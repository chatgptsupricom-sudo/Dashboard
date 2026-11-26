/**
 * Cotización directa a Odoo desde la tienda web (cliente con sesión de «Mi cuenta»): lo que lleva en el carrito
 * se crea como cotización (`sale.order` en borrador) a nombre de su ficha en la sede que está viendo, con su
 * vendedor y su lista de precios (Odoo los pone de la ficha). Así aparece al instante en «Mi cuenta › Pedidos»
 * y el vendedor recibe una actividad en Odoo para revisarla. El cliente no paga nada aquí: el vendedor la
 * confirma (o la ajusta) como siempre.
 *
 * - Solo a nombre de una ficha que el cliente ve al entrar (`partners_odoo` de la sesión), nunca otra.
 * - Un código que no está en Odoo (o no se vende) va como nota «por revisar» dentro de la cotización.
 * - `clave` (la genera la tienda por envío): un doble clic o un reintento devuelven la misma cotización. Tabla
 *   `tienda_cotizaciones` (se crea sola) con la clave, quién, la sede y la cotización de Odoo.
 * - Deja una nota en el chatter con quién la envió (en Odoo queda a nombre del usuario de ODOO_API_KEY).
 */
import { db } from "@/lib/db";
import { callOdooRPCEstricto } from "@/lib/odoo";
import type { ClienteOdoo } from "./odoo";
import { COMPANIAS_TIENDA, SEDE_DE_COMPANIA, type DatosCotizacion } from "./tipos";

const ctx = (cid: number) => ({ allowed_company_ids: [cid, ...COMPANIAS_TIENDA.filter((c) => c !== cid)], lang: "es_VE" });
// Las notas van en texto plano: Odoo 17 escapa el HTML que llega por la API (como las demás notas del panel).
const plano = (t: string) => t.replace(/[<>]/g, "").replace(/\s*\n\s*/g, " / ").trim();

let tablaLista: Promise<void> | null = null;
function asegurarTabla(): Promise<void> {
  if (!tablaLista) {
    tablaLista = db.execute(`
      CREATE TABLE IF NOT EXISTS tienda_cotizaciones (
        clave VARCHAR(64) PRIMARY KEY,
        correo VARCHAR(160) NOT NULL,
        company_id INT NOT NULL,
        partner_id INT NULL,
        sale_order_id INT NULL,
        numero VARCHAR(40) NULL,
        lineas INT NOT NULL DEFAULT 0,
        creado_el TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        KEY idx_correo (correo, creado_el)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `).then(() => undefined).catch((e) => { tablaLista = null; throw e; });
  }
  return tablaLista;
}

export type ResultadoCotizacion =
  | { ok: true; id: number; numero: string; vendedor: string; porRevisar: string[]; repetida: boolean }
  | { ok: false; status: number; error: string; motivo?: "sin_ficha" | "en_proceso" };

export async function crearCotizacion(c: ClienteOdoo, correo: string, d: DatosCotizacion): Promise<ResultadoCotizacion> {
  const cid = COMPANIAS_TIENDA.find((id) => SEDE_DE_COMPANIA[id].id === d.sede)!;
  const sedeNombre = SEDE_DE_COMPANIA[cid].nombre;

  // Su ficha en esa sede (solo las que ve al entrar). Sin ficha allá, la cotización va por WhatsApp/correo.
  const fichas = (await callOdooRPCEstricto<any[]>("res.partner", "read", [c.partners, ["company_id", "user_id", "name"]], { context: ctx(cid) })) || [];
  const enLaSede = fichas.filter((f) => Number(f.company_id?.[0]) === cid);
  if (!enLaSede.length) {
    return { ok: false, status: 409, motivo: "sin_ficha", error: `Todavía no tienes cuenta en ${sedeNombre}: envía la cotización por WhatsApp o correo y tu vendedor te atiende.` };
  }
  const ficha = enLaSede.find((f) => f.user_id) || enLaSede[0];

  // Un envío = una cotización: la clave se aparta antes de tocar Odoo.
  await asegurarTabla();
  const [ins]: any = await db.execute(
    "INSERT IGNORE INTO tienda_cotizaciones (clave, correo, company_id, partner_id, lineas) VALUES (?, ?, ?, ?, ?)",
    [d.clave, correo, cid, ficha.id, d.lineas.length],
  );
  if (!ins?.affectedRows) {
    const [filas]: any = await db.execute("SELECT sale_order_id, numero, correo FROM tienda_cotizaciones WHERE clave = ?", [d.clave]);
    const f = filas?.[0];
    if (f && f.correo === correo && f.sale_order_id) {
      return { ok: true, id: Number(f.sale_order_id), numero: String(f.numero || ""), vendedor: ficha.user_id ? String(ficha.user_id[1]) : "", porRevisar: [], repetida: true };
    }
    return { ok: false, status: 409, motivo: "en_proceso", error: "Tu cotización ya se está enviando. Espera unos segundos y revisa Mi cuenta." };
  }

  try {
    // Los productos por su código, en esa sede (o de todas), que se venden.
    const codigos = d.lineas.map((l) => l.codigo);
    const porCodigo = new Map<string, number>();
    for (let i = 0; i < codigos.length; i += 100) {
      const tramo = codigos.slice(i, i + 100);
      const condiciones = tramo.map((k) => ["default_code", "=ilike", k]);
      const dominio = [["sale_ok", "=", true], ["company_id", "in", [false, cid]], ...Array(Math.max(0, condiciones.length - 1)).fill("|"), ...condiciones];
      const prods = (await callOdooRPCEstricto<any[]>("product.product", "search_read", [dominio], { fields: ["id", "default_code"], context: ctx(cid), limit: 500 })) || [];
      for (const p of prods) {
        const k = String(p.default_code || "").trim().toUpperCase();
        if (k && !porCodigo.has(k)) porCodigo.set(k, p.id);
      }
    }
    const porRevisar = d.lineas.filter((l) => !porCodigo.has(l.codigo));
    const lineas: any[] = d.lineas.filter((l) => porCodigo.has(l.codigo))
      .map((l) => [0, 0, { product_id: porCodigo.get(l.codigo), product_uom_qty: l.cantidad }]);
    if (porRevisar.length) {
      lineas.push([0, 0, { display_type: "line_section", name: "Códigos por revisar (el cliente los pidió y no están en el catálogo)" }]);
      for (const l of porRevisar) lineas.push([0, 0, { display_type: "line_note", name: `${l.codigo} × ${l.cantidad}` }]);
    }

    const vals: Record<string, unknown> = { partner_id: ficha.id, company_id: cid, origin: "Tienda web", order_line: lineas };
    if (ficha.user_id) vals.user_id = ficha.user_id[0];
    const id = await callOdooRPCEstricto<number>("sale.order", "create", [vals], { context: ctx(cid) });
    if (!id) throw new Error("Odoo no devolvió la cotización");
    const [orden] = (await callOdooRPCEstricto<any[]>("sale.order", "read", [[id], ["name", "user_id"]], { context: ctx(cid) })) || [];
    const numero = String(orden?.name || "");
    const vendedor = orden?.user_id ? String(orden.user_id[1]) : "";
    await db.execute("UPDATE tienda_cotizaciones SET sale_order_id = ?, numero = ? WHERE clave = ?", [id, numero, d.clave]);

    // Quién la envió y su nota (en el chatter) y una actividad para el vendedor. Si falla, la cotización ya está.
    const cuerpo = [
      `Cotización enviada desde la tienda web por ${plano(correo)} (${d.lineas.length} ${d.lineas.length === 1 ? "producto" : "productos"}).`,
      d.nota ? `Nota del cliente: ${plano(d.nota)}` : "",
      porRevisar.length ? `Códigos que no están en el catálogo: ${plano(porRevisar.map((l) => l.codigo).join(", "))}.` : "",
    ].filter(Boolean).join(" · ");
    await callOdooRPCEstricto("sale.order", "message_post", [[id]], { body: cuerpo, message_type: "comment", subtype_xmlid: "mail.mt_note", context: ctx(cid) }).catch(() => {});
    if (orden?.user_id) {
      await callOdooRPCEstricto("sale.order", "activity_schedule", [[id]], {
        act_type_xmlid: "mail.mail_activity_data_todo",
        summary: "Revisar cotización de la tienda web",
        note: d.nota ? plano(d.nota) : "",
        user_id: orden.user_id[0],
        context: ctx(cid),
      }).catch((e: any) => console.error("[tienda-web/cotizacion] actividad:", e?.message || e));
    }
    return { ok: true, id, numero, vendedor, porRevisar: porRevisar.map((l) => l.codigo), repetida: false };
  } catch (e) {
    // Sin cotización en Odoo: se libera la clave para que el cliente pueda reintentar.
    await db.execute("DELETE FROM tienda_cotizaciones WHERE clave = ? AND sale_order_id IS NULL", [d.clave]).catch(() => {});
    throw e;
  }
}
