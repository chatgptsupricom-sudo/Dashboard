import { callOdooRPCEstricto } from "@/lib/odoo";
import { esInterno, esRelacionada } from "@/lib/cxc/cobros";
import { COMPANY_NAMES } from "@/lib/cxc/alcance";
import { nombresPlazos } from "@/lib/cxc/credito";

/**
 * Sobregiro: cuánto del límite de crédito usa cada cliente, sede por sede.
 *
 *   límite  = res.partner.credit_limit (Contactos > Contabilidad > Límite de
 *             crédito). Es company_dependent: cada sede tiene el suyo, así que
 *             se lee con `allowed_company_ids` de una sola sede a la vez.
 *   usado   = saldo por cobrar del cliente en esa sede: suma de
 *             `amount_residual` de sus apuntes de cuentas por cobrar
 *             publicados y sin conciliar. Es la misma cuenta que hace Odoo
 *             para el campo `credit` ("Total por cobrar", el que compara con
 *             el límite al avisar), pero filtrada por la sede exacta: `credit`
 *             suma todas las sedes que cuelgan de la misma casa matriz. Un
 *             anticipo sin aplicar resta, igual que en Odoo.
 *   vencido = la parte del usado con vencimiento anterior a hoy.
 *
 * Entra todo cliente con límite > 0 en la sede, y aparte los que deben algo
 * en la sede sin tener límite asignado. Sin Supricom ni SUPER TECHNO (empresas
 * del grupo, fuera de los KPIs de CxC).
 */

/** Desde este % de uso el cliente está "al límite" (mismo corte que Clasificación de clientes). */
export const UTILIZACION_ALTA = 80;

export type EstadoSobregiro = "excedido" | "al_limite" | "en_uso" | "sin_uso" | "sin_limite";

export interface ClienteSobregiro {
  partnerId: number;
  cliente: string;
  rif: string;
  companyId: number;
  sede: string;
  vendedor: string;
  plazo: string;
  limite: number;
  usado: number;
  /** límite − usado; negativo = sobregiro. */
  disponible: number;
  /** usado / límite × 100; null sin límite. */
  usoPct: number | null;
  /** Cuánto pasa del límite (0 si no lo pasa). */
  excedido: number;
  vencido: number;
  /** Días desde el vencimiento más viejo que sigue abierto (0 si nada vencido). */
  diasVencido: number;
  estado: EstadoSobregiro;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const idDe = (v: any): number | undefined => (Array.isArray(v) ? v[0] : v) || undefined;
const nombreDe = (v: any): string => (Array.isArray(v) ? v[1] : "") || "";

function hoyStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function grupos(domain: any[], fields: string[], cid: number): Promise<any[]> {
  const r = await callOdooRPCEstricto<any[]>("account.move.line", "read_group", [domain, fields, ["partner_id"]], {
    lazy: false,
    context: { allowed_company_ids: [cid] },
  });
  if (!Array.isArray(r)) throw new Error("Odoo no respondió account.move.line.read_group");
  return r;
}

/**
 * search_read y no read: hay contactos que el usuario de la API no puede leer
 * con ninguna sede activa (oct-2026: 3 de Panamá con saldo en la sede) y
 * `read` tumba la consulta entera por uno solo. search_read los salta; quien
 * llama los completa con el nombre que trae el libro.
 */
async function leerClientes(ids: number[], cid: number): Promise<any[]> {
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    const page = await callOdooRPCEstricto<any[]>("res.partner", "search_read", [[["id", "in", ids.slice(i, i + 500)]]], {
      fields: ["id", "name", "vat", "credit_limit", "user_id", "property_payment_term_id"],
      context: { allowed_company_ids: [cid], active_test: false },
    });
    out.push(...(page || []));
  }
  return out;
}

async function sobregiroDeSede(cid: number): Promise<ClienteSobregiro[]> {
  const hoy = hoyStr();
  const abiertos = [
    ["company_id", "=", cid],
    ["account_id.account_type", "=", "asset_receivable"],
    ["parent_state", "=", "posted"],
    ["reconciled", "=", false],
  ];

  const [conLimite, saldos, vencidos] = await Promise.all([
    callOdooRPCEstricto<number[]>("res.partner", "search", [[["credit_limit", ">", 0]]], {
      context: { allowed_company_ids: [cid] },
    }),
    grupos(abiertos, ["amount_residual:sum"], cid),
    grupos(
      [...abiertos, ["amount_residual", ">", 0], ["date_maturity", "<", hoy]],
      ["amount_residual:sum", "date_maturity:min"],
      cid,
    ),
  ]);

  const usado = new Map<number, number>();
  const nombreEnLibro = new Map<number, string>();
  for (const g of saldos) {
    const id = idDe(g.partner_id);
    if (!id) continue;
    usado.set(id, Number(g.amount_residual) || 0);
    nombreEnLibro.set(id, nombreDe(g.partner_id));
  }
  const vencido = new Map<number, { monto: number; desde: string | null }>();
  for (const g of vencidos) {
    const id = idDe(g.partner_id);
    if (id) vencido.set(id, { monto: Number(g.amount_residual) || 0, desde: g.date_maturity || null });
  }

  // Con límite, o sin límite pero debiendo algo (centavos de redondeo no cuentan).
  const ids = Array.from(new Set([
    ...(conLimite || []),
    ...[...usado.entries()].filter(([, v]) => v >= 0.01).map(([id]) => id),
  ]));
  const leidos = await leerClientes(ids, cid);
  // Los que Odoo no deja leer: sin límite conocido, con el nombre del libro.
  const vistos = new Set(leidos.map((p) => p.id));
  const restringidos = ids
    .filter((id) => !vistos.has(id))
    .map((id) => ({ id, name: nombreEnLibro.get(id) || `Contacto ${id}`, vat: "", credit_limit: 0, user_id: false, property_payment_term_id: false }));
  const partners = [...leidos, ...restringidos].filter((p) => !esInterno(p.name || "") && !esRelacionada(p.name || ""));

  const plazos = await nombresPlazos(
    Array.from(new Set(partners.map((p) => idDe(p.property_payment_term_id)).filter((id): id is number => Boolean(id)))),
  );

  const hoyMs = new Date(hoy + "T00:00:00").getTime();
  return partners.map((p) => {
    const limite = r2(Number(p.credit_limit) || 0);
    const u = r2(usado.get(p.id) || 0);
    const v = vencido.get(p.id);
    const usoPct = limite > 0 ? r2((u / limite) * 100) : null;
    const estado: EstadoSobregiro =
      limite <= 0 ? "sin_limite"
      : u > limite ? "excedido"
      : (usoPct as number) >= UTILIZACION_ALTA ? "al_limite"
      : u > 0 ? "en_uso"
      : "sin_uso";
    return {
      partnerId: p.id,
      cliente: p.name || "Sin nombre",
      rif: p.vat || "",
      companyId: cid,
      sede: COMPANY_NAMES[cid] || String(cid),
      vendedor: nombreDe(p.user_id) || "Sin vendedor",
      plazo: plazos.get(idDe(p.property_payment_term_id) as number) || "",
      limite,
      usado: u,
      disponible: r2(limite - u),
      usoPct,
      excedido: limite > 0 ? r2(Math.max(0, u - limite)) : 0,
      vencido: r2(v?.monto || 0),
      diasVencido: v?.desde ? Math.max(0, Math.round((hoyMs - new Date(v.desde + "T00:00:00").getTime()) / 86400000)) : 0,
      estado,
    };
  });
}

export async function calcularSobregiro(companyIds: number[]) {
  const clientes = (await Promise.all(companyIds.map(sobregiroDeSede))).flat();
  // Excedidos primero (el que más se pasa arriba), luego por % de uso.
  const orden: Record<EstadoSobregiro, number> = { excedido: 0, al_limite: 1, en_uso: 2, sin_uso: 3, sin_limite: 4 };
  clientes.sort((a, b) =>
    orden[a.estado] - orden[b.estado] ||
    b.excedido - a.excedido ||
    (b.usoPct ?? 0) - (a.usoPct ?? 0) ||
    b.usado - a.usado);

  const conLimite = clientes.filter((c) => c.estado !== "sin_limite");
  const de = (e: EstadoSobregiro) => clientes.filter((c) => c.estado === e);
  const suma = (lista: ClienteSobregiro[], k: "limite" | "usado" | "excedido" | "vencido") =>
    r2(lista.reduce((s, c) => s + c[k], 0));
  // El uso global no descuenta saldos a favor: un anticipo de un cliente no libera el cupo de otro.
  const usadoConLimite = r2(conLimite.reduce((s, c) => s + Math.max(0, c.usado), 0));
  const limiteTotal = suma(conLimite, "limite");

  return {
    clientes,
    resumen: {
      conLimite: conLimite.length,
      limiteTotal,
      usadoTotal: usadoConLimite,
      usoPct: limiteTotal > 0 ? r2((usadoConLimite / limiteTotal) * 100) : 0,
      excedidos: de("excedido").length,
      montoExcedido: suma(de("excedido"), "excedido"),
      vencidoExcedidos: suma(de("excedido"), "vencido"),
      alLimite: de("al_limite").length,
      enUso: de("en_uso").length,
      sinUso: de("sin_uso").length,
      sinLimite: de("sin_limite").length,
      usadoSinLimite: suma(de("sin_limite"), "usado"),
    },
    utilizacionAlta: UTILIZACION_ALTA,
  };
}
