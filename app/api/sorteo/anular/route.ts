import { NextRequest, NextResponse } from "next/server";
import { leerConfig } from "@/lib/sorteo/configuracion";
import { anular } from "@/lib/sorteo/ganadores";
import { operador } from "@/lib/sorteo/operador";
import { respuestaError } from "@/lib/sorteo/respuestas";

/**
 * POST (operador): { id } anula ese premio; { todos: true } anula todos los
 * del sorteo activo (reiniciar). El cliente vuelve a la ruleta; la fila queda
 * en la tabla con anulado = 1.
 */
export async function POST(request: NextRequest) {
  const op = await operador(request);
  if (op.error) return op.error;
  const body = await request.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!body?.todos && !(Number.isInteger(id) && id > 0)) {
    return NextResponse.json({ error: "Falta el premio a anular" }, { status: 400 });
  }
  try {
    const { companyId, mes } = await leerConfig();
    await anular(companyId, mes, op.quien, body?.todos ? undefined : id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return respuestaError(error, "sorteo anular");
  }
}
