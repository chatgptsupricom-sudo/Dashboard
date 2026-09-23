import { callOdooRPC } from "@/lib/odoo";
import { query } from "@/lib/db";

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

export async function topClientesPorMarca(opts: {
  cids: number | null;
  companyIds: number[];
  desde: string;
  hasta: string;
  /** Una marca concreta del POP, o null para todas. */
  marca?: string | null;
}): Promise<TopClientesResult> {
  const vacio = (marcasPop: string[], marcasSinVentas: string[]): TopClientesResult => ({
    clientes: [],
    marcasPop,
    marcasSinVentas,
    totales: { unidades: 0, monto: 0, clientes: 0 },
  });

  const marcasPop = await marcasDelCatalogo(opts.cids);
  const pedidas = opts.marca
    ? marcasPop.filter((m) => normalizar(m) === normalizar(opts.marca!))
    : marcasPop;
  if (pedidas.length === 0) return vacio(marcasPop, []);

  // Marcas de Odoo que coinciden por nombre con las del POP.
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
  if (brandIds.length === 0) return vacio(marcasPop, marcasSinVentas);

  const productos =
    (await callOdooRPC<any[]>(
      "product.product",
      "search_read",
      [[["x_studio_marca", "in", brandIds]]],
      { fields: ["id", "x_studio_marca"], limit: 0 },
    )) || [];
  if (productos.length === 0) return vacio(marcasPop, marcasSinVentas);

  const marcaDeProducto = new Map<number, string>();
  for (const p of productos) {
    const id = Array.isArray(p.x_studio_marca) ? p.x_studio_marca[0] : null;
    marcaDeProducto.set(p.id, (id && nombrePorId.get(id)) || "Sin marca");
  }

  const lineas = await searchReadPaginado(
    "account.move.line",
    [
      ["move_id.move_type", "in", ["out_invoice", "out_refund"]],
      ["move_id.state", "=", "posted"],
      ["move_id.company_id", "in", opts.companyIds],
      ["move_id.invoice_date", ">=", opts.desde],
      ["move_id.invoice_date", "<=", opts.hasta],
      ["display_type", "=", "product"],
      ["product_id", "in", [...marcaDeProducto.keys()]],
    ],
    ["move_id", "partner_id", "product_id", "quantity", "price_subtotal"],
  );
  if (lineas.length === 0) return vacio(marcasPop, marcasSinVentas);

  const moves = await readEnLotes(
    "account.move",
    lineas.map((l) => l.move_id?.[0]),
    ["move_type", "invoice_date", "invoice_user_id"],
  );

  type Acum = ClienteMarca & { movesVistos: Set<number>; montoPorMarca: Map<string, number> };
  const porCliente = new Map<number, Acum>();

  for (const l of lineas) {
    const partnerId = l.partner_id?.[0];
    if (!partnerId) continue;
    const mv = moves.get(l.move_id?.[0]) || {};
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
