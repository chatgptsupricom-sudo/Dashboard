import { query } from "@/lib/db";
import { SUCURSALES, limpiarPrecintos } from "@/lib/recepcion/flujo";

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
  contenedores: 50,
};

export type ContenedorNuevo = { numero: string; precintos_esperados: string[] };

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
      contenedores: ContenedorNuevo[];
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

  // Contenedores: al menos uno, cada uno con su numero (Compras lo pidio:
  // es lo que Almacen busca en el patio). Los precintos son opcionales porque
  // no siempre vienen en el packing list, y puede haber mas de uno por
  // contenedor. Se acepta tambien `precinto_esperado` suelto (lo de antes).
  const crudosCont = Array.isArray(body?.contenedores) ? body.contenedores : [];
  const contenedores: ContenedorNuevo[] = [];
  for (const [n, c] of crudosCont.entries()) {
    const numero = texto(c?.numero, MAX.contenedor)?.toUpperCase() || null;
    const precintos = limpiarPrecintos(
      Array.isArray(c?.precintos_esperados) ? c.precintos_esperados : c?.precinto_esperado,
    );
    if (!numero && precintos.length === 0) continue; // fila vacia de la grilla
    if (!numero) return { error: `Contenedor ${n + 1}: falta el numero` };
    if (contenedores.some((x) => x.numero === numero)) {
      return { error: `El contenedor ${numero} esta repetido` };
    }
    contenedores.push({ numero, precintos_esperados: precintos });
  }
  if (contenedores.length === 0) return { error: "Falta al menos un contenedor con su numero" };
  if (contenedores.length > MAX.contenedores) {
    return { error: `Maximo ${MAX.contenedores} contenedores` };
  }

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
      // Las columnas de cabecera `contenedor`/`precinto_esperado` son de
      // cuando habia uno solo: se llenan con el primero para lo que las lea,
      // pero la fuente de verdad es recepcion_packing_contenedores.
      contenedor: contenedores[0].numero,
      precinto_esperado: contenedores[0].precintos_esperados[0] ?? null,
      purchase_order_id: Number.isFinite(poId) && poId > 0 ? poId : null,
      oc_referencia: texto(body?.oc_referencia, MAX.oc),
      fecha_estimada: fecha,
      observaciones: texto(body?.observaciones, MAX.observaciones),
    },
    items,
    contenedores,
  };
}

export async function insertarContenedores(recepcionId: number, contenedores: ContenedorNuevo[]) {
  const valores: any[] = [];
  const marcas = contenedores
    .map((c) => {
      // La lista completa va en precintos_esperados; precinto_esperado (la
      // columna de cuando habia uno solo) se llena con el primero.
      valores.push(
        recepcionId,
        c.numero,
        c.precintos_esperados[0] ?? null,
        c.precintos_esperados.length ? JSON.stringify(c.precintos_esperados) : null,
      );
      return "(?, ?, ?, ?)";
    })
    .join(", ");
  await query(
    `INSERT INTO recepcion_packing_contenedores
       (recepcion_id, numero, precinto_esperado, precintos_esperados)
     VALUES ${marcas}`,
    valores,
  );
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
