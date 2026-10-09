import { requireRoles } from "@/lib/auth/roles";
import { agregar, cambiar, leerRotacion, quitar } from "@/lib/adminleads/rotacionEstados";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Qué vendedores reciben los leads de cada estado (lib/adminleads/rotacionEstados.ts).
// AdminLeads de Valencia/Caracas y SuperAdmin; Panamá no usa esta rotación.
//
//   GET                                -> { estados, vendedores }
//   POST   { estado, seller_id }       -> suma un vendedor al estado
//   PATCH  { fila, seller_id }         -> pone otro vendedor en esa fila
//   DELETE { fila }                    -> saca al vendedor de esa fila
//
// Cada cambio queda en audit_logs (ROTACION_ESTADO): lo ve el SuperAdmin en Auditoría.

async function guardia(request: NextRequest) {
  const auth = await requireRoles(request, ["adminleads"]);
  if (auth.error) return { error: auth.error };
  if (Number(auth.payload?.cids) === 7)
    return { error: NextResponse.json({ error: "Panamá no usa la rotación por estados." }, { status: 403 }) };
  const p = auth.payload as any;
  return { autor: { id: String(p?.sub ?? p?.uid ?? "0"), nombre: String(p?.name ?? p?.email ?? ""), rol: String(p?.role ?? "") } };
}

const responder = (error: string | null) =>
  error ? NextResponse.json({ error }, { status: 400 }) : NextResponse.json({ ok: true });

export async function GET(request: NextRequest) {
  const g = await guardia(request);
  if (g.error) return g.error;
  try {
    return NextResponse.json(await leerRotacion());
  } catch (e: any) {
    console.error("[rotacion-estados] GET:", e?.message);
    return NextResponse.json({ error: "No se pudo leer la rotación por estados." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const g = await guardia(request);
  if (g.error) return g.error;
  const b = await request.json().catch(() => null);
  const sellerId = Number(b?.seller_id);
  if (typeof b?.estado !== "string" || !Number.isInteger(sellerId))
    return NextResponse.json({ error: "Formato no válido." }, { status: 400 });
  return responder(await agregar(b.estado.trim().toLowerCase(), sellerId, g.autor!));
}

export async function PATCH(request: NextRequest) {
  const g = await guardia(request);
  if (g.error) return g.error;
  const b = await request.json().catch(() => null);
  const fila = Number(b?.fila);
  const sellerId = Number(b?.seller_id);
  if (!Number.isInteger(fila) || !Number.isInteger(sellerId))
    return NextResponse.json({ error: "Formato no válido." }, { status: 400 });
  return responder(await cambiar(fila, sellerId, g.autor!));
}

export async function DELETE(request: NextRequest) {
  const g = await guardia(request);
  if (g.error) return g.error;
  const b = await request.json().catch(() => null);
  const fila = Number(b?.fila);
  if (!Number.isInteger(fila)) return NextResponse.json({ error: "Formato no válido." }, { status: 400 });
  return responder(await quitar(fila, g.autor!));
}
