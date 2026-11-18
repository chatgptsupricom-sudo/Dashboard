import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { veTodasLasSedes } from "@/lib/auth/inteligenciaNegocio";
import { sedeDelToken } from "@/lib/auth/sedeRol";
import { marcasDeLaSesion } from "@/lib/gerente-marca/asignaciones";
import { productosDelAlcance } from "@/lib/gerente-marca/datos";
import { claveMarca } from "@/lib/metas-marca/marcas";
import {
  ROLES_ROTACION,
  ROL_COMPRAS,
  SEDES_GERENTE_ROTACION,
  editaRotacion,
  esGerenteMarca,
  gestionaSolicitudes,
  veSoloSuSede,
} from "@/lib/rotacion-inventario/acceso";
import { SEDES_ROTACION } from "@/lib/rotacion-inventario/tipos";

/**
 * Guard de las APIs de la Rotación de inventario (reglas en acceso.ts): qué
 * sedes y qué productos/marcas ve la sesión. `roles` cambia para las
 * escrituras (Compras, Gerente de Marca).
 */
export interface Alcance {
  payload: any;
  rol: string;
  usuario: string;
  sedesPermitidas: number[];
  eligeSede: boolean;
  /** null = todas las marcas; si no, claves de `claveMarca` (Gerente de Marca). */
  marcas: string[] | null;
  /** null = todos los productos; si no, ids de las marcas del Gerente de Marca. */
  productos: Set<number> | null;
  puedeEditar: boolean;
  puedeGestionarSolicitudes: boolean;
}

const TODAS = SEDES_ROTACION.map((s) => s.id as number);

export async function alcanceRotacion(
  request: NextRequest,
  roles: string[] = ROLES_ROTACION,
): Promise<{ error: NextResponse } | ({ error?: undefined } & Alcance)> {
  const auth = await requireRoles(request, roles);
  if (auth.error) return { error: auth.error };
  const payload = auth.payload;
  const rol = String(payload?.role || "").toLowerCase().trim();
  const usuario = String(payload?.name || payload?.email || "usuario").slice(0, 255);

  let sedesPermitidas = TODAS;
  let marcas: string[] | null = null;
  let productos: Set<number> | null = null;
  if (esGerenteMarca(rol)) {
    sedesPermitidas = SEDES_GERENTE_ROTACION;
    const asignaciones = await marcasDeLaSesion(payload);
    marcas = [...new Set(asignaciones.map((a) => claveMarca(a.marca)))];
    productos = new Set((await productosDelAlcance(asignaciones)).keys());
  } else if (veSoloSuSede(rol)) {
    const sede = sedeDelToken(payload);
    if (!sede) return { error: NextResponse.json({ error: "Tu usuario no tiene sede asignada." }, { status: 403 }) };
    sedesPermitidas = [sede];
  }

  return {
    payload,
    rol,
    usuario,
    sedesPermitidas,
    eligeSede: sedesPermitidas.length > 1 && (veTodasLasSedes(rol) || rol === ROL_COMPRAS || esGerenteMarca(rol)),
    marcas,
    productos,
    puedeEditar: editaRotacion(rol),
    puedeGestionarSolicitudes: gestionaSolicitudes(rol),
  };
}

/** `?sede=9|10|7|todas` recortado a lo permitido; [] = sede inválida. */
export function sedesPedidas(a: Alcance, pedida: string | null): number[] {
  if (!pedida || pedida === "todas") return a.sedesPermitidas;
  const n = Number(pedida);
  return a.sedesPermitidas.includes(n) ? [n] : [];
}

/** El Gerente de Marca solo toca solicitudes de sus marcas y sedes. */
export function puedeVerSolicitud(a: Alcance, s: { companyId: number; marca: string }): boolean {
  if (!a.sedesPermitidas.includes(s.companyId)) return false;
  return !a.marcas || a.marcas.includes(s.marca);
}
