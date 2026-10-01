import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { jwtSecretBytes } from "@/lib/secretos";
import { puedeVerReportesComerciales, resolverSede } from "@/lib/reportes-comerciales/acceso";
import { listarClientesPanama } from "@/lib/reportes-comerciales/reporteTrimestral";

export const runtime = "nodejs";
export const maxDuration = 60;

const JWT_SECRET = jwtSecretBytes();

export async function GET(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (!puedeVerReportesComerciales({ role: payload.role as string, email: payload.email as string })) {
      return NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 });
    }
    const companyId = resolverSede(
      { role: payload.role as string, email: payload.email as string, cids: payload.cids as number },
      new URL(request.url).searchParams.get("sede"),
    );
    if (companyId == null) return NextResponse.json({ error: "Sin sede asignada" }, { status: 403 });
    const clientes = await listarClientesPanama(companyId);
    return NextResponse.json({ clientes });
  } catch (error: any) {
    console.error("Error listando clientes de la sede:", error);
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
