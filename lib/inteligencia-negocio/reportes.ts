import {
  almacenSede,
  cachear,
  catalogo,
  costos,
  diaCaracas,
  diasEntre,
  dominioVentas,
  hoyCaracas,
  inicioDiaUtc,
  leerTodo,
  signoDocumento,
  sumarDias,
} from "@/lib/compras/datosOdoo";
import { historialStock } from "@/lib/compras/historial";
import { nombresPlazos } from "@/lib/cxc/credito";
import { sinIntercompania } from "@/lib/intercompania";
import { claveMarca, SIN_MARCA } from "@/lib/metas-marca/marcas";
import { callOdooRPCEstricto } from "@/lib/odoo";
import { CORTE_ODOO } from "@/lib/smartbit";

/**
 * Reportes del rol Inteligencia de Negocio (desplegable "Reportes"), pedidos
 * en el Excel "REQUERIMIENTOS - DT PROGRAMACION" (oct-2026):
 *
 * - Facturación: cada renglón de producto de las facturas del mes.
 * - Productos: todo el catálogo, con o sin inventario: venta, unidades,
 *   costo, margen, último ingreso e inventario al cierre del mes.
 * - Clientes: lo comprado en uno o varios meses, con días sin comprar, cupo
 *   y días de crédito, participación, zona y vendedor.
 *
 * Las dos sedes de Venezuela, juntas o por separado. La venta es la misma de
 * Compras (`dominioVentas`): renglones de producto (sin las líneas de costo
 * que Odoo repite), notas de crédito restando, sin servicios ni
 * intercompañía, en USD y sin IVA (`balance`, la moneda de las dos sedes es
 * USD aunque Caracas facture en bolívares). Solo Odoo: antes del corte
 * (`CORTE_ODOO`) la venta está en Smartbit, sin estos datos.
 */

export const SEDES_REPORTES: Record<string, number[]> = { venezuela: [9, 10], valencia: [9], caracas: [10] };
export const MES_INICIAL = CORTE_ODOO.slice(0, 7);

const r2 = (n: number) => Math.round(n * 100) / 100;
const idDe = (v: any): number | null => (Array.isArray(v) ? v[0] : v) || null;
const nombreDe = (v: any): string => (Array.isArray(v) ? String(v[1] ?? "") : "");

/** Mes "YYYY-MM" válido para los reportes: desde el corte y no futuro. */
export function mesValido(mes: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) && mes >= MES_INICIAL && mes <= hoyCaracas().slice(0, 7);
}

/** Primer y último día del mes; el mes en curso, hasta hoy. */
export function rangoDelMes(mes: string): { desde: string; hasta: string } {
  const [a, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
  const hoy = hoyCaracas();
  return { desde: `${mes}-01`, hasta: ultimo < hoy ? ultimo : hoy };
}

async function agrupar(model: string, domain: any[], fields: string[], groupby: string[]): Promise<any[]> {
  const r = await callOdooRPCEstricto<any[]>(model, "read_group", [domain, fields, groupby], { lazy: false });
  if (!Array.isArray(r)) throw new Error(`Odoo no respondió ${model}.read_group`);
  return r;
}

const entreFechas = (desde: string, hasta: string) => [
  ["invoice_date", ">=", desde],
  ["invoice_date", "<=", hasta],
];

/** Costo de lo vendido: la línea de costo (COGS) que Odoo genera por cada renglón de mercancía. */
async function dominioCostoVentas(companyId: number): Promise<any[]> {
  return [
    ["move_type", "in", ["out_invoice", "out_receipt", "out_refund"]],
    ["parent_state", "=", "posted"],
    ["display_type", "=", "cogs"],
    ["account_id.account_type", "=", "expense_direct_cost"],
    ["company_id", "=", companyId],
    ["product_id", "!=", false],
    ["product_id.type", "!=", "service"],
    await sinIntercompania("move_id.commercial_partner_id"),
  ];
}

// ---------------------------------------------------------------------------
// Productos y contactos
// ---------------------------------------------------------------------------

interface InfoProducto {
  codigo: string;
  nombre: string;
  marca: string;
  categoria: string;
}

/** Datos de los productos: el catálogo activo y, para los archivados, una lectura aparte. */
async function infoProductos(ids: number[]): Promise<Map<number, InfoProducto>> {
  const cat = await catalogo();
  const mapa = new Map<number, InfoProducto>();
  const faltan: number[] = [];
  for (const id of ids) {
    const p = cat.get(id);
    if (p) mapa.set(id, { codigo: p.codigo, nombre: p.nombre, marca: p.marca, categoria: p.categoria });
    else faltan.push(id);
  }
  for (let i = 0; i < faltan.length; i += 1000) {
    const r = await callOdooRPCEstricto<any[]>("product.product", "search_read", [[["id", "in", faltan.slice(i, i + 1000)]]], {
      fields: ["id", "default_code", "name", "categ_id", "spiff_brand_id"],
      context: { active_test: false },
    });
    for (const p of r || []) {
      mapa.set(p.id, {
        codigo: String(p.default_code || "").trim() || `PROD-${p.id}`,
        nombre: String(p.name || "").trim(),
        marca: p.spiff_brand_id ? claveMarca(p.spiff_brand_id[1]) : SIN_MARCA,
        categoria: (p.categ_id && String(p.categ_id[1]).trim()) || "Sin categoría",
      });
    }
  }
  return mapa;
}

/**
 * Contactos leídos con la sede en el contexto (cupo y plazo de pago son por
 * empresa). search_read y no read: un contacto que la API no puede leer no
 * tumba la consulta (lib/cxc/sobregiro.ts).
 */
async function leerContactos(ids: number[], companyId: number, fields: string[]): Promise<Map<number, any>> {
  const mapa = new Map<number, any>();
  for (let i = 0; i < ids.length; i += 500) {
    const r = await callOdooRPCEstricto<any[]>("res.partner", "search_read", [[["id", "in", ids.slice(i, i + 500)]]], {
      fields: ["id", ...fields],
      context: { allowed_company_ids: [companyId], active_test: false },
    });
    for (const p of r || []) mapa.set(p.id, p);
  }
  return mapa;
}

// ---------------------------------------------------------------------------
// Reporte I: Facturación
// ---------------------------------------------------------------------------

export interface LineaFacturacion {
  sede: number;
  fecha: string;
  factura: string;
  rif: string;
  cliente: string;
  cantidad: number;
  /** Total ÷ cantidad: precio efectivo con descuento, en USD. */
  precio: number;
  total: number;
  codigo: string;
  marca: string;
  categoria: string;
  producto: string;
}

export async function reporteFacturacion(companyIds: number[], mes: string): Promise<LineaFacturacion[]> {
  const { desde, hasta } = rangoDelMes(mes);
  const lineas = (
    await Promise.all(
      companyIds.map(async (cid) =>
        leerTodo(
          "account.move.line",
          [...(await dominioVentas(cid)), ...entreFechas(desde, hasta)],
          ["company_id", "invoice_date", "move_name", "move_type", "partner_id", "product_id", "quantity", "balance"],
        ),
      ),
    )
  ).flat();

  const [productos, contactos] = await Promise.all([
    infoProductos([...new Set(lineas.map((l) => idDe(l.product_id)).filter(Boolean) as number[])]),
    leerContactos([...new Set(lineas.map((l) => idDe(l.partner_id)).filter(Boolean) as number[])], companyIds[0], ["vat"]),
  ]);

  return lineas
    .map((l) => {
      const cantidad = signoDocumento(l.move_type) * (Number(l.quantity) || 0);
      const total = r2(-(Number(l.balance) || 0));
      const p = productos.get(idDe(l.product_id) as number);
      return {
        sede: idDe(l.company_id) as number,
        fecha: String(l.invoice_date || "").slice(0, 10),
        factura: String(l.move_name || ""),
        rif: String(contactos.get(idDe(l.partner_id) as number)?.vat || ""),
        cliente: nombreDe(l.partner_id),
        cantidad,
        precio: cantidad ? r2(total / cantidad) : 0,
        total,
        codigo: p?.codigo ?? "",
        marca: p?.marca ?? SIN_MARCA,
        categoria: p?.categoria ?? "Sin categoría",
        producto: p?.nombre ?? nombreDe(l.product_id),
      };
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.factura.localeCompare(b.factura));
}

// ---------------------------------------------------------------------------
// Reporte II: Productos
// ---------------------------------------------------------------------------

export interface FilaProducto {
  id: number;
  codigo: string;
  producto: string;
  /** Última recepción de compra (proveedor o tránsito) al almacén hasta el cierre del mes. */
  ultimoIngreso: string | null;
  marca: string;
  categoria: string;
  /** Costo unitario: el de lo vendido en el mes si se vendió; si no, el costo de Odoo. null = sin costo. */
  costo: number | null;
  /** (venta − costo de lo vendido) ÷ venta. null = sin venta o sin costo. */
  margen: number | null;
  venta: number;
  unidades: number;
  /** Stock del almacén principal al cierre del mes (hoy, si es el mes en curso). */
  inventario: number;
}

interface DatosSede {
  venta: Map<number, number>;
  unidades: Map<number, number>;
  costoVendido: Map<number, number>;
  ingreso: Map<number, string>;
  inventario: (id: number) => number;
  costoOdoo: Map<number, number>;
}

/**
 * Última recepción de compra (proveedor o tránsito entre sedes) de cada
 * producto al almacén principal hasta `hasta` (incluido). Lo que nunca se
 * recibió por compra en Odoo y entró con la carga inicial de inventario
 * (oct-2026: 555 productos con stock en Venezuela) toma la fecha de ese ajuste.
 */
async function ultimosIngresos(companyId: number, hasta: string): Promise<Map<number, string>> {
  const { ubicaciones } = await almacenSede(companyId);
  const porOrigen = (usos: string[]) =>
    agrupar(
      "stock.move",
      [
        ["state", "=", "done"],
        ["location_dest_id", "in", ubicaciones],
        ["location_id.usage", "in", usos],
        ["date", "<", inicioDiaUtc(sumarDias(hasta, 1))],
      ],
      ["date:max"],
      ["product_id"],
    );
  const [compras, ajustes] = await Promise.all([porOrigen(["supplier", "transit"]), porOrigen(["inventory"])]);
  const mapa = new Map<number, string>();
  for (const g of ajustes) if (g.product_id && g.date) mapa.set(g.product_id[0], diaCaracas(g.date));
  for (const g of compras) if (g.product_id && g.date) mapa.set(g.product_id[0], diaCaracas(g.date));
  return mapa;
}

function datosProductosSede(companyId: number, mes: string): Promise<DatosSede> {
  const { desde, hasta } = rangoDelMes(mes);
  const hoy = hoyCaracas();
  return cachear(`bi-productos|${companyId}|${mes}|${hoy}`, async () => {
    const [ventas, cogs, ingreso, historia, costoOdoo] = await Promise.all([
      (async () =>
        agrupar("account.move.line", [...(await dominioVentas(companyId)), ...entreFechas(desde, hasta)], ["quantity:sum", "balance:sum"], ["product_id", "move_type"]))(),
      (async () =>
        agrupar("account.move.line", [...(await dominioCostoVentas(companyId)), ...entreFechas(desde, hasta)], ["balance:sum"], ["product_id"]))(),
      ultimosIngresos(companyId, hasta),
      // Stock de hoy menos lo que entró y salió después del cierre.
      historialStock(companyId, hasta < hoy ? sumarDias(hasta, 1) : hoy, hoy),
      costos(companyId),
    ]);
    const venta = new Map<number, number>();
    const unidades = new Map<number, number>();
    for (const g of ventas) {
      const id = g.product_id?.[0];
      if (!id) continue;
      venta.set(id, (venta.get(id) ?? 0) - (Number(g.balance) || 0));
      unidades.set(id, (unidades.get(id) ?? 0) + signoDocumento(g.move_type) * (Number(g.quantity) || 0));
    }
    const costoVendido = new Map<number, number>();
    for (const g of cogs) if (g.product_id) costoVendido.set(g.product_id[0], Number(g.balance) || 0);
    return {
      venta,
      unidades,
      costoVendido,
      ingreso,
      inventario: (id: number) => historia.stockAlCierre(id, hasta),
      costoOdoo,
    };
  });
}

export async function reporteProductos(companyIds: number[], mes: string): Promise<FilaProducto[]> {
  const [sedes, cat] = await Promise.all([Promise.all(companyIds.map((cid) => datosProductosSede(cid, mes))), catalogo()]);

  // Todo el catálogo (con o sin inventario) más los archivados que se vendieron en el mes.
  const ids = new Set<number>(cat.keys());
  for (const s of sedes) for (const id of s.venta.keys()) ids.add(id);
  const info = await infoProductos([...ids]);

  const filas: FilaProducto[] = [];
  for (const id of ids) {
    let venta = 0;
    let unidades = 0;
    let costoVendido = 0;
    let inventario = 0;
    let ultimoIngreso: string | null = null;
    // Costo de Odoo de la sede, pesado por el stock al cierre (sin stock, el de la primera sede que lo tenga).
    let costoPesado = 0;
    let costoPrimero = 0;
    for (const s of sedes) {
      venta += s.venta.get(id) ?? 0;
      const u = s.unidades.get(id) ?? 0;
      unidades += u;
      const inv = s.inventario(id);
      inventario += inv;
      const std = s.costoOdoo.get(id) ?? 0;
      // Sin línea de costo (consumibles) se usa el costo de Odoo.
      costoVendido += s.costoVendido.get(id) ?? std * u;
      costoPesado += std * inv;
      if (!costoPrimero && std > 0) costoPrimero = std;
      const ing = s.ingreso.get(id);
      if (ing && (!ultimoIngreso || ing > ultimoIngreso)) ultimoIngreso = ing;
    }
    const p = info.get(id);
    const costoOdoo = inventario > 0 && costoPesado > 0 ? costoPesado / inventario : costoPrimero;
    const costo = unidades > 0 && costoVendido > 0 ? costoVendido / unidades : costoOdoo;
    filas.push({
      id,
      codigo: p?.codigo ?? `PROD-${id}`,
      producto: p?.nombre ?? "",
      ultimoIngreso,
      marca: p?.marca ?? SIN_MARCA,
      categoria: p?.categoria ?? "Sin categoría",
      costo: costo > 0 ? r2(costo) : null,
      margen: venta > 0 && costoVendido > 0 ? r2(((venta - costoVendido) / venta) * 100) : null,
      venta: r2(venta),
      unidades: r2(unidades),
      inventario: r2(inventario),
    });
  }
  return filas.sort((a, b) => b.venta - a.venta || b.inventario - a.inventario || a.producto.localeCompare(b.producto));
}

// ---------------------------------------------------------------------------
// Reporte III: Clientes
// ---------------------------------------------------------------------------

export interface FilaCliente {
  id: number;
  rif: string;
  cliente: string;
  /** Días desde la última factura (en las sedes elegidas) hasta hoy. */
  diasSinComprar: number | null;
  ultimaCompra: string | null;
  /** Límite de crédito de Odoo; con las dos sedes, la suma. */
  cupo: number;
  /** Días del plazo de pago del cliente; con las dos sedes, el mayor. 0 = contado. */
  diasCredito: number;
  plazo: string;
  ventas: number;
  participacion: number;
  /** Estado del cliente en Odoo (no hay campo de zona). */
  zona: string;
  vendedor: string;
}

/** Días de un plazo por su nombre en español ("30 días", "50% 30 días 50% 60 días" → 60). Sin número = contado. */
function diasDelPlazo(nombre: string): number {
  const numeros = (nombre.replace(/\d+(?:[.,]\d+)?\s*%/g, "").match(/\d+/g) || []).map(Number);
  return numeros.length ? Math.max(...numeros) : 0;
}

export async function reporteClientes(companyIds: number[], meses: string[]): Promise<FilaCliente[]> {
  const ordenados = [...new Set(meses)].sort();
  const elegidos = new Set(ordenados);
  const desde = `${ordenados[0]}-01`;
  const { hasta } = rangoDelMes(ordenados[ordenados.length - 1]);
  const hoy = hoyCaracas();

  // Venta por cliente y mes en el tramo; los meses no elegidos se descartan.
  const ventas = new Map<number, number>();
  const nombres = new Map<number, string>();
  await Promise.all(
    companyIds.map(async (cid) => {
      const grupos = await agrupar(
        "account.move.line",
        [...(await dominioVentas(cid)), ...entreFechas(desde, hasta)],
        ["balance:sum"],
        ["partner_id", "invoice_date:month"],
      );
      for (const g of grupos) {
        const id = idDe(g.partner_id);
        const mes = String(g.__range?.["invoice_date:month"]?.from || "").slice(0, 7);
        if (!id || !elegidos.has(mes)) continue;
        ventas.set(id, (ventas.get(id) ?? 0) - (Number(g.balance) || 0));
        nombres.set(id, nombreDe(g.partner_id));
      }
    }),
  );
  const ids = [...ventas.keys()];
  if (ids.length === 0) return [];

  // Última compra (factura, no nota de crédito) en cualquier fecha, y los datos del contacto por sede.
  const ultima = new Map<number, string>();
  const porSede = await Promise.all(
    companyIds.map(async (cid) => {
      const [grupos, contactos] = await Promise.all([
        (async () =>
          agrupar(
            "account.move.line",
            [...(await dominioVentas(cid, false)), ["quantity", ">", 0], ["partner_id", "in", ids]],
            ["invoice_date:max"],
            ["partner_id"],
          ))(),
        leerContactos(ids, cid, ["name", "vat", "credit_limit", "property_payment_term_id", "user_id", "state_id"]),
      ]);
      for (const g of grupos) {
        const id = idDe(g.partner_id);
        const dia = String(g.invoice_date || "").slice(0, 10);
        if (id && dia && (!ultima.has(id) || dia > ultima.get(id)!)) ultima.set(id, dia);
      }
      return contactos;
    }),
  );
  const plazos = await nombresPlazos([
    ...new Set(porSede.flatMap((m) => [...m.values()].map((p) => idDe(p.property_payment_term_id)).filter(Boolean) as number[])),
  ]);

  const total = [...ventas.values()].reduce((s, v) => s + v, 0);
  return ids
    .map((id) => {
      let cupo = 0;
      let diasCredito = 0;
      let plazo = "";
      let vendedor = "";
      let contacto: any = null;
      for (const sede of porSede) {
        const p = sede.get(id);
        if (!p) continue;
        contacto ??= p;
        cupo += Number(p.credit_limit) || 0;
        const nombrePlazo = plazos.get(idDe(p.property_payment_term_id) as number) || "";
        const dias = diasDelPlazo(nombrePlazo);
        if (nombrePlazo && (!plazo || dias > diasCredito)) {
          plazo = nombrePlazo;
          diasCredito = dias;
        }
        vendedor ||= nombreDe(p.user_id);
      }
      const ventaCliente = ventas.get(id) ?? 0;
      const ultimaCompra = ultima.get(id) ?? null;
      return {
        id,
        rif: String(contacto?.vat || ""),
        cliente: String(contacto?.name || nombres.get(id) || `Contacto ${id}`),
        diasSinComprar: ultimaCompra ? Math.max(0, diasEntre(ultimaCompra, hoy)) : null,
        ultimaCompra,
        cupo: r2(cupo),
        diasCredito,
        plazo: plazo || "Contado",
        ventas: r2(ventaCliente),
        participacion: total ? r2((ventaCliente / total) * 100) : 0,
        // "Carabobo (VE)" → "Carabobo".
        zona: nombreDe(contacto?.state_id).replace(/\s*\([A-Z]{2}\)$/, "") || "Sin zona",
        vendedor: vendedor || "Sin vendedor",
      };
    })
    .sort((a, b) => b.ventas - a.ventas);
}
