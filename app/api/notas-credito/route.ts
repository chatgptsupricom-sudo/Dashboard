import { requireSession } from "@/lib/auth/roles";
import { accesoNC, requireNC } from "@/lib/notas-credito/acceso";
import { listarAnteriores } from "@/lib/notas-credito/anteriores";
import { crearDirecta, ErrorNC, listar, sincronizarAprobadas } from "@/lib/notas-credito/solicitudes";
import { ESTADOS_ABIERTOS, PASO_DEL_ESTADO, type EstadoNC } from "@/lib/notas-credito/tipos";
import { getPublicOrigin } from "@/lib/publicOrigin";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const ESTADOS: EstadoNC[] = ["por_preaprobar", "por_aprobar", "aprobada", "procesada", "rechazada"];

/**
 * GET
 *   ?acceso=1   si la sesión entra y con qué pasos (sidebar y pantalla). Nunca 403.
 *   ?conteo=1   cuántas esperan a la sesión (contador del sidebar).
 *   (nada)      la lista de sus sedes [&estado=]. Las aprobadas se ponen al día con Odoo.
 *               `anteriores`: solicitudes de RMA fuera del flujo (lib/notas-credito/anteriores.ts).
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  if (sp.get("acceso") === "1") {
    const s = await requireSession(request);
    if (s.error) return NextResponse.json({ puede: false });
    const a = await accesoNC(s.payload);
    return NextResponse.json({ puede: !!a, superadmin: !!a?.superadmin, pasos: a?.pasos ?? {} });
  }

  const { acceso, error } = await requireNC(request);
  if (error) return error;

  try {
    const estado = sp.get("estado") as EstadoNC | null;
    if (sp.get("conteo") === "1") {
      const abiertas = await listar(acceso!.sedes ?? Object.keys(acceso!.pasos).map(Number));
      const mias = abiertas.filter((s) => {
        const paso = PASO_DEL_ESTADO[s.estado];
        return paso && ESTADOS_ABIERTOS.includes(s.estado) && (acceso!.pasos[s.company_id] ?? []).includes(paso);
      });
      return NextResponse.json({ success: true, pendientes: mias.length });
    }

    let notas = await listar(acceso!.sedes, estado && ESTADOS.includes(estado) ? estado : null);
    try {
      if (await sincronizarAprobadas(notas, getPublicOrigin(request))) {
        notas = await listar(acceso!.sedes, estado && ESTADOS.includes(estado) ? estado : null);
      }
    } catch (e: any) {
      console.error("[notas-credito] sincronizar con Odoo:", e?.message);
    }
    let anteriores: Awaited<ReturnType<typeof listarAnteriores>> = [];
    try {
      anteriores = await listarAnteriores(acceso!.sedes, acceso!.autor, acceso!.superadmin);
    } catch (e: any) {
      console.error("[notas-credito] solicitudes anteriores:", e?.message);
    }
    return NextResponse.json({ success: true, notas, anteriores, pasos: acceso!.pasos, superadmin: acceso!.superadmin });
  } catch (e: any) {
    console.error("GET /api/notas-credito:", e?.message);
    return NextResponse.json({ error: e?.message || "Error" }, { status: 500 });
  }
}

/** POST { company_id, factura_id, monto, motivo }: nota de crédito que no viene de RMA (la crea quien preaprueba). */
export async function POST(request: NextRequest) {
  const { acceso, error } = await requireNC(request);
  if (error) return error;
  try {
    const body = await request.json().catch(() => ({}));
    const id = await crearDirecta({
      companyId: Number(body.company_id),
      facturaId: Number(body.factura_id),
      monto: body.monto,
      motivo: String(body.motivo ?? ""),
      autor: acceso!.autor,
      origenPeticion: getPublicOrigin(request),
    });
    return NextResponse.json({ success: true, id });
  } catch (e: any) {
    if (e instanceof ErrorNC) return NextResponse.json({ error: e.message, ...e.extra }, { status: e.status });
    console.error("POST /api/notas-credito:", e?.message);
    return NextResponse.json({ error: e?.message || "Error" }, { status: 500 });
  }
}
