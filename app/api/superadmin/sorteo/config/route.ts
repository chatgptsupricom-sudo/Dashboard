import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { MES_VALIDO, TITULO_MAX, esSedeSorteo } from "@/lib/sorteo/config";
import { guardarConfig, leerConfig } from "@/lib/sorteo/configuracion";

/**
 * Configuración del sorteo activo (solo SuperAdmin). La landing la toma en
 * unos segundos (caché de 5 s en lib/sorteo/configuracion).
 *
 * GET → la configuración actual.
 * PUT { companyId: 9|10|7, mes: 'YYYY-MM', montoPorTicket, titulo? }
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, []);
  if (auth.error) return auth.error;
  return NextResponse.json({ success: true, data: await leerConfig() });
}

export async function PUT(request: NextRequest) {
  const auth = await requireRoles(request, []);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const companyId = Number(body?.companyId);
  const mes = String(body?.mes || "");
  const montoPorTicket = Number(body?.montoPorTicket);
  const titulo = typeof body?.titulo === "string" ? body.titulo.trim() : "";

  if (!esSedeSorteo(companyId)) return NextResponse.json({ error: "Sede inválida" }, { status: 400 });
  if (!MES_VALIDO.test(mes)) return NextResponse.json({ error: "Mes inválido (AAAA-MM)" }, { status: 400 });
  if (!Number.isFinite(montoPorTicket) || montoPorTicket < 1 || montoPorTicket > 10_000_000) {
    return NextResponse.json({ error: "Monto por ticket inválido" }, { status: 400 });
  }
  if (titulo.length > TITULO_MAX) return NextResponse.json({ error: `El título admite hasta ${TITULO_MAX} caracteres` }, { status: 400 });

  try {
    const p = auth.payload || {};
    await guardarConfig({ companyId, mes, montoPorTicket: Math.round(montoPorTicket * 100) / 100, titulo: titulo || null }, String(p.email || p.name || "SuperAdmin"));
    return NextResponse.json({ success: true, data: await leerConfig() });
  } catch (error: any) {
    console.error("Error guardando sorteo_config:", error?.message);
    const falta = error?.code === "ER_NO_SUCH_TABLE";
    return NextResponse.json({ error: falta ? "Falta crear la tabla sorteo_config (sql/sorteo_config.sql)" : "No se pudo guardar la configuración" }, { status: 500 });
  }
}
