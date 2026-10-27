import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { ROLES_ADMINISTRACION } from "@/lib/administracion/auth";
import {
  ArchivoIlegible,
  asignarMovimiento,
  borrarMovimientosSemana,
  capturaYaSubida,
  comprobantePorHuella,
  conciliacionSemana,
  clienteDelArchivo,
  diaDeCarpeta,
  eliminarComprobante,
  fechaConCarpeta,
  fechaSinComprobante,
  guardarComprobante,
  guardarMovimientos,
  hayIA,
  huella,
  leerComprobante,
  leerEstadoDeCuenta,
  movimientosBorrables,
  NOMBRE_SEDE,
  rangoSemana,
  sedeBinance,
} from "@/lib/administracion/binance";
import { respuestaSedeNoPermitida } from "@/lib/auth/sedeRol";
import { descargarDeDrive, ErrorDrive } from "@/lib/administracion/googleDrive";

const MAX_BYTES = 8 * 1024 * 1024;
const TIPOS = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

// GET /api/administracion/binance?semana=YYYY-MM-DD (lunes)
// Comprobantes de la semana cruzados con Binance Pay + pagos sin comprobante.
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_ADMINISTRACION);
  if (auth.error) return auth.error;
  const semana = request.nextUrl.searchParams.get("semana") || "";
  if (!rangoSemana(semana)) {
    return NextResponse.json({ error: "La semana debe ser un lunes (YYYY-MM-DD)" }, { status: 400 });
  }
  const sede = sedeBinance(auth.payload);
  if (sede === undefined) return respuestaSedeNoPermitida();
  try {
    const [datos, borrables] = await Promise.all([conciliacionSemana(semana, sede), movimientosBorrables(semana, sede)]);
    return NextResponse.json({ success: true, semana, ...datos, borrables });
  } catch (e: any) {
    console.error("[binance] conciliacion:", e?.message);
    return NextResponse.json({ error: "No se pudo cargar la conciliación" }, { status: 500 });
  }
}

/** Mensaje de un comprobante repetido: de otra sede no se dice quien lo subio (la tabla es de las tres). */
function respuestaRepetido(
  orderId: string,
  previo: { subidoPor: string; companyId: number | null },
  cids: number | null,
  mismoArchivo: boolean,
) {
  const otraSede = previo.companyId !== null && previo.companyId !== cids;
  const error = otraSede
    ? `El ID de orden ${orderId} ya está cargado en ${NOMBRE_SEDE[previo.companyId!] || "otra sede"}: ` +
      "puede que el cliente haya pasado el mismo comprobante en otra sede"
    : mismoArchivo
      ? `Este archivo ya estaba cargado (ID de orden ${orderId}, ${previo.subidoPor})`
      : `El ID de orden ${orderId} ya estaba cargado (${previo.subidoPor})`;
  return NextResponse.json({ error, repetido: true, otraSede }, { status: 409 });
}

// POST /api/administracion/binance (multipart: archivo [, tipo=estado]) — un
// archivo por llamada: la pantalla manda varios a la vez y muestra el avance.
// Con tipo=estado es una captura/PDF del estado de cuenta, no un comprobante.
// Un archivo que ya se subio (misma huella SHA-256) no se vuelve a leer con la
// IA: al subir otra vez una carpeta entera solo se paga lo nuevo.
export async function POST(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_ADMINISTRACION);
  if (auth.error) return auth.error;
  if (!hayIA()) {
    return NextResponse.json({ error: "Falta configurar OPENAI_API_KEY en el servidor" }, { status: 503 });
  }
  const sede = sedeBinance(auth.payload);
  if (sede === undefined) return respuestaSedeNoPermitida();
  const cidsToken = Number(auth.payload?.cids);
  const cids = Number.isInteger(cidsToken) ? cidsToken : null;
  const email = String(auth.payload?.email || "");
  try {
    const form = await request.formData();
    // drive_id: el archivo esta en la carpeta de Google Drive que se pego; se baja aca.
    const driveId = form.get("drive_id");
    let archivo: { name: string; type: string };
    let datos: Buffer;
    if (typeof driveId === "string" && driveId) {
      const d = await descargarDeDrive(driveId);
      archivo = { name: d.nombre, type: d.mime };
      datos = d.datos;
    } else {
      const subido = form.get("archivo");
      if (!(subido instanceof File) || subido.size === 0) {
        return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
      }
      if (subido.size > MAX_BYTES) {
        return NextResponse.json({ error: "El archivo pesa más de 8 MB" }, { status: 413 });
      }
      if (!TIPOS.has(subido.type)) {
        return NextResponse.json({ error: "Solo fotos (JPG, PNG, WEBP) o PDF" }, { status: 415 });
      }
      archivo = subido;
      datos = Buffer.from(await subido.arrayBuffer());
    }
    const sha = huella(datos);
    if (form.get("tipo") === "estado") {
      if (await capturaYaSubida(sha)) {
        return NextResponse.json({ success: true, estado: true, yaEstaba: true, recibidos: 0, nuevos: 0, repetidos: 0 });
      }
      const { movs, leidas, captura } = await leerEstadoDeCuenta(datos, archivo.type);
      if (!leidas) {
        return NextResponse.json({ error: "No parece un estado de cuenta de Binance Pay" }, { status: 422 });
      }
      // SuperAdmin (sede null): sus pagos solo los borra el SuperAdmin.
      const r = await guardarMovimientos(movs, { email, sede }, { datos, nombre: archivo.name, sha, captura });
      return NextResponse.json({ success: true, estado: true, leidas, recibidos: movs.length, ...r });
    }
    const mismo = await comprobantePorHuella(sha);
    if (mismo) return respuestaRepetido(mismo.orderId, mismo, cids, true);
    const leido = await leerComprobante(datos, archivo.type);
    // Una captura recortada puede no traer la fecha: se toma el dia de la carpeta
    // ("02-10-2026/Cliente.jpg") con la hora del reloj del telefono si se ve, y
    // si tampoco hay carpeta con fecha, va a la semana elegida.
    let fecha: { fechaMs: number; estimada: boolean; soloDia: boolean; horaTelefono: boolean };
    const dia = diaDeCarpeta(String(form.get("carpeta") || ""));
    if (leido.fechaMs !== null) {
      fecha = { fechaMs: leido.fechaMs, estimada: false, soloDia: false, horaTelefono: false };
    } else if (dia !== null) {
      fecha = fechaConCarpeta(dia, leido.horaTelefono);
    } else {
      const enSemana = await fechaSinComprobante(leido.orderId, String(form.get("semana") || ""));
      if (!enSemana) {
        return NextResponse.json({ error: "El comprobante no trae la fecha y falta la semana" }, { status: 400 });
      }
      fecha = { ...enSemana, soloDia: false, horaTelefono: false };
    }
    const r = await guardarComprobante(
      { ...leido, ...fecha },
      { nombre: archivo.name, mime: archivo.type, datos },
      { email, cids },
    );
    if ("repetido" in r) return respuestaRepetido(leido.orderId, r.repetido, cids, false);
    return NextResponse.json({
      success: true,
      id: r.id,
      orderId: leido.orderId,
      monto: leido.monto,
      moneda: leido.moneda,
      fecha: new Date(fecha.fechaMs).toISOString(),
      fechaEstimada: fecha.estimada,
      soloDia: fecha.soloDia,
      horaTelefono: fecha.horaTelefono,
      cliente: clienteDelArchivo(archivo.name),
    });
  } catch (e: any) {
    if (e instanceof ArchivoIlegible || e instanceof ErrorDrive) {
      return NextResponse.json({ error: e.message }, { status: 422 });
    }
    // Saturada aun despues de los reintentos del SDK: 429 para que la pantalla
    // espere y lo vuelva a mandar.
    if (e?.status === 429 && !/quota|billing|credit/i.test(String(e?.message))) {
      return NextResponse.json({ error: "La IA está saturada, se reintenta en unos segundos" }, { status: 429 });
    }
    // Error de la API de OpenAI o de Claude (los dos SDK traen `status`): sin
    // saldo, key mala, saturada... el mensaje del proveedor dice cual.
    if (typeof e?.status === "number") {
      return NextResponse.json(
        { error: `La IA no pudo leer el archivo: ${String(e.message).slice(0, 200)}` },
        { status: 422 },
      );
    }
    console.error("[binance] subir archivo:", e?.message);
    // Pantalla interna: el detalle ayuda a saber si fallo la IA o la base.
    return NextResponse.json(
      { error: `No se pudo procesar el archivo (${String(e?.message || "error").slice(0, 160)})` },
      { status: 500 },
    );
  }
}

// PATCH /api/administracion/binance {id, movimiento_id} — amarrar a mano un
// comprobante con un pago del estado de cuenta (movimiento_id null = soltarlo).
export async function PATCH(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_ADMINISTRACION);
  if (auth.error) return auth.error;
  const b = await request.json().catch(() => ({}));
  const id = Number(b?.id);
  const mov = b?.movimiento_id === null ? null : Number(b?.movimiento_id);
  if (!Number.isInteger(id) || id <= 0 || (mov !== null && (!Number.isInteger(mov) || mov <= 0))) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const sede = sedeBinance(auth.payload);
  if (sede === undefined) return respuestaSedeNoPermitida();
  try {
    await asignarMovimiento(id, mov, sede, b?.aprobar === true);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (e instanceof ArchivoIlegible) return NextResponse.json({ error: e.message }, { status: 409 });
    console.error("[binance] asignar:", e?.message);
    return NextResponse.json({ error: "No se pudo guardar" }, { status: 500 });
  }
}

// DELETE /api/administracion/binance?id= — quitar un comprobante subido por error.
// DELETE /api/administracion/binance?estado=YYYY-MM-DD — borrar el estado de
// cuenta de esa semana: solo lo que subio esta sede y nadie mas (el SuperAdmin, todo).
export async function DELETE(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_ADMINISTRACION);
  if (auth.error) return auth.error;
  const sede = sedeBinance(auth.payload);
  if (sede === undefined) return respuestaSedeNoPermitida();
  const p = request.nextUrl.searchParams;
  try {
    const semana = p.get("estado");
    if (semana !== null) {
      if (!rangoSemana(semana)) return NextResponse.json({ error: "Semana inválida" }, { status: 400 });
      return NextResponse.json({ success: true, borrados: await borrarMovimientosSemana(semana, sede) });
    }
  } catch (e: any) {
    console.error("[binance] borrar estado de cuenta:", e?.message);
    return NextResponse.json({ error: "No se pudo borrar el estado de cuenta" }, { status: 500 });
  }
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "id inválido" }, { status: 400 });
  await eliminarComprobante(id, sede);
  return NextResponse.json({ success: true });
}
