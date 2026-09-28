import { query } from "@/lib/db";
import { esCodigoDeProducto, normalizarCodigo, productoPorPrefijo } from "@/lib/escaneo/codigos";

/**
 * Que es lo que leyo la pistola, y que hacer con eso.
 *
 * Lo comparten la recepcion por packing list (/api/recepcion/[id]/escaneo) y
 * la verificacion del egreso en C4. La decision es la misma en los dos; lo
 * que cambia es en que tablas se suma y donde se guardan los seriales, y eso
 * lo pone cada uno con su `AdaptadorEscaneo`.
 *
 *  0. (Opcional) Un serial que ya se sabe de que renglon es
 *     (`serialEsperado`): se registra directo, sin seleccionar el producto.
 *     Es el caso del egreso, donde los seriales vienen del picking de Odoo.
 *  1. El codigo de un producto de la lista, su codigo con una variante
 *     ("5HB10D#B1K" es la caja de "5HB10D") o un codigo de caja ya
 *     aprendido que apunta a uno:
 *       - sin serial: suma 1                           -> "conteo"
 *       - con serial: lo deja seleccionado             -> "seleccionado"
 *  2. Si no, y hay un producto con serial seleccionado (`item_id`), es un
 *     serial de ese producto                           -> registrarSerial
 *     Salvo que parezca un UPC/EAN (codigo del modelo, igual en todas las
 *     cajas): eso no se guarda como serial sin que lo confirmen
 *     (`forzar_serial`)                               -> "desconocido"
 *  3. Si no, no se sabe que es                         -> "desconocido"
 *     y la pantalla pregunta de que producto es. Al responder, vuelve con
 *     `aprender_item_id`: se guarda el codigo de caja -> producto y se
 *     aplica la lectura.
 *
 * Quien llama valida sesion, alcance y etapa antes; esto no sabe de roles.
 */

export const MAX_CODIGO = 100;

export type ItemEscaneable = {
  id: number | string;
  codigo: string | null;
  lleva_serial: unknown;
};

/** Status HTTP y cuerpo JSON de la respuesta, para que la ruta lo devuelva tal cual. */
export type RespuestaEscaneo = { status: number; body: Record<string, unknown> };

export type AdaptadorEscaneo<I extends ItemEscaneable> = {
  /** Quien pistolea, para el alias aprendido. */
  quien: string;
  /** Producto sin serial: suma 1 y devuelve la cantidad que queda. */
  sumarUno: (item: I) => Promise<number>;
  /**
   * Guarda un serial del renglon. Devuelve la respuesta completa: "serial"
   * (200), "repetido" (409), o lo que corresponda a ese flujo.
   */
  registrarSerial: (item: I, serial: string) => Promise<RespuestaEscaneo>;
  /** Renglon al que pertenece un serial esperado, o null. Ver el paso 0. */
  serialEsperado?: (serial: string) => Promise<I | null>;
};

const ok = (body: Record<string, unknown>): RespuestaEscaneo => ({ status: 200, body });
const error = (status: number, mensaje: string): RespuestaEscaneo => ({
  status,
  body: { error: mensaje },
});

/** Codigo de producto al que apunta un codigo de caja aprendido, o null. */
export async function buscarAlias(codigoNormalizado: string): Promise<string | null> {
  try {
    const r = await query("SELECT producto_codigo FROM recepcion_codigos_alias WHERE codigo = ?", [
      codigoNormalizado,
    ]);
    return (r.rows as any[])[0]?.producto_codigo ?? null;
  } catch {
    return null;
  }
}

/**
 * Aprende que un codigo de caja es de un producto. Queda para siempre y para
 * todos los flujos: la caja es la misma en la recepcion y en el egreso.
 */
async function aprenderAlias(codigo: string, productoCodigo: string, quien: string) {
  const destino = normalizarCodigo(productoCodigo);
  await query(
    `INSERT INTO recepcion_codigos_alias (codigo, producto_codigo, creado_por) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE producto_codigo = ?, creado_por = ?`,
    [codigo, destino, quien, destino, quien],
  );
}

export async function procesarEscaneo<I extends ItemEscaneable>(
  body: any,
  items: I[],
  adaptador: AdaptadorEscaneo<I>,
): Promise<RespuestaEscaneo> {
  const codigo = normalizarCodigo(String(body?.codigo ?? "").trim().slice(0, MAX_CODIGO));
  if (!codigo) return error(400, "Codigo vacio");

  const porId = (v: unknown) => items.find((i) => Number(i.id) === Number(v)) || null;
  const porCodigo = (c: string) => items.find((i) => i.codigo && normalizarCodigo(i.codigo) === c) || null;
  const llevaSerial = (i: I) => !!Number(i.lleva_serial);

  // Aprender: este codigo de caja es de tal producto.
  if (body?.aprender_item_id !== undefined) {
    const destino = porId(body.aprender_item_id);
    if (!destino) return error(400, "Renglon invalido");
    if (!destino.codigo) {
      return error(400, "Ese renglon no tiene codigo de producto: no se puede asociar");
    }
    if (porCodigo(codigo)) return error(400, "Ese codigo ya es el de un producto");
    await aprenderAlias(codigo, destino.codigo, adaptador.quien);
  }

  // 0. Serial esperado: ya dice de que renglon es.
  if (adaptador.serialEsperado) {
    const dueno = await adaptador.serialEsperado(codigo);
    if (dueno) return adaptador.registrarSerial(dueno, codigo);
  }

  // 1. Codigo de producto (directo, con variante o aprendido).
  let producto = porCodigo(codigo) || productoPorPrefijo(items, codigo);
  if (!producto) {
    const alias = await buscarAlias(codigo);
    if (alias) producto = porCodigo(alias);
  }
  if (producto) {
    if (llevaSerial(producto)) {
      return ok({ resultado: "seleccionado", item_id: Number(producto.id), codigo });
    }
    const cantidad = await adaptador.sumarUno(producto);
    return ok({ resultado: "conteo", item_id: Number(producto.id), codigo, cantidad });
  }

  // 2. Serial del producto seleccionado.
  const seleccionado =
    body?.item_id !== undefined && body?.item_id !== null ? porId(body.item_id) : null;
  if (seleccionado && llevaSerial(seleccionado)) {
    if (esCodigoDeProducto(codigo) && body?.forzar_serial !== true) {
      return ok({ resultado: "desconocido", codigo, pista: "codigo_de_producto" });
    }
    return adaptador.registrarSerial(seleccionado, codigo);
  }

  // 3. No se sabe que es.
  return ok({ resultado: "desconocido", codigo });
}
