import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { jwtSecretBytes } from "@/lib/secretos";
import { query } from "@/lib/db";
import { puedeVerReportesComerciales } from "@/lib/reportes-comerciales/acceso";
import {
  calcularEpp,
  COMPANY_ID_PANAMA,
  construirReporte,
} from "@/lib/reportes-comerciales/reporteTrimestral";
import { generarYGuardarTrimestre } from "@/lib/reportes-comerciales/snapshot";
import { ensureTablasReportesComerciales } from "@/lib/reportes-comerciales/tablas";

export const runtime = "nodejs";
export const maxDuration = 120;

const JWT_SECRET = jwtSecretBytes();

async function sesion(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (!puedeVerReportesComerciales({ role: payload.role as string, email: payload.email as string })) {
      return { error: NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 }) };
    }
    return { payload };
  } catch {
    return { error: NextResponse.json({ error: "Token invalido" }, { status: 401 }) };
  }
}

function anioDeTrimestre(trimestre: string): number {
  return parseInt(trimestre.slice(0, 4), 10);
}

export async function GET(request: NextRequest) {
  const s = await sesion(request);
  if (s.error) return s.error;

  try {
    await ensureTablasReportesComerciales();
    const { searchParams } = new URL(request.url);
    const trimestre = searchParams.get("trimestre") || "";
    const marca = searchParams.get("marca") || "EZVIZ";

    // Tab Historico: lista de cierres guardados (no toca Odoo).
    if (searchParams.get("historico") === "1") {
      const { rows } = await query(
        `SELECT trimestre, marca, total_venta, total_unidades, num_facturas, num_clientes,
                generado_por, updated_at
           FROM reporte_trimestral_snapshots
          WHERE company_id = ? AND marca = ?
          ORDER BY trimestre ASC`,
        [COMPANY_ID_PANAMA, marca.toUpperCase()],
      );
      return NextResponse.json({ historico: rows });
    }

    if (!trimestre) {
      return NextResponse.json({ error: "Falta el parametro 'trimestre'" }, { status: 400 });
    }

    const reporte = await construirReporte({ trimestre, marca });

    const anio = anioDeTrimestre(reporte.periodo.trimestre);
    const { rows: filasEpp } = await query(
      `SELECT id, cliente_nombre, odoo_partner_id, razones_sociales, meta_anual
         FROM epp_clientes
        WHERE company_id = ? AND anio = ? AND marca = ? AND activo = 1
        ORDER BY meta_anual DESC`,
      [COMPANY_ID_PANAMA, anio, reporte.periodo.marca],
    );
    const epp = calcularEpp(reporte.rankingClientes, filasEpp as any);

    return NextResponse.json({ ...reporte, epp, anio });
  } catch (error: any) {
    console.error("Error reporte trimestral:", error);
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const s = await sesion(request);
  if (s.error) return s.error;

  try {
    const body = await request.json();
    const trimestre: string = body.trimestre;
    const marca: string = (body.marca || "EZVIZ").toUpperCase();
    if (!trimestre) {
      return NextResponse.json({ error: "Falta 'trimestre'" }, { status: 400 });
    }
    const generadoPor = (s.payload!.email as string) || (s.payload!.name as string) || "";
    await generarYGuardarTrimestre({ trimestre, marca, generadoPor });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error guardando cierre trimestral:", error);
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
