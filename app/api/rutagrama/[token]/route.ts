import { ErrorEnvio, enviar, vistaPublica } from "@/lib/rutagrama/datos";
import { aplicarLimites, obtenerIp } from "@/lib/servicio-tecnico/limites";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PÚBLICO (sin sesión): el rutagrama que llena el nuevo ingreso desde el
 * enlace que le mandó RRHH (/<idioma>/mi-ruta/<token>, lib/rutagrama/).
 * El token (64 hex) es la única llave: sin él no se lee ni se escribe nada.
 *   GET  -> lo que ya puso RRHH (o "ya enviado", sin datos)
 *   POST {…datos, declaro: true, firma: "data:image/png;base64,…"}
 */

type Ctx = { params: Promise<{ token: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  const bloqueo = aplicarLimites(request, "rutagrama-ver", [{ max: 30, ventanaSegundos: 60 }]);
  if (bloqueo) return bloqueo;
  try {
    const vista = await vistaPublica((await ctx.params).token);
    if (!vista) return NextResponse.json({ error: "Este enlace no existe. Pide uno nuevo a Recursos Humanos." }, { status: 404 });
    return NextResponse.json(vista);
  } catch (e: any) {
    console.error("GET /api/rutagrama/[token]:", e?.message);
    return NextResponse.json({ error: "No pudimos abrir el formulario. Intenta de nuevo." }, { status: 500 });
  }
}

export async function POST(request: NextRequest, ctx: Ctx) {
  const bloqueo = aplicarLimites(request, "rutagrama-enviar", [{ max: 10, ventanaSegundos: 600 }]);
  if (bloqueo) return bloqueo;
  try {
    const b = await request.json().catch(() => ({}));
    return NextResponse.json(await enviar((await ctx.params).token, b, obtenerIp(request)));
  } catch (e: any) {
    if (e instanceof ErrorEnvio) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("POST /api/rutagrama/[token]:", e?.message);
    return NextResponse.json({ error: "No pudimos guardar tu rutagrama. Intenta de nuevo." }, { status: 500 });
  }
}
