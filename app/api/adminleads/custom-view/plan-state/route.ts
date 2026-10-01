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

function normalizarPieza(val: any) {
  return {
    checked: !!val.checked,
    moved: !!val.moved,
    colId: typeof val.colId === "string" ? val.colId.slice(0, 120) : null,
  };
}

/**
 * Aplana cualquier cantidad de envolturas `pieces` y devuelve un unico mapa
 * `{ [pieceId]: {checked, moved, colId} }`.
 *
 * La app trata el campo `pieces` de la respuesta como SU estado y al guardar lo
 * vuelve a envolver en `{ pieces: ... }`. Como el GET devolvia el objeto
 * envuelto en vez del mapa, cada guardado sumaba un nivel:
 *
 *   { pieces: { pieces: { pieces: { SEP3, SEP6 }, SEP1 } } }
 *
 * y la version vieja de esta funcion solo miraba dos niveles: aplastaba el
 * resto en una entrada basura llamada "pieces" y perdia las piezas de mas
 * abajo. De ahi que los marcados desaparecieran al recargar.
 *
 * Se recorren todos los niveles para rescatar tambien lo ya guardado asi. Ante
 * la misma pieza en dos niveles gana la mas superficial, que es la mas
 * reciente.
 */
function aplanarPiezas(src: any, out: PlanContentState["pieces"] = {}, nivel = 0) {
  if (!src || typeof src !== "object" || nivel > 20) return out;
  // 1) piezas de este nivel primero, para que ganen sobre las de mas abajo
  for (const [k, v] of Object.entries(src)) {
    if (k === "pieces") continue;
    if (pareceEntradaDePieza(v) && !(k in out)) {
      out[String(k).slice(0, 200)] = normalizarPieza(v);
    }
  }
  // 2) bajar por la envoltura
  if (src.pieces && typeof src.pieces === "object") {
    aplanarPiezas(src.pieces, out, nivel + 1);
  }
  return out;
}

function sanitizePieces(input: unknown): PlanContentState | null {
  if (!input || typeof input !== "object") return null;
  const src: any = input;

  const out: PlanContentState = { pieces: aplanarPiezas(src) };

  // Se conserva cualquier otra clave escalar de primer nivel que la app quiera
  // guardar, acotada para que el blob no crezca sin control.
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
    // `pieces` va como MAPA PLANO ({ [id]: {...} }), que es lo que la app usa
    // como su estado. Antes iba el objeto envuelto ({ pieces: { ... } }) y la
    // app lo volvia a envolver al guardar, anidando un nivel por guardado
    // hasta perder los marcados. aplanarPiezas() ademas rescata lo que quedo
    // guardado con la envoltura vieja.
    return NextResponse.json({
      pieces: aplanarPiezas(state.pieces),
      revision: state.revision,
      updatedBy: state.updatedBy,
      updatedAt: state.updatedAt,
    });
  } catch (error: any) {
    console.error("plan-state GET error:", error?.message);
    return NextResponse.json({ pieces: {}, revision: 0 });
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
      // Mapa plano, igual que el GET: es lo que la app fusiona al resolver el
      // conflicto. Devolver el objeto envuelto reiniciaba el anidamiento.
      return NextResponse.json({
        success: false,
        conflict: true,
        revision: result.revision,
        pieces: aplanarPiezas(result.pieces),
      });
    }

    if (global.io) {
      global.io.emit("plan-state-updated", {
        view,
        clientId: body?.clientId || null,
        pieces: pieces.pieces,
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
        pieces: aplanarPiezas(snapshot),
        revision: result.revision,
        by: user?.role || null,
      });
    }

    return NextResponse.json({ success: true, revision: result.revision, pieces: aplanarPiezas(snapshot) });
  } catch (error: any) {
    console.error("plan-state POST error:", error?.message);
    return NextResponse.json({ success: false, error: error?.message }, { status: 500 });
  }
}
