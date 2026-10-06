import { callOdooRPC, callOdooRPCEstricto } from "@/lib/odoo";
import { normalizarCodigo } from "@/lib/escaneo/codigos";

/**
 * Valida en Odoo la orden de despacho (stock.picking → "Hecho") cuando
 * Seguridad aprueba en el portón: ahí sale la mercancía, y ahí se descuenta
 * el inventario. Antes la validaba alguien a mano en Odoo, a veces antes de
 * que la mercancía pasara por el portón (CENT1/OUT/08530).
 *
 * Solo se descuenta lo que Seguridad contó (`salidas`): de un pedido de 100
 * pueden salir 76. Antes de validar, cada línea del picking queda con lo que
 * de verdad salió (las de serial: 1 si su serial se pistoleó, si no 0; las
 * demás, lo contado repartido entre sus líneas). Odoo valida eso, borra las
 * líneas en 0 y crea con el resto el pedido pendiente (backorder), como hace
 * por defecto (`skip_backorder` sin `picking_ids_not_to_backorder`).
 *
 * - Ya "Hecha" (alguien la validó en Odoo): no se toca, se informa.
 * - `button_validate` puede devolver un asistente en vez de validar (falta un
 *   serial, SMS…). Por la API no hay quien lo conteste: se corta con el
 *   nombre del asistente.
 * - Si no se valida, las líneas vuelven a sus cantidades de antes: no queda
 *   la reserva cambiada a medias.
 *
 * Lanza con el motivo si Odoo no la deja en "Hecho".
 */

export type SalidaProducto = {
  productId: number;
  /** Unidades que salieron (sin serial). */
  cantidad: number;
  /** Seriales que salieron (pistoleados en el portón), si el producto lleva serial. */
  seriales: string[] | null;
};

export type ResultadoValidacion = {
  estado: "validado" | "ya_estaba";
  /** Pedido pendiente que creó Odoo con lo que no salió. */
  pendiente: string | null;
};

type Linea = {
  id: number;
  product_id: [number, string] | false;
  lot_id: [number, string] | false;
  quantity: number;
  tracking: string;
};

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export async function validarPickingEnOdoo(
  pickingId: number,
  salidas?: SalidaProducto[],
): Promise<ResultadoValidacion> {
  const leerEstado = async () => {
    const [p] = (await callOdooRPC<any[]>("stock.picking", "read", [[pickingId], ["state", "name"]])) || [];
    if (!p) throw new Error("No se encontró la orden de despacho en Odoo");
    return p as { state: string; name: string };
  };

  const antes = await leerEstado();
  if (antes.state === "done") return { estado: "ya_estaba", pendiente: null };
  if (antes.state === "cancel") throw new Error(`La orden ${antes.name} está cancelada en Odoo`);

  // Cantidades por línea según lo que salió.
  const cambios: Array<{ id: number; antes: number; despues: number }> = [];
  if (salidas && salidas.length > 0) {
    const lineas =
      (await callOdooRPC<Linea[]>(
        "stock.move.line",
        "search_read",
        [[["picking_id", "=", pickingId]]],
        { fields: ["product_id", "lot_id", "quantity", "tracking"], limit: 2000 },
      )) || [];
    for (const s of salidas) {
      const propias = lineas.filter((l) => l.product_id && l.product_id[0] === s.productId);
      if (s.seriales) {
        const salieron = new Set(s.seriales.map(normalizarCodigo));
        for (const l of propias) {
          const despues = l.lot_id && salieron.has(normalizarCodigo(l.lot_id[1])) ? Math.min(1, Number(l.quantity) || 1) : 0;
          if (r3(despues) !== r3(Number(l.quantity))) cambios.push({ id: l.id, antes: Number(l.quantity), despues });
        }
      } else {
        let resto = s.cantidad;
        for (const l of propias) {
          const despues = r3(Math.max(0, Math.min(Number(l.quantity), resto)));
          resto = r3(resto - despues);
          if (despues !== r3(Number(l.quantity))) cambios.push({ id: l.id, antes: Number(l.quantity), despues });
        }
      }
    }
    const sale = lineas.reduce((t, l) => {
      const c = cambios.find((x) => x.id === l.id);
      return t + (c ? c.despues : Number(l.quantity));
    }, 0);
    if (sale <= 0) throw new Error(`No sale nada de ${antes.name}: no hay qué validar`);
  }

  const restaurar = async () => {
    for (const c of cambios) {
      try {
        await callOdooRPCEstricto("stock.move.line", "write", [[c.id], { quantity: c.antes }]);
      } catch (e: any) {
        console.error(`[odoo] no se pudo devolver la línea ${c.id} a ${c.antes}:`, e?.message || e);
      }
    }
  };

  try {
    for (const c of cambios) {
      await callOdooRPCEstricto("stock.move.line", "write", [[c.id], { quantity: c.despues }]);
    }
    const respuesta = await callOdooRPCEstricto<any>("stock.picking", "button_validate", [[pickingId]], {
      context: { skip_backorder: true },
    });
    if (respuesta && typeof respuesta === "object" && (respuesta.res_model || respuesta.type)) {
      throw new Error(
        `Odoo pide completar "${respuesta.name || respuesta.res_model || "un asistente"}" para validar ${antes.name}: resuélvelo en Odoo y vuelve a aprobar`,
      );
    }
    const despues = await leerEstado();
    if (despues.state !== "done") {
      throw new Error(`Odoo no dejó ${despues.name} en Hecho (quedó en "${despues.state}")`);
    }
  } catch (e) {
    await restaurar();
    throw e;
  }

  const pendientes =
    (await callOdooRPC<any[]>("stock.picking", "search_read", [[["backorder_id", "=", pickingId]]], {
      fields: ["name"],
      limit: 1,
    })) || [];
  return { estado: "validado", pendiente: pendientes[0]?.name || null };
}
