import { NextRequest, NextResponse } from "next/server";
import { canUploadCustomPlan, canViewCustomPlan, getAuthUser } from "@/lib/auth/customView";
import {
  addPlanHistory,
  ensurePlanTables,
  getPlanHistoryState,
  getPlanState,
  listPlanHistory,
  resolvePlanView,
  savePlanState,
  type PlanContentState,
} from "@/lib/customView/planContentStore";

declare global {
  var io: any;
}

export const dynamic = "force-dynamic";

/**
 * Estado del Plan de Contenido para el panel React (SPA).
 *
 *   GET                -> { pieces, revision, updatedBy, updatedAt }
 *   GET ?mode=history  -> { versions: [...] }
 *   PUT  { pieces, revision, clientId }
 *        -> { success, revision }  |  { conflict, revision, pieces }
 *   POST { restore: <historyId> } -> { success, revision, pieces }
 */

/** Una entrada de pieza valida: { checked?, moved?, colId? }. */
function pareceEntradaDePieza(val: unknown): boolean {
  if (!val || typeof val !== "object" || Array.isArray(val)) return false;
  const v: any = val;
  return "checked" in v || "moved" in v || "colId" in v;
}

function sanitizePieces(input: unknown): PlanContentState | null {
  if (!input || typeof input !== "object") return null;
  const src: any = input;

  // Se aceptan las dos formas del payload:
  //   anidada -> { pieces: { [id]: {...} } }   (la que devuelve el GET)
  //   plana   -> { [id]: {...} }               (el estado tal cual lo tiene la app)
  //
  // Antes solo se leia `src.pieces`: si la app mandaba la forma plana, esto
  // guardaba un estado VACIO y respondia success:true, asi que los marcados
  // desaparecian al recargar sin ningun error a la vista.
  let rawPieces: any = {};
  if (src.pieces && typeof src.pieces === "object") {
    rawPieces = src.pieces;
  } else if (Object.values(src).some(pareceEntradaDePieza)) {
    rawPieces = src;
  }
  const pieces: PlanContentState["pieces"] = {};
  for (const [id, val] of Object.entries(rawPieces)) {
    if (!val || typeof val !== "object") continue;
    const v: any = val;
    pieces[String(id).slice(0, 200)] = {
      checked: !!v.checked,
      moved: !!v.moved,
      colId: typeof v.colId === "string" ? v.colId.slice(0, 120) : null,
    };
  }
  // Se conserva cualquier otra clave de primer nivel que la app quiera guardar,
  // pero acotada para que el blob no crezca sin control.
  const out: PlanContentState = { pieces };
  for (const [k, val] of Object.entries(src)) {
    if (k === "pieces") continue;
    if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
      (out as any)[k] = val;
    }
  }
  return out;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!canViewCustomPlan(user)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    await ensurePlanTables();
    const view = resolvePlanView(request.nextUrl.searchParams.get("view"));

    if (request.nextUrl.searchParams.get("mode") === "history") {
      const versions = await listPlanHistory(view);
      return NextResponse.json({ versions });
    }

    const state = await getPlanState(view);
    return NextResponse.json({
      pieces: state.pieces,
      revision: state.revision,
      updatedBy: state.updatedBy,
      updatedAt: state.updatedAt,
    });
  } catch (error: any) {
    console.error("plan-state GET error:", error?.message);
    return NextResponse.json({ pieces: { pieces: {} }, revision: 0 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!canViewCustomPlan(user)) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    await ensurePlanTables();
    const view = resolvePlanView(request.nextUrl.searchParams.get("view"));
    const body = await request.json().catch(() => null);
    const pieces = sanitizePieces(body?.pieces);
    if (!pieces) {
      return NextResponse.json({ success: false, error: "Estado invalido" }, { status: 400 });
    }

    // Si la app mando algo pero no sobrevivio ninguna pieza, el contrato del
    // payload cambio: se avisa en el log en vez de guardar vacio en silencio.
    const recibidas = body?.pieces && typeof body.pieces === "object"
      ? Object.keys(body.pieces.pieces ?? body.pieces).length
      : 0;
    if (recibidas > 0 && Object.keys(pieces.pieces).length === 0) {
      console.error(
        "plan-state PUT: llegaron",
        recibidas,
        "claves pero ninguna es una pieza valida; no se guarda para no borrar el plan.",
        JSON.stringify(body?.pieces).slice(0, 300),
      );
      return NextResponse.json(
        { success: false, error: "Formato de estado no reconocido" },
        { status: 400 },
      );
    }

    const expectedRevision = Number(body?.revision);
    const result = await savePlanState({
      view,
      pieces,
      expectedRevision,
      updatedBy: user?.role || null,
    });

    if (!result.ok) {
      return NextResponse.json({
        success: false,
        conflict: true,
        revision: result.revision,
        pieces: result.pieces,
      });
    }

    if (global.io) {
      global.io.emit("plan-state-updated", {
        view,
        clientId: body?.clientId || null,
        pieces,
        revision: result.revision,
        by: user?.role || null,
      });
    }

    return NextResponse.json({ success: true, revision: result.revision });
  } catch (error: any) {
    console.error("plan-state PUT error:", error?.message);
    return NextResponse.json({ success: false, error: error?.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    // Restaurar una version es equivalente a sobrescribir el plan del equipo:
    // se exige el mismo permiso que para subir el HTML.
    if (!canUploadCustomPlan(user)) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    await ensurePlanTables();
    const view = resolvePlanView(request.nextUrl.searchParams.get("view"));
    const body = await request.json().catch(() => null);
    const id = Number(body?.restore);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ success: false, error: "Falta restore" }, { status: 400 });
    }

    const snapshot = await getPlanHistoryState(view, id);
    if (!snapshot) {
      return NextResponse.json({ success: false, error: "Version no encontrada" }, { status: 404 });
    }

    const cur = await getPlanState(view);
    const result = await savePlanState({
      view,
      pieces: snapshot,
      expectedRevision: cur.revision,
      updatedBy: user?.role || null,
    });
    if (!result.ok) {
      // Alguien guardo justo ahora: se reintenta una vez contra la revision fresca.
      const retry = await savePlanState({
        view,
        pieces: snapshot,
        expectedRevision: result.revision,
        updatedBy: user?.role || null,
      });
      if (!retry.ok) {
        return NextResponse.json({ success: false, error: "Conflicto al restaurar" }, { status: 409 });
      }
      result.revision = retry.revision;
      (result as any).ok = true;
    }

    await addPlanHistory({
      view,
      revision: result.revision,
      piecesJson: JSON.stringify(snapshot),
      label: `Restaurada desde #${id}`,
      createdBy: user?.role || null,
    });

    if (global.io) {
      global.io.emit("plan-state-updated", {
        view,
        clientId: body?.clientId || null,
        pieces: snapshot,
        revision: result.revision,
        by: user?.role || null,
      });
    }

    return NextResponse.json({ success: true, revision: result.revision, pieces: snapshot });
  } catch (error: any) {
    console.error("plan-state POST error:", error?.message);
    return NextResponse.json({ success: false, error: error?.message }, { status: 500 });
  }
}
