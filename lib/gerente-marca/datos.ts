import {
  almacenSede,
  cachear,
  costos,
  diaCaracas,
  diasEntre,
  disponible,
  hoyCaracas,
  leerTodo,
  sumarDias,
  transito,
  ultimaVenta,
  unidadesVendidas,
} from "@/lib/compras/datosOdoo";
import { obtenerCobros } from "@/lib/cxc/cobros";
import { sinIntercompania } from "@/lib/intercompania";
import { CORTE_ODOO } from "@/lib/smartbit";
import {
  esComputo,
  FIN_CARGA_INICIAL,
  tramoDe,
  type Asignacion,
  type DatosInventario,
  type DatosVentas,
  type ProductoGerente,
  type SedeProducto,
  type VentaProducto,
} from "@/lib/gerente-marca/tipos";

/**
 * Lecturas de Odoo del Gerente de Marca (solo lectura). El stock, el costo,
 * el tránsito y las unidades vendidas son los mismos de Compras
 * (lib/compras/datosOdoo.ts: almacén principal entero con Entrada, sin
 * intercompañía, Smartbit antes del corte), así un número sale igual aquí y
 * allá. Lo propio de esta sección:
 *
 * - Antigüedad por unidad: cada quant del almacén trae su `in_date` (las
 *   computadoras van por serial, así que cada unidad tiene la suya). Lo de la
 *   carga inicial de Odoo va aparte (`FIN_CARGA_INICIAL`): no se sabe su
 *   fecha real.
 * - Ventas: facturas y notas de crédito de cliente publicadas, sin IVA, en
 *   USD (`balance`, la moneda de la empresa), sin intercompañía.
 * - Cobrado: lo que entró por banco o caja a cada factura, con la misma regla
 *   de Cuentas por Cobrar (`obtenerCobros` de lib/cxc/cobros.ts): las
 *   retenciones de IVA, los pagos del 25 % de IVA y las notas de crédito
 *   aplicadas bajan el saldo pero no son cobro. La parte cobrada de una
 *   factura es cobrado ÷ (cobrado + saldo), así queda en la misma base que lo
 *   facturado aunque el cliente retenga: una factura de $240 + IVA a la que
 *   solo se le aplicó la retención va 0 % cobrada; si el cliente pagó $100 de
 *   los $240 que le tocaba pagar, 42 %. Cada línea se lleva esa parte.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

interface ProductoBase {
  id: number;
  codigo: string;
  nombre: string;
  marcaId: number;
  marca: string;
  categoria: string;
  activo: boolean;
}

const llaveAlcance = (asignaciones: Asignacion[]) =>
  asignaciones.map((a) => `${a.marcaId}:${a.linea}`).sort().join(",");

/**
 * Productos de las marcas asignadas (también archivados: pueden tener stock o
 * ventas), sin servicios. En las marcas de "Cómputo Corporativo" se quita lo
 * de impresión.
 */
export function productosDelAlcance(asignaciones: Asignacion[]): Promise<Map<number, ProductoBase>> {
  return cachear(`gm-productos|${llaveAlcance(asignaciones)}`, async () => {
    const mapa = new Map<number, ProductoBase>();
    if (asignaciones.length === 0) return mapa;
    const lineaDe = new Map(asignaciones.map((a) => [a.marcaId, a.linea]));
    const filas = await leerTodo(
      "product.product",
      [["spiff_brand_id", "in", [...lineaDe.keys()]], ["type", "!=", "service"]],
      ["id", "default_code", "name", "categ_id", "spiff_brand_id", "active"],
      { context: { active_test: false } },
    );
    for (const p of filas) {
      const marcaId = p.spiff_brand_id?.[0];
      const categoria = (p.categ_id && String(p.categ_id[1]).trim()) || "Sin categoría";
      if (!marcaId) continue;
      if (lineaDe.get(marcaId) === "computo" && !esComputo(categoria)) continue;
      const codigo = String(p.default_code || "").trim();
      mapa.set(p.id, {
        id: p.id,
        // Sin número de parte en Odoo queda vacío (la pantalla dice "sin código").
        codigo,
        nombre: String(p.name || "").trim(),
        marcaId,
        marca: String(p.spiff_brand_id[1] || "").trim(),
        categoria,
        activo: p.active !== false,
      });
    }
    return mapa;
  });
}

/** Mismo día del mes, `n` meses atrás (el 31 cae al último día del mes). */
function mesesAtras(dia: string, n: number): string {
  const [y, m, d] = dia.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1 - n, 1));
  const ultimo = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  base.setUTCDate(Math.min(d, ultimo));
  return base.toISOString().slice(0, 10);
}

export function ventanas(hoy = hoyCaracas()) {
  return {
    mes: { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy },
    // Seis meses corridos hasta hoy (incluye el mes en curso).
    seisMeses: { desde: sumarDias(mesesAtras(hoy, 6), 1), hasta: hoy },
  };
}

interface EdadProducto {
  tramos: SedeProducto["tramos"];
  entradaMasVieja: string | null;
  diasPromedio: number | null;
}

/** Antigüedad de cada unidad en el almacén principal de la sede. */
async function antiguedadSede(companyId: number, ids: number[], hoy: string): Promise<Map<number, EdadProducto>> {
  const { ubicaciones } = await almacenSede(companyId);
  const mapa = new Map<number, EdadProducto & { suma: number; unidades: number }>();
  for (let i = 0; i < ids.length; i += 2000) {
    const quants = await leerTodo(
      "stock.quant",
      [
        ["product_id", "in", ids.slice(i, i + 2000)],
        ["location_id", "in", ubicaciones],
        ["company_id", "=", companyId],
        ["quantity", ">", 0],
      ],
      ["product_id", "quantity", "in_date"],
    );
    for (const q of quants) {
      const id = q.product_id?.[0];
      const unidades = Number(q.quantity) || 0;
      if (!id || unidades <= 0 || !q.in_date) continue;
      const dia = diaCaracas(q.in_date);
      const dias = Math.max(0, diasEntre(dia, hoy));
      const inicial = String(q.in_date).slice(0, 10) < FIN_CARGA_INICIAL;
      const e = mapa.get(id) ?? { tramos: {}, entradaMasVieja: null, diasPromedio: null, suma: 0, unidades: 0 };
      const tramo = tramoDe(dias, inicial);
      e.tramos[tramo] = (e.tramos[tramo] ?? 0) + unidades;
      if (!e.entradaMasVieja || dia < e.entradaMasVieja) e.entradaMasVieja = dia;
      e.suma += dias * unidades;
      e.unidades += unidades;
      mapa.set(id, e);
    }
  }
  const out = new Map<number, EdadProducto>();
  for (const [id, e] of mapa) {
    out.set(id, {
      tramos: e.tramos,
      entradaMasVieja: e.entradaMasVieja,
      diasPromedio: e.unidades > 0 ? Math.round(e.suma / e.unidades) : null,
    });
  }
  return out;
}

async function inventarioSede(companyId: number, productos: Map<number, ProductoBase>, hoy: string) {
  const ids = [...productos.keys()];
  const v = ventanas(hoy);
  const [almacen, porLlegar, costo, mes, seis, ultima, edad] = await Promise.all([
    almacenSede(companyId),
    transito(companyId),
    costos(companyId),
    unidadesVendidas(companyId, v.mes.desde, v.mes.hasta),
    unidadesVendidas(companyId, v.seisMeses.desde, v.seisMeses.hasta),
    ultimaVenta(companyId),
    antiguedadSede(companyId, ids, hoy),
  ]);
  const filas = new Map<number, SedeProducto>();
  for (const id of ids) {
    const s = almacen.stock.get(id);
    const e = edad.get(id);
    filas.set(id, {
      companyId,
      fisico: s?.fisico ?? 0,
      reservado: s?.reservado ?? 0,
      disponible: disponible(s),
      transito: porLlegar.get(id) ?? 0,
      costo: r2(costo.get(id) ?? 0),
      tramos: e?.tramos ?? {},
      entradaMasVieja: e?.entradaMasVieja ?? null,
      diasPromedio: e?.diasPromedio ?? null,
      vendidasMes: mes.get(id) ?? 0,
      vendidas6m: seis.get(id) ?? 0,
      ultimaVenta: ultima.get(id) ?? null,
    });
  }
  return filas;
}

/**
 * Inventario de las marcas asignadas en cada sede, con antigüedad y unidades
 * vendidas. Quedan los productos con algo que mostrar en alguna sede: stock,
 * por llegar o venta en los últimos 6 meses.
 */
export async function inventarioGerente(asignaciones: Asignacion[], sedes: number[]): Promise<DatosInventario> {
  const hoy = hoyCaracas();
  const productos = await productosDelAlcance(asignaciones);
  const porSede = await Promise.all(sedes.map((s) => inventarioSede(s, productos, hoy)));
  const lista: ProductoGerente[] = [];
  for (const p of productos.values()) {
    const filas = porSede.map((m) => m.get(p.id)!).filter(Boolean);
    if (!filas.some((f) => f.fisico > 0 || f.transito > 0 || f.vendidas6m !== 0)) continue;
    lista.push({ ...p, sedes: filas });
  }
  lista.sort((a, b) => a.marca.localeCompare(b.marca) || a.categoria.localeCompare(b.categoria) || a.codigo.localeCompare(b.codigo));
  return { asignaciones, sedes, hoy, ...ventanas(hoy), productos: lista };
}

/** Ventas por producto en cada sede, con lo facturado y lo cobrado. */
export async function ventasGerente(asignaciones: Asignacion[], sedes: number[], desde: string, hasta: string): Promise<DatosVentas> {
  const productos = await productosDelAlcance(asignaciones);
  const ids = [...productos.keys()];
  const ini = desde < CORTE_ODOO ? CORTE_ODOO : desde;
  const filas: VentaProducto[] = [];
  if (ids.length > 0 && ini <= hasta) {
    const sinIC = await sinIntercompania("move_id.commercial_partner_id");
    for (const companyId of sedes) {
      const lineas: any[] = [];
      for (let i = 0; i < ids.length; i += 2000) {
        lineas.push(
          ...(await leerTodo(
            "account.move.line",
            [
              ["move_type", "in", ["out_invoice", "out_refund"]],
              ["parent_state", "=", "posted"],
              ["display_type", "=", "product"],
              ["company_id", "=", companyId],
              ["invoice_date", ">=", ini],
              ["invoice_date", "<=", hasta],
              ["product_id", "in", ids.slice(i, i + 2000)],
              sinIC,
            ],
            ["move_id", "product_id", "quantity", "balance", "move_type"],
          )),
        );
      }
      const moveIds = [...new Set(lineas.map((l) => l.move_id?.[0]).filter(Boolean))] as number[];
      const banco = new Map<number, number>();
      const pagado = new Map<number, number>();
      for (let i = 0; i < moveIds.length; i += 2000) {
        const lote = moveIds.slice(i, i + 2000);
        const [movs, cobros] = await Promise.all([
          leerTodo("account.move", [["id", "in", lote]], ["amount_residual_signed"]),
          obtenerCobros([companyId], { hasta: hoyCaracas(), dominioFactura: [["id", "in", lote]] }),
        ]);
        for (const c of cobros) banco.set(c.facturaId, (banco.get(c.facturaId) ?? 0) + c.monto);
        for (const m of movs) {
          const cobrado = banco.get(m.id) ?? 0;
          const saldo = Math.abs(Number(m.amount_residual_signed) || 0);
          pagado.set(m.id, cobrado + saldo > 0 ? Math.min(1, cobrado / (cobrado + saldo)) : 0);
        }
      }
      const porProducto = new Map<number, VentaProducto & { movs: Set<number> }>();
      for (const l of lineas) {
        const id = l.product_id?.[0];
        const p = id ? productos.get(id) : undefined;
        const moveId = l.move_id?.[0];
        if (!p || !moveId) continue;
        const signo = l.move_type === "out_refund" ? -1 : 1;
        const ingreso = -(Number(l.balance) || 0);
        const f = porProducto.get(id) ?? {
          productoId: p.id, codigo: p.codigo, nombre: p.nombre, marcaId: p.marcaId, marca: p.marca,
          categoria: p.categoria, companyId, unidades: 0, facturado: 0, cobrado: 0, facturas: 0, movs: new Set<number>(),
        };
        f.unidades += signo * (Number(l.quantity) || 0);
        f.facturado += ingreso;
        f.cobrado += ingreso * (pagado.get(moveId) ?? 0);
        f.movs.add(moveId);
        porProducto.set(id, f);
      }
      for (const { movs, ...f } of porProducto.values()) {
        filas.push({ ...f, facturado: r2(f.facturado), cobrado: r2(f.cobrado), facturas: movs.size });
      }
    }
  }
  filas.sort((a, b) => b.facturado - a.facturado);
  return { asignaciones, sedes, desde: ini, hasta, filas };
}
