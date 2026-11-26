/**
 * Seguimiento de las cotizaciones de la tienda web y «Aceptar» desde «Mi cuenta».
 *
 * - `aceptarCotizacion`: el cliente acepta con un clic una cotización que su vendedor ya le **envió** (estado
 *   `sent`: el vendedor revisó precios y existencia). La confirma en Odoo (`action_confirm`), deja nota en el
 *   chatter y una actividad al vendedor. Una en borrador no se acepta (el vendedor todavía la revisa); una
 *   vencida tampoco. Sirve para cualquier cotización suya, también las que el vendedor hizo en Odoo.
 * - `revisarCotizaciones` (cron de server.js cada 10 min → `GET /api/cron/tienda-cotizaciones`): mira en Odoo en qué
 *   va cada cotización enviada desde la tienda (`tienda_cotizaciones`, últimos 120 días) y, cuando avanza (lista,
 *   confirmada, despachada, facturada o anulada; `hitoPedido`/`avisoPendiente` de tipos.ts), le avisa por correo a
 *   quien la envió: fila en `tienda_pedido_avisos` (se crea sola) + `{evento, aviso_id}` al webhook de n8n
 *   `N8N_TIENDA_PEDIDO_WEBHOOK_URL` (flujo «Tienda web - Avisos de pedidos», `scripts/n8n-tienda-avisos-pedido.json`),
 *   que lee la fila y manda el correo. Sin la variable no se avisa (queda la fila).
 *   `TIENDA_WEB_URL` (opcional): la dirección de la tienda, para el botón «Ver en Mi cuenta» del correo.
 */
import { db } from "@/lib/db";
import { callOdooRPCEstricto } from "@/lib/odoo";
import { hoyCaracas } from "@/lib/compras/datosOdoo";
import { asegurarTabla } from "./cotizacion";
import type { ClienteOdoo } from "./odoo";
import { avisoPendiente, COMPANIAS_TIENDA, hitoPedido, SEDE_DE_COMPANIA, type HitoPedido } from "./tipos";

const ctx = (cid: number) => ({ allowed_company_ids: [cid, ...COMPANIAS_TIENDA.filter((c) => c !== cid)], lang: "es_VE" });
const plano = (t: string) => t.replace(/[<>]/g, "").trim();
const redondear = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;

let tablaAvisos: Promise<void> | null = null;
function asegurarTablas(): Promise<void> {
  if (!tablaAvisos) {
    tablaAvisos = (async () => {
      await asegurarTabla();
      await db.execute(`
        CREATE TABLE IF NOT EXISTS tienda_pedido_avisos (
          id INT AUTO_INCREMENT PRIMARY KEY,
          clave VARCHAR(64) NULL,
          correo VARCHAR(160) NOT NULL,
          sale_order_id INT NOT NULL,
          numero VARCHAR(40) NOT NULL,
          aviso VARCHAR(20) NOT NULL,
          sede VARCHAR(40) NULL,
          vendedor VARCHAR(160) NULL,
          total DECIMAL(14,2) NULL,
          moneda VARCHAR(10) NULL,
          enlace VARCHAR(300) NULL,
          creado_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          enviado_at DATETIME NULL,
          KEY idx_orden (sale_order_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    })().catch((e) => { tablaAvisos = null; throw e; });
  }
  return tablaAvisos;
}

function avisarN8n(id: number): void {
  const url = process.env.N8N_TIENDA_PEDIDO_WEBHOOK_URL;
  if (!id) return;
  if (!url) { console.warn(`[tienda-web/seguimiento] aviso ${id} sin enviar: falta N8N_TIENDA_PEDIDO_WEBHOOK_URL`); return; }
  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ evento: "tienda_pedido", aviso_id: id }),
    signal: AbortSignal.timeout(10000),
  })
    .then((r) => { if (!r.ok) console.error(`[tienda-web/seguimiento] aviso ${id}: n8n respondió ${r.status}`); })
    .catch((e) => console.error(`[tienda-web/seguimiento] aviso ${id}:`, e?.message));
}

const enlaceMiCuenta = (sede: string) => {
  const base = String(process.env.TIENDA_WEB_URL || "").trim().replace(/\/+$/, "");
  return /^https:\/\//.test(base) ? `${base}/mi-cuenta.html?sede=${sede}#pedidos` : "";
};

/**
 * Anota el aviso y lo manda, solo si `ultimo_aviso` sigue siendo `antes` (así el cron y «Aceptar» no avisan dos
 * veces lo mismo). `orden`: la cotización como se lee de Odoo.
 */
async function registrarAviso(fila: { clave: string; correo: string; ultimo_aviso: string | null }, orden: any, hito: HitoPedido): Promise<boolean> {
  const [up]: any = await db.execute(
    "UPDATE tienda_cotizaciones SET ultimo_aviso = ? WHERE clave = ? AND (ultimo_aviso <=> ?)",
    [hito, fila.clave, fila.ultimo_aviso ?? null],
  );
  if (!up?.affectedRows) return false;
  const cid = Number(orden.company_id?.[0]);
  const sede = SEDE_DE_COMPANIA[cid] || { id: "valencia", nombre: "" };
  const [ins]: any = await db.execute(
    "INSERT INTO tienda_pedido_avisos (clave, correo, sale_order_id, numero, aviso, sede, vendedor, total, moneda, enlace) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [fila.clave, fila.correo, orden.id, String(orden.name || ""), hito, sede.nombre, orden.user_id ? String(orden.user_id[1]) : null,
      redondear(orden.amount_total), orden.currency_id ? String(orden.currency_id[1]) : "USD", enlaceMiCuenta(sede.id) || null],
  );
  avisarN8n(Number(ins?.insertId));
  return true;
}

const CAMPOS = ["id", "name", "state", "invoice_status", "amount_total", "currency_id", "company_id", "user_id"];
async function leerOrdenes(ids: number[], cid: number): Promise<any[]> {
  if (!ids.length) return [];
  try {
    return (await callOdooRPCEstricto<any[]>("sale.order", "read", [ids, [...CAMPOS, "delivery_status"]], { context: ctx(cid) })) || [];
  } catch {
    // Sin sale_stock no hay delivery_status: se sigue sin «despachada».
    return (await callOdooRPCEstricto<any[]>("sale.order", "read", [ids, CAMPOS], { context: ctx(cid) })) || [];
  }
}

/** Revisa en Odoo las cotizaciones de la tienda que siguen en camino y avisa lo que avanzó. */
export async function revisarCotizaciones(): Promise<{ revisadas: number; avisos: number }> {
  await asegurarTablas();
  const [filas]: any = await db.query(
    `SELECT clave, correo, company_id, sale_order_id, ultimo_aviso FROM tienda_cotizaciones
      WHERE sale_order_id IS NOT NULL AND (ultimo_aviso IS NULL OR ultimo_aviso NOT IN ('facturada', 'anulada'))
        AND creado_el > NOW() - INTERVAL 120 DAY
      ORDER BY creado_el DESC LIMIT 500`,
  );
  let avisos = 0;
  for (const cid of COMPANIAS_TIENDA) {
    const deLaSede = (filas || []).filter((f: any) => Number(f.company_id) === cid);
    for (let i = 0; i < deLaSede.length; i += 100) {
      const tramo = deLaSede.slice(i, i + 100);
      const ordenes = await leerOrdenes(tramo.map((f: any) => Number(f.sale_order_id)), cid);
      for (const f of tramo) {
        const o = ordenes.find((x) => x.id === Number(f.sale_order_id));
        if (!o) continue;
        const hito = avisoPendiente(f.ultimo_aviso, hitoPedido(o));
        if (hito && (await registrarAviso(f, o, hito))) avisos++;
      }
    }
  }
  return { revisadas: (filas || []).length, avisos };
}

export type ResultadoAceptar =
  | { ok: true; numero: string; yaEstaba: boolean }
  | { ok: false; status: number; error: string };

export async function aceptarCotizacion(c: ClienteOdoo, correo: string, id: number): Promise<ResultadoAceptar> {
  // Solo una cotización suya (de las fichas de su sesión), en una sede de la tienda.
  const [o] = (await callOdooRPCEstricto<any[]>("sale.order", "search_read", [[["id", "=", id], ["partner_id", "child_of", c.partners], ["company_id", "in", COMPANIAS_TIENDA]]], {
    fields: [...CAMPOS, "validity_date"], limit: 1, context: { allowed_company_ids: COMPANIAS_TIENDA, lang: "es_VE" },
  })) || [];
  if (!o) return { ok: false, status: 404, error: "Cotización no encontrada" };
  const cid = Number(o.company_id[0]);
  if (o.state === "sale") return { ok: true, numero: String(o.name), yaEstaba: true };
  if (o.state === "draft") return { ok: false, status: 409, error: "Tu vendedor todavía la está revisando. Cuando te la envíe con los precios finales, la puedes aceptar aquí." };
  if (o.state !== "sent") return { ok: false, status: 409, error: "Esta cotización ya no se puede aceptar. Escríbele a tu vendedor." };
  if (o.validity_date && String(o.validity_date).slice(0, 10) < hoyCaracas()) {
    return { ok: false, status: 409, error: "Esta cotización venció. Pídele a tu vendedor que la actualice." };
  }

  await callOdooRPCEstricto("sale.order", "action_confirm", [[id]], { context: ctx(cid) });
  const [despues] = await leerOrdenes([id], cid);
  const vendedor = despues?.user_id?.[0] || o.user_id?.[0];
  if (despues?.state !== "sale") {
    // Odoo no la confirmó sola (por ejemplo, pide una aprobación): se le avisa al vendedor para que la confirme.
    if (vendedor) {
      await callOdooRPCEstricto("sale.order", "activity_schedule", [[id]], {
        act_type_xmlid: "mail.mail_activity_data_todo", summary: "El cliente aceptó la cotización: confirmarla", user_id: vendedor, context: ctx(cid),
      }).catch(() => {});
    }
    return { ok: false, status: 409, error: "Recibimos tu aceptación, pero tu vendedor tiene que confirmarla. Ya le avisamos." };
  }
  await callOdooRPCEstricto("sale.order", "message_post", [[id]], {
    body: `Cotización aceptada por el cliente desde Mi cuenta de la tienda web (${plano(correo)}).`,
    message_type: "comment", subtype_xmlid: "mail.mt_note", context: ctx(cid),
  }).catch(() => {});
  if (vendedor) {
    await callOdooRPCEstricto("sale.order", "activity_schedule", [[id]], {
      act_type_xmlid: "mail.mail_activity_data_todo", summary: "El cliente aceptó la cotización en la tienda web: preparar el pedido", user_id: vendedor, context: ctx(cid),
    }).catch(() => {});
  }
  // Si salió de la tienda, el correo de «confirmado» le llega ya (no espera al cron).
  try {
    await asegurarTablas();
    const [filas]: any = await db.execute("SELECT clave, correo, ultimo_aviso FROM tienda_cotizaciones WHERE sale_order_id = ? LIMIT 1", [id]);
    const f = filas?.[0];
    if (f && avisoPendiente(f.ultimo_aviso, "confirmada")) await registrarAviso(f, despues, "confirmada");
  } catch (e: any) {
    console.error("[tienda-web/seguimiento] aviso al aceptar:", e?.message || e);
  }
  return { ok: true, numero: String(o.name), yaEstaba: false };
}
