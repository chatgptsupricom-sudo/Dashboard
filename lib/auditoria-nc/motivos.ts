/**
 * Motivo de una nota de crédito a partir de la referencia de Odoo.
 *
 * Al revertir una factura, Odoo escribe en `ref` "Reversión de: <factura>,
 * <motivo que tipeó el usuario>" (ej. "Reversión de: 5037748, ERROR DE
 * FACTURA"). El motivo es texto libre, así que se clasifica por palabras
 * clave para poder agrupar. La carga inicial de abril-2026 viene como
 * "Importación Masiva - CRE CCxxx" y se separa del resto.
 */

export type CategoriaMotivo =
  | "importacion"
  | "error_facturacion"
  | "impuestos"
  | "devolucion"
  | "no_retirado"
  | "no_solicitado"
  | "garantia"
  | "precio_descuento"
  | "cambio_producto"
  | "otro"
  | "sin_motivo";

export const CATEGORIA_LABEL: Record<CategoriaMotivo, string> = {
  importacion: "Importación masiva (carga inicial)",
  error_facturacion: "Error de facturación",
  impuestos: "Corrección de impuestos / IVA",
  devolucion: "Devolución de mercancía",
  no_retirado: "No retirado / sin stock / no despachado",
  no_solicitado: "El cliente no lo pidió / no lo quiso",
  garantia: "Garantía / producto defectuoso",
  precio_descuento: "Precio, descuento o rebate",
  cambio_producto: "Cambio de producto o modelo",
  otro: "Otro motivo",
  sin_motivo: "Sin motivo",
};

export const normalizar = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

/** Motivo tipeado (sin el "Reversión de: X,"). Vacío si no hay. */
export function extraerMotivo(ref: string | false | null | undefined): string {
  // Odoo devuelve `false` para una referencia vacía (antes salía el motivo "false").
  let s = typeof ref === "string" ? ref.trim() : "";
  const m = s.match(/^(?:reversi[oó]n de|reversal of)\s*:\s*[^,]*,?\s*(.*)$/i);
  if (m) s = m[1];
  return s.trim();
}

export const esImportacionMasiva = (ref: string | false | null | undefined) =>
  typeof ref === "string" && normalizar(ref).includes("IMPORTACION MASIVA");

// Orden: la primera regla que coincide gana. Los textos vienen con errores de
// tipeo frecuentes ("QUIZO", "CLENTE", "BATERA"), por eso las raíces cortas.
const REGLAS: [CategoriaMotivo, RegExp][] = [
  ["impuestos", /\b(IVA|IMPUESTO|RETENCION|IGTF|EXENT|ALICUOTA)/],
  ["garantia", /(GARANTIA|\bRMA\b|DEFECT|DANAD|FALLA|BATER|NO ENCI?END|NO CARGA|NO FUNCIONA|\bMAL[OA]S?\b|ROT[OA]S?\b|GOLPEAD|MANCHA|HINCHAD|MUERT|PLACA|\bBOTA\b|SERVICIO TECNICO|REFURBISHED)/],
  ["no_solicitado", /(NO (LO|LA|LOS|LAS) (QUI|QUE|QUIS|QUIZ|QUS)|YA NO (LO|LA|LOS|LAS) QUI|NO (LO|LA|LOS|LAS)? ?QUI[SZ]O|NO (LO|LA|LOS|LAS)? ?QUIER|NO (LO|LA|LOS|LAS)? ?QUERE|NO (LO|LA|LOS|LAS) (PIDIO|SOLICIT)|NO (LO )?SOLICIT|NO FUE (LO QUE )?(EL CLIENTE )?SOLICIT|NO ES LO QUE|SOLO SOLICITO|SOLICITO SOLO|SOLO QUERIA|NO CANCELO|NO LO PIDIO|CARACTERISTICA|[EX]SPECIFICACION|NO APTA)/],
  ["no_retirado", /(NO RETIR|NUNCA RETIR|NO SE DESPACH|NO DESPACH|NO FUERON ENTREGAD|NO SE ENTREG|NO LLEGO|FALTA DE EQUIPO|MONTO MINIMO|NO HAY STOCK|SIN STOCK|NO SE REBAJ|NO ESTA FISICAMENTE|NO SE DESCONTO|NO SE ENCUENTRA EN FISICO|NO (ESTA|ESTAN) DISPONIBLE|NO DISPONIBLE|NO HAY EN SISTEMA|NO HAY (EN )?EXISTENCIA|NO SE (LE )?ENTREGO|NO SE LLEVO)/],
  ["devolucion", /(DEVOL|DEEVUEL|DEVUEL|REGRES|RETORN|MAL ESTADO|SOLO RECIBIRA|NO QUISO|RECHAZ)/],
  ["precio_descuento", /(PRECIO|DESCUENTO|REBATE|BONIFIC|PROMO|AJUSTE DE PRECIO|DIFERENCIAL|NOTA DE CREDITO POR|MULTA)/],
  ["cambio_producto", /(CAMBIO DE (PRODUCTO|MODELO|EQUIPO)|OTRO MODELO|CAMBIO POR)/],
  ["error_facturacion", /(ERROR|EROR|ERRAD|EQUIVOC|MAL FACTURAD|DUPLIC|CORRECCION|CORREGIR|FACTURO MAL|SE FACTURO|FACTURARON|DE ?MAS\b|FALTO|\bRIF\b|RAZON SOCIAL|PARA MODIFICAR|FACTURADOS APARTE|POR FECHA|COBRADO DE MAS)/],
];

export function categorizarMotivo(ref: string | false | null | undefined): CategoriaMotivo {
  if (esImportacionMasiva(ref)) return "importacion";
  const motivo = normalizar(extraerMotivo(ref));
  // Solo el número de la factura o un punto no cuentan como motivo.
  if (motivo.replace(/[^A-Z]/g, "").length < 3) return "sin_motivo";
  for (const [cat, re] of REGLAS) if (re.test(motivo)) return cat;
  return "otro";
}
