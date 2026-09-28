import { requireRoles } from "@/lib/auth/roles";
import { getPublicOrigin } from "@/lib/publicOrigin";
import { NextRequest, NextResponse } from "next/server";
import { decidirNotaCredito, ErrorNota, obtenerNota } from "@/lib/rma/notaCredito";

/** GET: una solicitud con su caso y producto (documento imprimible). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(request, ["rma"]);
  if (auth.error) return auth.error;

  try {
    const id = parseInt((await params).id, 10);
    const nota = id ? await obtenerNota(id) : null;
    if (!nota) return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });
    return NextResponse.json({ success: true, nota });
  } catch (error: any) {
    console.error("GET /api/rma/nota-credito/[id] error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * PUT: el Super Admin aprueba o rechaza la solicitud.
 * Body: { decision: "aprobar" | "rechazar", motivo_rechazo? }
 * `requireRoles(request, [])`: solo entra superadmin.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(request, []);
  if (auth.error) return auth.error;

  try {
    const id = parseInt((await params).id, 10);
    const body = await request.json().catch(() => ({}));
    if (body.decision !== "aprobar" && body.decision !== "rechazar") {
      return NextResponse.json({ error: "decision debe ser aprobar o rechazar" }, { status: 400 });
    }

    await decidirNotaCredito({
      id,
      aprobar: body.decision === "aprobar",
      motivoRechazo: body.motivo_rechazo ? String(body.motivo_rechazo) : null,
      opciones: {
        autor: auth.payload?.name || auth.payload?.email || "Super Admin",
        origenPeticion: getPublicOrigin(request),
      },
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof ErrorNota) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("PUT /api/rma/nota-credito/[id] error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
