import { callOdooRPC, callOdooRPCEstricto } from "@/lib/odoo";
import { normalizarCodigo } from "@/lib/escaneo/codigos";

/**
 * Almacén serializa desde el panel: el serial que pistolea se escribe en la
 * línea del picking de Odoo (lo mismo que hacerlo a mano en "Operaciones
 * detalladas"), sin tener que cargarlo allá.
 *
 * Lo que dice Odoo (medido en octubre de 2026):
 *  - En un picking "Listo" (`assigned`) ya hay UNA stock.move.line por unidad
 *    (cantidad 1) con `lot_id` vacío: la reserva está contra un quant sin
 *    lote de la ubicación. Al escribir `lot_id` en la línea, Odoo pasa la
 *    reserva a la unidad con ese serial (igual que desde la pantalla). No se
 *    crean ni se parten líneas.
 *  - Los seriales ya existen en el inventario (stock.lot + stock.quant): se
 *    cargaron al recibir. Una salida solo puede usar un serial en existencia.
 *  - Muchos nombres de lote tienen espacios al final ("26068321500021     "):
 *    se compara normalizado (`normalizarCodigo`), como lee la pistola.
 *
 * Las escrituras van con `callOdooRPCEstricto`: si Odoo no las acepta, el
 * motivo llega a la pantalla.
 */

export class ErrorSerial extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

type LineaOdoo = {
  id: number;
  product_id: [number, string] | false;
  lot_id: [number, string] | false;
  quantity: number;
  location_id: [number, string] | false;
  tracking: string;
};

async function leerPicking(pickingId: number) {
  const [picking] =
    (await callOdooRPC<any[]>("stock.picking", "read", [[pickingId], ["name", "state", "company_id"]])) || [];
  if (!picking) throw new ErrorSerial("No se encontró la orden de despacho en Odoo", 404);
  if (picking.state === "done") throw new ErrorSerial("La orden ya está validada (Hecha) en Odoo: los seriales no se cambian desde el panel", 409);
  if (picking.state === "cancel") throw new ErrorSerial("La orden está cancelada en Odoo", 409);
  const lineas =
    (await callOdooRPC<LineaOdoo[]>(
      "stock.move.line",
      "search_read",
      [[["picking_id", "=", pickingId]]],
      { fields: ["product_id", "lot_id", "quantity", "location_id", "tracking"], limit: 2000 },
    )) || [];
  return { picking, lineas };
}

const nombreProducto = (l: LineaOdoo) => String((l.product_id && l.product_id[1]) || "").replace(/^\[[^\]]*\]\s*/, "");

/**
 * Escribe en una línea vacía del picking el serial pistoleado. Devuelve el
 * serial (como está en Odoo) y el producto.
 */
export async function cargarSerialEnOdoo(
  pickingId: number,
  companyId: number | null,
  leido: string,
): Promise<{ serial: string; producto: string }> {
  const codigo = normalizarCodigo(leido);
  if (!codigo) throw new ErrorSerial("Código vacío");

  const { lineas } = await leerPicking(pickingId);
  const conSerial = lineas.filter((l) => l.tracking === "serial" && l.product_id);
  if (conSerial.length === 0) throw new ErrorSerial("Esta orden no tiene productos con serial", 409);

  // Ya está en la orden: no se carga dos veces.
  const yaEsta = conSerial.find((l) => l.lot_id && normalizarCodigo(l.lot_id[1]) === codigo);
  if (yaEsta) {
    throw new ErrorSerial(`El serial ${codigo} ya está cargado en esta orden (${nombreProducto(yaEsta)})`, 409);
  }

  // El lote, de alguno de los productos con serial de la orden y de la sede.
  const productos = [...new Set(conSerial.map((l) => (l.product_id as [number, string])[0]))];
  const dominio: any[] = [["name", "ilike", codigo], ["product_id", "in", productos]];
  if (companyId) dominio.push(["company_id", "in", [companyId, false]]);
  const lotes = ((await callOdooRPC<any[]>("stock.lot", "search_read", [dominio], { fields: ["name", "product_id"], limit: 20 })) || [])
    .filter((l) => normalizarCodigo(l.name) === codigo);
  if (lotes.length === 0) {
    throw new ErrorSerial(`El serial ${codigo} no existe en Odoo para los productos de esta orden`, 404);
  }
  if (lotes.length > 1) {
    throw new ErrorSerial(`El serial ${codigo} está repetido en Odoo en más de un producto: cárgalo a mano en Odoo`, 409);
  }
  const lote = lotes[0];
  const productoId = lote.product_id[0];

  // Una línea vacía de ese producto.
  const libre = conSerial.find((l) => !l.lot_id && (l.product_id as [number, string])[0] === productoId);
  if (!libre) {
    const total = conSerial.filter((l) => (l.product_id as [number, string])[0] === productoId).length;
    throw new ErrorSerial(`Ya se cargaron los ${total} seriales de ${String(lote.product_id[1]).replace(/^\[[^\]]*\]\s*/, "")}`, 409);
  }

  // En existencia en la ubicación de salida (o debajo) y sin apartar para
  // otra orden.
  const ubicacion = libre.location_id ? libre.location_id[0] : null;
  const quants =
    (await callOdooRPC<any[]>(
      "stock.quant",
      "search_read",
      [[["lot_id", "=", lote.id], ...(ubicacion ? [["location_id", "child_of", ubicacion]] : []), ["quantity", ">", 0]]],
      { fields: ["quantity", "reserved_quantity", "location_id"] },
    )) || [];
  if (quants.length === 0) {
    throw new ErrorSerial(
      `El serial ${codigo} no está en existencia en ${libre.location_id ? libre.location_id[1] : "la ubicación de salida"}`,
      409,
    );
  }
  const disponible = quants.find((q) => Number(q.quantity) - Number(q.reserved_quantity || 0) >= 1);
  if (!disponible) {
    throw new ErrorSerial(`El serial ${codigo} está apartado para otra orden en Odoo`, 409);
  }

  // La línea toma el serial y, si está en una sub-ubicación, esa ubicación.
  const cambios: Record<string, unknown> = { lot_id: lote.id };
  if (disponible.location_id && (!libre.location_id || disponible.location_id[0] !== libre.location_id[0])) {
    cambios.location_id = disponible.location_id[0];
  }
  await callOdooRPCEstricto("stock.move.line", "write", [[libre.id], cambios]);

  // Se relee: lo que vale es lo que quedó en Odoo.
  const [despues] =
    (await callOdooRPC<LineaOdoo[]>("stock.move.line", "read", [[libre.id], ["lot_id"]])) || [];
  if (!despues?.lot_id || despues.lot_id[0] !== lote.id) {
    throw new ErrorSerial("Odoo no guardó el serial en la línea. Intenta de nuevo.", 502);
  }
  return { serial: String(lote.name).trim(), producto: nombreProducto(libre) };
}

/** Quita un serial de la orden en Odoo (la línea queda vacía otra vez). */
export async function quitarSerialEnOdoo(pickingId: number, leido: string): Promise<{ serial: string }> {
  const codigo = normalizarCodigo(leido);
  if (!codigo) throw new ErrorSerial("Código vacío");
  const { lineas } = await leerPicking(pickingId);
  const linea = lineas.find((l) => l.lot_id && normalizarCodigo(l.lot_id[1]) === codigo);
  if (!linea) throw new ErrorSerial(`El serial ${codigo} no está cargado en esta orden`, 404);
  await callOdooRPCEstricto("stock.move.line", "write", [[linea.id], { lot_id: false }]);
  return { serial: codigo };
}
