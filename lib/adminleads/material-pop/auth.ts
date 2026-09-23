import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";

/**
 * Guard para el módulo Material POP.
 *
 * Acceso exclusivo para:
 * - superAdmin
 * - adminLeads con cids = 9 (Valencia)
 */
export async function requireAdminLeadsValencia(
  request: NextRequest,
): Promise<{ payload?: any; error?: NextResponse }> {
  const auth = await requireRoles(request, ["adminleads"]);
  if (auth.error) return auth;

  const payload = auth.payload!;
  const userRole = String(payload.role || "").toLowerCase().trim();

  if (userRole === "superadmin") {
    return { payload };
  }

  const cids = Number(payload.cids);
  if (userRole === "adminleads" && cids === 9) {
    return { payload };
  }

  return {
    error: NextResponse.json(
      { error: "Este módulo solo está disponible para AdminLeads de Valencia" },
      { status: 403 },
    ),
  };
}

/**
 * Resuelve el cids de la sesión.
 * superAdmin => null (ve todo).
 * adminLeads => 9.
 */
export function resolveMaterialPopCids(payload: any): number | null {
  const userRole = String(payload.role || "").toLowerCase().trim();
  if (userRole === "superadmin") return null;
  return 9;
}

/**
 * Guard para la vista de solicitudes del vendedor.
 *
 * Mismo corte por sede que el módulo: solo Valencia (cids 9). superAdmin entra
 * para poder probar.
 */
export async function requireVendedorValencia(
  request: NextRequest,
): Promise<{ payload?: any; error?: NextResponse }> {
  const auth = await requireRoles(request, ["vendedor", "seller"]);
  if (auth.error) return auth;

  const payload = auth.payload!;
  const userRole = String(payload.role || "").toLowerCase().trim();
  if (userRole === "superadmin") return { payload };

  if (Number(payload.cids) === 9) return { payload };

  return {
    error: NextResponse.json(
      { error: "Material POP solo está disponible para vendedores de Valencia" },
      { status: 403 },
    ),
  };
}

/**
 * Lectura del catálogo: la necesitan el adminLeads que administra el módulo y
 * el vendedor que arma una solicitud. Solo para GET; todo lo que escribe sigue
 * pidiendo `requireAdminLeadsValencia`.
 */
export async function requireLecturaMaterialPop(
  request: NextRequest,
): Promise<{ payload?: any; error?: NextResponse }> {
  const comoAdmin = await requireAdminLeadsValencia(request);
  if (!comoAdmin.error) return comoAdmin;

  const comoVendedor = await requireVendedorValencia(request);
  if (!comoVendedor.error) return comoVendedor;

  return comoAdmin;
}
