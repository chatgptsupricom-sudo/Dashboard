import { callOdooRPC } from "@/lib/odoo";

/**
 * Reporte de rotación de SKUs para el equipo de contenido (adminleads).
 *
 * Responde a las 3 preguntas del brief: qué se mueve rápido, qué está
 * estancado, y cómo se ordena cada categoría — SOLO con cantidades físicas.
 *
 * RESTRICCIÓN DURA: nada de dinero. No se consultan ni se devuelven precios,
 * márgenes, costos, facturación por SKU ni proveedores. Solo:
 *   - unidades vendidas (cantidades físicas)
 *   - stock actual (unidades)
 *   - días de cobertura (stock ÷ ritmo de venta)
 *   - ranking de rotación (posición 1, 2, 3…)
 */

export type EstadoRotacion = "alta" | "media" | "baja";

export type FilaRotacion = {
  sku: string;
  nombre: string;
  marca: string;
  categoria: string;
  stock: number;
  vendidas30: number;
  vendidas60: number;
  /** stock ÷ (vendidas30 / 30). null = sin ventas recientes (cobertura infinita). */
  coberturaDias: number | null;
  /** Días desde la última venta. null = sin ventas en la ventana consultada. */
  diasSinVenta: number | null;
  estado: EstadoRotacion;
  /** Posición dentro de su categoría por unidades vendidas (30d). 1 = el que más vende. */
  rankingCategoria: number;
};

// Umbrales del "Estado de rotación" (#brief). Fijos por ahora; si hace falta
// afinarlos, se tocan acá.
const UMBRAL = {
  altaVentas30: 20, // unidades vendidas en 30 días para considerarse "alta"
  altaCoberturaMax: 60, // y que el stock no dure más de ~2 meses
  bajaSinVentaDias: 45, // 45+ días sin una sola venta => estancado
  bajaCoberturaMin: 180, // o más de ~6 meses de stock al ritmo actual
};

const VENTANA_DIAS = 90; // se piden 90d y se parte en 30/60 + última venta

type CompanyFilter = ["company_id", "in", number[]] | ["company_id", "=", number];

export async function calcularRotacion(
  companyIds: number[],
): Promise<{ filas: FilaRotacion[]; categorias: string[]; marcas: string[]; periodo: { desde: string; hasta: string } }> {
  const companyFilter: CompanyFilter =
    companyIds.length === 1
      ? ["company_id", "=", companyIds[0]]
      : ["company_id", "in", companyIds];

  const hoy = new Date();
  const desde = new Date(hoy.getTime() - VENTANA_DIAS * 86400000)
    .toISOString()
    .slice(0, 10);
  const hasta = hoy.toISOString().slice(0, 10);
  const hace30 = new Date(hoy.getTime() - 30 * 86400000).toISOString().slice(0, 10);
  const hace60 = new Date(hoy.getTime() - 60 * 86400000).toISOString().slice(0, 10);

  // --- 1. Ventas (líneas de factura de cliente, publicadas) de la ventana ---
  const lineas = await callOdooRPC<any[]>("account.move.line", "search_read", [
    [
      ["move_id.move_type", "=", "out_invoice"],
      ["move_id.state", "=", "posted"],
      ["move_id.invoice_date", ">=", desde],
      ["move_id.invoice_date", "<=", hasta],
      ["product_id", "!=", false],
      ["quantity", ">", 0],
      companyFilter,
    ],
  ], { fields: ["product_id", "quantity", "date"], limit: 100000 });

  type Venta = { v30: number; v60: number; ultima: string | null };
  const ventas = new Map<number, Venta>();
  for (const l of lineas || []) {
    const pid = l.product_id?.[0];
    if (!pid) continue;
    const qty = Number(l.quantity) || 0;
    if (qty <= 0) continue;
    const fecha: string = String(l.date || "").slice(0, 10);
    const e = ventas.get(pid) || { v30: 0, v60: 0, ultima: null };
    if (fecha >= hace60) e.v60 += qty;
    if (fecha >= hace30) e.v30 += qty;
    if (!e.ultima || fecha > e.ultima) e.ultima = fecha;
    ventas.set(pid, e);
  }

  // --- 2. Productos vendibles + los que tuvieron ventas aunque ya no lo sean ---
  const productos = await callOdooRPC<any[]>("product.product", "search_read", [
    [
      ["sale_ok", "=", true],
      ["active", "=", true],
      ["type", "=", "product"],
    ],
  ], {
    fields: ["id", "default_code", "name", "x_studio_marca", "categ_id"],
    limit: 20000,
    context: { lang: "es_VE", allowed_company_ids: companyIds },
  });

  const infoProd = new Map<number, { sku: string; nombre: string; marca: string; categoria: string }>();
  for (const p of productos || []) {
    infoProd.set(p.id, {
      sku: typeof p.default_code === "string" ? p.default_code : "",
      nombre: p.name || "",
      marca: Array.isArray(p.x_studio_marca) ? p.x_studio_marca[1] : p.x_studio_marca || "Sin marca",
      categoria: Array.isArray(p.categ_id) ? p.categ_id[1] : "Sin categoría",
    });
  }

  // Productos con ventas que no aparecieron arriba (no vendibles / archivados):
  const faltantes = [...ventas.keys()].filter((id) => !infoProd.has(id));
  for (let i = 0; i < faltantes.length; i += 100) {
    const batch = faltantes.slice(i, i + 100);
    const extra = await callOdooRPC<any[]>("product.product", "read", [batch], {
      fields: ["id", "default_code", "name", "x_studio_marca", "categ_id"],
      context: { lang: "es_VE" },
    });
    for (const p of extra || []) {
      infoProd.set(p.id, {
        sku: typeof p.default_code === "string" ? p.default_code : "",
        nombre: p.name || "",
        marca: Array.isArray(p.x_studio_marca) ? p.x_studio_marca[1] : p.x_studio_marca || "Sin marca",
        categoria: Array.isArray(p.categ_id) ? p.categ_id[1] : "Sin categoría",
      });
    }
  }

  // --- 3. Stock actual (quants de ubicaciones internas de las compañías) ---
  const ids = [...infoProd.keys()];
  const stock = new Map<number, number>();
  for (let i = 0; i < ids.length; i += 2000) {
    const batch = ids.slice(i, i + 2000);
    const quants = await callOdooRPC<any[]>("stock.quant", "search_read", [
      [
        ["product_id", "in", batch],
        ["location_id.usage", "=", "internal"],
        companyFilter,
      ],
    ], { fields: ["product_id", "quantity", "reserved_quantity"], limit: 0 });
    for (const q of quants || []) {
      const pid = q.product_id?.[0];
      if (!pid) continue;
      const disp = Math.max(0, (Number(q.quantity) || 0) - (Number(q.reserved_quantity) || 0));
      stock.set(pid, (stock.get(pid) || 0) + disp);
    }
  }

  // --- 4. Armar filas + estado ---
  const hoyStr = hasta;
  const diasDesde = (f: string | null): number | null => {
    if (!f) return null;
    const d = Math.round((Date.parse(hoyStr) - Date.parse(f)) / 86400000);
    return Number.isFinite(d) ? Math.max(0, d) : null;
  };

  let filas: FilaRotacion[] = [];
  for (const [pid, info] of infoProd) {
    const v = ventas.get(pid) || { v30: 0, v60: 0, ultima: null };
    const st = stock.get(pid) || 0;
    // Ignora productos sin stock y sin ventas: no aportan nada al contenido.
    if (st === 0 && v.v60 === 0) continue;

    const ritmoDiario = v.v30 / 30;
    const coberturaDias = ritmoDiario > 0 ? Math.round(st / ritmoDiario) : null;
    const diasSinVenta = diasDesde(v.ultima);

    let estado: EstadoRotacion;
    const estancado =
      (diasSinVenta === null || diasSinVenta >= UMBRAL.bajaSinVentaDias) ||
      (coberturaDias !== null && coberturaDias > UMBRAL.bajaCoberturaMin) ||
      (coberturaDias === null && st > 0);
    const rapido =
      v.v30 >= UMBRAL.altaVentas30 &&
      coberturaDias !== null &&
      coberturaDias < UMBRAL.altaCoberturaMax;

    if (estancado && !rapido) estado = "baja";
    else if (rapido) estado = "alta";
    else estado = "media";

    filas.push({
      sku: info.sku,
      nombre: info.nombre,
      marca: info.marca,
      categoria: info.categoria,
      stock: Math.round(st),
      vendidas30: Math.round(v.v30),
      vendidas60: Math.round(v.v60),
      coberturaDias,
      diasSinVenta,
      estado,
      rankingCategoria: 0,
    });
  }

  // --- 5. Ranking por categoría (unidades 30d, desempate por 60d) ---
  const porCat = new Map<string, FilaRotacion[]>();
  for (const f of filas) {
    if (!porCat.has(f.categoria)) porCat.set(f.categoria, []);
    porCat.get(f.categoria)!.push(f);
  }
  for (const grupo of porCat.values()) {
    grupo.sort((a, b) => b.vendidas30 - a.vendidas30 || b.vendidas60 - a.vendidas60);
    grupo.forEach((f, i) => (f.rankingCategoria = i + 1));
  }

  filas.sort((a, b) => b.vendidas30 - a.vendidas30 || b.vendidas60 - a.vendidas60);

  const categorias = [...new Set(filas.map((f) => f.categoria))].sort((a, b) =>
    a.localeCompare(b),
  );
  const marcas = [...new Set(filas.map((f) => f.marca))].sort((a, b) =>
    a.localeCompare(b),
  );

  return { filas, categorias, marcas, periodo: { desde, hasta } };
}

export function resolverCompanies(payload: any): number[] | null {
  const rol = String(payload?.role || "").toLowerCase().trim();
  if (rol === "superadmin") return [7, 9, 10];
  const cid = parseInt(payload?.cids, 10);
  if (!Number.isFinite(cid) || cid <= 0) return null;
  return [cid];
}
