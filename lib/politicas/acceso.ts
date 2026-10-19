import { requireRoles } from "@/lib/auth/roles";
import type { Lector } from "@/lib/politicas/datos";
import { ROLES_EDITAN_POLITICAS, ROLES_POLITICAS } from "@/lib/politicas/permisos";
import { NextRequest } from "next/server";

/** Guardias de las APIs de Políticas: leer (roles administrativos) o publicar (Procesos y SuperAdmin). */
export const requireLectorPoliticas = (request: NextRequest) => requireRoles(request, ROLES_POLITICAS);
export const requireEditorPoliticas = (request: NextRequest) => requireRoles(request, ROLES_EDITAN_POLITICAS);

export const lectorDe = (payload: any): Lector => ({
  email: String(payload?.email ?? ""),
  name: String(payload?.name ?? ""),
  role: String(payload?.role ?? ""),
  cids: payload?.cids,
});

export const idValido = (v: unknown) => {
  const id = Number(v);
  return Number.isInteger(id) && id > 0 ? id : null;
};
