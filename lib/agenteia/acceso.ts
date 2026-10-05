import { requireSession } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

/**
 * Qué roles usan el Agente IA. El SuperAdmin siempre; los demás, los que él
 * habilite en la pantalla del agente (botón "Acceso"). Se guarda en
 * agenteia_acceso (un rol por fila, en minúsculas, igual que middleware.ts
 * compara los roles); la tabla se crea sola.
 *
 * Los roles habilitados leen lo mismo que el SuperAdmin (Odoo y la MySQL del
 * panel), pero no pueden preparar ni confirmar cambios en Odoo.
 */

export const normRol = (r: unknown) => String(r ?? "").toLowerCase().trim();
export const esSuperadmin = (r: unknown) => normRol(r) === "superadmin";

let tablaLista = false;
async function ensureTabla() {
  if (tablaLista) return;
  await db.execute(`
    CREATE TABLE IF NOT EXISTS agenteia_acceso (
      rol VARCHAR(80) NOT NULL PRIMARY KEY,
      updated_by VARCHAR(120) NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  tablaLista = true;
}

// ponytail: caché de 30 s por proceso; un cambio de acceso tarda eso en verse
// en las APIs (la pantalla de acceso escribe y borra la caché al momento).
let cache: { roles: string[]; hasta: number } | null = null;

export async function rolesConAgente(): Promise<string[]> {
  if (cache && cache.hasta > Date.now()) return cache.roles;
  await ensureTabla();
  const [filas] = await db.execute("SELECT rol FROM agenteia_acceso");
  const roles = (filas as any[]).map((f) => normRol(f.rol));
  cache = { roles, hasta: Date.now() + 30_000 };
  return roles;
}

export async function guardarRolesConAgente(roles: string[], por: string): Promise<string[]> {
  await ensureTabla();
  const lista = [...new Set(roles.map(normRol).filter((r) => r && r !== "superadmin"))];
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute("DELETE FROM agenteia_acceso");
    for (const rol of lista) await conn.execute("INSERT INTO agenteia_acceso (rol, updated_by) VALUES (?, ?)", [rol, por]);
    await conn.commit();
  } catch (e) {
    await conn.rollback().catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
  cache = null;
  return lista;
}

export async function puedeUsarAgente(rol: unknown): Promise<boolean> {
  if (esSuperadmin(rol)) return true;
  try {
    return (await rolesConAgente()).includes(normRol(rol));
  } catch (e: any) {
    console.error("[agenteia] no se pudo leer el acceso:", e?.message);
    return false;
  }
}

/** Sesión válida y rol habilitado para el agente (el SuperAdmin siempre). */
export async function requireAgente(request: NextRequest): Promise<{ payload?: any; error?: NextResponse }> {
  const s = await requireSession(request);
  if (s.error) return s;
  if (!(await puedeUsarAgente(s.payload?.role))) {
    return { error: NextResponse.json({ error: "Tu rol no tiene acceso al Agente IA." }, { status: 403 }) };
  }
  return s;
}
