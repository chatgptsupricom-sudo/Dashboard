import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";

/**
 * Roles (además de superadmin) que pueden abrir los modales de detalle del
 * grupo Ventas del Stoplight (`/api/superadmin/stoplight/*-detail`).
 *
 * Gerencia de Ventas solo ve el grupo Ventas, pero es justamente el rol que
 * más usa estos detalles. Cuando se cerró el IDOR de estas rutas (83176726)
 * quedó afuera por error y todos sus modales de Ventas devolvían 403 -> "No
 * hay datos disponibles".
 */
export const ROLES_DETALLE_VENTAS = ["gerente de operaciones", "gerencia de ventas"];

export interface AccesoStoplight {
  payload: any;
  rol: string;
  /**
   * Empresa a consultar. Solo superadmin puede elegirla con `?company_id=`;
   * el resto queda fijo en la empresa de su token, igual que la ruta
   * principal del Stoplight (si no, cualquiera podría leer otra sede
   * cambiando el parámetro).
   */
  companyId: number;
  error?: undefined;
}

export async function accesoStoplight(
  request: NextRequest,
  roles: string[] = ROLES_DETALLE_VENTAS,
): Promise<AccesoStoplight | { error: NextResponse }> {
  const auth = await requireRoles(request, roles);
  if (auth.error) return { error: auth.error };

  const payload = auth.payload;
  const rol = String(payload.role || "").toLowerCase().trim();
  const param = parseInt(request.nextUrl.searchParams.get("company_id") || "", 10);
  const companyId = rol === "superadmin" && Number.isFinite(param) ? param : Number(payload.cids);

  return { payload, rol, companyId };
}
