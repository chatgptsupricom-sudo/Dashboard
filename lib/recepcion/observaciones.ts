/**
 * Observaciones de una recepcion: todo lo anotado como novedad (notas,
 * precintos, diferencias y cajas en mal estado) en filas, y el Excel con el
 * encabezado de color y las fotos dentro de la hoja.
 *
 * Lo usan el boton «Descargar observaciones» del detalle (en el navegador,
 * las fotos se piden a la API) y el correo que sale al cerrar un contenedor o
 * el packing list (lib/recepcion/avisoObservaciones.ts, las fotos salen de la
 * base). Por eso no importa nada del servidor y exceljs se carga al usarlo.
 */

export const DANO_ETIQUETA: Record<string, string> = { danada: "Dañada", humeda: "Húmeda", abierta: "Abierta" };

export type ArchivoObs = { id: number; item_id: number | null; contenedor_id: number | null; tipo: string; mime: string };

/** Lo que hace falta de una recepcion: la forma de cargarRecepcion() y de la pantalla. */
export type DatosObservaciones = {
  recepcion: {
    observaciones: string | null;
    creado_por: string;
    created_at: string;
    notas_cierre: string | null;
    cerrado_por: string | null;
    cerrado_at: string | null;
  };
  contenedores: Array<{
    id: number;
    numero: string;
    precintos_esperados: string[];
    precintos_recibidos: string[];
    precinto_coincide: number | null;
    llegada_por: string | null;
    llegada_at: string | null;
    notas_cierre: string | null;
    cerrado_por: string | null;
    cerrado_at: string | null;
    precintos_correcciones?: Array<{ antes: string[]; despues: string[]; motivo: string; por: string; at: string }>;
  }>;
  items: Array<{
    id: number;
    codigo: string | null;
    producto: string;
    cantidad_esperada: string | number;
    cantidad_recibida: string | number | null;
    motivo_diferencia: string | null;
    danos?: Array<{ tipo: string; cantidad: number | null }>;
    golpeado_nota: string | null;
    conteo?: Array<{ contenedor_id: number; cantidad_esperada: number | null; cantidad_recibida: number | null }>;
  }>;
  archivos: ArchivoObs[];
};

/** Una fila del Excel; `fotos` va como imagenes al lado, no como columna. */
export type FilaObservacion = {
  tipo: string;
  contenedor: string;
  codigo: string;
  producto: string;
  esperado: number | "";
  recibido: number | "";
  diferencia: number | "";
  detalle: string;
  por: string;
  fecha: string;
  fotos: ArchivoObs[];
};

const fecha = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString("es-VE", { timeZone: "America/Caracas" }) : "";

/**
 * Las filas de la recepcion. Con `contenedorId`, solo lo de ese contenedor:
 * su precinto, sus correcciones, su nota y los productos contados en el con
 * diferencia o caja en mal estado (lo de todo el packing list —la nota de
 * Compras y la de cierre— va solo en la recepcion completa).
 */
export function filasObservaciones(datos: DatosObservaciones, contenedorId?: number): FilaObservacion[] {
  const { recepcion: rec, contenedores, items, archivos } = datos;
  const fila = (tipo: string, detalle: string, extra: Partial<Omit<FilaObservacion, "tipo" | "detalle">> = {}): FilaObservacion => ({
    tipo, contenedor: "", codigo: "", producto: "", esperado: "", recibido: "", diferencia: "", detalle, por: "", fecha: "", fotos: [], ...extra,
  });
  const fotosDe = (tipo: string, f: { itemId?: number; contenedorId?: number }) =>
    archivos.filter(
      (a) =>
        a.tipo === tipo &&
        a.mime.startsWith("image/") &&
        (f.itemId === undefined || Number(a.item_id) === f.itemId) &&
        (f.contenedorId === undefined || Number(a.contenedor_id) === f.contenedorId),
    );
  const completa = contenedorId === undefined;
  const filas: FilaObservacion[] = [];
  if (completa && rec.observaciones) {
    filas.push(fila("Observaciones del packing list", rec.observaciones, { por: rec.creado_por, fecha: fecha(rec.created_at) }));
  }
  for (const c of contenedores) {
    if (!completa && Number(c.id) !== contenedorId) continue;
    if (Number(c.precinto_coincide) === 0 && c.precinto_coincide !== null)
      filas.push(fila("Precinto distinto", `Esperado: ${c.precintos_esperados.join(", ")} · Recibido: ${c.precintos_recibidos.join(", ")}`, {
        contenedor: c.numero, por: c.llegada_por || "", fecha: fecha(c.llegada_at), fotos: fotosDe("foto_precinto", { contenedorId: Number(c.id) }),
      }));
    for (const k of c.precintos_correcciones || [])
      filas.push(fila("Corrección de precintos", `${k.antes.join(", ")} → ${k.despues.join(", ")}: ${k.motivo}`, { contenedor: c.numero, por: k.por, fecha: fecha(k.at) }));
    if (c.notas_cierre)
      filas.push(fila("Nota del contenedor", c.notas_cierre, {
        contenedor: c.numero, por: c.cerrado_por || "", fecha: fecha(c.cerrado_at), fotos: fotosDe("foto_cierre", { contenedorId: Number(c.id) }),
      }));
  }
  for (const i of items) {
    const conteo = i.conteo || [];
    if (!completa && !conteo.some((f) => Number(f.contenedor_id) === contenedorId && f.cantidad_recibida !== null)) continue;
    const esperado = Number(i.cantidad_esperada);
    const recibido = i.cantidad_recibida === null || i.cantidad_recibida === undefined ? null : Number(i.cantidad_recibida);
    // En que contenedor(es) vino y cuanto en cada uno (contra lo esperado ahi, si el packing list lo dice).
    const contenedor = conteo
      .filter((f) => f.cantidad_recibida !== null || f.cantidad_esperada !== null)
      .map((f) => {
        const numero = contenedores.find((c) => Number(c.id) === Number(f.contenedor_id))?.numero;
        if (!numero) return "";
        const esp = f.cantidad_esperada === null ? "" : ` de ${Number(f.cantidad_esperada)}`;
        return `${numero}: ${f.cantidad_recibida === null ? 0 : Number(f.cantidad_recibida)}${esp}`;
      })
      .filter(Boolean)
      .join("\n");
    const producto = { contenedor, codigo: i.codigo || "", producto: i.producto, esperado, recibido: recibido ?? ("" as const) };
    if (i.motivo_diferencia)
      filas.push(fila("Diferencia", i.motivo_diferencia, { ...producto, diferencia: recibido === null ? "" : recibido - esperado }));
    if (i.danos?.length) {
      const danos = i.danos.map((d) => `${DANO_ETIQUETA[d.tipo] || d.tipo}${d.cantidad ? ` (${d.cantidad})` : ""}`).join(", ");
      filas.push(fila("Caja en mal estado", i.golpeado_nota ? `${danos}: ${i.golpeado_nota}` : danos, {
        ...producto, fotos: fotosDe("foto_golpe", { itemId: Number(i.id) }),
      }));
    }
  }
  if (completa && rec.notas_cierre) {
    filas.push(fila("Nota de cierre", rec.notas_cierre, { por: rec.cerrado_por || "", fecha: fecha(rec.cerrado_at) }));
  }
  return filas;
}

/** Lado mayor de una foto dentro del Excel, en px. */
export const FOTO_PX = 160;

/** Una foto lista para el Excel: JPEG en base64 y su tamano en la hoja (px). */
export type FotoExcel = { base64: string; ancho: number; alto: number };

/** El Excel de las filas. `leerFoto` trae cada foto ya achicada; null = se salta. */
export async function excelObservaciones(
  filas: FilaObservacion[],
  leerFoto: (archivo: ArchivoObs) => Promise<FotoExcel | null>,
): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import("exceljs");
  const maxFotos = Math.max(0, ...filas.map((f) => f.fotos.length));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Observaciones", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "Tipo", key: "tipo", width: 26 },
    { header: "Contenedor", key: "contenedor", width: 22 },
    { header: "Código", key: "codigo", width: 16 },
    { header: "Producto", key: "producto", width: 40 },
    { header: "Esperado", key: "esperado", width: 10 },
    { header: "Recibido", key: "recibido", width: 10 },
    { header: "Diferencia", key: "diferencia", width: 11 },
    { header: "Detalle", key: "detalle", width: 60 },
    { header: "Por", key: "por", width: 22 },
    { header: "Fecha", key: "fecha", width: 21 },
    ...Array.from({ length: maxFotos }, (_, n) => ({ header: `Foto ${n + 1}`, width: 24 })),
  ];
  const encabezado = ws.getRow(1);
  encabezado.height = 24;
  encabezado.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF6D28D9" } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  for (const f of filas) {
    const fila = ws.addRow(f);
    fila.alignment = { vertical: "top", wrapText: true };
    if (f.fotos.length) fila.height = FOTO_PX * 0.75 + 8; // alto en puntos
    for (const [n, foto] of f.fotos.entries()) {
      const img = await leerFoto(foto);
      if (!img) continue;
      ws.addImage(wb.addImage({ base64: img.base64, extension: "jpeg" }), {
        tl: { col: 10 + n + 0.05, row: fila.number - 1 + 0.05 },
        ext: { width: img.ancho, height: img.alto },
      });
    }
  }
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
