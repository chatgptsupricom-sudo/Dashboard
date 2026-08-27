import { callOdooRPC } from "@/lib/odoo";

/**
 * Ordenes de entrega de Odoo para la seccion Mercancia.
 *
 * La lista de lo que va en el camion sale de Odoo (`stock.picking` y sus
 * `stock.move`), no de lo que alguien escriba a mano: si el papel lo llena el
 * mismo que carga, verificar contra el no prueba nada.
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
  cliente_nombre: string;
  estado: string;
  origen: string | null;
  lineas: LineaPicking[];
};

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
 * Busca una orden de entrega por su nombre exacto (ej. "PRIN1/OUT/05838").
 *
 * Devuelve null si no existe o si Odoo no responde. El que llama decide que
 * hacer: aqui no se inventa una orden vacia, porque un camion verificado
 * contra una lista vacia sale "conforme" siempre.
 */
export async function buscarPickingPorNombre(
  nombre: string,
): Promise<PickingOdoo | null> {
  const limpio = String(nombre || "").trim();
  if (!limpio || limpio.length > 100) return null;

  const pickings = await callOdooRPC<any[]>(
    "stock.picking",
    "search_read",
    [[["name", "=", limpio]]],
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
    cliente_nombre: p.partner_id?.[1] || "",
    estado: p.state || "",
    origen: p.origin || null,
    lineas,
  };
}

/**
 * Compara lo cargado contra lo verificado.
 *
 * Un renglon sin contar (`cantidad_verificada` null) NO cuenta como faltante:
 * "todavia no lo revise" y "conte cero" son cosas distintas, y confundirlas
 * marcaria descuadre en cada acta a medio llenar.
 */
export function evaluarDescuadre(
  items: Array<{ cantidad_cargada: number; cantidad_verificada: number | null }>,
): { estado: "pendiente" | "conforme" | "descuadre"; diferencias: number } {
  const contados = items.filter((i) => i.cantidad_verificada !== null);
  if (contados.length === 0) return { estado: "pendiente", diferencias: 0 };

  const diferencias = contados.filter(
    (i) => Number(i.cantidad_verificada) !== Number(i.cantidad_cargada),
  ).length;

  if (diferencias > 0) return { estado: "descuadre", diferencias };

  // Conforme solo si ademas no quedo ningun renglon sin contar: si falta por
  // revisar la mitad del camion, eso no es "todo correcto".
  if (contados.length < items.length) return { estado: "pendiente", diferencias: 0 };

  return { estado: "conforme", diferencias: 0 };
}
