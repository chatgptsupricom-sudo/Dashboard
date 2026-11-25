/**
 * Perfiles de clientes en el panel: lo que cada cliente escribió en «Mi cuenta» › Perfil de la tienda web
 * (lib/tienda-web/clientes/perfil.ts), para que su vendedor lo vea y actualice Odoo.
 *
 * Quién ve qué (lo pide la ruta con `alcancePanel`):
 * - Vendedor: los clientes que tiene asignados en Odoo (`res.partner.user_id` = su uid), en su sede o en todas
 *   si no tiene sede.
 * - Gerencia de Ventas y Gerente de Operaciones: los clientes con ficha en su sede (`cids`).
 * - SuperAdmin: todos; puede filtrar por sede.
 *
 * Solo lee. La ficha en Odoo se busca por el RIF del perfil y de cada razón social (`vat` que contiene el tramo
 * de números del RIF, y después la misma clave exacta): así se sabe de qué sede y vendedor es cada perfil y qué
 * razones sociales ya están registradas.
 */
import { db } from "@/lib/db";
import { callOdooRPCEstricto } from "@/lib/odoo";
import { esVendedorPanel, ROLES_PERFILES_CLIENTES } from "./accesoPanel";
import { asegurarTablas } from "./perfil";
import { claveDocumento, COMPANIAS_TIENDA, nucleoDocumento, resumenCambios, SEDE_DE_COMPANIA, type DatosPerfil } from "./tipos";

export { ROLES_PERFILES_CLIENTES };

export type AlcancePanel =
  | { tipo: "todo"; sede: number | null }
  | { tipo: "sede"; sede: number }
  | { tipo: "vendedor"; uid: number; sede: number | null };

/** El alcance del usuario del panel según su rol, su sede (`cids`) y su vendedor de Odoo (`uid`). null = no le toca. */
export function alcancePanel(payload: any, sedePedida: number | null): AlcancePanel | { error: string } {
  const rol = String(payload?.role ?? "").toLowerCase().trim();
  const cids = Number(payload?.cids);
  const sede = COMPANIAS_TIENDA.includes(cids) ? cids : null;
  if (rol === "superadmin") return { tipo: "todo", sede: sedePedida && COMPANIAS_TIENDA.includes(sedePedida) ? sedePedida : null };
  if (esVendedorPanel(rol)) {
    const uid = Number(payload?.uid);
    if (!uid) return { error: "Tu usuario no tiene vendedor en Odoo" };
    return { tipo: "vendedor", uid, sede };
  }
  if (!sede) return { error: "Tu usuario no tiene sede asignada" };
  return { tipo: "sede", sede };
}

interface FichaOdoo { id: number; nombre: string; clave: string; sede: number; vendedorId: number | null; vendedor: string }

/** Las fichas de empresa de Odoo (tres sedes) cuyo RIF es alguno de estos (claves sin guiones). */
async function fichasPorRif(claves: string[]): Promise<FichaOdoo[]> {
  const nucleos = [...new Set(claves.map((c) => nucleoDocumento(c)).filter(Boolean))] as string[];
  if (!nucleos.length) return [];
  const fichas: FichaOdoo[] = [];
  const buscadas = new Set(claves);
  for (let i = 0; i < nucleos.length; i += 40) {
    const lote = nucleos.slice(i, i + 40);
    const dominio: any[] = [...Array(lote.length - 1).fill("|"), ...lote.map((n) => ["vat", "ilike", n])];
    const filas = await callOdooRPCEstricto<any[]>("res.partner", "search_read", [[...dominio, ["is_company", "=", true]]], {
      fields: ["id", "name", "vat", "company_id", "user_id"], limit: 2000,
      context: { allowed_company_ids: COMPANIAS_TIENDA, lang: "es_VE" },
    });
    for (const f of filas || []) {
      const clave = claveDocumento(f.vat);
      const sede = Number(f.company_id?.[0]);
      if (!buscadas.has(clave) || !COMPANIAS_TIENDA.includes(sede)) continue;
      fichas.push({ id: f.id, nombre: String(f.name || ""), clave, sede, vendedorId: f.user_id ? Number(f.user_id[0]) : null, vendedor: f.user_id ? String(f.user_id[1]) : "" });
    }
  }
  return fichas;
}

/** Fichas sueltas por id (perfiles de clientes sin RIF: su llave es `p:<id>`). */
async function fichasPorId(ids: number[]): Promise<(FichaOdoo & { idPerfil: number })[]> {
  if (!ids.length) return [];
  const filas = await callOdooRPCEstricto<any[]>("res.partner", "read", [ids, ["id", "name", "vat", "company_id", "user_id"]], {
    context: { allowed_company_ids: COMPANIAS_TIENDA, lang: "es_VE" },
  });
  return (filas || []).map((f) => ({
    idPerfil: f.id, id: f.id, nombre: String(f.name || ""), clave: claveDocumento(f.vat), sede: Number(f.company_id?.[0]) || 0,
    vendedorId: f.user_id ? Number(f.user_id[0]) : null, vendedor: f.user_id ? String(f.user_id[1]) : "",
  }));
}

const claveDePerfil = (clave: string) => (clave.startsWith("d:") ? clave.slice(2) : "");

export interface PerfilPanel {
  clave: string;
  nombre: string;
  tieneLogo: boolean;
  razones: (DatosPerfil["razones"][number] & { registrada: boolean })[];
  redes: DatosPerfil["redes"];
  sucursales: number;
  actualizadoEl: string;
  actualizadoPor: string;
  version: number;
  /** Dónde está en Odoo: una entrada por ficha (sede, vendedor). */
  enOdoo: { sede: string; cid: number; vendedor: string; vendedorId: number | null; partnerId: number }[];
  porConfirmar: number;
}

async function leerFilas(clave?: string) {
  await asegurarTablas();
  const [filas]: any = await db.execute(
    `SELECT clave, nombre, datos, logo_tipo IS NOT NULL AS tiene_logo, version, actualizado_por,
            DATE_FORMAT(actualizado_el, '%Y-%m-%d %H:%i') AS el
       FROM tienda_perfiles ${clave ? "WHERE clave = ?" : ""} ORDER BY actualizado_el DESC LIMIT 2000`,
    clave ? [clave] : [],
  );
  return (filas || []) as any[];
}

function armar(filas: any[], fichas: FichaOdoo[], porId: Map<number, FichaOdoo>): PerfilPanel[] {
  const porClave = new Map<string, FichaOdoo[]>();
  for (const f of fichas) porClave.set(f.clave, [...(porClave.get(f.clave) || []), f]);
  return filas.map((f) => {
    let datos: DatosPerfil;
    try { datos = JSON.parse(f.datos); } catch { datos = { nombre: f.nombre, razones: [], redes: {} }; }
    const propia = claveDePerfil(f.clave);
    const ids = f.clave.startsWith("p:") ? [Number(f.clave.slice(2))] : [];
    const enOdoo = [
      ...(propia ? porClave.get(propia) || [] : []),
      ...ids.map((i) => porId.get(i)).filter(Boolean) as FichaOdoo[],
    ].map((x) => ({ sede: SEDE_DE_COMPANIA[x.sede]?.nombre || String(x.sede), cid: x.sede, vendedor: x.vendedor, vendedorId: x.vendedorId, partnerId: x.id }));
    const registradas = new Set([...fichas.map((x) => x.clave)]);
    const razones = (datos.razones || []).map((r) => ({ ...r, registrada: registradas.has(claveDocumento(r.rif)) }));
    return {
      clave: f.clave, nombre: f.nombre || datos.nombre, tieneLogo: Boolean(Number(f.tiene_logo)), razones, redes: datos.redes || {},
      sucursales: razones.reduce((a, r) => a + r.sucursales.length, 0),
      actualizadoEl: f.el || "", actualizadoPor: f.actualizado_por || "", version: Number(f.version) || 1,
      enOdoo, porConfirmar: razones.filter((r) => !r.registrada).length,
    };
  });
}

/** ¿El usuario del panel ve este perfil? */
export function loVe(p: PerfilPanel, a: AlcancePanel): boolean {
  if (a.tipo === "todo") return !a.sede || p.enOdoo.some((x) => x.cid === a.sede);
  if (a.tipo === "sede") return p.enOdoo.some((x) => x.cid === a.sede);
  return p.enOdoo.some((x) => x.vendedorId === a.uid && (!a.sede || x.cid === a.sede));
}

async function conOdoo(filas: any[]): Promise<PerfilPanel[]> {
  const claves = new Set<string>();
  for (const f of filas) {
    const propia = claveDePerfil(f.clave);
    if (propia) claves.add(propia);
    try { for (const r of JSON.parse(f.datos).razones || []) { const c = claveDocumento(r.rif); if (c.length >= 6) claves.add(c); } } catch { /* datos dañados: sin razones */ }
  }
  const ids = filas.filter((f) => f.clave.startsWith("p:")).map((f) => Number(f.clave.slice(2))).filter((n) => n > 0);
  const [fichas, sueltas] = await Promise.all([fichasPorRif([...claves]), fichasPorId(ids)]);
  return armar(filas, [...fichas, ...sueltas], new Map(sueltas.map((s) => [s.idPerfil, s])));
}

export async function listarPerfiles(a: AlcancePanel): Promise<PerfilPanel[]> {
  return (await conOdoo(await leerFilas())).filter((p) => loVe(p, a));
}

export interface CambioPerfil { version: number; por: string; el: string; logo: string | null; cambios: string[] }

/** Un perfil con su historial (de lo más nuevo a lo más viejo). null = no existe o no lo ve. */
export async function detallePerfil(clave: string, a: AlcancePanel): Promise<(PerfilPanel & { historial: CambioPerfil[] }) | null> {
  const filas = await leerFilas(clave);
  if (!filas.length) return null;
  const [p] = await conOdoo(filas);
  if (!p || !loVe(p, a)) return null;
  const [hist]: any = await db.execute(
    "SELECT version, datos_antes, logo_cambio, por, DATE_FORMAT(el, '%Y-%m-%d %H:%i') AS el FROM tienda_perfiles_historial WHERE clave = ? ORDER BY version ASC, id ASC LIMIT 200",
    [clave],
  );
  // Cada fila guarda lo que había ANTES de ese cambio: el «después» es lo de antes del siguiente, o lo de hoy.
  const parse = (t: string | null): DatosPerfil | null => { if (!t) return null; try { return JSON.parse(t); } catch { return null; } };
  const hoy = parse(filas[0].datos)!;
  const lista = (hist || []) as any[];
  const historial: CambioPerfil[] = lista.map((h, i) => {
    const despues = i + 1 < lista.length ? parse(lista[i + 1].datos_antes) : hoy;
    const cambios = despues ? resumenCambios(parse(h.datos_antes), despues) : [];
    if (h.logo_cambio === "nuevo") cambios.push("Cambió el logo");
    if (h.logo_cambio === "quitado") cambios.push("Quitó el logo");
    return { version: Number(h.version), por: String(h.por || ""), el: String(h.el || ""), logo: h.logo_cambio || null, cambios: cambios.length ? cambios : ["Guardó sin cambios"] };
  }).reverse();
  return { ...p, historial };
}

/** El logo de un perfil, si el usuario ve ese perfil. */
export async function logoPerfil(clave: string, a: AlcancePanel): Promise<{ bytes: Buffer; tipo: string } | null> {
  const filas = await leerFilas(clave);
  if (!filas.length) return null;
  const [p] = await conOdoo(filas);
  if (!p || !loVe(p, a)) return null;
  const [r]: any = await db.execute("SELECT logo, logo_tipo FROM tienda_perfiles WHERE clave = ?", [clave]);
  const f = r?.[0];
  return f?.logo && f.logo_tipo ? { bytes: Buffer.from(f.logo), tipo: String(f.logo_tipo) } : null;
}
