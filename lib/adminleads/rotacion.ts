import { callOdooRPC } from "@/lib/odoo";
import { ultimaVenta } from "@/lib/compras/datosOdoo";
import { FIN_CARGA_INICIAL } from "@/lib/gerente-marca/tipos";
import { IDS_SEDES, listasPrincipales } from "@/lib/calidad-odoo/odoo";
import { ultimosIngresos } from "@/lib/inteligencia-negocio/reportes";

/**
 * Reporte de rotación de SKUs para el equipo de contenido (adminleads).
 *
 * Responde a las 3 preguntas del brief: qué se mueve rápido, qué está
 * estancado, y cómo se ordena cada categoría — SOLO con cantidades físicas.
 *
 * Devuelve unidades vendidas, stock, días de cobertura (stock ÷ ritmo de
 * venta), ranking de rotación y el precio de venta (el de la lista de precios
 * principal de la sede, `listasPrincipales`).
 * Nada de costos, márgenes, facturación por SKU ni proveedores: a pedido, el
 * precio de venta sí, el costo no (nov-2026).
 */

export type EstadoRotacion = "alta" | "media" | "baja";

export type FilaRotacion = {
  sku: string;
  nombre: string;
  marca: string;
  categoria: string;
  /**
   * Precio de venta sin IVA: la regla de precio fijo de la lista principal de
   * la sede (en Odoo el precio del producto es 1 en casi todos); sin regla, el
   * `lst_price` si es mayor que 1. 0 = sin precio.
   */
  precio: number;
  stock: number;
  vendidas30: number;
  vendidas60: number;
  /**
   * Cobertura: días que dura el stock al ritmo de venta de 60 días,
   * stock ÷ (vendidas60 / 60). No es la antigüedad en el almacén. Con 60 y no
   * 30 días, un mes flojo no la dispara. null = sin ventas en 60 días.
   */
  coberturaDias: number | null;
  /** Días desde la última venta. null = nunca se vendió. */
  diasSinVenta: number | null;
  /** Día de la última venta (YYYY-MM-DD), en Odoo o en Smartbit. null = nunca. */
  ultimaVenta: string | null;
  /** Días desde que entró la unidad más vieja del stock actual. null = sin stock. */
  antiguedadDias: number | null;
  /**
   * La unidad más vieja vino en la carga inicial de Odoo (antes de
   * FIN_CARGA_INICIAL): su fecha real es anterior, la antigüedad es "al menos".
   */
  antiguedadAntesDeOdoo: boolean;
  /**
   * Día del último ingreso al almacén principal: la última recepción de compra
   * (proveedor o tránsito entre sedes); sin compras en Odoo, el ajuste de
   * inventario (la carga inicial). Es `ultimosIngresos` del reporte de
   * Productos de Inteligencia de Negocio. null = nunca entró.
   */
  ultimoIngreso: string | null;
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
      // Clientes internos / inter-compañía: sin esto, sus movimientos inflan
      // "vendidas30/60" y rompen el ranking de rotación (mismo criterio que
      // el resto de los reportes de ventas del panel).
      ["partner_id.name", "not ilike", "supricom"],
      ["partner_id.name", "not ilike", "office solution"],
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
    fields: ["id", "default_code", "name", "x_studio_marca", "categ_id", "lst_price", "product_tmpl_id"],
    limit: 20000,
    context: { lang: "es_VE", allowed_company_ids: companyIds },
  });

  // Precio de la lista principal de cada sede del usuario (el SuperAdmin:
  // Valencia, si no Caracas, si no Panamá).
  const listas = (
    await listasPrincipales().catch((e) => {
      console.error("Rotación: listas de precios", e?.message);
      return [];
    })
  )
    .filter((l) => companyIds.includes(l.companyId))
    .sort((a, b) => IDS_SEDES.indexOf(a.companyId) - IDS_SEDES.indexOf(b.companyId));
  const precioDe = (p: any) => {
    const tmpl = Array.isArray(p.product_tmpl_id) ? p.product_tmpl_id[0] : 0;
    for (const l of listas) {
      const precio = l.precios.get(tmpl)?.find((x) => x > 0);
      if (precio) return precio;
    }
    const lista = Number(p.lst_price) || 0;
    return lista > 1 ? lista : 0;
  };

  const infoProd = new Map<number, { sku: string; nombre: string; marca: string; categoria: string; precio: number }>();
  const agregar = (p: any) =>
    infoProd.set(p.id, {
      sku: typeof p.default_code === "string" ? p.default_code : "",
      nombre: p.name || "",
      marca: Array.isArray(p.x_studio_marca) ? p.x_studio_marca[1] : p.x_studio_marca || "Sin marca",
      categoria: Array.isArray(p.categ_id) ? p.categ_id[1] : "Sin categoría",
      precio: precioDe(p),
    });
  for (const p of productos || []) agregar(p);

  // Productos con ventas que no aparecieron arriba (no vendibles / archivados):
  const faltantes = [...ventas.keys()].filter((id) => !infoProd.has(id));
  for (let i = 0; i < faltantes.length; i += 100) {
    const batch = faltantes.slice(i, i + 100);
    const extra = await callOdooRPC<any[]>("product.product", "read", [batch], {
      fields: ["id", "default_code", "name", "x_studio_marca", "categ_id", "lst_price", "product_tmpl_id"],
      context: { lang: "es_VE", allowed_company_ids: companyIds },
    });
    for (const p of extra || []) agregar(p);
  }

  // --- 3. Stock actual (quants de ubicaciones internas de las compañías) ---
  const ids = [...infoProd.keys()];
  const stock = new Map<number, number>();
  const entrada = new Map<number, string>(); // in_date más viejo con unidades
  for (let i = 0; i < ids.length; i += 2000) {
    const batch = ids.slice(i, i + 2000);
    const quants = await callOdooRPC<any[]>("stock.quant", "search_read", [
      [
        ["product_id", "in", batch],
        ["location_id.usage", "=", "internal"],
        companyFilter,
      ],
    ], { fields: ["product_id", "quantity", "reserved_quantity", "in_date"], limit: 0 });
    for (const q of quants || []) {
      const pid = q.product_id?.[0];
      if (!pid) continue;
      const dia = q.in_date ? String(q.in_date).slice(0, 10) : "";
      if (dia && Number(q.quantity) > 0 && (!entrada.has(pid) || dia < entrada.get(pid)!)) entrada.set(pid, dia);
      const disp = Math.max(0, (Number(q.quantity) || 0) - (Number(q.reserved_quantity) || 0));
      stock.set(pid, (stock.get(pid) || 0) + disp);
    }
  }

  // --- 4. Última venta de toda la historia (Odoo + Smartbit), la más
  // reciente entre las sedes; si falla, queda la de la ventana de 90 días.
  const porSede = <T,>(leer: (c: number) => Promise<Map<number, T>>, que: string) =>
    Promise.all(
      companyIds.map((c) =>
        leer(c).catch((e) => {
          console.error(`Rotación: ${que} de la sede`, c, e?.message);
          return new Map<number, T>();
        }),
      ),
    );
  const [ultimas, ingresos] = await Promise.all([
    porSede(ultimaVenta, "última venta"),
    porSede((c) => ultimosIngresos(c, hasta), "último ingreso"),
  ]);
  const masReciente = (fechas: (string | null | undefined)[]) =>
    fechas.reduce<string | null>((max, d) => (d && (!max || d > max) ? d : max), null);
  const ultimaDe = (pid: number, ventana: string | null) =>
    masReciente([ventana, ...ultimas.map((m) => m.get(pid))]);

  // --- 5. Armar filas + estado ---
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

    const ritmoDiario = v.v60 / 60;
    const coberturaDias = ritmoDiario > 0 ? Math.round(st / ritmoDiario) : null;
    const ultima = ultimaDe(pid, v.ultima);
    const diasSinVenta = diasDesde(ultima);
    const entro = st > 0 ? entrada.get(pid) ?? null : null;

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
      precio: info.precio,
      stock: Math.round(st),
      vendidas30: Math.round(v.v30),
      vendidas60: Math.round(v.v60),
      coberturaDias,
      diasSinVenta,
      ultimaVenta: ultima,
      antiguedadDias: diasDesde(entro),
      antiguedadAntesDeOdoo: !!entro && entro < FIN_CARGA_INICIAL,
      ultimoIngreso: masReciente(ingresos.map((m) => m.get(pid))),
      estado,
      rankingCategoria: 0,
    });
  }

  // --- 6. Ranking por categoría (unidades 30d, desempate por 60d) ---
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
