import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { jwtSecretBytes } from "@/lib/secretos";
import { puedeVerReportesComerciales } from "@/lib/reportes-comerciales/acceso";
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
    const clientes = await listarClientesPanama();
    return NextResponse.json({ clientes });
  } catch (error: any) {
    console.error("Error listando clientes Panamá:", error);
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
