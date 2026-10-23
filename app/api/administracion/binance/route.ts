import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { ROLES_ADMINISTRACION } from "@/lib/administracion/auth";
import {
  ArchivoIlegible,
  asignarMovimiento,
  borrarMovimientosSemana,
  conciliacionSemana,
  eliminarComprobante,
  fechaSinComprobante,
  guardarComprobante,
  guardarMovimientos,
  hayIA,
  leerComprobante,
  leerEstadoDeCuenta,
  rangoSemana,
} from "@/lib/administracion/binance";

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
  try {
    return NextResponse.json({ success: true, semana, ...(await conciliacionSemana(semana)) });
  } catch (e: any) {
    console.error("[binance] conciliacion:", e?.message);
    return NextResponse.json({ error: "No se pudo cargar la conciliación" }, { status: 500 });
  }
}

// POST /api/administracion/binance (multipart: archivo [, tipo=estado]) — un
// archivo por llamada: la pantalla los sube de a uno para mostrar el avance.
// Con tipo=estado es una captura/PDF del estado de cuenta, no un comprobante.
export async function POST(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_ADMINISTRACION);
  if (auth.error) return auth.error;
  if (!hayIA()) {
    return NextResponse.json({ error: "Falta configurar OPENAI_API_KEY en el servidor" }, { status: 503 });
  }
  try {
    const form = await request.formData();
    const archivo = form.get("archivo");
    if (!(archivo instanceof File) || archivo.size === 0) {
      return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
    }
    if (archivo.size > MAX_BYTES) {
      return NextResponse.json({ error: "El archivo pesa más de 8 MB" }, { status: 413 });
    }
    if (!TIPOS.has(archivo.type)) {
      return NextResponse.json({ error: "Solo fotos (JPG, PNG, WEBP) o PDF" }, { status: 415 });
    }
    const datos = Buffer.from(await archivo.arrayBuffer());
    if (form.get("tipo") === "estado") {
      const { movs, leidas, captura } = await leerEstadoDeCuenta(datos, archivo.type);
      if (!leidas) {
        return NextResponse.json({ error: "No parece un estado de cuenta de Binance Pay" }, { status: 422 });
      }
      const r = await guardarMovimientos(
        movs,
        String(auth.payload?.email || ""),
        captura && { datos: captura, nombre: archivo.name },
      );
      return NextResponse.json({ success: true, estado: true, leidas, recibidos: movs.length, ...r });
    }
    const leido = await leerComprobante(datos, archivo.type);
    // Una captura recortada puede no traer la fecha: va a la semana elegida.
    const fecha =
      leido.fechaMs !== null
        ? { fechaMs: leido.fechaMs, estimada: false }
        : await fechaSinComprobante(leido.orderId, String(form.get("semana") || ""));
    if (!fecha) {
      return NextResponse.json({ error: "El comprobante no trae la fecha y falta la semana" }, { status: 400 });
    }
    const cids = Number(auth.payload?.cids);
    const r = await guardarComprobante(
      { ...leido, ...fecha },
      { nombre: archivo.name, mime: archivo.type, datos },
      { email: String(auth.payload?.email || ""), cids: Number.isInteger(cids) ? cids : null },
    );
    if ("repetido" in r) {
      return NextResponse.json(
        { error: `El ID de orden ${leido.orderId} ya estaba cargado (${r.repetido.subidoPor})`, repetido: true },
        { status: 409 },
      );
    }
    return NextResponse.json({
      success: true,
      id: r.id,
      orderId: leido.orderId,
      monto: leido.monto,
      moneda: leido.moneda,
      fecha: new Date(fecha.fechaMs).toISOString(),
      fechaEstimada: fecha.estimada,
    });
  } catch (e: any) {
    if (e instanceof ArchivoIlegible) {
      return NextResponse.json({ error: e.message }, { status: 422 });
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
  try {
    await asignarMovimiento(id, mov);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (e instanceof ArchivoIlegible) return NextResponse.json({ error: e.message }, { status: 409 });
    console.error("[binance] asignar:", e?.message);
    return NextResponse.json({ error: "No se pudo guardar" }, { status: 500 });
  }
}

// DELETE /api/administracion/binance?id= — quitar un comprobante subido por error.
// DELETE /api/administracion/binance?estado=YYYY-MM-DD — borrar el estado de cuenta de esa semana.
export async function DELETE(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_ADMINISTRACION);
  if (auth.error) return auth.error;
  const semana = request.nextUrl.searchParams.get("estado");
  if (semana !== null) {
    if (!rangoSemana(semana)) return NextResponse.json({ error: "Semana inválida" }, { status: 400 });
    await borrarMovimientosSemana(semana);
    return NextResponse.json({ success: true });
  }
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "id inválido" }, { status: 400 });
  await eliminarComprobante(id);
  return NextResponse.json({ success: true });
}
