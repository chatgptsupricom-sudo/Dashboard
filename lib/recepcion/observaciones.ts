/**
 * Observaciones de una recepcion: todo lo anotado como novedad (notas,
 * precintos, diferencias y cajas en mal estado) en filas, y el PDF con una
 * tarjeta por observacion: sus datos arriba y las fotos grandes abajo, con
 * los colores del panel.
 *
 * Lo usan el boton «Descargar observaciones» del detalle (en el navegador,
 * las fotos se piden a la API) y el correo que sale al cerrar un contenedor o
 * el packing list (lib/recepcion/avisoObservaciones.ts, las fotos salen de la
 * base). Por eso no importa nada del servidor y jspdf se carga al usarlo.
 */

import { SUCURSALES } from "./flujo";

export const DANO_ETIQUETA: Record<string, string> = { danada: "Dañada", humeda: "Húmeda", abierta: "Abierta" };

export type ArchivoObs = { id: number; item_id: number | null; contenedor_id: number | null; tipo: string; mime: string };

/** Lo que hace falta de una recepcion: la forma de cargarRecepcion() y de la pantalla. */
export type DatosObservaciones = {
  recepcion: {
    cids: number | string;
    proveedor: string;
    referencia: string;
    oc_referencia?: string | null;
    odoo_oc_nombre?: string | null;
    origen?: string | null;
    resultado?: string | null;
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

/** «Recibido de esperado (diferencia)» de una fila con producto. */
export function cantidades(f: FilaObservacion): string {
  if (f.esperado === "") return "";
  const dif = f.diferencia === "" || f.diferencia === 0 ? "" : ` (${f.diferencia > 0 ? "+" : ""}${f.diferencia})`;
  return `${f.recibido === "" ? "—" : f.recibido} de ${f.esperado}${dif}`;
}

/** Titulo y datos de cabecera del PDF: la recepcion entera o un contenedor. */
export function encabezadoObservaciones(datos: DatosObservaciones, contenedorId?: number) {
  const rec = datos.recepcion;
  const contenedor = contenedorId === undefined ? null : datos.contenedores.find((c) => Number(c.id) === contenedorId);
  const resultado = rec.resultado === "con_novedades" ? "Con novedades" : rec.resultado === "conforme" ? "Conforme" : "";
  return {
    titulo: contenedor ? `Observaciones del contenedor ${contenedor.numero}` : "Observaciones de la recepción",
    datos: [
      ["Sede", SUCURSALES.find((s) => s.cids === Number(rec.cids))?.nombre || ""],
      ["Proveedor", rec.proveedor],
      [rec.origen === "factura" ? "Factura" : "Packing list", rec.referencia],
      ["Orden de compra", rec.odoo_oc_nombre || rec.oc_referencia || ""],
      ...(contenedor
        ? [["Contenedor", contenedor.numero], ["Descargado por", contenedor.cerrado_por || ""]]
        : [["Resultado", resultado], ["Cerrado por", rec.cerrado_por || ""]]),
    ].filter(([, v]) => v) as Array<[string, string]>,
  };
}

/** Lado mayor de una foto dentro del PDF, en px: se ve grande y nitida sin pesar de mas. */
export const FOTO_PX = 1000;

/** Una foto lista para el PDF: JPEG en base64 y su tamano en px (para la proporcion). */
export type FotoPdf = { base64: string; ancho: number; alto: number };

const VIOLETA: [number, number, number] = [109, 40, 217];
const VIOLETA_SUAVE: [number, number, number] = [244, 240, 255];
const BORDE: [number, number, number] = [226, 232, 240];
const GRIS: [number, number, number] = [100, 116, 139];
const TEXTO: [number, number, number] = [15, 23, 42];

/** Las fuentes estandar del PDF solo traen Latin-1: lo demas se cambia o se quita. */
const limpio = (s: unknown) =>
  String(s ?? "").replace(/→/g, "->").replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF—–“”‘’…•]/g, "");

/**
 * El PDF de las filas: cabecera violeta con los datos de la recepcion y una
 * tarjeta por observacion (tipo, contenedor, producto, cantidades, quien y
 * cuando, el detalle) con sus fotos debajo, dos por linea (una sola, mas
 * grande). `leerFoto` trae cada foto ya achicada; null = se salta.
 */
export async function pdfObservaciones(
  encabezado: { titulo: string; datos: Array<[string, string]> },
  filas: FilaObservacion[],
  leerFoto: (archivo: ArchivoObs) => Promise<FotoPdf | null>,
): Promise<ArrayBuffer> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 36;
  const ANCHO = W - 2 * M;
  const PIE = 26;
  let y = 0;
  /** Pasa a otra pagina si no cabe; true si paso. */
  const salto = (alto: number) => {
    if (y + alto <= H - M - PIE) return false;
    doc.addPage();
    y = M;
    return true;
  };
  const lineas = (texto: string, ancho: number, tam: number): string[] => {
    doc.setFontSize(tam);
    return doc.splitTextToSize(limpio(texto), ancho) as string[];
  };
  const alto = (n: number, tam: number) => n * tam * 1.25;

  // Cabecera: banda violeta con el titulo y la fecha, y los datos en tres columnas.
  doc.setFillColor(...VIOLETA);
  doc.rect(0, 0, W, 64, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text(limpio(encabezado.titulo), M, 34);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    limpio(`${filas.length} observación(es) · generado el ${new Date().toLocaleString("es-VE", { timeZone: "America/Caracas" })}`),
    M,
    50,
  );
  y = 84;
  const col = ANCHO / 3;
  for (let i = 0; i < encabezado.datos.length; i += 3) {
    let altoFila = 0;
    encabezado.datos.slice(i, i + 3).forEach(([k, v], j) => {
      const x = M + j * col;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...GRIS);
      doc.text(limpio(k).toUpperCase(), x, y);
      doc.setFont("helvetica", "bold");
      const ls = lineas(v, col - 10, 10.5);
      doc.setTextColor(...TEXTO);
      doc.text(ls, x, y + 13);
      altoFila = Math.max(altoFila, 13 + alto(ls.length, 10.5));
    });
    y += altoFila + 8;
  }
  y += 6;

  for (const f of filas) {
    // Datos de la tarjeta: solo los que tienen algo.
    const celdas = (
      [
        ["Contenedor", f.contenedor],
        ["Producto", [f.codigo, f.producto].filter(Boolean).join(" · ")],
        ["Recibido", cantidades(f)],
        ["Por", [f.por, f.fecha].filter(Boolean).join("\n")],
      ] as Array<[string, string]>
    ).filter(([, v]) => v);
    const pesos = celdas.map(([k]) => (k === "Producto" ? 2 : k === "Contenedor" ? 1.4 : 1));
    const total = pesos.reduce((a, b) => a + b, 0) || 1;
    const anchos = pesos.map((p) => ((ANCHO - 24) * p) / total);
    doc.setFont("helvetica", "bold");
    const valores = celdas.map(([, v], i) => lineas(v, anchos[i] - 10, 10));
    const altoCeldas = celdas.length ? 12 + Math.max(...valores.map((v) => alto(v.length, 10))) + 10 : 0;
    doc.setFont("helvetica", "normal");
    const detalle = lineas(f.detalle, ANCHO - 24, 10.5);
    const altoInfo = 26 + 14 + altoCeldas + alto(detalle.length, 10.5) + 14;

    // Fotos debajo, grandes: dos por linea, o una sola mas ancha.
    const fotos = (await Promise.all(f.fotos.map((a) => leerFoto(a)))).filter((ft): ft is FotoPdf => !!ft);
    const porLinea = fotos.length === 1 ? 1 : 2;
    const anchoFoto = porLinea === 1 ? ANCHO * 0.62 : (ANCHO - 12) / 2;
    const altoMax = porLinea === 1 ? 360 : 300;
    const grupos: Array<{ ft: FotoPdf; w: number; h: number }[]> = [];
    for (let i = 0; i < fotos.length; i += porLinea) {
      grupos.push(
        fotos.slice(i, i + porLinea).map((ft) => {
          const escala = Math.min(anchoFoto / ft.ancho, altoMax / ft.alto);
          return { ft, w: ft.ancho * escala, h: ft.alto * escala };
        }),
      );
    }
    const altoGrupo = (g: { h: number }[]) => Math.max(...g.map((x) => x.h));

    // La tarjeta no queda sola al final de una pagina: va con su primera linea de fotos.
    salto(altoInfo + (grupos.length ? 36 + altoGrupo(grupos[0]) : 20));
    const y0 = y;
    // Tarjeta blanca con borde y franja violeta clara con el tipo arriba.
    doc.setDrawColor(...BORDE);
    doc.setLineWidth(0.8);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(M, y0, ANCHO, altoInfo, 6, 6, "FD");
    doc.setFillColor(...VIOLETA_SUAVE);
    doc.roundedRect(M + 0.4, y0 + 0.4, ANCHO - 0.8, 26, 6, 6, "F");
    doc.rect(M + 0.4, y0 + 14, ANCHO - 0.8, 12.4, "F");
    doc.setFillColor(...VIOLETA);
    doc.rect(M + 0.4, y0 + 5, 3, 16, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.setTextColor(...VIOLETA);
    doc.text(limpio(f.tipo), M + 12, y0 + 17);
    if (f.fotos.length) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...GRIS);
      doc.text(`${f.fotos.length} foto${f.fotos.length === 1 ? "" : "s"}`, M + ANCHO - 12, y0 + 17, { align: "right" });
    }
    y = y0 + 26 + 14;
    let x = M + 12;
    celdas.forEach(([k], i) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...GRIS);
      doc.text(k.toUpperCase(), x, y);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...TEXTO);
      doc.text(valores[i], x, y + 12);
      x += anchos[i];
    });
    if (celdas.length) y += altoCeldas;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...GRIS);
    doc.text("DETALLE", M + 12, y);
    doc.setFontSize(10.5);
    doc.setTextColor(...TEXTO);
    doc.text(detalle, M + 12, y + 13);
    y = y0 + altoInfo + 10;

    for (const grupo of grupos) {
      // Fotos que siguen en otra pagina: se dice de que tarjeta son.
      if (salto(altoGrupo(grupo) + 26)) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(...VIOLETA);
        doc.text(limpio(`${f.tipo}${f.producto ? ` · ${f.producto}` : f.contenedor ? ` · ${f.contenedor}` : ""} (continúa)`), M, y + 8);
        y += 18;
      }
      grupo.forEach((g, j) => {
        const xCaja = porLinea === 1 ? M + (ANCHO - anchoFoto) / 2 : M + j * (anchoFoto + 12);
        const xFoto = xCaja + (anchoFoto - g.w) / 2;
        doc.addImage(`data:image/jpeg;base64,${g.ft.base64}`, "JPEG", xFoto, y, g.w, g.h);
        doc.setDrawColor(...BORDE);
        doc.rect(xFoto, y, g.w, g.h, "S");
      });
      y += altoGrupo(grupo) + 10;
    }
    y += 12;
  }

  // Pie en cada pagina.
  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...GRIS);
    doc.text("Panel SUPRICOM · Recepción de mercancía", M, H - 18);
    doc.text(`Página ${p} de ${paginas}`, W - M, H - 18, { align: "right" });
  }
  return doc.output("arraybuffer");
}
