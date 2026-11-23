// Panel de actividades: lista ("Mi día" y Tablero) y alta.
// GET ?vista=mias|asignadas|persona&userId=  → { actividades, personas, permisos }
// POST { title, description?, due_date?, priority?, checklist?, user_id? }
import { requireSession } from "@/lib/auth/roles";
import {
  alcanceDe,
  crear,
  ErrorActividad,
  listar,
  personasVisibles,
  veEquipo,
  type Vista,
} from "@/lib/actividades/datos";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function error(e: unknown) {
  if (e instanceof ErrorActividad) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error("[activities/panel]", e);
  return NextResponse.json({ error: "Error en actividades" }, { status: 500 });
}

export async function GET(req: NextRequest) {
  const auth = await requireSession(req);
  if (auth.error) return auth.error;
  try {
    const a = alcanceDe(auth.payload);
    const sp = req.nextUrl.searchParams;
    const v = sp.get("vista");
    const vista: Vista = v === "asignadas" || v === "persona" ? v : "mias";
    const userId = Number(sp.get("userId")) || undefined;
    const actividades = await listar(a, vista, userId);
    if (actividades === null) {
      return NextResponse.json({ error: "No puedes ver las actividades de esa persona" }, { status: 403 });
    }
    const personas = veEquipo(a) || a.puedeAsignar ? await personasVisibles(a) : [];
    return NextResponse.json({
      actividades,
      personas,
      permisos: {
        yo: a.yo,
        veEquipo: veEquipo(a),
        puedeAsignar: a.puedeAsignar,
        soloLee: a.soloLee,
      },
    });
  } catch (e) {
    return error(e);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireSession(req);
  if (auth.error) return auth.error;
  try {
    const body = await req.json().catch(() => ({}));
    const actividad = await crear(alcanceDe(auth.payload), body ?? {});
    return NextResponse.json({ actividad });
  } catch (e) {
    return error(e);
  }
}
