import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { jwtSecretBytes } from "@/lib/secretos";
import { puedeVerReportesComerciales } from "@/lib/reportes-comerciales/acceso";
import {
  generarYGuardarTrimestre,
  leerArchivoTrimestre,
} from "@/lib/reportes-comerciales/snapshot";

export const runtime = "nodejs";
export const maxDuration = 120;

const JWT_SECRET = jwtSecretBytes();

/**
 * Descarga del .xlsx del cierre trimestral guardado.
 *
 * Auth: cookie de sesión (usuario con acceso a Reportes Comerciales) O
 * `Authorization: Bearer <CRON_SECRET>` para que n8n lo pueda bajar sin sesión.
 *
 * Si todavía no hay archivo guardado para ese trimestre, se genera al vuelo y
 * se guarda (útil si el cron aún no corrió).
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const esCron =
      Boolean(process.env.CRON_SECRET) &&
      authHeader === `Bearer ${process.env.CRON_SECRET}`;

    if (!esCron) {
      const token = request.cookies.get("token")?.value;
      if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
      try {
        const { payload } = await jwtVerify(token, JWT_SECRET);
        if (!puedeVerReportesComerciales({ role: payload.role as string, email: payload.email as string })) {
          return NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 });
        }
      } catch {
        return NextResponse.json({ error: "Token invalido" }, { status: 401 });
      }
    }

    const { searchParams } = new URL(request.url);
    const trimestre = searchParams.get("trimestre") || "";
    const marca = (searchParams.get("marca") || "EZVIZ").trim().toUpperCase();
    if (!trimestre) return NextResponse.json({ error: "Falta 'trimestre'" }, { status: 400 });

    let archivo = await leerArchivoTrimestre(trimestre, marca);
    if (!archivo) {
      const r = await generarYGuardarTrimestre({ trimestre, marca, generadoPor: "descarga" });
      archivo = { nombre: r.archivoNombre, buffer: r.buffer };
    }

    return new NextResponse(archivo.buffer as any, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${archivo.nombre}"`,
      },
    });
  } catch (error: any) {
    console.error("Error archivo reporte trimestral:", error);
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
