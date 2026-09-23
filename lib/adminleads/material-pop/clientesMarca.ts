import { callOdooRPC } from "@/lib/odoo";
import { query } from "@/lib/db";
import { clienteExcluido } from "@/lib/gerente_venta/reporteVentas";
import { esVendedorExcluido } from "@/lib/cxc/vendedoresExcluidos";

/**
 * Top de clientes que compran las marcas del catálogo Material POP.
 *
 * El material POP se hace para empujar marcas concretas (ASTA, CANON…), así
 * que la pregunta útil es quién compra esas marcas. El inventario POP vive en
 * MySQL y las ventas en Odoo, y el único puente es el nombre de la marca:
 * `pop_products.brand` es texto libre y en Odoo la marca es
 * `product.product.x_studio_marca`, un many2one a `spiff.brand`. Se cruzan por
 * nombre normalizado (mayúsculas, sin acentos ni espacios de más).
 *
 * Una marca del POP que no exista en Odoo — "SUPRICOM", que es material propio
 * — simplemente no tiene ventas. Se devuelve aparte en `marcasSinVentas` para
 * que la pantalla lo diga en vez de mostrar una tabla vacía sin explicación.
 *
 * Las ventas salen de `account.move.line` de facturas y notas de crédito de
 * cliente confirmadas, con `price_subtotal` (sin IVA) y la nota de crédito
 * restando. Es el mismo criterio del reporte de ventas de Gerencia
 * (lib/gerente_venta/reporteVentas.ts), para que las cifras coincidan.
 *
 * Quedan fuera las facturas entre empresas del grupo (Supricom, Office
 * Solution) y las de los vendedores internos o de prueba. Las dos reglas se
 * importan de donde ya viven, en vez de copiar las listas: la de clientes del
 * reporte de Gerencia y la de vendedores de lib/cxc/vendedoresExcluidos.ts,
 * que es por sede.
 */

export interface ClienteMarca {
  partnerId: number;
  cliente: string;
  rif: string;
  telefono: string;
  email: string;
  ciudad: string;
  vendedor: string;
  unidades: number;
  monto: number;
  facturas: number;
  ultimaCompra: string | null;
  /** Marcas del POP que le compró, de mayor a menor monto. */
  marcas: string[];
}

export interface TopClientesResult {
  clientes: ClienteMarca[];
  /** Marcas del catálogo POP, para el filtro de la pantalla. */
  marcasPop: string[];
  /** Marcas del POP que no existen como marca en Odoo. */
  marcasSinVentas: string[];
  totales: { unidades: number; monto: number; clientes: number };
}

export interface DetalleProducto {
  producto: string;
  marca: string;
  unidades: number;
  monto: number;
}

export interface DetalleFactura {
  numero: string;
  fecha: string | null;
  vendedor: string;
  unidades: number;
  monto: number;
  esNotaCredito: boolean;
}

export interface DetalleCliente {
  cliente: string;
  productos: DetalleProducto[];
  facturas: DetalleFactura[];
  totales: { unidades: number; monto: number; facturas: number };
}

export interface OpcionesConsulta {
  cids: number | null;
  companyIds: number[];
  desde: string;
  hasta: string;
  /** Una marca concreta del POP, o null para todas. */
  marca?: string | null;
}

const PAGE = 2000;

/** Mayúsculas, sin acentos ni espacios de más, para cruzar nombres de marca. */
function normalizar(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim()
    .replace(/\s+/g, " ");
}

/** "[A-057H] ASTA TONER CANON" -> "ASTA TONER CANON". */
function limpiarProducto(s: string): string {
  return (s || "").replace(/^\s*\[[^\]]*\]\s*/, "").trim();
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const soloFecha = (v: any): string | null => (v ? String(v).split(/[ T]/)[0] : null);

async function searchReadPaginado(model: string, domain: any[], fields: string[]): Promise<any[]> {
  const out: any[] = [];
  let offset = 0;
  // Tope de seguridad: 80k líneas. La ruta limita el rango a 12 meses.
  for (let i = 0; i < 40; i++) {
    const page =
      (await callOdooRPC<any[]>(model, "search_read", [domain], {
        fields,
        limit: PAGE,
        offset,
        order: "id asc",
      })) || [];
    out.push(...page);
    if (page.length < PAGE) break;
    offset += PAGE;
  }
  return out;
}

async function readEnLotes(model: string, ids: any[], fields: string[]): Promise<Map<number, any>> {
  const map = new Map<number, any>();
  const unicos = [...new Set(ids.filter(Boolean))] as number[];
  for (let i = 0; i < unicos.length; i += 200) {
    const recs =
      (await callOdooRPC<any[]>(model, "read", [unicos.slice(i, i + 200)], { fields })) || [];
    for (const r of recs) map.set(r.id, r);
  }
  return map;
}

/** Marcas distintas del catálogo POP activo. */
export async function marcasDelCatalogo(cids: number | null): Promise<string[]> {
  const params: any[] = [];
  let where = "WHERE is_active = 1 AND brand IS NOT NULL AND TRIM(brand) <> ''";
  if (cids !== null) {
    where += " AND cids = ?";
    params.push(cids);
  }
  const res = await query(
    `SELECT DISTINCT TRIM(brand) AS brand FROM pop_products ${where} ORDER BY brand ASC`,
    params,
  );
  return (res.rows || []).map((r: any) => String(r.brand));
}

/** Productos de Odoo de las marcas del POP, con el nombre de su marca. */
async function productosDeMarcasPop(
  cids: number | null,
  marca?: string | null,
): Promise<{ marcasPop: string[]; marcasSinVentas: string[]; marcaDeProducto: Map<number, string> }> {
  const marcaDeProducto = new Map<number, string>();
  const marcasPop = await marcasDelCatalogo(cids);
  const pedidas = marca ? marcasPop.filter((m) => normalizar(m) === normalizar(marca)) : marcasPop;
  if (pedidas.length === 0) return { marcasPop, marcasSinVentas: [], marcaDeProducto };

  const marcasOdoo =
    (await callOdooRPC<any[]>("spiff.brand", "search_read", [[]], {
      fields: ["id", "name"],
      limit: 0,
    })) || [];
  const idPorNombre = new Map<string, number>();
  const nombrePorId = new Map<number, string>();
  for (const m of marcasOdoo) {
    const n = normalizar(m?.name || "");
    if (!n) continue;
    idPorNombre.set(n, m.id);
    nombrePorId.set(m.id, String(m.name).trim());
  }

  const brandIds: number[] = [];
  const marcasSinVentas: string[] = [];
  for (const m of pedidas) {
    const id = idPorNombre.get(normalizar(m));
    if (id) brandIds.push(id);
    else marcasSinVentas.push(m);
  }
  if (brandIds.length === 0) return { marcasPop, marcasSinVentas, marcaDeProducto };

  const productos =
    (await callOdooRPC<any[]>(
      "product.product",
      "search_read",
      [[["x_studio_marca", "in", brandIds]]],
      { fields: ["id", "x_studio_marca"], limit: 0 },
    )) || [];
  for (const p of productos) {
    const id = Array.isArray(p.x_studio_marca) ? p.x_studio_marca[0] : null;
    marcaDeProducto.set(p.id, (id && nombrePorId.get(id)) || "Sin marca");
  }
  return { marcasPop, marcasSinVentas, marcaDeProducto };
}

function dominioLineas(opts: OpcionesConsulta, productIds: number[], partnerId?: number): any[] {
  const dom: any[] = [
    ["move_id.move_type", "in", ["out_invoice", "out_refund"]],
    ["move_id.state", "=", "posted"],
    ["move_id.company_id", "in", opts.companyIds],
    ["move_id.invoice_date", ">=", opts.desde],
    ["move_id.invoice_date", "<=", opts.hasta],
    ["display_type", "=", "product"],
    ["product_id", "in", productIds],
  ];
  if (partnerId) dom.push(["partner_id", "=", partnerId]);
  return dom;
}

const CAMPOS_MOVE = ["name", "move_type", "invoice_date", "invoice_user_id", "company_id"];

export async function topClientesPorMarca(opts: OpcionesConsulta): Promise<TopClientesResult> {
  const vacio = (marcasPop: string[], marcasSinVentas: string[]): TopClientesResult => ({
    clientes: [],
    marcasPop,
    marcasSinVentas,
    totales: { unidades: 0, monto: 0, clientes: 0 },
  });

  const { marcasPop, marcasSinVentas, marcaDeProducto } = await productosDeMarcasPop(
    opts.cids,
    opts.marca,
  );
  if (marcaDeProducto.size === 0) return vacio(marcasPop, marcasSinVentas);

  const lineas = await searchReadPaginado(
    "account.move.line",
    dominioLineas(opts, [...marcaDeProducto.keys()]),
    ["move_id", "partner_id", "product_id", "quantity", "price_subtotal"],
  );
  if (lineas.length === 0) return vacio(marcasPop, marcasSinVentas);

  const moves = await readEnLotes(
    "account.move",
    lineas.map((l) => l.move_id?.[0]),
    CAMPOS_MOVE,
  );

  type Acum = ClienteMarca & { movesVistos: Set<number>; montoPorMarca: Map<string, number> };
  const porCliente = new Map<number, Acum>();

  for (const l of lineas) {
    const partnerId = l.partner_id?.[0];
    if (!partnerId) continue;
    if (clienteExcluido(l.partner_id?.[1] || "")) continue;
    const mv = moves.get(l.move_id?.[0]) || {};
    if (esVendedorExcluido(mv.invoice_user_id?.[1], mv.company_id?.[0])) continue;
    // La nota de crédito resta: son unidades devueltas y plata que vuelve.
    const signo = mv.move_type === "out_refund" ? -1 : 1;
    const unidades = signo * (Number(l.quantity) || 0);
    const monto = signo * (Number(l.price_subtotal) || 0);
    const marca = marcaDeProducto.get(l.product_id?.[0]) || "Sin marca";
    const fecha = soloFecha(mv.invoice_date);

    let acc = porCliente.get(partnerId);
    if (!acc) {
      acc = {
        partnerId,
        cliente: l.partner_id?.[1] || "(sin cliente)",
        rif: "",
        telefono: "",
        email: "",
        ciudad: "",
        vendedor: mv.invoice_user_id?.[1] || "",
        unidades: 0,
        monto: 0,
        facturas: 0,
        ultimaCompra: null,
        marcas: [],
        movesVistos: new Set<number>(),
        montoPorMarca: new Map<string, number>(),
      };
      porCliente.set(partnerId, acc);
    }
    acc.unidades += unidades;
    acc.monto += monto;
    acc.montoPorMarca.set(marca, (acc.montoPorMarca.get(marca) || 0) + monto);
    if (l.move_id?.[0]) acc.movesVistos.add(l.move_id[0]);
    if (fecha && (!acc.ultimaCompra || fecha > acc.ultimaCompra)) {
      acc.ultimaCompra = fecha;
      // El vendedor que se muestra es el de la factura más reciente.
      acc.vendedor = mv.invoice_user_id?.[1] || acc.vendedor;
    }
  }

  const partners = await readEnLotes(
    "res.partner",
    [...porCliente.keys()],
    ["vat", "phone", "mobile", "email", "city"],
  );

  const clientes: ClienteMarca[] = [...porCliente.values()].map((a) => {
    const p = partners.get(a.partnerId) || {};
    return {
      partnerId: a.partnerId,
      cliente: a.cliente,
      rif: p.vat || "",
      telefono: p.phone || p.mobile || "",
      email: p.email || "",
      ciudad: p.city || "",
      vendedor: a.vendedor,
      unidades: r2(a.unidades),
      monto: r2(a.monto),
      facturas: a.movesVistos.size,
      ultimaCompra: a.ultimaCompra,
      marcas: [...a.montoPorMarca.entries()].sort((x, y) => y[1] - x[1]).map(([m]) => m),
    };
  });

  clientes.sort((a, b) => b.monto - a.monto);

  return {
    clientes,
    marcasPop,
    marcasSinVentas,
    totales: {
      unidades: r2(clientes.reduce((s, c) => s + c.unidades, 0)),
      monto: r2(clientes.reduce((s, c) => s + c.monto, 0)),
      clientes: clientes.length,
    },
  };
}

/**
 * Desglose de un cliente: qué productos compró y en qué facturas.
 *
 * Mismo dominio que el listado, acotado a un `partner_id`, para que los totales
 * del detalle cuadren con la fila de la que se abrió.
 */
export async function detalleClienteMarca(
  opts: OpcionesConsulta & { partnerId: number },
): Promise<DetalleCliente> {
  const vacio: DetalleCliente = {
    cliente: "",
    productos: [],
    facturas: [],
    totales: { unidades: 0, monto: 0, facturas: 0 },
  };

  const { marcaDeProducto } = await productosDeMarcasPop(opts.cids, opts.marca);
  if (marcaDeProducto.size === 0) return vacio;

  const lineas = await searchReadPaginado(
    "account.move.line",
    dominioLineas(opts, [...marcaDeProducto.keys()], opts.partnerId),
    ["move_id", "partner_id", "product_id", "quantity", "price_subtotal"],
  );
  if (lineas.length === 0) return vacio;

  const moves = await readEnLotes(
    "account.move",
    lineas.map((l) => l.move_id?.[0]),
    CAMPOS_MOVE,
  );

  const porProducto = new Map<string, DetalleProducto>();
  const porFactura = new Map<number, DetalleFactura>();
  let cliente = "";

  for (const l of lineas) {
    const nombreCliente = l.partner_id?.[1] || "";
    if (clienteExcluido(nombreCliente)) continue;
    const mv = moves.get(l.move_id?.[0]) || {};
    if (esVendedorExcluido(mv.invoice_user_id?.[1], mv.company_id?.[0])) continue;
    cliente = cliente || nombreCliente;

    const signo = mv.move_type === "out_refund" ? -1 : 1;
    const unidades = signo * (Number(l.quantity) || 0);
    const monto = signo * (Number(l.price_subtotal) || 0);
    const productoId = l.product_id?.[0];
    const clave = String(productoId);

    const prod = porProducto.get(clave);
    if (prod) {
      prod.unidades += unidades;
      prod.monto += monto;
    } else {
      porProducto.set(clave, {
        producto: limpiarProducto(l.product_id?.[1] || "") || "(sin producto)",
        marca: marcaDeProducto.get(productoId) || "Sin marca",
        unidades,
        monto,
      });
    }

    const moveId = l.move_id?.[0];
    if (!moveId) continue;
    const fac = porFactura.get(moveId);
    if (fac) {
      fac.unidades += unidades;
      fac.monto += monto;
    } else {
      porFactura.set(moveId, {
        numero: mv.name || l.move_id?.[1] || "",
        fecha: soloFecha(mv.invoice_date),
        vendedor: mv.invoice_user_id?.[1] || "",
        unidades,
        monto,
        esNotaCredito: mv.move_type === "out_refund",
      });
    }
  }

  const productos = [...porProducto.values()]
    .map((p) => ({ ...p, unidades: r2(p.unidades), monto: r2(p.monto) }))
    .sort((a, b) => b.monto - a.monto);
  const facturas = [...porFactura.values()]
    .map((f) => ({ ...f, unidades: r2(f.unidades), monto: r2(f.monto) }))
    .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));

  return {
    cliente,
    productos,
    facturas,
    totales: {
      unidades: r2(productos.reduce((s, p) => s + p.unidades, 0)),
      monto: r2(productos.reduce((s, p) => s + p.monto, 0)),
      facturas: facturas.length,
    },
  };
}
