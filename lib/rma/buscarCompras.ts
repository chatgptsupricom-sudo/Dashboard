import { query } from "@/lib/db";
import { callOdooRPCEstricto } from "@/lib/odoo";
import { partnersIntercompania } from "@/lib/intercompania";
import { calcularGarantia, type ResultadoGarantia } from "@/lib/garantia";
import { normalizarRif, RIF_SQL, SQL_SIN_INTERCOMPANIA } from "@/lib/smartbit";
import { OdooNoDisponibleError } from "@/lib/servicio-tecnico/factura";
import type { MovimientoSerial, ResultadoSerial } from "@/lib/rma/buscarSerial";

/**
 * Compras de un producto, facturas y seriales de Smartbit, para Buscar
 * Factura de RMA (/rma/buscar-factura). Completa a lib/rma/buscarSerial.ts,
 * que mira Odoo (desde abril de 2026).
 *
 * - `ventas_smartbit`: un renglón por artículo vendido (sede, día, cliente,
 *   RIF en `codigo_cliente`, código y nombre del artículo, unidades). Lo
 *   cargado con el Excel "Ventas histórico" (scripts/smartbit-historico-a-sql.cjs,
 *   hoy Valencia) trae además `numero` (el de la factura) y `serial` (un
 *   renglón por unidad); lo cargado por API o con los exports anteriores no
 *   (columnas de sql/ventas_smartbit_numero_serial.sql, NULL).
 * - `ventas_smartbit_facturas`: la cabecera de cada factura (número, día, RIF
 *   normalizado, cliente, unidades), sin productos. Las devoluciones vienen
 *   con prefijo `NC-`, igual que `ventas_smartbit.numero`.
 *
 * Los productos de una factura salen de `ventas_smartbit.numero`; si la sede
 * no lo tiene, son los que ese cliente compró ese día en esa sede (mismo
 * criterio que Recompra, "una compra = cliente + día").
 *
 * Nada devuelve precios ni montos. Las compras de empresas del grupo no
 * cuentan como compra de un cliente.
 */

export interface CompraProducto {
  origen: "odoo" | "smartbit";
  fecha: string;
  sede: number | null;
  cliente: string;
  /** Factura; en Smartbit solo si la sede se cargó con número. */
  factura: string | null;
  codigo: string;
  producto: string;
  /** Solo Smartbit con serial (un renglón por unidad). */
  serial: string | null;
  unidades: number;
}

export interface ProductoSmartbit {
  codigo: string;
  articulo: string;
  unidades: number;
  seriales: string[];
  garantia: ResultadoGarantia;
}

export interface FacturaSmartbit {
  sede: number;
  fecha: string;
  numero: string;
  cliente: string;
  rif: string;
  unidades: number | null;
  devolucion: boolean;
  /** true = los productos de la factura; false = lo que ese cliente compró ese día en esa sede. */
  porNumero: boolean;
  productos: ProductoSmartbit[];
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

/**
 * Columnas de ventas_smartbit que no están en todas las bases: `numero` y
 * `serial` (sql/ventas_smartbit_numero_serial.sql) y `marca`. Sin la
 * migración se vuelve a mirar en la próxima búsqueda.
 */
let columnas: Promise<Set<string>> | null = null;
function columnasSmartbit(): Promise<Set<string>> {
  columnas ??= filas("SHOW COLUMNS FROM ventas_smartbit", []).then((r) => {
    const set = new Set(r.map((c) => String(c.Field)));
    if (!set.has("serial")) columnas = null;
    return set;
  });
  return columnas;
}

/** Garantía de un artículo de Smartbit, sin poder tumbar la búsqueda. */
async function garantiaSmartbit(marca: string, articulo: string, fecha: string): Promise<ResultadoGarantia> {
  try {
    return await calcularGarantia({ marcaOdoo: marca, productoNombre: articulo, fechaFactura: fecha });
  } catch (e: any) {
    console.error("[rma/buscarCompras] garantía:", e?.message);
    return { estado: "indeterminada", meses_cubiertos: null, fecha_vencimiento: null, dias_restantes: null, marca_resuelta: null, motivo: "error_calculo" };
  }
}

const sinComodines = (s: string) => s.trim().replace(/[%_]/g, " ").replace(/\s+/g, " ").slice(0, 80);

/** Filtro SQL de un artículo de Smartbit por código (exacto, `/` = `-`) o por nombre. */
function filtroArticulo(texto: string): { sql: string; params: any[] } {
  const codigo = texto.toUpperCase();
  return {
    sql: "(UPPER(TRIM(codigo_articulo)) IN (?, ?) OR articulo LIKE ?)",
    params: [codigo, codigo.replace(/\//g, "-"), `%${texto}%`],
  };
}

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
        serial: null,
        unidades: Number(l.quantity) || 0,
      }));
  }

  // ── Smartbit (antes de abril 2026): renglones por artículo ──
  const conSerial = (await columnasSmartbit()).has("serial");
  const articulo = filtroArticulo(q);
  const params: any[] = [...articulo.params];
  let filtro = articulo.sql;
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
            ${conSerial ? ", numero, serial" : ""}
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
    factura: r.numero || null,
    codigo: r.codigo_articulo || "",
    producto: r.articulo || "",
    serial: r.serial || null,
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
  const cols = await columnasSmartbit();
  const marca = cols.has("marca") ? "MAX(marca)" : "''";
  return Promise.all(
    cabeceras.map(async (f) => {
      // Por número (con sus seriales) si la sede lo tiene; si no, cliente + día.
      // Se agrupa aquí y no con GROUP_CONCAT, que corta en 1024 bytes.
      const renglones = cols.has("serial")
        ? await filas(
            `SELECT codigo_articulo, articulo, ${cols.has("marca") ? "marca" : "''"} AS marca, unidades, serial
               FROM ventas_smartbit
              WHERE company_id = ? AND numero = ?
              ORDER BY articulo, serial
              LIMIT 2000`,
            [f.company_id, f.numero],
          )
        : [];
      const porNumero = new Map<string, { codigo_articulo: string; articulo: string; marca: string; unidades: number; seriales: string[] }>();
      for (const r of renglones) {
        const clave = `${r.codigo_articulo}|${r.articulo}`;
        const p = porNumero.get(clave) ?? { ...r, unidades: 0, seriales: [] };
        p.unidades += Number(r.unidades) || 0;
        if (r.serial) p.seriales.push(String(r.serial));
        porNumero.set(clave, p);
      }
      const productos: any[] = porNumero.size
        ? [...porNumero.values()]
        : await filas(
            `SELECT codigo_articulo, articulo, ${marca} AS marca, SUM(unidades) AS unidades
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
        porNumero: porNumero.size > 0,
        productos: await Promise.all(
          productos.map(async (p) => ({
            codigo: p.codigo_articulo || "",
            articulo: p.articulo || "",
            unidades: Number(p.unidades) || 0,
            seriales: p.seriales ?? [],
            garantia: await garantiaSmartbit(p.marca || "", p.articulo || "", f.fecha),
          })),
        ),
      };
    }),
  );
}

/**
 * Un serial en las ventas de Smartbit (solo las sedes cargadas con serial),
 * con la misma forma que buscarSerial() de Odoo: cada factura es una
 * "salida" y cada devolución (NC) una "devolucion". Las ventas a empresas del
 * grupo se muestran pero no cuentan; el veredicto sale de la última venta a
 * un cliente de afuera y de si después volvió. Smartbit tiene seriales
 * cortos internos ("7750") que se repiten entre productos: con `producto`
 * solo cuentan los de ese artículo.
 */
export async function serialSmartbit(
  serial: string,
  producto = "",
  sede?: number,
): Promise<ResultadoSerial & { garantia: ResultadoGarantia | null }> {
  const vacio = { serial, veredicto: "no_existe" as const, productos: [], venta: null, movimientos: [], garantia: null };
  const cols = await columnasSmartbit();
  if (!serial || !cols.has("serial")) return vacio;

  // Los seriales se guardan sin espacios a los lados y la columna no distingue
  // mayúsculas: `=` usa el índice.
  const params: any[] = [serial.trim()];
  let filtro = "serial = ?";
  const q = sinComodines(producto);
  if (q.length >= 3) {
    const a = filtroArticulo(q);
    filtro += ` AND ${a.sql}`;
    params.push(...a.params);
  }
  if (sede) {
    filtro += " AND company_id = ?";
    params.push(sede);
  }
  const r = await filas(
    `SELECT company_id, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, numero, cliente, articulo,
            ${cols.has("marca") ? "marca" : "''"} AS marca, unidades,
            (${SQL_SIN_INTERCOMPANIA}) AS externo
       FROM ventas_smartbit
      WHERE ${filtro}
      ORDER BY fecha, id
      LIMIT 200`,
    params,
  );
  if (!r.length) return vacio;

  const movimientos: (MovimientoSerial & { marca: string })[] = r.map((m) => ({
    tipo: Number(m.unidades) < 0 ? "devolucion" : "salida",
    fecha: m.fecha,
    sede: Number(m.company_id) || null,
    despacho: "",
    cliente: m.cliente || "Sin cliente",
    intercompania: !Number(m.externo),
    facturas: m.numero ? [{ numero: m.numero, fecha: m.fecha }] : [],
    producto: m.articulo || "",
    marca: m.marca || "",
  }));
  // Ya vienen en orden: una devolución del mismo día cuenta solo si va después de la venta.
  const aClientes = movimientos.filter((m) => !m.intercompania);
  const iVenta = aClientes.map((m) => m.tipo).lastIndexOf("salida");
  const venta = iVenta >= 0 ? aClientes[iVenta] : null;
  const veredicto = venta
    ? aClientes.slice(iVenta + 1).some((m) => m.tipo === "devolucion") ? "devuelto" : "comprado"
    : "solo_entre_sedes";
  const sinMarca = ({ marca, ...m }: MovimientoSerial & { marca: string }): MovimientoSerial => m;
  return {
    serial,
    veredicto,
    productos: [...new Set(movimientos.map((m) => m.producto || "").filter(Boolean))],
    venta: venta && sinMarca(venta),
    movimientos: movimientos.map(sinMarca),
    garantia: venta && veredicto === "comprado" ? await garantiaSmartbit(venta.marca, venta.producto || "", venta.fecha) : null,
  };
}
