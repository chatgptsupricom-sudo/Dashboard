import { query } from "@/lib/db";
import { callOdooRPCEstricto } from "@/lib/odoo";
import { partnersIntercompania } from "@/lib/intercompania";
import { normalizarRif, RIF_SQL, SQL_SIN_INTERCOMPANIA } from "@/lib/smartbit";
import { OdooNoDisponibleError } from "@/lib/servicio-tecnico/factura";

/**
 * Compras de un producto y facturas de Smartbit, para Buscar Factura de RMA
 * (/rma/buscar-factura). Completa a lib/rma/buscarSerial.ts, que solo puede
 * mirar Odoo: Smartbit (las ventas antes de abril de 2026) no guarda
 * seriales, así que para esos equipos la validación es por producto y
 * cliente.
 *
 * - `ventas_smartbit`: un renglón por artículo vendido (sede, día, cliente,
 *   RIF en `codigo_cliente`, código y nombre del artículo, unidades). No
 *   trae número de factura.
 * - `ventas_smartbit_facturas`: la cabecera de cada factura (número, día, RIF
 *   normalizado, cliente, unidades), sin productos. Solo de las sedes que
 *   subieron el Excel "Ventas / Devoluciones" en Recompra; las devoluciones
 *   vienen con prefijo `NC-`.
 *
 * Las dos tablas no tienen una llave en común: los productos de una factura
 * de Smartbit son los que ese cliente compró ese día en esa sede (mismo
 * criterio que Recompra, "una compra = cliente + día").
 *
 * Nada devuelve precios ni montos. Las compras de empresas del grupo no
 * cuentan como compra de un cliente y se dejan fuera.
 */

export interface CompraProducto {
  origen: "odoo" | "smartbit";
  fecha: string;
  sede: number | null;
  cliente: string;
  /** Factura (Odoo); en Smartbit el renglón no la trae. */
  factura: string | null;
  codigo: string;
  producto: string;
  unidades: number;
}

export interface FacturaSmartbit {
  sede: number;
  fecha: string;
  numero: string;
  cliente: string;
  rif: string;
  unidades: number | null;
  devolucion: boolean;
  /** Lo que ese cliente compró ese día en esa sede (ventas_smartbit). */
  productos: { codigo: string; articulo: string; unidades: number }[];
}

const LIMITE = 100;
const id = (v: any) => (Array.isArray(v) ? v[0] : null);
const nombre = (v: any) => (Array.isArray(v) ? v[1] : "");

async function rpc<T>(model: string, method: string, args: any[], kwargs: Record<string, any> = {}): Promise<T> {
  const r = await callOdooRPCEstricto<T>(model, method, args, kwargs);
  if (r === null || r === undefined) throw new OdooNoDisponibleError();
  return r;
}

/** Las tablas de Smartbit pueden no existir en una base nueva: sin ellas, nada. */
async function filas(sql: string, params: any[]): Promise<any[]> {
  try {
    return (await query(sql, params)).rows as any[];
  } catch (e: any) {
    console.error("[rma/buscarCompras] Smartbit:", e?.message);
    return [];
  }
}

const sinComodines = (s: string) => s.trim().replace(/[%_]/g, " ").replace(/\s+/g, " ").slice(0, 80);

/** Productos de Odoo por código exacto o por nombre. */
export async function idsDeProducto(texto: string): Promise<{ ids: number[]; nombres: string[] }> {
  const q = sinComodines(texto);
  if (q.length < 3) return { ids: [], nombres: [] };
  const r = await rpc<any[]>(
    "product.product",
    "search_read",
    [["|", "|", ["default_code", "=ilike", q], ["barcode", "=", q], ["name", "ilike", q]]],
    { fields: ["id", "display_name"], limit: 40, context: { active_test: false } },
  );
  return { ids: r.map((p) => p.id), nombres: r.map((p) => p.display_name) };
}

/**
 * Clientes de Odoo por nombre o por RIF. El RIF se compara por sus dígitos:
 * en Odoo está escrito de varias formas ("J-31163115-1", "J311631151") y el
 * usuario puede escribir solo los números.
 */
async function clientesOdoo(texto: string): Promise<number[]> {
  const digitos = normalizarRif(texto).replace(/[^0-9]/g, "");
  const dominio = digitos.length >= 6
    ? ["|", ["name", "ilike", texto], ["vat", "ilike", digitos.slice(0, 8)]]
    : [["name", "ilike", texto]];
  const r = await rpc<any[]>("res.partner", "search_read", [dominio], {
    fields: ["id", "name", "vat", "commercial_partner_id"],
    limit: 300,
    context: { active_test: false },
  });
  const nombreBuscado = texto.toLowerCase();
  return [
    ...new Set(
      r
        .filter(
          (p) =>
            String(p.name || "").toLowerCase().includes(nombreBuscado) ||
            (digitos.length >= 6 && normalizarRif(String(p.vat || "")).replace(/[^0-9]/g, "").includes(digitos)),
        )
        .map((p) => id(p.commercial_partner_id) ?? p.id),
    ),
  ];
}

export async function comprasDelProducto(
  producto: string,
  cliente: string,
  sede?: number,
): Promise<{ compras: CompraProducto[]; productosOdoo: string[] }> {
  const q = sinComodines(producto);
  const c = sinComodines(cliente);
  const digitosCliente = normalizarRif(c).replace(/[^0-9]/g, "");

  // ── Odoo (desde abril 2026): líneas de producto de facturas publicadas ──
  const { ids, nombres } = await idsDeProducto(q);
  let odoo: CompraProducto[] = [];
  const clientes = ids.length && c ? await clientesOdoo(c) : [];
  if (ids.length && (!c || clientes.length)) {
    const dominio: any[] = [
      ["product_id", "in", ids],
      ["display_type", "=", "product"],
      ["parent_state", "=", "posted"],
      ["move_id.move_type", "=", "out_invoice"],
    ];
    if (sede) dominio.push(["company_id", "=", sede]);
    if (c) dominio.push(["move_id.commercial_partner_id", "in", clientes]);
    const [lineas, grupo] = await Promise.all([
      rpc<any[]>("account.move.line", "search_read", [dominio], {
        fields: ["date", "move_id", "partner_id", "company_id", "product_id", "quantity"],
        order: "date desc, id desc",
        limit: LIMITE,
      }),
      partnersIntercompania(),
    ]);
    odoo = lineas
      .filter((l) => !grupo.has(id(l.partner_id)))
      .map((l) => ({
        origen: "odoo" as const,
        fecha: String(l.date || ""),
        sede: id(l.company_id),
        cliente: nombre(l.partner_id) || "Sin cliente",
        factura: nombre(l.move_id) || null,
        codigo: "",
        producto: nombre(l.product_id),
        unidades: Number(l.quantity) || 0,
      }));
  }

  // ── Smartbit (antes de abril 2026): renglones por artículo ──
  const codigo = q.toUpperCase();
  const params: any[] = [codigo, codigo.replace(/\//g, "-"), `%${q}%`];
  let filtro = `(UPPER(TRIM(codigo_articulo)) IN (?, ?) OR articulo LIKE ?)`;
  if (c) {
    filtro += ` AND (cliente LIKE ?${digitosCliente.length >= 6 ? ` OR ${RIF_SQL} LIKE ?` : ""})`;
    params.push(`%${c}%`);
    if (digitosCliente.length >= 6) params.push(`%${digitosCliente}%`);
  }
  if (sede) {
    filtro += " AND company_id = ?";
    params.push(sede);
  }
  const sb = await filas(
    `SELECT company_id, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, cliente, codigo_articulo, articulo, unidades
       FROM ventas_smartbit
      WHERE ${filtro} AND unidades > 0 AND ${SQL_SIN_INTERCOMPANIA}
      ORDER BY fecha DESC
      LIMIT ${LIMITE}`,
    params,
  );
  const smartbit: CompraProducto[] = sb.map((r) => ({
    origen: "smartbit",
    fecha: r.fecha,
    sede: Number(r.company_id) || null,
    cliente: r.cliente || "Sin cliente",
    factura: null,
    codigo: r.codigo_articulo || "",
    producto: r.articulo || "",
    unidades: Number(r.unidades) || 0,
  }));

  const compras = [...odoo, ...smartbit].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, LIMITE);
  return { compras, productosOdoo: nombres };
}

export async function facturasSmartbit(numeroCrudo: string, sede?: number): Promise<FacturaSmartbit[]> {
  const numero = numeroCrudo.trim().toUpperCase().replace(/[^A-Z0-9/-]/g, "").slice(0, 30);
  if (!numero) return [];
  // Número exacto o sin los ceros de adelante que el Excel a veces quita.
  const sinCeros = numero.replace(/^0+/, "");
  const params: any[] = [numero, `NC-${numero}`, sinCeros, `NC-${sinCeros}`];
  let filtro = "UPPER(numero) IN (?, ?, ?, ?)";
  if (sede) {
    filtro += " AND company_id = ?";
    params.push(sede);
  }
  const cabeceras = await filas(
    `SELECT company_id, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, numero, rif, cliente, unidades
       FROM ventas_smartbit_facturas WHERE ${filtro} ORDER BY fecha DESC LIMIT 10`,
    params,
  );
  return Promise.all(
    cabeceras.map(async (f) => {
      const productos = await filas(
        `SELECT codigo_articulo, articulo, SUM(unidades) AS unidades
           FROM ventas_smartbit
          WHERE company_id = ? AND fecha = ? AND (${RIF_SQL} = ? OR cliente = ?)
          GROUP BY codigo_articulo, articulo
          HAVING SUM(unidades) <> 0
          ORDER BY articulo
          LIMIT 200`,
        [f.company_id, f.fecha, f.rif || "", f.cliente || ""],
      );
      return {
        sede: Number(f.company_id),
        fecha: f.fecha,
        numero: f.numero,
        cliente: f.cliente || "",
        rif: f.rif || "",
        unidades: f.unidades == null ? null : Number(f.unidades),
        devolucion: String(f.numero).toUpperCase().startsWith("NC-"),
        productos: productos.map((p) => ({
          codigo: p.codigo_articulo || "",
          articulo: p.articulo || "",
          unidades: Number(p.unidades) || 0,
        })),
      };
    }),
  );
}
