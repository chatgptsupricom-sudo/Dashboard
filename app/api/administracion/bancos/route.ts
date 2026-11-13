import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { ROLES_ADMINISTRACION } from "@/lib/administracion/auth";
import { ArchivoIlegible, hayIA, rangoSemana, sedeBinance } from "@/lib/administracion/binance";
import {
  amarrarComprobante,
  amarrarPago,
  borrarComprobante,
  borrarEstado,
  conciliacionSemana,
  cuentasBancarias,
  esExcel,
  guardarComprobante,
  guardarEstado,
  buscarClientes,
  registrarCobro,
  verificarComprobante,
  verificarPendientes,
  vistaPreviaRegistro,
  type CuentaBanco,
} from "@/lib/administracion/bancos";
import { respuestaSedeNoPermitida, SEDES_VALIDAS } from "@/lib/auth/sedeRol";

const MAX_BYTES = 8 * 1024 * 1024;
const IMAGENES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const HUELLA = /^[0-9a-f]{64}$/;

/**
 * Sedes que el usuario puede ver: Administracion la de su `cids` (aunque pida
 * otra), el SuperAdmin la que pida o todas. undefined = sin sede valida.
 */
function sedesDe(payload: any, pedida: string | null): number[] | undefined {
  const sede = sedeBinance(payload);
  if (sede === undefined) return undefined;
  if (sede !== null) return [sede];
  const n = Number(pedida);
  return SEDES_VALIDAS.includes(n) ? [n] : SEDES_VALIDAS;
}

/** La cuenta pedida, si es de una sede del usuario. */
async function cuentaPedida(payload: any, id: unknown): Promise<CuentaBanco | NextResponse> {
  const sedes = sedesDe(payload, null);
  if (!sedes) return respuestaSedeNoPermitida();
  const cuenta = (await cuentasBancarias(sedes)).find((c) => c.id === Number(id));
  return cuenta || NextResponse.json({ error: "Esa cuenta no existe o no es de tu sede" }, { status: 404 });
}

// GET /api/administracion/bancos?cuentas=1[&sede=9] — cuentas de banco de la sede.
// GET /api/administracion/bancos?cuenta=<diario>&semana=YYYY-MM-DD (lunes) — la conciliacion.
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_ADMINISTRACION);
  if (auth.error) return auth.error;
  const p = request.nextUrl.searchParams;
  try {
    if (p.get("cuentas")) {
      const sedes = sedesDe(auth.payload, p.get("sede"));
      if (!sedes) return respuestaSedeNoPermitida();
      return NextResponse.json({ success: true, cuentas: await cuentasBancarias(sedes) });
    }
    const semana = p.get("semana") || "";
    if (!rangoSemana(semana)) {
      return NextResponse.json({ error: "La semana debe ser un lunes (YYYY-MM-DD)" }, { status: 400 });
    }
    const cuenta = await cuentaPedida(auth.payload, p.get("cuenta"));
    if (cuenta instanceof NextResponse) return cuenta;
    return NextResponse.json({ success: true, semana, ...(await conciliacionSemana(cuenta, semana)) });
  } catch (e: any) {
    console.error("[bancos] conciliacion:", e?.message);
    return NextResponse.json({ error: "No se pudo cargar la conciliación (¿Odoo no responde?)" }, { status: 502 });
  }
}

// POST /api/administracion/bancos (multipart: cuenta, archivo, tipo=estado|comprobante[, carpeta])
// Un archivo por llamada: la pantalla manda varios y muestra el avance.
export async function POST(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_ADMINISTRACION);
  if (auth.error) return auth.error;
  const email = String(auth.payload?.email || "");
  try {
    const form = await request.formData();
    const cuenta = await cuentaPedida(auth.payload, form.get("cuenta"));
    if (cuenta instanceof NextResponse) return cuenta;
    const subido = form.get("archivo");
    if (!(subido instanceof File) || subido.size === 0) {
      return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
    }
    if (subido.size > MAX_BYTES) return NextResponse.json({ error: "El archivo pesa más de 8 MB" }, { status: 413 });
    const estado = form.get("tipo") === "estado";
    const excel = estado && esExcel(subido.name);
    if (!excel && !IMAGENES.has(subido.type)) {
      return NextResponse.json(
        { error: estado ? "Solo Excel, CSV, fotos o PDF" : "Solo fotos (JPG, PNG, WEBP) o PDF" },
        { status: 415 },
      );
    }
    if (!excel && !hayIA()) {
      return NextResponse.json({ error: "Falta configurar OPENAI_API_KEY en el servidor" }, { status: 503 });
    }
    const archivo = { nombre: subido.name, mime: subido.type, datos: Buffer.from(await subido.arrayBuffer()) };
    if (estado) return NextResponse.json({ success: true, estado: true, ...(await guardarEstado(cuenta, archivo, email)) });
    const r = await guardarComprobante(cuenta, archivo, String(form.get("carpeta") || ""), email);
    if ("repetido" in r) return NextResponse.json({ error: r.repetido, repetido: true }, { status: 409 });
    return NextResponse.json({ success: true, ...r });
  } catch (e: any) {
    if (e instanceof ArchivoIlegible) return NextResponse.json({ error: e.message }, { status: 422 });
    // IA saturada: 429 para que la pantalla espere y lo vuelva a mandar.
    if (e?.status === 429 && !/quota|billing|credit/i.test(String(e?.message))) {
      return NextResponse.json({ error: "La IA está saturada, se reintenta en unos segundos" }, { status: 429 });
    }
    if (typeof e?.status === "number") {
      return NextResponse.json({ error: `La IA no pudo leer el archivo: ${String(e.message).slice(0, 200)}` }, { status: 422 });
    }
    console.error("[bancos] subir archivo:", e?.message);
    return NextResponse.json(
      { error: `No se pudo procesar el archivo (${String(e?.message || "error").slice(0, 160)})` },
      { status: 500 },
    );
  }
}

// PATCH /api/administracion/bancos
//   {cuenta, movimiento, pago_id}      — movimiento <-> cobro de Odoo a mano (pago_id null = soltar)
//   {cuenta, comprobante, movimiento}  — comprobante <-> movimiento a mano (movimiento null = soltar)
//   {cuenta, verificar: id}            — volver a consultar un comprobante en el banco (API de Mercantil)
//   {cuenta, verificar: "pendientes", semana} — los de la semana que el banco no confirmo
export async function PATCH(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_ADMINISTRACION);
  if (auth.error) return auth.error;
  const b = await request.json().catch(() => ({}));
  const cuenta = await cuentaPedida(auth.payload, b?.cuenta);
  if (cuenta instanceof NextResponse) return cuenta;
  if (b?.verificar !== undefined) {
    try {
      if (b.verificar === "pendientes") {
        if (!rangoSemana(String(b?.semana || ""))) return NextResponse.json({ error: "Semana inválida" }, { status: 400 });
        return NextResponse.json({ success: true, ...(await verificarPendientes(cuenta, b.semana)) });
      }
      const id = Number(b.verificar);
      if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Comprobante inválido" }, { status: 400 });
      const api = await verificarComprobante(cuenta, id);
      if (!api) return NextResponse.json({ error: "Esta cuenta no tiene la API del banco" }, { status: 400 });
      return NextResponse.json({ success: true, api });
    } catch (e: any) {
      console.error("[bancos] verificar:", e?.message);
      return NextResponse.json({ error: "No se pudo consultar el banco" }, { status: 502 });
    }
  }
  const movimiento = b?.movimiento ?? null;
  if (movimiento !== null && !HUELLA.test(String(movimiento))) {
    return NextResponse.json({ error: "Movimiento inválido" }, { status: 400 });
  }
  try {
    if (b?.comprobante !== undefined) {
      const id = Number(b.comprobante);
      if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Comprobante inválido" }, { status: 400 });
      await amarrarComprobante(cuenta, id, movimiento);
    } else {
      const pago = b?.pago_id === null ? null : Number(b?.pago_id);
      if (!movimiento || (pago !== null && (!Number.isInteger(pago) || pago <= 0))) {
        return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
      }
      await amarrarPago(cuenta, movimiento, pago, String(auth.payload?.email || ""));
    }
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("[bancos] amarrar:", e?.message);
    return NextResponse.json({ error: "No se pudo guardar" }, { status: 500 });
  }
}

// PUT /api/administracion/bancos — registrar en Odoo el cobro de un comprobante que el banco confirmo.
//   {cuenta, comprobante}                                   — vista previa (no crea nada)
//   {cuenta, comprobante, buscar}                           — clientes de Odoo por nombre o RIF
//   {cuenta, comprobante, aprobar: true, partner_id, tasa, descripcion} — lo crea y lo confirma en Odoo
export async function PUT(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_ADMINISTRACION);
  if (auth.error) return auth.error;
  const b = await request.json().catch(() => ({}));
  const cuenta = await cuentaPedida(auth.payload, b?.cuenta);
  if (cuenta instanceof NextResponse) return cuenta;
  const id = Number(b?.comprobante);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Comprobante inválido" }, { status: 400 });
  try {
    if (typeof b?.buscar === "string") {
      return NextResponse.json({ success: true, clientes: await buscarClientes(cuenta, b.buscar.slice(0, 80)) });
    }
    if (b?.aprobar !== true) {
      const vista = await vistaPreviaRegistro(cuenta, id);
      if ("error" in vista) return NextResponse.json({ error: vista.error }, { status: 409 });
      return NextResponse.json({ success: true, ...vista });
    }
    const partnerId = Number(b?.partner_id);
    const tasa = Number(b?.tasa);
    const descripcion = String(b?.descripcion || "").trim().slice(0, 500);
    if (!Number.isInteger(partnerId) || partnerId <= 0) return NextResponse.json({ error: "Elige el cliente" }, { status: 400 });
    if (!(tasa > 0 && tasa < 1e7)) return NextResponse.json({ error: "La tasa debe ser mayor que 0" }, { status: 400 });
    if (!descripcion) return NextResponse.json({ error: "Escribe la descripción (las facturas que paga)" }, { status: 400 });
    const p = auth.payload as any;
    const r = await registrarCobro(cuenta, id, { partnerId, tasa, descripcion }, {
      nombre: String(p?.name || p?.nombre || ""),
      email: String(p?.email || ""),
    });
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: 409 });
    return NextResponse.json({ success: true, ...r });
  } catch (e: any) {
    console.error("[bancos] registrar en Odoo:", e?.message);
    return NextResponse.json({ error: `Odoo no lo aceptó: ${String(e?.message || "error").slice(0, 300)}` }, { status: 502 });
  }
}

// DELETE /api/administracion/bancos?cuenta=&comprobante=id — quitar un comprobante subido por error.
// DELETE /api/administracion/bancos?cuenta=&estado=id — quitar un archivo del estado de cuenta.
export async function DELETE(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_ADMINISTRACION);
  if (auth.error) return auth.error;
  const p = request.nextUrl.searchParams;
  const cuenta = await cuentaPedida(auth.payload, p.get("cuenta"));
  if (cuenta instanceof NextResponse) return cuenta;
  const comprobante = Number(p.get("comprobante"));
  const estado = Number(p.get("estado"));
  if (Number.isInteger(comprobante) && comprobante > 0) await borrarComprobante(cuenta, comprobante);
  else if (Number.isInteger(estado) && estado > 0) await borrarEstado(cuenta, estado);
  else return NextResponse.json({ error: "Falta qué borrar" }, { status: 400 });
  return NextResponse.json({ success: true });
}
