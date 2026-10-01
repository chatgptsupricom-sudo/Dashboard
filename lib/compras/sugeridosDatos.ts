import { query } from "@/lib/db";
import {
  almacenSede,
  catalogo,
  costos,
  hoyCaracas,
  sumarDias,
  transito,
  unidadesVendidas,
} from "@/lib/compras/datosOdoo";

/**
 * Datos de entrada de la sugerencia de compra (lo que en el Excel del
 * comprador son las hojas DATA_INPUT, VENTAS_* y MAESTRO), por sucursal.
 *
 * Vive aparte de la ruta porque lo usan varias pantallas: /api/compras/sugeridos,
 * el resumen de /api/compras/dashboard, Mayor rotación y Cobertura, que tienen
 * que dar lo mismo. El calculo en si esta en lib/compras/sugeridos.ts; las
 * lecturas de Odoo (ventas sin COGS ni intercompañia, stock con la Entrada,
 * transito real) en lib/compras/datosOdoo.ts.
 *
 * Lo de Odoo se cachea 10 minutos; los ajustes del comprador (ETA y compra
 * manual) se leen siempre, para que lo que acaba de cargar no se pierda.
 */

export type FilaSugerido = FilaOdoo & {
  eta: number | null;
  compraManual: number | null;
  ajustadoPor: string | null;
  ajustadoAt: string | null;
};

const odooCache = new Map<string, { data: FilaOdoo[]; warning?: string; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000;

type FilaOdoo = {
  id: number;
  codigo: string;
  name: string;
  marca: string;
  categoria: string;
  fisico: number;
  reservado: number;
  transito: number;
  ventas45d: number;
  ventas365d: number;
  moq: number;
  costo: number;
};

async function leerDeOdoo(sedeId: number): Promise<{ data: FilaOdoo[]; warning?: string }> {
  // Ventanas de 45 y 365 dias de calendario contando hoy. La de 365 cruza el
  // corte Smartbit -> Odoo (abr-2026): lo anterior sale de ventas_smartbit,
  // si no el año quedaba con la mitad de la venta y la demanda anual y la
  // clase ABC salian a la mitad.
  const hoy = hoyCaracas();
  const [v45, v365, ajustes, cat] = await Promise.all([
    unidadesVendidas(sedeId, sumarDias(hoy, -44), hoy),
    unidadesVendidas(sedeId, sumarDias(hoy, -364), hoy),
    leerAjustes(sedeId),
    catalogo(),
  ]);

  // Productos con compra manual/ETA cargado en la sede entran aunque no
  // hayan vendido en el ano (el comprador los esta siguiendo). Solo
  // almacenables: un consumible no lleva stock en Odoo, su fisico seria
  // siempre 0 y la formula pediria comprarlo aunque haya.
  const productIds = [
    ...new Set([
      ...[...v365].filter(([, u]) => u > 0).map(([id]) => id),
      ...ajustes.keys(),
    ]),
  ].filter((id) => cat.get(id)?.tipo === "product");
  if (productIds.length === 0) return { data: [] };

  const [almacen, porLlegar, moqResult, costo] = await Promise.all([
    almacenSede(sedeId),
    transito(sedeId),
    query("SELECT sku, cantidad FROM moqs"),
    costos(sedeId),
  ]);
  const moqMap = new Map((moqResult as any).rows.map((m: any) => [m.sku, Number(m.cantidad)]));

  const data: FilaOdoo[] = productIds.map((id) => {
    const p = cat.get(id)!;
    const s = almacen.stock.get(id);
    const moq = Number(moqMap.get(p.codigo)) || 0;
    return {
      id,
      codigo: p.codigo,
      name: p.nombre,
      marca: p.marca,
      categoria: p.categoria,
      // Fisico y reservado por separado, como las columnas C y D de la hoja.
      fisico: Math.round(s?.fisico ?? 0),
      reservado: Math.round(s?.reservado ?? 0),
      transito: Math.round(porLlegar.get(id) ?? 0),
      ventas45d: Math.max(0, Math.round(v45.get(id) ?? 0)),
      ventas365d: Math.max(0, Math.round(v365.get(id) ?? 0)),
      // Sin MOQ cargado se usa 1, como la hoja (IFERROR(...;1)).
      moq: moq > 0 ? moq : 1,
      costo: costo.get(id) ?? 0,
    };
  });

  const warning =
    almacen.stock.size === 0
      ? `El almacén ${almacen.nombre || "principal"} de esta sede no tiene stock registrado en Odoo.`
      : undefined;
  return { data, warning };
}

type Ajuste = {
  eta_dias: number | null;
  compra_manual: number | null;
  actualizado_por: string | null;
  updated_at: string | null;
};

async function leerAjustes(sedeId: number): Promise<Map<number, Ajuste>> {
  try {
    const r = await query(
      `SELECT product_odoo_id, eta_dias, compra_manual, actualizado_por, updated_at
         FROM compras_sugeridos_ajustes WHERE cids = ?`,
      [sedeId],
    );
    return new Map(
      (r.rows as any[]).map((a) => [
        Number(a.product_odoo_id),
        {
          eta_dias: a.eta_dias === null ? null : Number(a.eta_dias),
          compra_manual: a.compra_manual === null ? null : Number(a.compra_manual),
          actualizado_por: a.actualizado_por,
          updated_at: a.updated_at,
        },
      ]),
    );
  } catch (e: any) {
    // Sin la migracion (sql/compras_sugeridos_ajustes.sql) la pantalla sigue
    // funcionando, solo que sin ETA/compra manual guardados.
    console.error("[Sugeridos] no se pudieron leer los ajustes:", e.message);
    return new Map();
  }
}

/** Datos + ajustes de una sucursal, listos para calcularSugerido(). */
export async function leerSugeridos(
  sedeId: number,
): Promise<{ data: FilaSugerido[]; warning?: string }> {
  const cacheKey = `sugeridos_excel_v4_sede${sedeId}`;
  let cached = odooCache.get(cacheKey);
  if (!cached || Date.now() - cached.ts >= CACHE_TTL) {
    const leido = await leerDeOdoo(sedeId);
    cached = { ...leido, ts: Date.now() };
    odooCache.set(cacheKey, cached);
  }

  const ajustes = await leerAjustes(sedeId);
  const data = cached.data.map((p) => {
    const a = ajustes.get(p.id);
    return {
      ...p,
      eta: a?.eta_dias ?? null,
      compraManual: a?.compra_manual ?? null,
      ajustadoPor: a?.actualizado_por ?? null,
      ajustadoAt: a?.updated_at ?? null,
    };
  });
  return { data, warning: cached.warning };
}
