import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/roles";
import { query } from "@/lib/db";

/**
 * Acceso a la planificación de visitas:
 *  - Vendedor ("seller"/"vendedor"): solo su propio plan, puede editarlo.
 *  - Gerencia de Ventas y superadmin: cualquier asesor de su sede; además
 *    marcan las visitas como realizadas.
 *  - Gerente de operaciones: solo lectura.
 */
export type RolPlan = "vendedor" | "gerencia" | "lectura";

export interface AccesoPlan {
  payload: any;
  rol: RolPlan;
  companyId: number;
  uid: number;
  usuario: string;
  error?: undefined;
}

export async function accesoPlanificacion(request: NextRequest): Promise<AccesoPlan | { error: NextResponse }> {
  const sesion = await requireSession(request);
  if (sesion.error) return { error: sesion.error };
  const payload = sesion.payload;
  const role = String(payload.role || "").toLowerCase().trim();
  const rol: RolPlan | null =
    role === "seller" || role === "vendedor" ? "vendedor"
    : role === "gerencia de ventas" || role === "superadmin" ? "gerencia"
    : role === "gerente de operaciones" ? "lectura"
    : null;
  if (!rol) return { error: NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 }) };

  const param = parseInt(request.nextUrl.searchParams.get("company_id") || "", 10);
  const companyId = role === "superadmin" && Number.isFinite(param) ? param : Number(payload.cids) || 9;
  return {
    payload, rol, companyId,
    uid: Number(payload.uid),
    usuario: String(payload.email || payload.name || payload.uid || ""),
  };
}

/** Asesores activos de la sede (con usuario de Odoo). */
export async function asesoresDeSede(companyId: number): Promise<{ userId: number; nombre: string }[]> {
  const r = await query(
    "SELECT name, user_id FROM sellers WHERE cids = ? AND activo = 1 AND user_id IS NOT NULL ORDER BY name",
    [companyId],
  );
  return (r.rows as any[]).map((s) => ({ userId: Number(s.user_id), nombre: s.name }));
}
