import { query } from "@/lib/db";
import { callOdooRPCEstricto } from "@/lib/odoo";
import { normalizarCodigo } from "@/lib/escaneo/codigos";
import { SUCURSALES } from "@/lib/recepcion/flujo";

/**
 * Aviso a los adminLeads cuando Compras carga un packing list de Venezuela:
 * los productos que vienen sin imagen en Odoo o sin flyer en el Banco de
 * Flyers (`product_images`), y cuáles son nuevos (no están en Odoo o nunca
 * tuvieron existencia), que es por qué les falta todo.
 *
 * Va al flujo de n8n "Recepción - Material faltante"
 * (`N8N_RECEPCION_WEBHOOK_URL`). Como en Material POP, el panel no manda
 * direcciones: n8n busca a los adminLeads en `users_config` + `roles`, de
 * cualquier sede de Venezuela, porque el packing list de Valencia y el de
 * Caracas se ven en las dos.
 *
 * Fire-and-forget: si Odoo o n8n fallan, el packing list ya quedó cargado.
 */

/** Packing lists que avisan: Valencia y Caracas. */
const SEDES_AVISO = [9, 10];
const TODAS_LAS_SEDES = SUCURSALES.map((s) => s.cids);

export type ProductoFaltante = {
  codigo: string | null;
  producto: string;
  marca: string | null;
  cantidad: number;
  /** No está en Odoo, o está pero nunca tuvo existencia (ningún movimiento hecho). */
  nuevo: boolean;
  en_odoo: boolean;
  sin_imagen: boolean;
  sin_flyer: boolean;
};

export function avisarMaterialFaltante(recepcionId: number, origenPeticion: string): void {
  procesarAviso(recepcionId, origenPeticion).catch((e) => {
    console.error(`[recepcion/avisoMaterial] recepcion ${recepcionId}:`, e?.message);
  });
}

async function procesarAviso(recepcionId: number, origenPeticion: string): Promise<void> {
  const url = process.env.N8N_RECEPCION_WEBHOOK_URL;
  if (!url) return;

  const cab = ((await query(
    `SELECT id, cids, proveedor, referencia, fecha_estimada, creado_por
       FROM recepcion_packing WHERE id = ?`,
    [recepcionId],
  )).rows as any[])[0];
  if (!cab || !SEDES_AVISO.includes(Number(cab.cids))) return;

  const items = (await query(
    `SELECT codigo, producto, cantidad_esperada FROM recepcion_packing_items WHERE recepcion_id = ?`,
    [recepcionId],
  )).rows as any[];
  const faltantes = await productosSinMaterial(items);
  if (faltantes.length === 0) return;

  const origen = origenPeticion.replace(/\/+$/, "");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      evento: "recepcion_material_faltante",
      cids: Number(cab.cids),
      recepcion: {
        id: Number(cab.id),
        sede: SUCURSALES.find((s) => s.cids === Number(cab.cids))?.nombre || null,
        proveedor: cab.proveedor,
        referencia: cab.referencia,
        fecha_estimada: cab.fecha_estimada,
        cargado_por: cab.creado_por,
        total_productos: items.length,
      },
      resumen: {
        nuevos: faltantes.filter((f) => f.nuevo).length,
        sin_imagen: faltantes.filter((f) => f.sin_imagen).length,
        sin_flyer: faltantes.filter((f) => f.sin_flyer).length,
      },
      items: faltantes,
      link: `${origen}/es/adminleads/banco-imagenes`,
    }),
  });
  if (!res.ok) {
    console.error(`[recepcion/avisoMaterial] n8n respondió ${res.status} (recepcion ${recepcionId})`);
  }
}

/** Los renglones del packing list a los que les falta imagen o flyer. */
export async function productosSinMaterial(
  items: Array<{ codigo: string | null; producto: string; cantidad_esperada: number }>,
): Promise<ProductoFaltante[]> {
  // Un mismo producto puede venir en varios renglones (varios contenedores).
  const porCodigo = new Map<string, { codigo: string | null; producto: string; cantidad: number }>();
  for (const it of items) {
    const clave = normalizarCodigo(it.codigo) || `#${it.producto}`;
    const previo = porCodigo.get(clave);
    if (previo) previo.cantidad += Number(it.cantidad_esperada) || 0;
    else porCodigo.set(clave, { codigo: it.codigo, producto: it.producto, cantidad: Number(it.cantidad_esperada) || 0 });
  }

  const codigos = [...porCodigo.keys()].filter((c) => !c.startsWith("#"));
  const ctx = { active_test: false, allowed_company_ids: TODAS_LAS_SEDES };

  // Productos de Odoo por código (exacto, sin mayúsculas ni espacios).
  const odoo = new Map<string, { id: number; marca: string | null; conImagen: boolean }>();
  if (codigos.length > 0) {
    const dominio: any[] = codigos.map(() => "|").slice(1);
    for (const c of codigos) dominio.push(["default_code", "=ilike", c]);
    const encontrados = (await callOdooRPCEstricto<any[]>("product.product", "search_read", [dominio], {
      fields: ["default_code", "image_128", "spiff_brand_id", "active"],
      context: ctx,
    })) || [];
    // Con duplicados (uno archivado), gana el activo.
    encontrados.sort((a, b) => Number(a.active) - Number(b.active));
    for (const p of encontrados) {
      odoo.set(normalizarCodigo(p.default_code), {
        id: p.id,
        marca: p.spiff_brand_id ? String(p.spiff_brand_id[1]) : null,
        conImagen: Boolean(p.image_128),
      });
    }
  }

  // Productos que alguna vez tuvieron existencia. Cualquier movimiento hecho,
  // no solo recepciones: lo que venía de Smartbit entró por ajuste de inventario.
  const ids = [...odoo.values()].map((p) => p.id);
  const conMovimiento = new Set<number>();
  if (ids.length > 0) {
    const grupos = (await callOdooRPCEstricto<any[]>(
      "stock.move",
      "read_group",
      [[["product_id", "in", ids], ["state", "=", "done"]], ["product_id"], ["product_id"]],
      { lazy: false, context: ctx },
    )) || [];
    for (const g of grupos) if (Array.isArray(g.product_id)) conMovimiento.add(Number(g.product_id[0]));
  }

  // Flyers del banco, por producto de Odoo o por código.
  const conFlyerId = new Set<number>();
  const conFlyerCodigo = new Set<string>();
  if (codigos.length > 0) {
    const condiciones = [`UPPER(REPLACE(product_code, ' ', '')) IN (${codigos.map(() => "?").join(",")})`];
    const params: any[] = [...codigos];
    if (ids.length > 0) {
      condiciones.push(`odoo_product_id IN (${ids.map(() => "?").join(",")})`);
      params.push(...ids);
    }
    const flyers = (await query(
      `SELECT odoo_product_id, product_code FROM product_images WHERE ${condiciones.join(" OR ")}`,
      params,
    )).rows as any[];
    for (const f of flyers) {
      if (f.odoo_product_id) conFlyerId.add(Number(f.odoo_product_id));
      if (f.product_code) conFlyerCodigo.add(normalizarCodigo(f.product_code));
    }
  }

  const faltantes: ProductoFaltante[] = [];
  for (const [clave, it] of porCodigo) {
    const p = odoo.get(clave);
    const sinFlyer = !(p && conFlyerId.has(p.id)) && !conFlyerCodigo.has(clave);
    const sinImagen = !p?.conImagen;
    if (!sinFlyer && !sinImagen) continue;
    faltantes.push({
      codigo: it.codigo,
      producto: it.producto,
      marca: p?.marca ?? null,
      cantidad: it.cantidad,
      nuevo: !p || !conMovimiento.has(p.id),
      en_odoo: Boolean(p),
      sin_imagen: sinImagen,
      sin_flyer: sinFlyer,
    });
  }
  // Los nuevos primero: son los que no tienen nada.
  return faltantes.sort((a, b) => Number(b.nuevo) - Number(a.nuevo) || a.producto.localeCompare(b.producto));
}
