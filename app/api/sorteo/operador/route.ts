import { NextRequest, NextResponse } from "next/server";
import { operador } from "@/lib/sorteo/operador";

/** POST: verifica la clave de operador (header x-sorteo-clave) o la sesión de SuperAdmin. */
export async function POST(request: NextRequest) {
  const op = await operador(request);
  if (op.error) return op.error;
  return NextResponse.json({ success: true, data: { quien: op.quien } });
}
