import { query } from "@/lib/db";
import { SUCURSALES } from "@/lib/recepcion/flujo";
import { cargarRecepcion } from "@/lib/recepcion/servidor";
import { FOTO_PX, excelObservaciones, filasObservaciones } from "@/lib/recepcion/observaciones";

/**
 * Correo con las observaciones de una recepcion cuando Almacen termina de
 * descargar un contenedor (solo lo de ese contenedor) o cierra el packing
 * list (todo). Lleva el Excel del boton «Descargar observaciones» adjunto.
 * Sin observaciones no sale nada.
 *
 * Va al flujo de n8n "Recepción - Observaciones"
 * (`N8N_RECEPCION_OBSERVACIONES_WEBHOOK_URL`; sin ella no se avisa). El panel
 * manda solo datos: el correo lo arma n8n y los destinatarios son fijos en su
 * nodo "Armar correo" (Oscar Martínez de Compras, Neylin Centeno, Stephanie
 * Cruz y Félix Camacho), porque el webhook es publico y no debe aceptar
 * direcciones.
 *
 * Fire-and-forget: si algo falla, el contenedor o la recepcion ya quedaron cerrados.
 */

export function avisarObservaciones(recepcionId: number, origenPeticion: string, contenedorId?: number): void {
  procesar(recepcionId, origenPeticion, contenedorId).catch((e) => {
    console.error(`[recepcion/avisoObservaciones] recepcion ${recepcionId}:`, e?.message);
  });
}

async function procesar(recepcionId: number, origenPeticion: string, contenedorId?: number): Promise<void> {
  const url = process.env.N8N_RECEPCION_OBSERVACIONES_WEBHOOK_URL;
  if (!url) return;
  const datos = await cargarRecepcion(recepcionId);
  if (!datos) return;
  const filas = filasObservaciones(datos, contenedorId);
  if (filas.length === 0) return;

  const rec = datos.recepcion;
  const contenedor = contenedorId === undefined ? null : datos.contenedores.find((c) => Number(c.id) === contenedorId);
  const sede = SUCURSALES.find((s) => s.cids === Number(rec.cids))?.nombre || "";
  const excel = await excelObservaciones(filas, leerFoto);
  const que = contenedor ? `contenedor ${contenedor.numero}` : rec.origen === "factura" ? `factura ${rec.referencia}` : `packing list ${rec.referencia}`;
  const nombre = `Observaciones_${rec.referencia}${contenedor ? `_${contenedor.numero}` : ""}.xlsx`.replace(/[\\/:*?"<>|]/g, "-");

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      evento: "recepcion_observaciones",
      cids: Number(rec.cids),
      recepcion: {
        id: recepcionId,
        que,
        cerrada: !contenedor,
        sede,
        proveedor: rec.proveedor,
        referencia: rec.referencia,
        oc: rec.odoo_oc_nombre || rec.oc_referencia || null,
        contenedor: contenedor?.numero || null,
        por: (contenedor ? contenedor.cerrado_por : rec.cerrado_por) || null,
        resultado: contenedor ? null : rec.resultado,
      },
      filas: filas.map((f) => ({
        tipo: f.tipo,
        contenedor: f.contenedor,
        producto: [f.codigo, f.producto].filter(Boolean).join(" · "),
        cantidades: f.esperado === "" ? "" : `${f.recibido === "" ? "—" : f.recibido} de ${f.esperado}${f.diferencia === "" || f.diferencia === 0 ? "" : ` (${f.diferencia > 0 ? "+" : ""}${f.diferencia})`}`,
        detalle: f.detalle,
        fotos: f.fotos.length,
        por: f.por,
        fecha: f.fecha,
      })),
      link: `${origenPeticion.replace(/\/+$/, "")}/es/seguridad/mercancia/recepcion/${recepcionId}`,
      adjunto: { nombre, base64: Buffer.from(excel).toString("base64") },
    }),
  });
  if (!res.ok) console.error(`[recepcion/avisoObservaciones] n8n respondió ${res.status} (recepcion ${recepcionId})`);
}

/** La foto de la base, achicada como en el navegador (al doble, para que no se vea borrosa). */
async function leerFoto(archivo: { id: number }) {
  try {
    const fila = ((await query("SELECT data FROM recepcion_packing_archivos WHERE id = ?", [archivo.id])).rows as any[])[0];
    if (!fila?.data) return null;
    const sharp = (await import("sharp")).default;
    const { data, info } = await sharp(fila.data as Buffer)
      .rotate()
      .resize(FOTO_PX * 2, FOTO_PX * 2, { fit: "inside" })
      .jpeg({ quality: 85 })
      .toBuffer({ resolveWithObject: true });
    return { base64: data.toString("base64"), ancho: Math.round(info.width / 2), alto: Math.round(info.height / 2) };
  } catch {
    return null;
  }
}
