import { bajarArchivo } from "@/lib/agenteia/agente";
import { requireAgente } from "@/lib/agenteia/acceso";
import { NextRequest, NextResponse } from "next/server";

// GET ?id=file_... -> un archivo creado por el Agente IA (Excel, Word, PDF,
// PowerPoint, HTML…), bajado de la Files API de Anthropic.

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireAgente(request);
  if (auth.error) return auth.error;

  const id = request.nextUrl.searchParams.get("id") || "";
  if (!/^file_[A-Za-z0-9_-]+$/.test(id)) return NextResponse.json({ error: "Archivo inválido." }, { status: 400 });

  try {
    const { nombre, tipo, cuerpo } = await bajarArchivo(id);
    return new Response(cuerpo, {
      headers: {
        "Content-Type": tipo,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nombre)}`,
        // Lo escribió el modelo: un HTML abierto directo no corre en el
        // origen del panel (sin cookies ni APIs del usuario).
        "Content-Security-Policy": "sandbox",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e: any) {
    console.error("❌ agenteia archivo:", e.message);
    return NextResponse.json({ error: "No se pudo bajar el archivo." }, { status: 404 });
  }
}
