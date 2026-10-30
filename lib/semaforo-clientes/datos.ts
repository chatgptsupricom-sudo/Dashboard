import { query } from "@/lib/db";
import { cachear, diaLocal, dominioVentas, hoyCaracas, leerTodo } from "@/lib/compras/datosOdoo";
import { partnersIntercompania } from "@/lib/intercompania";
import { callOdooRPCEstricto } from "@/lib/odoo";
import { SQL_SIN_INTERCOMPANIA, desdeOdoo, normalizarRif, rangoSmartbit } from "@/lib/smartbit";
import {
  CONFIG_INICIAL,
  DIAS_HISTORIA,
  clasificar,
  normalizarConfig,
  sumarDias,
  type ConfigSemaforo,
  type DiaCompra,
  type EstadoSemaforo,
  type FilaSemaforo,
  type Ventana,
} from "./tipos";

/**
 * Lecturas del Semáforo de clientes (reglas en ./tipos.ts).
 *
 * - Cartera = `res.partner` empresa con `customer_rank > 0` de la sede; el
 *   vendedor es el asignado en Odoo (`user_id`). Un cliente de otra sede (o
 *   sin sede) que compró en esta también entra, con su vendedor.
 * - Compras = Odoo desde el corte (`dominioVentas`, por día y tipo de
 *   documento) + Smartbit antes del corte, empatado por RIF.
 * - Último contacto comercial, lo más reciente de: una cotización o pedido
 *   de venta (cualquier estado), una nota, correo o actividad hecha en el
 *   contacto en Odoo, y una visita realizada del panel (`weekly_visits`, por
 *   nombre exacto del cliente). En Odoo casi no se anotan contactos
 *   (oct-2026: ~100 notas y ~110 actividades en 7 meses), por eso pesa la
 *   cotización.
 * - Foto semanal (`semaforo_clientes_fotos`, se crea sola): el estado de cada
 *   cliente la primera vez que se calcula la sede en la semana (o el cron
 *   del lunes), con la ventana de la configuración. Sirve para ver quién
 *   cambió de color y, más adelante, las alertas y los recuperados.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;
const idDe = (v: any): number | null => (Array.isArray(v) ? Number(v[0]) : v ? Number(v) : null) || null;
const nombreDe = (v: any): string => (Array.isArray(v) ? String(v[1] ?? "") : "");
const normNombre = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();

async function agrupar(model: string, domain: any[], fields: string[], groupby: string[], companyId: number): Promise<any[]> {
  const r = await callOdooRPCEstricto<any[]>(model, "read_group", [domain, fields, groupby], {
    lazy: false,
    context: { allowed_company_ids: [companyId] },
  });
  if (!Array.isArray(r)) throw new Error(`Odoo no respondió ${model}.read_group`);
  return r;
}

interface Contacto {
  id: number;
  nombre: string;
  rif: string;
  vendedorId: number | null;
  vendedor: string;
}

// ---------------------------------------------------------------------------
// Configuración (una fila, la cambia el SuperAdmin)
// ---------------------------------------------------------------------------

let tablasListas = false;
async function asegurarTablas() {
  if (tablasListas) return;
  await query(
    `CREATE TABLE IF NOT EXISTS semaforo_clientes_config (
      id INT PRIMARY KEY,
      config JSON NOT NULL,
      actualizado_por VARCHAR(200) NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
  );
  await query(
    `CREATE TABLE IF NOT EXISTS semaforo_clientes_fotos (
      semana DATE NOT NULL,
      company_id INT NOT NULL,
      partner_id INT NOT NULL,
      user_id INT NULL,
      estado VARCHAR(12) NOT NULL,
      base DECIMAL(14,2) NOT NULL DEFAULT 0,
      ritmo DECIMAL(14,2) NOT NULL DEFAULT 0,
      venta_ventana DECIMAL(14,2) NOT NULL DEFAULT 0,
      ventana INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (semana, company_id, partner_id),
      KEY idx_sede_semana (company_id, semana)
    )`,
  );
  tablasListas = true;
}

export interface ConfigGuardada {
  config: ConfigSemaforo;
  actualizadoPor: string | null;
  actualizado: string | null;
}

export async function leerConfig(): Promise<ConfigGuardada> {
  try {
    await asegurarTablas();
    const { rows } = await query("SELECT config, actualizado_por, updated_at FROM semaforo_clientes_config WHERE id = 1");
    const r: any = rows[0];
    if (!r) return { config: CONFIG_INICIAL, actualizadoPor: null, actualizado: null };
    const json = typeof r.config === "string" ? JSON.parse(r.config) : r.config;
    return {
      config: normalizarConfig(json),
      actualizadoPor: r.actualizado_por || null,
      actualizado: r.updated_at ? new Date(r.updated_at).toISOString() : null,
    };
  } catch (e: any) {
    // Sin MySQL el semáforo sigue con los umbrales iniciales.
    console.error("[semaforo-clientes] no se pudo leer la configuración:", e?.message);
    return { config: CONFIG_INICIAL, actualizadoPor: null, actualizado: null };
  }
}

export async function guardarConfig(c: Partial<ConfigSemaforo>, quien: string): Promise<ConfigSemaforo> {
  await asegurarTablas();
  const config = normalizarConfig(c);
  await query(
    `INSERT INTO semaforo_clientes_config (id, config, actualizado_por) VALUES (1, ?, ?)
     ON DUPLICATE KEY UPDATE config = ?, actualizado_por = ?`,
    [JSON.stringify(config), quien.slice(0, 200), JSON.stringify(config), quien.slice(0, 200)],
  );
  return config;
}

// ---------------------------------------------------------------------------
// Cartera, compras y contactos de una sede
// ---------------------------------------------------------------------------

const CAMPOS_CONTACTO = ["name", "vat", "user_id", "commercial_partner_id"];

function aContacto(p: any): Contacto {
  return {
    id: p.id,
    nombre: String(p.name || `Contacto ${p.id}`),
    rif: String(p.vat || ""),
    vendedorId: idDe(p.user_id),
    vendedor: nombreDe(p.user_id) || "Sin vendedor",
  };
}

/** Lee contactos sueltos (hijos o de otra sede) y devuelve id → partner comercial. */
async function comercialesDe(ids: number[], companyId: number): Promise<Map<number, any>> {
  const mapa = new Map<number, any>();
  for (let i = 0; i < ids.length; i += 500) {
    const r = await callOdooRPCEstricto<any[]>("res.partner", "search_read", [[["id", "in", ids.slice(i, i + 500)]]], {
      fields: CAMPOS_CONTACTO,
      context: { allowed_company_ids: [companyId], active_test: false },
    });
    for (const p of r || []) mapa.set(p.id, p);
  }
  return mapa;
}

interface DatosSede {
  contactos: Map<number, Contacto>;
  compras: Map<number, DiaCompra[]>;
  contacto: Map<number, { dia: string; origen: string }>;
  sinSmartbit: boolean;
}

async function leerSede(companyId: number, hoy: string): Promise<DatosSede> {
  const inicio = sumarDias(hoy, -DIAS_HISTORIA);
  const inicioOdoo = desdeOdoo(inicio);
  const ic = await partnersIntercompania();

  const [cartera, grupos, pedidos] = await Promise.all([
    leerTodo(
      "res.partner",
      [["customer_rank", ">", 0], ["parent_id", "=", false], ["company_id", "=", companyId]],
      CAMPOS_CONTACTO,
      { context: { allowed_company_ids: [companyId] } },
    ),
    (async () =>
      inicioOdoo > hoy
        ? []
        : agrupar(
            "account.move.line",
            [...(await dominioVentas(companyId)), ["invoice_date", ">=", inicioOdoo], ["invoice_date", "<=", hoy]],
            ["balance:sum"],
            ["partner_id", "invoice_date:day", "move_type"],
            companyId,
          ))(),
    agrupar(
      "sale.order",
      [["company_id", "=", companyId], ["date_order", ">=", `${inicio} 00:00:00`]],
      ["date_order:max"],
      ["partner_id"],
      companyId,
    ),
  ]);

  const contactos = new Map<number, Contacto>();
  for (const p of cartera) if (!ic.has(p.id)) contactos.set(p.id, aContacto(p));

  // Contactos de las ventas y los pedidos que no son de la cartera: hijos
  // (van al partner comercial) o clientes de otra sede que compraron aquí.
  const sueltos = new Set<number>();
  for (const g of [...grupos, ...pedidos]) {
    const id = idDe(g.partner_id);
    if (id && !contactos.has(id) && !ic.has(id)) sueltos.add(id);
  }
  const leidos = await comercialesDe([...sueltos], companyId);
  const comercial = new Map<number, number>();
  const padres = new Set<number>();
  for (const [id, p] of leidos) {
    const padre = idDe(p.commercial_partner_id) ?? id;
    comercial.set(id, padre);
    if (padre === id && !ic.has(id)) contactos.set(id, aContacto(p));
    else if (!contactos.has(padre)) padres.add(padre);
  }
  for (const [id, p] of await comercialesDe([...padres].filter((id) => !ic.has(id)), companyId)) contactos.set(id, aContacto(p));

  // Un cliente con varios contactos del mismo RIF en la sede es uno solo: si
  // compra con otro de sus contactos no "dejó de comprar" (oct-2026: 10 RIF
  // repetidos en Valencia, 2 en Caracas, 24 en Panamá). Queda el que tiene
  // vendedor asignado y, entre esos, el más viejo.
  const duplicado = new Map<number, number>();
  const unoPorRif = new Map<string, number>();
  const ordenados = [...contactos.values()].sort((a, b) => Number(!a.vendedorId) - Number(!b.vendedorId) || a.id - b.id);
  for (const c of ordenados) {
    const rif = normalizarRif(c.rif);
    if (rif.length < 6) continue;
    const queda = unoPorRif.get(rif);
    if (queda === undefined) unoPorRif.set(rif, c.id);
    else {
      duplicado.set(c.id, queda);
      contactos.delete(c.id);
    }
  }
  const unificar = (id: number) => duplicado.get(id) ?? id;
  const aComercial = (id: number | null) => {
    if (!id) return null;
    const c = contactos.has(id) || duplicado.has(id) ? id : comercial.get(id);
    return c ? unificar(c) : null;
  };

  // Compras de Odoo por día. El balance de una venta es negativo (crédito).
  const compras = new Map<number, Map<string, DiaCompra>>();
  const sumar = (id: number, dia: string, monto: number, devolucion: boolean) => {
    if (!contactos.has(id) || !dia) return;
    let porDia = compras.get(id);
    if (!porDia) compras.set(id, (porDia = new Map()));
    const d = porDia.get(dia) ?? { dia, compra: 0, devolucion: 0 };
    if (devolucion) d.devolucion += monto;
    else d.compra += monto;
    porDia.set(dia, d);
  };
  for (const g of grupos) {
    const id = aComercial(idDe(g.partner_id));
    const dia = String(g.__range?.["invoice_date:day"]?.from || "").slice(0, 10);
    const monto = -(Number(g.balance) || 0);
    if (!id) continue;
    if (g.move_type === "out_refund") sumar(id, dia, monto < 0 ? -monto : 0, true);
    else if (monto >= 0) sumar(id, dia, monto, false);
    else sumar(id, dia, -monto, true);
  }

  // Smartbit antes del corte, por RIF.
  let sinSmartbit = false;
  const rango = rangoSmartbit(inicio, hoy);
  if (rango) {
    const porRif = new Map<string, number>();
    for (const c of contactos.values()) {
      const rif = normalizarRif(c.rif);
      if (rif.length >= 5 && !porRif.has(rif)) porRif.set(rif, c.id);
    }
    try {
      const { rows } = await query(
        `SELECT REGEXP_REPLACE(UPPER(codigo_cliente), '[^A-Z0-9]', '') AS rif, fecha,
                SUM(CASE WHEN venta > 0 THEN venta ELSE 0 END) AS compra,
                SUM(CASE WHEN venta < 0 THEN -venta ELSE 0 END) AS devolucion
           FROM ventas_smartbit
          WHERE company_id = ? AND fecha BETWEEN ? AND ? AND codigo_cliente IS NOT NULL
            AND ${SQL_SIN_INTERCOMPANIA}
          GROUP BY rif, fecha`,
        [companyId, rango[0], rango[1]],
      );
      for (const f of rows as any[]) {
        const id = porRif.get(String(f.rif));
        if (!id) continue;
        const dia = f.fecha instanceof Date ? diaLocal(f.fecha) : String(f.fecha).slice(0, 10);
        if (Number(f.compra) > 0) sumar(id, dia, Number(f.compra), false);
        if (Number(f.devolucion) > 0) sumar(id, dia, Number(f.devolucion), true);
      }
    } catch (e: any) {
      sinSmartbit = true;
      console.error("[semaforo-clientes] no se pudo leer ventas_smartbit:", e?.message);
    }
  }

  // Último contacto comercial.
  const contacto = new Map<number, { dia: string; origen: string }>();
  const anotar = (id: number | null, dia: string, origen: string) => {
    if (!id || !dia || !contactos.has(id)) return;
    const actual = contacto.get(id);
    if (!actual || dia > actual.dia) contacto.set(id, { dia, origen });
  };
  for (const g of pedidos) anotar(aComercial(idDe(g.partner_id)), String(g.date_order || "").slice(0, 10), "Cotización o pedido en Odoo");

  const ids = [...contactos.keys(), ...duplicado.keys()];
  const [mensajes, visitas] = await Promise.all([
    (async () => {
      const todos: any[] = [];
      for (let i = 0; i < ids.length; i += 1000) {
        const r = await callOdooRPCEstricto<any[]>(
          "mail.message",
          "search_read",
          [[
            ["model", "=", "res.partner"],
            ["res_id", "in", ids.slice(i, i + 1000)],
            ["date", ">=", `${inicio} 00:00:00`],
            "|", ["message_type", "in", ["comment", "email"]], ["mail_activity_type_id", "!=", false],
          ]],
          { fields: ["res_id", "date", "message_type", "mail_activity_type_id"] },
        );
        todos.push(...(r || []));
      }
      return todos;
    })(),
    query(
      `SELECT client_name, MAX(visit_date) AS dia FROM weekly_visits
        WHERE company_id = ? AND visit_date >= ? GROUP BY client_name`,
      [companyId, inicio],
    )
      .then((r) => r.rows as any[])
      .catch(() => [] as any[]),
  ]);
  for (const m of mensajes) {
    const origen = m.mail_activity_type_id ? "Actividad hecha en Odoo" : m.message_type === "email" ? "Correo en Odoo" : "Nota en Odoo";
    anotar(unificar(Number(m.res_id)), String(m.date || "").slice(0, 10), origen);
  }
  if (visitas.length) {
    const porNombre = new Map<string, number>();
    for (const c of contactos.values()) porNombre.set(normNombre(c.nombre), c.id);
    for (const v of visitas) {
      const dia = v.dia instanceof Date ? diaLocal(v.dia) : String(v.dia || "").slice(0, 10);
      anotar(porNombre.get(normNombre(v.client_name)) ?? null, dia, "Visita del vendedor");
    }
  }

  return {
    contactos,
    compras: new Map([...compras].map(([id, dias]) => [id, [...dias.values()]])),
    contacto,
    sinSmartbit,
  };
}

// ---------------------------------------------------------------------------
// Semáforo de una sede
// ---------------------------------------------------------------------------

export interface SemaforoSede {
  filas: FilaSemaforo[];
  sinSmartbit: boolean;
}

/** Semáforo de toda la cartera de una sede. Caché de 10 min por sede, ventana y umbrales. */
export function semaforoDeSede(companyId: number, ventana: Ventana, cfg: ConfigSemaforo): Promise<SemaforoSede> {
  const hoy = hoyCaracas();
  const datos = cachear(`semaforo|datos|${companyId}|${hoy}`, () => leerSede(companyId, hoy));
  return cachear(`semaforo|${companyId}|${hoy}|${ventana}|${JSON.stringify(cfg)}`, async () => {
    const d = await datos;
    const filas: FilaSemaforo[] = [];
    for (const c of d.contactos.values()) {
      const cl = clasificar(d.compras.get(c.id) ?? [], hoy, ventana, cfg);
      const ultimo = d.contacto.get(c.id);
      filas.push({
        ...cl,
        id: c.id,
        companyId,
        cliente: c.nombre,
        rif: c.rif,
        vendedorId: c.vendedorId,
        vendedor: c.vendedor,
        ultimoContacto: ultimo?.dia ?? null,
        contactoOrigen: ultimo?.origen ?? null,
        estadoAnterior: null,
      });
    }
    return { filas, sinSmartbit: d.sinSmartbit };
  });
}

// ---------------------------------------------------------------------------
// Foto semanal
// ---------------------------------------------------------------------------

/** Lunes de la semana de `dia`. */
export function lunesDe(dia: string): string {
  const d = new Date(`${dia}T00:00:00Z`);
  return sumarDias(dia, -((d.getUTCDay() + 6) % 7));
}

/**
 * Guarda la foto de esta semana de la sede si todavía no está. Solo con la
 * ventana de la configuración, para que todas las fotos se comparen igual.
 */
export async function guardarFoto(companyId: number, ventana: Ventana, filas: FilaSemaforo[]): Promise<boolean> {
  await asegurarTablas();
  const semana = lunesDe(hoyCaracas());
  const { rows } = await query("SELECT 1 FROM semaforo_clientes_fotos WHERE semana = ? AND company_id = ? LIMIT 1", [semana, companyId]);
  if ((rows as any[]).length) return false;
  for (let i = 0; i < filas.length; i += 400) {
    const lote = filas.slice(i, i + 400);
    await query(
      `INSERT IGNORE INTO semaforo_clientes_fotos
         (semana, company_id, partner_id, user_id, estado, base, ritmo, venta_ventana, ventana)
       VALUES ${lote.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ")}`,
      lote.flatMap((f) => [
        semana, companyId, f.id, f.vendedorId, f.estado, f.base, f.ritmo,
        ventana === 30 ? f.venta30 : ventana === 60 ? f.venta60 : f.venta90, ventana,
      ]),
    );
  }
  return true;
}

/** Estados de la última foto anterior a esta semana: { semana, partner → estado }. */
export async function fotoAnterior(companyId: number): Promise<{ semana: string | null; estados: Map<number, EstadoSemaforo> }> {
  const estados = new Map<number, EstadoSemaforo>();
  try {
    await asegurarTablas();
    const semanaActual = lunesDe(hoyCaracas());
    const { rows } = await query(
      "SELECT MAX(semana) AS semana FROM semaforo_clientes_fotos WHERE company_id = ? AND semana < ?",
      [companyId, semanaActual],
    );
    const s = (rows as any[])[0]?.semana;
    if (!s) return { semana: null, estados };
    const semana = s instanceof Date ? diaLocal(s) : String(s).slice(0, 10);
    const r = await query("SELECT partner_id, estado FROM semaforo_clientes_fotos WHERE company_id = ? AND semana = ?", [companyId, semana]);
    for (const f of r.rows as any[]) estados.set(Number(f.partner_id), f.estado as EstadoSemaforo);
    return { semana, estados };
  } catch (e: any) {
    console.error("[semaforo-clientes] no se pudo leer la foto anterior:", e?.message);
    return { semana: null, estados };
  }
}
