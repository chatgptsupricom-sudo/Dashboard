import { query } from "@/lib/db";
import { NextResponse } from "next/server";

/**
 * Cada usuario de RMA ve solo los casos de su sede (su `cids`). El SuperAdmin
 * ve todas y elige una con `?company_id=` (selector de components/rma/SedeRma).
 * Un usuario de RMA sin sede no ve nada (falla cerrado).
 */
function sedeDelUsuario(payload: any): number | null | undefined {
  if (String(payload?.role || "").toLowerCase().trim() === "superadmin") return null;
  const cids = Number(payload?.cids);
  return Number.isFinite(cids) && cids > 0 ? cids : undefined;
}

const SIN_SEDE = () => NextResponse.json({ error: "Tu usuario no tiene sede asignada" }, { status: 403 });

/** Sede con la que filtrar: la del usuario de RMA, o la que pidió el SuperAdmin (null = todas). */
export function sedeRma(
  payload: any,
  pedida: string | null,
): { companyId: number | null; error?: undefined } | { error: NextResponse } {
  const propia = sedeDelUsuario(payload);
  if (propia === undefined) return { error: SIN_SEDE() };
  return { companyId: propia ?? (parseInt(pedida || "", 10) || null) };
}

/** Respuesta 404/403 si el caso (id o número) es de otra sede; null si se puede tocar o no existe. */
export async function casoDeOtraSede(payload: any, idOCaso: string | number): Promise<NextResponse | null> {
  const propia = sedeDelUsuario(payload);
  if (propia === null) return null;
  if (propia === undefined) return SIN_SEDE();
  const r = await query(`SELECT company_id FROM rma_cases WHERE id = ? OR case_number = ? LIMIT 1`, [idOCaso, idOCaso]);
  const caso = (r.rows as any[])[0];
  if (caso && Number(caso.company_id) !== propia) {
    return NextResponse.json({ error: "Caso no encontrado" }, { status: 404 });
  }
  return null;
}
