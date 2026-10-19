// Recompra de clientes que llegaron por leads: cuántas veces volvió a comprar
// cada cliente después de la primera venta que cerró el lead.
//
// Leads: los del panel (`leads`, cerrados como venta) + los de los Excel de
// redes sociales de antes del panel (`leads_historicos`, se importan desde la
// pantalla). Compras, por RIF: antes del corte (CORTE_ODOO) de Smartbit
// —facturas importadas desde el Excel "Ventas / Devoluciones"
// (`ventas_smartbit_facturas`) o, para las sedes que no lo tengan, el
// histórico por artículo de `ventas_smartbit`—; desde el corte, las facturas de
// cliente de Odoo. Abril de 2026 está en los dos sistemas: por eso Smartbit se
// corta en CORTE_ODOO y no en su última fecha.

import { createHash } from "crypto";
import { db, query } from "@/lib/db";
import { leerTodo } from "@/lib/administracion/lectura";
import { callOdooRPCEstricto } from "@/lib/odoo";
import { CORTE_ODOO, normalizarRif, RIF_SQL } from "@/lib/smartbit";
import { canalNormalizadoSql } from "@/lib/canales";

export const SEDES: Record<number, string> = { 9: "Valencia", 10: "Caracas", 7: "Panamá" };

/** Compras hasta estos días después de la primera venta son parte de ella (factura del día siguiente, pedido partido). */
export const VENTANA_PRIMERA_VENTA = 3;

// ---------------------------------------------------------------------------
// Tablas

let tablasListas: Promise<void> | null = null;

export function asegurarTablas(): Promise<void> {
  tablasListas ??= (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS leads_historicos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        clave CHAR(40) NOT NULL,
        company_id INT NOT NULL,
        archivo VARCHAR(255) NULL,
        hoja VARCHAR(120) NULL,
        red_social VARCHAR(60) NULL,
        nombre VARCHAR(255) NOT NULL,
        fecha_interaccion DATE NULL,
        telefono VARCHAR(120) NULL,
        ubicacion VARCHAR(120) NULL,
        vendedor VARCHAR(120) NULL,
        estatus VARCHAR(40) NULL,
        monto DECIMAL(14,2) NULL,
        factura_txt VARCHAR(255) NULL,
        observacion TEXT NULL,
        rif VARCHAR(30) NULL,
        rif_origen VARCHAR(20) NULL,
        cliente_rif VARCHAR(255) NULL,
        primera_venta DATE NULL,
        importado_por VARCHAR(160) NULL,
        importado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_clave (clave),
        KEY idx_estatus (estatus),
        KEY idx_rif (rif)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await query(`
      CREATE TABLE IF NOT EXISTS ventas_smartbit_facturas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        fecha DATE NOT NULL,
        numero VARCHAR(30) NOT NULL,
        rif VARCHAR(30) NULL,
        cliente VARCHAR(255) NULL,
        vendedor VARCHAR(150) NULL,
        unidades DECIMAL(14,2) NULL,
        venta DECIMAL(16,2) NOT NULL DEFAULT 0,
        importado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_numero (company_id, numero),
        KEY idx_rif (rif)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  })().catch((e) => {
    tablasListas = null;
    throw e;
  });
  return tablasListas;
}

// ---------------------------------------------------------------------------
// Utilidades

const r2 = (n: number) => Math.round(n * 100) / 100;

function fechaISO(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

const sumarDias = (iso: string, dias: number) =>
  new Date(Date.parse(iso + "T00:00:00Z") + dias * 86400000).toISOString().slice(0, 10);
const diasEntre = (a: string, b: string) =>
  Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);

/** Valor plano de una celda de exceljs (fórmulas, texto enriquecido, hipervínculos). */
function celda(v: any): any {
  if (v == null || v instanceof Date) return v ?? null;
  if (typeof v === "object") {
    if ("result" in v) return celda(v.result);
    if (Array.isArray(v.richText)) return v.richText.map((t: any) => t.text).join("");
    if ("text" in v) return celda(v.text);
    return null;
  }
  return v;
}
const texto = (v: any) => {
  const c = celda(v);
  return c == null ? "" : c instanceof Date ? (fechaISO(c) ?? "") : String(c).trim();
};

/** "112$", 816, "2.151,50" → número; vacío o ilegible → null. */
function monto(v: any): number | null {
  const c = celda(v);
  if (typeof c === "number") return c;
  let s = String(c ?? "").replace(/[^0-9.,-]/g, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

const sinAcentos = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "");

function normNombre(s: string): string {
  return sinAcentos(String(s || ""))
    .toUpperCase()
    .replace(/\b(C\.?\s?A|F\.?\s?P|S\.?\s?A|SRL|COMPANIA ANONIMA)\b\.?/g, " ")
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !["DE", "LA", "EL", "Y", "LOS", "LAS"].includes(w))
    .join(" ");
}

function bigramas(s: string): string[] {
  const t = s.replace(/ /g, "");
  return Array.from({ length: Math.max(0, t.length - 1) }, (_, i) => t.slice(i, i + 2));
}

/** Parecido entre dos nombres (0..1): el mejor de palabras en común y bigramas (Dice). */
function parecido(a: string, b: string): number {
  const na = normNombre(a), nb = normNombre(b);
  if (!na || !nb) return 0;
  const ta = new Set(na.split(" ")), tb = new Set(nb.split(" "));
  const comunes = [...ta].filter((w) => tb.has(w)).length;
  const jac = comunes / Math.min(ta.size, tb.size);
  const ba = bigramas(na), bb = bigramas(nb);
  const resto = [...bb];
  let iguales = 0;
  for (const g of ba) {
    const i = resto.indexOf(g);
    if (i >= 0) { iguales++; resto.splice(i, 1); }
  }
  const dice = ba.length + bb.length ? (2 * iguales) / (ba.length + bb.length) : 0;
  return Math.max(jac, dice);
}

const partesNombre = (nombre: string) => [...String(nombre).split(/[/()]/).filter((p) => p.trim()), nombre];
const parecidoLead = (nombre: string, cliente: string) =>
  Math.max(...partesNombre(nombre).map((p) => parecido(p, cliente)));

const GENERICAS = new Set([
  "INVERSIONES", "GRUPO", "CORPORACION", "SOLUCIONES", "TECNOLOGIA", "TECNOLOGIAS", "SERVICIOS",
  "SUMINISTROS", "DISTRIBUIDORA", "COMERCIALIZADORA", "EMPRENDIMIENTO", "SISTEMAS", "STORE", "C", "A",
]);

/** Sin factura que lo respalde: todas las palabras propias del nombre del lead tienen que estar en el cliente. */
function coincideEstricto(nombre: string, cliente: string): boolean {
  const tb = new Set(normNombre(cliente).split(" ").filter((w) => !GENERICAS.has(w)));
  return String(nombre)
    .split(/[/()]/)
    .some((p) => {
      const ta = normNombre(p).split(" ").filter((w) => w && !GENERICAS.has(w));
      return ta.length > 0 && ta.every((w) => tb.has(w));
    });
}

// ---------------------------------------------------------------------------
// Importación de Excel

export type ResultadoImportacion = {
  tipo: "leads" | "smartbit";
  hojas: number;
  filas: number;
  rif?: { resueltos: number; sinRif: number };
};

const normEncabezado = (s: string) => sinAcentos(s).toLowerCase().replace(/\s+/g, " ").trim();

/** Lee el Excel sin tocar la base: filas listas para insertar. */
export async function leerExcel(buffer: ArrayBuffer, archivo: string, companyId: number, usuario: string) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);

  const leads: any[][] = [];
  const facturas: any[][] = [];
  let hojas = 0;

  for (const ws of wb.worksheets) {
    // El encabezado puede no estar en la primera fila (título arriba).
    let col: Record<string, number> | null = null;
    let filaEnc = 0;
    for (let i = 1; i <= Math.min(8, ws.rowCount) && !col; i++) {
      const vals = (ws.getRow(i).values as any[]) || [];
      const enc: Record<string, number> = {};
      vals.forEach((v, j) => { const t = normEncabezado(texto(v)); if (t) enc[t] = j; });
      if ("nombre del cliente" in enc || ("numero" in enc && "cuenta" in enc)) { col = enc; filaEnc = i; }
    }
    if (!col) continue;
    hojas++;
    const busca = (...prefijos: string[]) => {
      const k = Object.keys(col!).find((h) => prefijos.some((p) => h.startsWith(p)));
      return k ? col![k] : -1;
    };

    if ("nombre del cliente" in col) {
      const c = {
        red: busca("red social"), nombre: col["nombre del cliente"], fecha: busca("fecha inter"),
        tel: busca("numero de telefono", "telefono"), ubic: busca("estado"), vend: busca("asignado", "asigando"),
        estatus: busca("estatus"), monto: busca("monto"), fact: busca("factura"), obs: busca("observacion"),
      };
      const de = (vals: any[], j: number) => (j >= 0 ? vals[j] : null);
      ws.eachRow((row, n) => {
        if (n <= filaEnc) return;
        const v = (row.values as any[]) || [];
        const nombre = texto(de(v, c.nombre)).replace(/\s+/g, " ");
        if (!nombre) return;
        const fecha = fechaISO(celda(de(v, c.fecha)));
        const telefono = texto(de(v, c.tel)).slice(0, 120);
        const clave = createHash("sha1")
          .update(`${companyId}|${nombre.toUpperCase()}|${fecha ?? ""}|${telefono}`)
          .digest("hex");
        leads.push([
          clave, companyId, archivo.slice(0, 255), ws.name.slice(0, 120), texto(de(v, c.red)).slice(0, 60),
          nombre.slice(0, 255), fecha, telefono, texto(de(v, c.ubic)).slice(0, 120),
          texto(de(v, c.vend)).slice(0, 120), texto(de(v, c.estatus)).toUpperCase().slice(0, 40) || null,
          monto(de(v, c.monto)), texto(de(v, c.fact)).slice(0, 255) || null, texto(de(v, c.obs)) || null, usuario,
        ]);
      });
    } else {
      const c = {
        fecha: col["fecha"], num: col["numero"], cuenta: col["cuenta"], cliente: busca("cliente"),
        vend: busca("vendedor"), unid: busca("unidades"), venta: busca("venta"),
      };
      ws.eachRow((row, n) => {
        if (n <= filaEnc) return;
        const v = (row.values as any[]) || [];
        const fecha = fechaISO(celda(v[c.fecha]));
        const venta = monto(v[c.venta]) ?? 0;
        // Las devoluciones llevan su propia numeración: con el prefijo no pisan una factura del mismo número.
        const numero = texto(v[c.num]) && (venta < 0 ? "NC-" : "") + texto(v[c.num]);
        if (!fecha || !numero) return; // la fila de totales no tiene fecha
        facturas.push([
          companyId, fecha, numero.slice(0, 30), normalizarRif(texto(v[c.cuenta])).slice(0, 30) || null,
          texto(v[c.cliente]).slice(0, 255), texto(v[c.vend]).replace(/\s+/g, " ").slice(0, 150),
          monto(v[c.unid]), venta,
        ]);
      });
    }
  }

  if (!leads.length && !facturas.length) {
    throw new Error(
      "No se reconoció el archivo: tiene que ser el Excel de leads de redes (columna \"Nombre del Cliente\") o el de Smartbit \"Ventas / Devoluciones\".",
    );
  }

  return { leads, facturas, hojas };
}

/**
 * Importa un Excel: el de leads de redes ("Nombre del Cliente", "Estatus",
 * "Factura/Pedido"…, una hoja por semana) o el de Smartbit "Ventas /
 * Devoluciones" (Fecha, Numero, Cuenta, Cliente, Vendedor, Unidades, Venta).
 * Se reconoce por los encabezados. Se puede subir varias veces: lo repetido se
 * actualiza, no se duplica.
 */
export async function importarExcel(
  buffer: ArrayBuffer,
  archivo: string,
  companyId: number,
  usuario: string,
): Promise<ResultadoImportacion> {
  const { leads, facturas, hojas } = await leerExcel(buffer, archivo, companyId, usuario);
  await asegurarTablas();
  // Inserción en bloque con db.query (como lib/smartbit.ts): query() usa
  // sentencias preparadas, que no aceptan `VALUES ?` con una lista de filas.
  for (let i = 0; i < leads.length; i += 500) {
    await db.query(
      `INSERT INTO leads_historicos
         (clave, company_id, archivo, hoja, red_social, nombre, fecha_interaccion, telefono, ubicacion,
          vendedor, estatus, monto, factura_txt, observacion, importado_por)
       VALUES ?
       ON DUPLICATE KEY UPDATE archivo = VALUES(archivo), hoja = VALUES(hoja), red_social = VALUES(red_social),
         ubicacion = VALUES(ubicacion), vendedor = VALUES(vendedor), estatus = VALUES(estatus),
         monto = VALUES(monto), factura_txt = VALUES(factura_txt), observacion = VALUES(observacion),
         importado_por = VALUES(importado_por)`,
      [leads.slice(i, i + 500)],
    );
  }
  for (let i = 0; i < facturas.length; i += 500) {
    await db.query(
      `INSERT INTO ventas_smartbit_facturas
         (company_id, fecha, numero, rif, cliente, vendedor, unidades, venta)
       VALUES ?
       ON DUPLICATE KEY UPDATE fecha = VALUES(fecha), rif = VALUES(rif), cliente = VALUES(cliente),
         vendedor = VALUES(vendedor), unidades = VALUES(unidades), venta = VALUES(venta)`,
      [facturas.slice(i, i + 500)],
    );
  }

  // Con leads nuevos, o con facturas que ahora permiten ubicarlos, se vuelve a buscar el RIF.
  const rif = await resolverRifs(companyId);
  return leads.length
    ? { tipo: "leads", hojas, filas: leads.length, rif }
    : { tipo: "smartbit", hojas, filas: facturas.length, rif };
}

// ---------------------------------------------------------------------------
// RIF de los leads de Excel (no lo traen: se deduce de la factura o del nombre)

type Ubicado = { rif: string; origen: string; cliente: string; primera: string | null };

/** Partners de Odoo → { vat normalizado, nombre }. `read` también trae los archivados. */
async function vatsDePartners(ids: number[]): Promise<Map<number, { rif: string; nombre: string }>> {
  const out = new Map<number, { rif: string; nombre: string }>();
  const unicos = [...new Set(ids)];
  for (let i = 0; i < unicos.length; i += 1000) {
    const filas =
      (await callOdooRPCEstricto<any[]>("res.partner", "read", [unicos.slice(i, i + 1000)], {
        fields: ["vat", "name"],
        context: { allowed_company_ids: Object.keys(SEDES).map(Number) },
      })) || [];
    for (const p of filas) out.set(p.id, { rif: normalizarRif(String(p.vat || "")), nombre: p.name || "" });
  }
  return out;
}

/**
 * Busca el RIF de los leads concretados de Excel de una sede, en este orden:
 * 1) un número de "Factura/Pedido" que sea una factura de Smartbit de un cliente
 *    con nombre parecido (la columna mezcla pedido y factura, y el número de
 *    pedido choca con facturas de otros clientes: el nombre desempata);
 * 2) un pedido S-xxxxx de Odoo de esa sede;
 * 3) una factura de Smartbit, hasta 120 días después del lead, de un cliente
 *    con todas las palabras propias del nombre;
 * 4) un cliente de Odoo con ese nombre, si es uno solo.
 * Los que corrigió una persona (`manual`) no se tocan.
 */
export async function resolverRifs(companyId: number): Promise<{ resueltos: number; sinRif: number }> {
  await asegurarTablas();
  const { rows: leads } = await query(
    `SELECT id, nombre, fecha_interaccion, factura_txt FROM leads_historicos
      WHERE company_id = ? AND estatus = 'CONCRETADO' AND (rif_origen IS NULL OR rif_origen <> 'manual')`,
    [companyId],
  );
  if (!leads.length) return { resueltos: 0, sinRif: 0 };

  const { rows: sb } = await query(
    `SELECT DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, numero, rif, cliente, venta
       FROM ventas_smartbit_facturas WHERE company_id = ?`,
    [companyId],
  );
  const porNumero = new Map(sb.map((r: any) => [String(r.numero), r]));
  const ubicados = new Map<number, Ubicado>();

  // 1) factura de Smartbit
  for (const l of leads) {
    const tokens = String(l.factura_txt || "").match(/(?<![\w-])\d{4,6}(?!\d)/g) || [];
    const hits = tokens
      .map((t) => porNumero.get(t))
      .filter((r: any) => r?.rif && parecidoLead(l.nombre, r.cliente) >= 0.6) as any[];
    if (!hits.length) continue;
    const mejor = hits.reduce((a, b) => (parecidoLead(l.nombre, b.cliente) > parecidoLead(l.nombre, a.cliente) ? b : a));
    const primera = hits.filter((h) => h.rif === mejor.rif).map((h) => h.fecha).sort()[0];
    ubicados.set(l.id, { rif: mejor.rif, origen: "factura", cliente: mejor.cliente, primera });
  }

  // 2) pedido de Odoo
  const pedidos = new Map<number, string[]>();
  for (const l of leads) {
    if (ubicados.has(l.id)) continue;
    const s = (String(l.factura_txt || "").toUpperCase().match(/S-?\d{4,6}/g) || []).map((x) =>
      x.includes("-") ? x : `S-${x.slice(1)}`,
    );
    if (s.length) pedidos.set(l.id, s);
  }
  const nombres = [...new Set([...pedidos.values()].flat())];
  if (nombres.length) {
    const ordenes =
      (await callOdooRPCEstricto<any[]>("sale.order", "search_read", [[["name", "in", nombres], ["company_id", "=", companyId]]], {
        fields: ["name", "partner_id", "date_order"],
        context: { allowed_company_ids: [companyId] },
      })) || [];
    const partners = await vatsDePartners(ordenes.map((o) => o.partner_id?.[0]).filter(Boolean));
    const porPedido = new Map(ordenes.map((o) => [o.name, o]));
    for (const [id, lista] of pedidos) {
      const o = lista.map((n) => porPedido.get(n)).find((x) => x && partners.get(x.partner_id?.[0])?.rif);
      if (!o) continue;
      const p = partners.get(o.partner_id[0])!;
      ubicados.set(id, { rif: p.rif, origen: "pedido", cliente: p.nombre, primera: null });
    }
  }

  // 3) nombre en Smartbit, cerca de la fecha del lead
  for (const l of leads) {
    if (ubicados.has(l.id) || !l.fecha_interaccion) continue;
    const d0 = fechaISO(l.fecha_interaccion)!;
    const desde = sumarDias(d0, -3), hasta = sumarDias(d0, 120);
    const cand = sb
      .filter((r: any) => r.rif && r.fecha >= desde && r.fecha <= hasta && Number(r.venta) > 0)
      .filter((r: any) => coincideEstricto(l.nombre, r.cliente))
      .sort((a: any, b: any) => (a.fecha < b.fecha ? -1 : 1));
    if (cand.length) ubicados.set(l.id, { rif: cand[0].rif, origen: "nombre", cliente: cand[0].cliente, primera: cand[0].fecha });
  }

  // 4) nombre en Odoo
  for (const l of leads) {
    if (ubicados.has(l.id)) continue;
    const base = String(l.nombre).split("/")[0].replace(/,?\s*(C\.?\s?A|F\.?\s?P|S\.?\s?A)\.?\s*$/i, "").trim();
    if (base.length < 5) continue;
    const ps =
      (await callOdooRPCEstricto<any[]>(
        "res.partner",
        "search_read",
        [[["name", "ilike", base], ["parent_id", "=", false], ["vat", "!=", false]]],
        { fields: ["vat", "name"], limit: 10 },
      )) || [];
    const rifs = [...new Set(ps.map((p) => normalizarRif(String(p.vat))).filter(Boolean))];
    if (rifs.length === 1) ubicados.set(l.id, { rif: rifs[0], origen: "odoo_nombre", cliente: ps[0].name, primera: null });
  }

  for (const l of leads) {
    const u = ubicados.get(l.id);
    await query(
      `UPDATE leads_historicos SET rif = ?, rif_origen = ?, cliente_rif = ?, primera_venta = ? WHERE id = ?`,
      u ? [u.rif, u.origen, String(u.cliente).slice(0, 255), u.primera, l.id] : [null, null, null, null, l.id],
    );
  }
  return { resueltos: ubicados.size, sinRif: leads.length - ubicados.size };
}

// ---------------------------------------------------------------------------
// Compras por RIF

export type Compra = { fecha: string; sede: number; documento: string; monto: number; fuente: "Smartbit" | "Odoo" };

type FacturaOdoo = Compra & { rif: string; cliente: string; claves: string[] };

// shortcut: caché de 10 minutos en memoria del proceso; si el reporte se usa
// mucho y hace falta al instante lo facturado hoy, bajar el TTL.
let cacheOdoo: { t: number; datos: Promise<FacturaOdoo[]> } | null = null;

/** Facturas de cliente de Odoo desde el corte, en las tres sedes, con su RIF. */
function facturasOdoo(): Promise<FacturaOdoo[]> {
  if (cacheOdoo && Date.now() - cacheOdoo.t < 10 * 60_000) return cacheOdoo.datos;
  const datos = (async () => {
    const movs = await leerTodo(
      "account.move",
      [["move_type", "=", "out_invoice"], ["state", "=", "posted"], ["invoice_date", ">=", CORTE_ODOO]],
      ["name", "invoice_date", "amount_total_signed", "commercial_partner_id", "company_id", "invoice_origin"],
      Object.keys(SEDES).map(Number),
    );
    const partners = await vatsDePartners(movs.map((m) => m.commercial_partner_id?.[0]).filter(Boolean));
    return movs
      .map((m) => {
        const p = partners.get(m.commercial_partner_id?.[0]);
        const name = String(m.name || "");
        // Claves para ubicar el num_factura del panel: el nombre completo, su
        // último tramo numérico (FCLIE/2026/04879 → 4879) y los pedidos de origen.
        const claves = [normalizarRif(name), String(Number(name.split("/").pop()) || "")]
          .concat((String(m.invoice_origin || "").toUpperCase().match(/S-?\d+/g) || []).map(normalizarRif))
          .filter(Boolean);
        return {
          rif: p?.rif || "",
          cliente: p?.nombre || m.commercial_partner_id?.[1] || "",
          fecha: m.invoice_date,
          sede: m.company_id?.[0],
          documento: name,
          monto: Number(m.amount_total_signed) || 0,
          fuente: "Odoo" as const,
          claves,
        };
      })
      .filter((f) => f.rif);
  })();
  cacheOdoo = { t: Date.now(), datos };
  datos.catch(() => { cacheOdoo = null; });
  return datos;
}

async function comprasSmartbit(rifs: string[], desde: string): Promise<(Compra & { rif: string })[]> {
  if (!rifs.length) return [];
  const marcas = rifs.map(() => "?").join(",");
  const { rows: fact } = await query(
    `SELECT company_id, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, numero, rif, venta
       FROM ventas_smartbit_facturas
      WHERE fecha < ? AND fecha >= ? AND venta > 0 AND rif IN (${marcas})`,
    [CORTE_ODOO, desde, ...rifs],
  );
  // Las sedes sin el Excel de facturas salen del histórico por artículo: una compra = un cliente en un día.
  const { rows: art } = await query(
    `SELECT company_id, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, ${RIF_SQL} AS rif, SUM(venta) AS venta
       FROM ventas_smartbit
      WHERE fecha < ? AND fecha >= ?
        AND company_id NOT IN (SELECT DISTINCT company_id FROM ventas_smartbit_facturas)
        AND ${RIF_SQL} IN (${marcas})
      GROUP BY company_id, fecha, rif
     HAVING SUM(venta) > 0`,
    [CORTE_ODOO, desde, ...rifs],
  );
  return [
    ...fact.map((r: any) => ({ rif: r.rif, fecha: r.fecha, sede: r.company_id, documento: String(r.numero), monto: Number(r.venta), fuente: "Smartbit" as const })),
    ...art.map((r: any) => ({ rif: r.rif, fecha: r.fecha, sede: r.company_id, documento: "", monto: Number(r.venta), fuente: "Smartbit" as const })),
  ];
}

// ---------------------------------------------------------------------------
// Reporte

export type ClienteRecompra = {
  rif: string;
  cliente: string;
  sede: number | null;
  origen: "Excel" | "Panel";
  vendedor: string;
  campana: string;
  entrada: string | null;
  primeraVenta: string;
  montoPrimera: number;
  comprasAntes: number;
  comprasDespues: number;
  montoDespues: number;
  primeraRecompra: string | null;
  diasHastaRecompra: number | null;
  ultimaCompra: string | null;
  despues: Compra[];
};

export type SinRif = { origen: "Excel" | "Panel"; id: number; sede: number | null; nombre: string; fecha: string | null; vendedor: string; factura: string };

export type ReporteRecompra = {
  corte: string;
  ventana: number;
  resumen: {
    clientes: number;
    conRecompra: number;
    pctRecompra: number | null;
    comprasDespues: number;
    montoDespues: number;
    yaEranClientes: number;
    distribucion: { rango: string; clientes: number }[];
  };
  clientes: ClienteRecompra[];
  sinRif: SinRif[];
};

const ES_VENTA = "l.status = 'CERRADO' AND l.motivo_cierre IN ('VENTA', 'GANADO')";

type LeadVenta = {
  origen: "Excel" | "Panel";
  id: number;
  rif: string;
  nombre: string;
  sede: number | null;
  vendedor: string;
  campana: string;
  entrada: string | null;
  venta: string | null; // fecha de la primera venta, si se conoce
  monto: number;
  factura: string;
};

export async function calcularRecompra(opts: {
  userCids: number | null;
  sede: number | null;
  desde: string | null;
  hasta: string | null;
  origen: "Excel" | "Panel" | null;
}): Promise<ReporteRecompra> {
  await asegurarTablas();
  // Panamá solo ve Panamá, igual que el resto de los reportes de leads.
  const sede = opts.userCids === 7 ? 7 : opts.sede;

  const [{ rows: panel }, { rows: excel }, odoo] = await Promise.all([
    query(
      `SELECT l.id, COALESCE(NULLIF(TRIM(l.name), ''), l.nombre_contacto) AS nombre, l.rif, l.num_factura,
              DATE_FORMAT(l.fecha_venta, '%Y-%m-%d') AS venta, l.monto_cerrado_usd,
              DATE_FORMAT(COALESCE(l.fecha_ingreso, l.created_at), '%Y-%m-%d') AS entrada,
              COALESCE(NULLIF(TRIM(l.campana), ''), ${canalNormalizadoSql("l.canal_origen")}) AS campana,
              s.name AS vendedor, s.cids
         FROM leads l LEFT JOIN sellers s ON s.id = l.seller_id
        WHERE ${ES_VENTA} AND l.fecha_venta IS NOT NULL`,
    ),
    query(
      `SELECT id, nombre, rif, company_id, vendedor, red_social, monto, factura_txt,
              DATE_FORMAT(fecha_interaccion, '%Y-%m-%d') AS entrada,
              DATE_FORMAT(primera_venta, '%Y-%m-%d') AS primera
         FROM leads_historicos WHERE estatus = 'CONCRETADO'`,
    ),
    facturasOdoo(),
  ]);

  // num_factura del panel → RIF, para los leads que no tienen el RIF cargado.
  const porClave = new Map<string, string>();
  for (const f of odoo) for (const k of f.claves) porClave.set(`${f.sede}|${k}`, f.rif);
  const rifDeFactura = (txt: string, cids: number | null) => {
    const piezas = [txt, ...txt.split(/[\s,;|/]+/)].map(normalizarRif).filter(Boolean);
    for (const p of piezas) {
      const k = /^\d+$/.test(p) ? String(Number(p)) : p;
      for (const s of cids ? [cids] : Object.keys(SEDES).map(Number)) {
        const r = porClave.get(`${s}|${k}`);
        if (r) return r;
      }
    }
    return "";
  };

  const leads: LeadVenta[] = [];
  const sinRif: SinRif[] = [];
  for (const l of panel) {
    const cids = l.cids != null ? Number(l.cids) : null;
    const rif = normalizarRif(String(l.rif || "")) || rifDeFactura(String(l.num_factura || ""), cids);
    const lead: LeadVenta = {
      origen: "Panel", id: l.id, rif, nombre: l.nombre || "", sede: cids, vendedor: l.vendedor || "",
      campana: l.campana || "", entrada: l.entrada, venta: l.venta, monto: Number(l.monto_cerrado_usd) || 0,
      factura: String(l.num_factura || ""),
    };
    if (rif.length >= 6) leads.push(lead);
    else sinRif.push({ origen: "Panel", id: l.id, sede: cids, nombre: lead.nombre, fecha: l.venta, vendedor: lead.vendedor, factura: lead.factura });
  }
  for (const l of excel) {
    const lead: LeadVenta = {
      origen: "Excel", id: l.id, rif: l.rif || "", nombre: l.nombre, sede: l.company_id, vendedor: l.vendedor || "",
      campana: l.red_social || "", entrada: l.entrada, venta: l.primera, monto: Number(l.monto) || 0,
      factura: String(l.factura_txt || ""),
    };
    if (lead.rif) leads.push(lead);
    else sinRif.push({ origen: "Excel", id: l.id, sede: l.company_id, nombre: l.nombre, fecha: l.entrada, vendedor: lead.vendedor, factura: lead.factura });
  }

  const rifs = [...new Set(leads.map((l) => l.rif))];
  const fechas = leads.map((l) => l.entrada || l.venta).filter(Boolean).sort() as string[];
  // Un año antes del primer lead alcanza para saber si ya era cliente.
  const sb = await comprasSmartbit(rifs, sumarDias(fechas[0] || CORTE_ODOO, -365));

  const compras = new Map<string, Compra[]>();
  const nombreCliente = new Map<string, string>();
  const quiero = new Set(rifs);
  for (const f of odoo) {
    if (!quiero.has(f.rif)) continue;
    const { rif, cliente, claves, ...c } = f;
    nombreCliente.set(rif, cliente);
    (compras.get(rif) ?? compras.set(rif, []).get(rif)!).push(c);
  }
  for (const { rif, ...c } of sb) (compras.get(rif) ?? compras.set(rif, []).get(rif)!).push(c);
  for (const lista of compras.values()) lista.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));

  // Fecha de la primera venta de cada lead: la del panel; en los de Excel, la
  // factura que se ubicó o, si no, la primera compra desde que entró el lead.
  for (const l of leads) {
    if (l.venta) continue;
    const base = l.entrada ? sumarDias(l.entrada, -VENTANA_PRIMERA_VENTA) : null;
    l.venta = (base && compras.get(l.rif)?.find((c) => c.fecha >= base)?.fecha) || l.entrada;
  }

  const porRif = new Map<string, LeadVenta[]>();
  for (const l of leads) if (l.venta) (porRif.get(l.rif) ?? porRif.set(l.rif, []).get(l.rif)!).push(l);

  let clientes: ClienteRecompra[] = [];
  for (const [rif, ls] of porRif) {
    ls.sort((a, b) => (a.venta! < b.venta! ? -1 : 1));
    const primero = ls[0];
    // fecha_ingreso del panel a veces es posterior a la venta (se reescribe al
    // reasignar o reactivar): nunca se toma una entrada después de la venta.
    const entrada = [...ls.map((l) => l.entrada), primero.venta].filter(Boolean).sort()[0]!;
    const lista = compras.get(rif) ?? [];
    const limite = sumarDias(primero.venta!, VENTANA_PRIMERA_VENTA);
    const despues = lista.filter((c) => c.fecha > limite);
    clientes.push({
      rif,
      cliente: nombreCliente.get(rif) || primero.nombre,
      sede: primero.sede,
      origen: primero.origen,
      vendedor: primero.vendedor,
      campana: primero.campana,
      entrada,
      primeraVenta: primero.venta!,
      montoPrimera: r2(primero.monto),
      comprasAntes: lista.filter((c) => c.fecha < entrada).length,
      comprasDespues: despues.length,
      montoDespues: r2(despues.reduce((s, c) => s + c.monto, 0)),
      primeraRecompra: despues[0]?.fecha ?? null,
      diasHastaRecompra: despues[0] ? diasEntre(primero.venta!, despues[0].fecha) : null,
      ultimaCompra: despues.length ? despues[despues.length - 1].fecha : null,
      despues,
    });
  }

  clientes = clientes
    .filter((c) => sede == null || c.sede === sede)
    .filter((c) => !opts.origen || c.origen === opts.origen)
    .filter((c) => !opts.desde || c.primeraVenta >= opts.desde)
    .filter((c) => !opts.hasta || c.primeraVenta <= opts.hasta)
    .sort((a, b) => b.comprasDespues - a.comprasDespues || b.montoDespues - a.montoDespues);

  const rangos: [string, (n: number) => boolean][] = [
    ["Ninguna", (n) => n === 0], ["1", (n) => n === 1], ["2 a 3", (n) => n >= 2 && n <= 3],
    ["4 a 9", (n) => n >= 4 && n <= 9], ["10 o más", (n) => n >= 10],
  ];
  const conRecompra = clientes.filter((c) => c.comprasDespues > 0).length;
  return {
    corte: CORTE_ODOO,
    ventana: VENTANA_PRIMERA_VENTA,
    resumen: {
      clientes: clientes.length,
      conRecompra,
      pctRecompra: clientes.length ? r2((conRecompra * 100) / clientes.length) : null,
      comprasDespues: clientes.reduce((s, c) => s + c.comprasDespues, 0),
      montoDespues: r2(clientes.reduce((s, c) => s + c.montoDespues, 0)),
      yaEranClientes: clientes.filter((c) => c.comprasAntes > 0).length,
      distribucion: rangos.map(([rango, f]) => ({ rango, clientes: clientes.filter((c) => f(c.comprasDespues)).length })),
    },
    clientes,
    sinRif: sinRif.filter((s) => (sede == null || s.sede === sede) && (!opts.origen || s.origen === opts.origen)),
  };
}

/** Filtros del reporte desde la URL (los usa la pantalla y el Excel). */
export function filtrosRecompra(sp: URLSearchParams) {
  const n = parseInt(sp.get("sede") || "", 10);
  const f = (k: string) => (/^\d{4}-\d{2}-\d{2}$/.test(sp.get(k) || "") ? sp.get(k)! : null);
  const o = sp.get("origen");
  return {
    sede: SEDES[n] ? n : null,
    desde: f("desde"),
    hasta: f("hasta"),
    origen: o === "Excel" || o === "Panel" ? (o as "Excel" | "Panel") : null,
  };
}
