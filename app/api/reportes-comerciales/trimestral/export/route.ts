import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { jwtSecretBytes } from "@/lib/secretos";
import { query } from "@/lib/db";
import { puedeVerReportesComerciales } from "@/lib/reportes-comerciales/acceso";
import {
  calcularEpp,
  COMPANY_ID_PANAMA,
  construirReporteCompleto,
} from "@/lib/reportes-comerciales/reporteTrimestral";
import { generarExcelTrimestral, nombreArchivoTrimestral } from "@/lib/reportes-comerciales/excel";
import { ensureTablasReportesComerciales } from "@/lib/reportes-comerciales/tablas";

export const runtime = "nodejs";
export const maxDuration = 120;

const JWT_SECRET = jwtSecretBytes();

export async function GET(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (!puedeVerReportesComerciales({ role: payload.role as string, email: payload.email as string })) {
      return NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 });
    }

    await ensureTablasReportesComerciales();
    const { searchParams } = new URL(request.url);
    const trimestre = searchParams.get("trimestre") || "";
    const marca = (searchParams.get("marca") || "EZVIZ").trim();
    if (!trimestre) return NextResponse.json({ error: "Falta 'trimestre'" }, { status: 400 });

    const { reporte, detalle } = await construirReporteCompleto({ trimestre, marca });
    const anio = parseInt(reporte.periodo.trimestre.slice(0, 4), 10);
    const { rows: filasEpp } = await query(
      `SELECT id, cliente_nombre, odoo_partner_id, meta_anual
         FROM epp_clientes
        WHERE company_id = ? AND anio = ? AND marca = ? AND activo = 1
        ORDER BY meta_anual DESC`,
      [COMPANY_ID_PANAMA, anio, reporte.periodo.marca],
    );
    const epp = calcularEpp(reporte.rankingClientes, filasEpp as any);

    const buffer = await generarExcelTrimestral({ reporte, detalle, epp });

    return new NextResponse(buffer as any, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nombreArchivoTrimestral(reporte)}"`,
      },
    });
  } catch (error: any) {
    console.error("Error export reporte trimestral:", error);
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
