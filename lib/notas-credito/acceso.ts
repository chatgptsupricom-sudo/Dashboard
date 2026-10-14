import { requireSession } from "@/lib/auth/roles";
import { esSuperadmin, pasosDe } from "@/lib/notas-credito/datos";
import { autorDeSesion, type Autor } from "@/lib/notas-credito/solicitudes";
import type { PasoNC } from "@/lib/notas-credito/tipos";
import { NextRequest, NextResponse } from "next/server";

/**
 * Quién entra a /notas-credito: los responsables de algún paso en alguna sede
 * (por correo, nc_aprobadores) y el SuperAdmin, que ve todo y configura los
 * responsables pero no decide (solo aprueba quien está en "aprueba").
 */
export type AccesoNC = { autor: Autor; pasos: Record<number, PasoNC[]>; superadmin: boolean; sedes: number[] | null };

export async function accesoNC(payload: any): Promise<AccesoNC | null> {
  const autor = autorDeSesion(payload);
  const superadmin = esSuperadmin(autor.rol);
  let pasos: Record<number, PasoNC[]> = {};
  try {
    pasos = await pasosDe(autor.email);
  } catch (e: any) {
    console.error("[notas-credito] no se pudo leer los responsables:", e?.message);
  }
  const sedes = Object.keys(pasos).map(Number);
  if (!superadmin && !sedes.length) return null;
  return { autor, pasos, superadmin, sedes: superadmin ? null : sedes };
}

export async function requireNC(request: NextRequest): Promise<{ acceso?: AccesoNC; error?: NextResponse }> {
  const s = await requireSession(request);
  if (s.error) return { error: s.error };
  const acceso = await accesoNC(s.payload);
  if (!acceso) return { error: NextResponse.json({ error: "No tienes acceso a las notas de crédito." }, { status: 403 }) };
  return { acceso };
}

export function puedeVerSede(acceso: AccesoNC, companyId: number): boolean {
  return acceso.sedes === null || acceso.sedes.includes(companyId);
}
