import { requireAlmacen, resolverCidsSesion } from "@/lib/seguridad/auth";
import { listar } from "@/lib/mantenimiento/datos";
import { IaNoDisponible, diagnosticar, planDeFlota, responder } from "@/lib/mantenimiento/ia";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// El plan de una flota grande puede tardar: que la plataforma no lo corte antes.
export const maxDuration = 180;

/**
 * POST /api/seguridad/mercancia/mantenimiento/ia  { modo, ... }
 *
 * El asistente de mantenimiento (lib/mantenimiento/ia):
 *  - plan: qué mantenimientos conviene abrir en la flota de la sede.
 *  - diagnostico { equipo_id, falla }: prioridad, causas y tareas de una falla.
 *  - pregunta { pregunta }: una respuesta en texto sobre la flota.
 *
 * Solo lee y propone; no guarda nada. La flota se vuelve a leer de la base en
 * cada consulta: la IA nunca trabaja con lo que mande el navegador.
 */

const MAX = { falla: 2000, pregunta: 1000 };

// Una consulta por usuario a la vez, y no más seguido que esto: cada una
// cuesta, y un doble toque no tiene por qué pagar dos.
const ESPERA_MS = 4000;
const enCurso = new Map<string, number>();

export async function POST(request: NextRequest) {
  const auth = await requireAlmacen(request);
  if (auth.error) return auth.error;
  const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
  if (cidsError) return cidsError;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }

  const usuario = String(auth.payload?.email || auth.payload?.name || "almacen");
  const ahora = Date.now();
  if ((enCurso.get(usuario) || 0) > ahora) {
    return NextResponse.json({ error: "La IA todavía está con tu consulta anterior. Espera unos segundos." }, { status: 429 });
  }
  // Mientras responde queda tomado; al terminar, la espera corta.
  enCurso.set(usuario, ahora + 180_000);

  try {
    const { equipos, historial } = await listar(cids);

    if (body?.modo === "plan") {
      return NextResponse.json({ success: true, plan: await planDeFlota(equipos, historial) });
    }

    if (body?.modo === "diagnostico") {
      const equipo = equipos.find((e) => e.id === Number(body?.equipo_id));
      if (!equipo) return NextResponse.json({ error: "No encontramos ese equipo" }, { status: 404 });
      const falla = String(body?.falla || "").trim().slice(0, MAX.falla);
      if (falla.length < 5) {
        return NextResponse.json({ error: "Describe la falla para que la IA la pueda diagnosticar" }, { status: 400 });
      }
      return NextResponse.json({ success: true, diagnostico: await diagnosticar(equipo, falla, historial) });
    }

    if (body?.modo === "pregunta") {
      const pregunta = String(body?.pregunta || "").trim().slice(0, MAX.pregunta);
      if (pregunta.length < 3) return NextResponse.json({ error: "Escribe la pregunta" }, { status: 400 });
      return NextResponse.json({ success: true, respuesta: await responder(pregunta, equipos, historial) });
    }

    return NextResponse.json({ error: "modo invalido" }, { status: 400 });
  } catch (error: any) {
    if (error instanceof IaNoDisponible) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("Error en el asistente de mantenimiento:", error);
    return NextResponse.json({ error: "La IA no pudo responder ahora. Intenta de nuevo." }, { status: 500 });
  } finally {
    enCurso.set(usuario, Date.now() + ESPERA_MS);
  }
}
