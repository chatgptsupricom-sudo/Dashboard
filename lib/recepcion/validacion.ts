import { query } from "@/lib/db";
import { SUCURSALES } from "@/lib/recepcion/flujo";

/**
 * Validacion de un packing list (cabecera + renglones), compartida por el
 * alta y la edicion. Vive aca y no en la ruta: Next no deja exportar nada
 * que no sea un handler desde un route.ts.
 */

const MAX = {
  proveedor: 200,
  referencia: 100,
  contenedor: 50,
  precinto: 50,
  oc: 50,
  observaciones: 5000,
  codigo: 100,
  producto: 300,
  items: 1000,
};

function texto(v: unknown, max: number): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

export type ItemNuevo = {
  codigo: string | null;
  producto: string;
  cantidad_esperada: number;
  cajas_esperadas: number | null;
};

export function validarCabeceraEItems(body: any):
  | {
      cab: {
        cids: number;
        proveedor: string;
        referencia: string;
        contenedor: string | null;
        precinto_esperado: string | null;
        purchase_order_id: number | null;
        oc_referencia: string | null;
        fecha_estimada: string | null;
        observaciones: string | null;
      };
      items: ItemNuevo[];
    }
  | { error: string } {
  const cids = Number(body?.cids);
  if (!SUCURSALES.some((s) => s.cids === cids)) return { error: "Sucursal invalida" };

  const proveedor = texto(body?.proveedor, MAX.proveedor);
  if (!proveedor) return { error: "Falta el proveedor" };
  const referencia = texto(body?.referencia, MAX.referencia);
  if (!referencia) return { error: "Falta el numero de packing list" };

  const fecha = texto(body?.fecha_estimada, 10);
  if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: "Fecha estimada invalida" };

  const poId = Number(body?.purchase_order_id);

  const crudos = Array.isArray(body?.items) ? body.items : [];
  if (crudos.length === 0) return { error: "El packing list no tiene renglones" };
  if (crudos.length > MAX.items) return { error: `Maximo ${MAX.items} renglones` };

  const items: ItemNuevo[] = [];
  for (const [n, it] of crudos.entries()) {
    const producto = texto(it?.producto, MAX.producto);
    const cantidad = Number(it?.cantidad_esperada);
    if (!producto) return { error: `Renglon ${n + 1}: falta el producto` };
    if (!Number.isFinite(cantidad) || cantidad < 0) {
      return { error: `Renglon ${n + 1}: cantidad invalida` };
    }
    const cajas = it?.cajas_esperadas === "" || it?.cajas_esperadas == null ? null : Number(it.cajas_esperadas);
    items.push({
      codigo: texto(it?.codigo, MAX.codigo),
      producto,
      cantidad_esperada: cantidad,
      cajas_esperadas: cajas !== null && Number.isFinite(cajas) && cajas >= 0 ? Math.round(cajas) : null,
    });
  }

  return {
    cab: {
      cids,
      proveedor,
      referencia,
      contenedor: texto(body?.contenedor, MAX.contenedor),
      precinto_esperado: texto(body?.precinto_esperado, MAX.precinto),
      purchase_order_id: Number.isFinite(poId) && poId > 0 ? poId : null,
      oc_referencia: texto(body?.oc_referencia, MAX.oc),
      fecha_estimada: fecha,
      observaciones: texto(body?.observaciones, MAX.observaciones),
    },
    items,
  };
}

/** Todos los renglones en una sentencia (un packing list puede traer cientos). */
export async function insertarItems(recepcionId: number, items: ItemNuevo[]) {
  const valores: any[] = [];
  const marcas = items
    .map((i) => {
      valores.push(recepcionId, i.codigo, i.producto, i.cantidad_esperada, i.cajas_esperadas);
      return "(?, ?, ?, ?, ?)";
    })
    .join(", ");
  await query(
    `INSERT INTO recepcion_packing_items
       (recepcion_id, codigo, producto, cantidad_esperada, cajas_esperadas)
     VALUES ${marcas}`,
    valores,
  );
}
