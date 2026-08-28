import { callOdooRPC } from "@/lib/odoo";

/**
 * Documentos de Odoo para la seccion Mercancia.
 *
 * Cada flujo llega con el suyo: la mercancia que ENTRA viene con la factura de
 * la orden de compra, y la que SALE con la orden de despacho mas su factura.
 *
 * La lista de renglones sale de Odoo, no de lo que alguien escriba a mano: si
 * el papel lo llena el mismo que carga, verificar contra el no prueba nada.
 */

export type LineaPicking = {
  odoo_product_id: number | null;
  producto: string;
  codigo: string | null;
  cantidad_cargada: number;
};

export type PickingOdoo = {
  odoo_picking_id: number;
  odoo_picking_name: string;
  /** Proveedor en un ingreso, cliente en un egreso. */
  contraparte: string;
  estado: string;
  origen: string | null;
  lineas: LineaPicking[];
};

/**
 * Listas de facturas y almacenistas por egreso (issue #43).
 *
 * Un camion puede salir con varias facturas y con mas de un almacenista
 * cargandolo. Se guardan como JSON en una columna de texto, mismo patron que
 * `seguridad_despachos.facturas_json` en RMA — no una tabla aparte, porque no
 * hace falta consultarlas por separado, solo mostrarlas junto al registro.
 */
export function serializarLista(items: unknown, max: number, maxItems: number): string | null {
  if (!Array.isArray(items)) return null;
  const limpios = items
    .map((v) => String(v ?? "").trim().slice(0, max))
    .filter((v) => v.length > 0)
    .slice(0, maxItems);
  return limpios.length > 0 ? JSON.stringify(limpios) : null;
}

export function parsearLista(json: unknown): string[] {
  if (!json || typeof json !== "string") return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map((x) => String(x)) : [];
  } catch {
    return [];
  }
}

/**
 * El nombre del producto en Odoo viene como "[CODIGO] Descripcion".
 * Se separan para que el codigo se pueda leer de un vistazo en el porton,
 * que es donde alguien compara caja contra pantalla.
 */
function partirProducto(nombre: string): { codigo: string | null; producto: string } {
  const m = String(nombre || "").match(/^\s*\[([^\]]+)\]\s*(.*)$/);
  if (!m) return { codigo: null, producto: String(nombre || "").trim() };
  return { codigo: m[1].trim(), producto: m[2].trim() || m[1].trim() };
}

/**
 * Busca una orden de despacho por su nombre exacto (ej. "PRIN1/OUT/05838").
 *
 * Devuelve null si no existe o si Odoo no responde. El que llama decide que
 * hacer: aqui no se inventa una orden vacia, porque un camion verificado
 * contra una lista vacia sale "conforme" siempre.
 *
 * `cids` acota la busqueda a la sucursal de quien la hace (9=Valencia,
 * 10=Caracas, 7=Panama) — sin esto, cualquiera podia buscar y verificar un
 * picking de otra sucursal con solo saber (o adivinar) su nombre. `null` es
 * "sin filtro" (superadmin).
 */
export async function buscarPickingPorNombre(
  nombre: string,
  cids: number | null,
): Promise<PickingOdoo | null> {
  const limpio = String(nombre || "").trim();
  if (!limpio || limpio.length > 100) return null;

  const domain: any[] = [["name", "=", limpio]];
  if (cids !== null) domain.push(["company_id", "=", cids]);

  const pickings = await callOdooRPC<any[]>(
    "stock.picking",
    "search_read",
    [domain],
    {
      fields: ["name", "partner_id", "state", "origin", "picking_type_code"],
      limit: 1,
    },
  );

  const p = pickings?.[0];
  if (!p) return null;

  const moves = await callOdooRPC<any[]>(
    "stock.move",
    "search_read",
    [[["picking_id", "=", p.id]]],
    { fields: ["product_id", "product_uom_qty", "quantity"], limit: 500 },
  );

  const lineas: LineaPicking[] = (moves || []).map((m: any) => {
    const { codigo, producto } = partirProducto(m.product_id?.[1] || "");
    return {
      odoo_product_id: m.product_id?.[0] ?? null,
      producto,
      codigo,
      // `quantity` es lo realmente despachado y `product_uom_qty` lo pedido.
      // Se toma lo despachado cuando existe: es lo que de verdad subio al
      // camion, que es contra lo que hay que contar en el porton.
      cantidad_cargada: Number(
        m.quantity !== undefined && m.quantity !== null && Number(m.quantity) > 0
          ? m.quantity
          : m.product_uom_qty || 0,
      ),
    };
  });

  return {
    odoo_picking_id: p.id,
    odoo_picking_name: p.name,
    contraparte: p.partner_id?.[1] || "",
    estado: p.state || "",
    origen: p.origin || null,
    lineas,
  };
}

/**
 * Busca una factura de compra por su numero (ej. "FACTU/2026/08/0064").
 *
 * Es el documento con el que llega la mercancia al almacen. Se acepta tambien
 * la referencia del proveedor (`ref`), que es lo que muchas veces trae el
 * papel en la mano: el numero interno de Odoo no siempre esta impreso.
 *
 * Solo lineas de producto: una factura trae ademas secciones, notas y lineas
 * de impuesto, y contar eso en el porton no significa nada.
 *
 * `cids` acota por sucursal, mismo motivo que en `buscarPickingPorNombre`.
 */
export async function buscarFacturaCompra(
  numero: string,
  cids: number | null,
): Promise<PickingOdoo | null> {
  const limpio = String(numero || "").trim();
  if (!limpio || limpio.length > 100) return null;

  const domain: any[] = [["move_type", "=", "in_invoice"]];
  if (cids !== null) domain.push(["company_id", "=", cids]);
  domain.push("|", ["name", "=", limpio], ["ref", "=", limpio]);

  const facturas = await callOdooRPC<any[]>(
    "account.move",
    "search_read",
    [domain],
    { fields: ["name", "partner_id", "state", "invoice_origin", "ref"], limit: 1 },
  );

  const f = facturas?.[0];
  if (!f) return null;

  const lineas_raw = await callOdooRPC<any[]>(
    "account.move.line",
    "search_read",
    [
      [
        ["move_id", "=", f.id],
        ["display_type", "=", "product"],
      ],
    ],
    { fields: ["product_id", "quantity", "name"], limit: 500 },
  );

  const lineas: LineaPicking[] = (lineas_raw || []).map((l: any) => {
    // Si la linea no tiene producto de catalogo, se usa su descripcion: es lo
    // unico que identifica lo que llego, y perderla dejaria un renglon mudo.
    const etiqueta = l.product_id?.[1] || l.name || "";
    const { codigo, producto } = partirProducto(etiqueta);
    return {
      odoo_product_id: l.product_id?.[0] ?? null,
      producto,
      codigo,
      cantidad_cargada: Number(l.quantity || 0),
    };
  });

  return {
    odoo_picking_id: f.id,
    odoo_picking_name: f.name,
    contraparte: f.partner_id?.[1] || "",
    estado: f.state || "",
    origen: f.invoice_origin || f.ref || null,
    lineas,
  };
}

/**
 * Compara lo cargado contra lo verificado.
 *
 * Un renglon sin contar (`cantidad_verificada` null) NO cuenta como faltante:
 * "todavia no lo revise" y "conte cero" son cosas distintas, y confundirlas
 * marcaria descuadre en cada acta a medio llenar.
 *
 * `no_salio` (issue #44) es una senal aparte del conteo numerico: un renglon
 * puede salir en cantidad parcial (3 de 4) sin ser "no salio", y al reves, se
 * puede marcar "no salio" sin llegar a contar la cantidad. El checkbox manda
 * sobre la cantidad cuando estan en conflicto — es la razon por la que Seguridad
 * lo marco explicitamente.
 */
export function evaluarDescuadre(
  items: Array<{
    cantidad_cargada: number;
    cantidad_verificada: number | null;
    no_salio?: boolean;
  }>,
): { estado: "pendiente" | "conforme" | "descuadre"; diferencias: number } {
  const marcados = items.filter((i) => i.no_salio).length;

  const contados = items.filter((i) => i.cantidad_verificada !== null);
  const conDiferenciaCantidad = contados.filter(
    (i) => !i.no_salio && Number(i.cantidad_verificada) !== Number(i.cantidad_cargada),
  ).length;

  const diferencias = marcados + conDiferenciaCantidad;
  if (diferencias > 0) return { estado: "descuadre", diferencias };

  if (contados.length === 0) return { estado: "pendiente", diferencias: 0 };

  // Conforme solo si ademas no quedo ningun renglon sin contar: si falta por
  // revisar la mitad del camion, eso no es "todo correcto".
  if (contados.length < items.length) return { estado: "pendiente", diferencias: 0 };

  return { estado: "conforme", diferencias: 0 };
}
