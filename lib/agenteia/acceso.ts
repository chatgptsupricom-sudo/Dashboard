import { requireSession } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

/**
 * Quién usa el Agente IA, por correo. El SuperAdmin siempre (y es editor); los
 * demás, los que él habilite en Configuración (la tuerca de la pantalla), con
 * uno de dos niveles:
 *   - consultor: lee Odoo y la MySQL del panel, no toca Odoo.
 *   - editor: además prepara y confirma cambios en Odoo.
 * Se guarda en agenteia_permisos (un correo por fila, en minúsculas); la tabla
 * se crea sola. agenteia_acceso (por rol) quedó sin uso.
 */

export type Nivel = "consultor" | "editor";
export const NIVELES: Nivel[] = ["consultor", "editor"];

export const normRol = (r: unknown) => String(r ?? "").toLowerCase().trim();
export const normCorreo = (c: unknown) => String(c ?? "").toLowerCase().trim();
export const esSuperadmin = (r: unknown) => normRol(r) === "superadmin";

let tablaLista = false;
async function ensureTabla() {
  if (tablaLista) return;
  await db.execute(`
    CREATE TABLE IF NOT EXISTS agenteia_permisos (
      email VARCHAR(190) NOT NULL PRIMARY KEY,
      nivel ENUM('consultor','editor') NOT NULL,
      updated_by VARCHAR(190) NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  tablaLista = true;
}

// ponytail: caché de 30 s por proceso; un cambio de permisos tarda eso en verse
// en las APIs (guardarPermiso borra la caché al momento).
let cache: { permisos: Map<string, Nivel>; hasta: number } | null = null;

export async function permisosAgente(): Promise<Map<string, Nivel>> {
  if (cache && cache.hasta > Date.now()) return cache.permisos;
  await ensureTabla();
  const [filas] = await db.execute("SELECT email, nivel FROM agenteia_permisos");
  const permisos = new Map((filas as any[]).map((f) => [normCorreo(f.email), f.nivel as Nivel]));
  cache = { permisos, hasta: Date.now() + 30_000 };
  return permisos;
}

/** nivel = null quita el acceso. */
export async function guardarPermiso(email: string, nivel: Nivel | null, por: string) {
  await ensureTabla();
  const correo = normCorreo(email);
  if (nivel) {
    await db.execute(
      `INSERT INTO agenteia_permisos (email, nivel, updated_by) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE nivel = VALUES(nivel), updated_by = VALUES(updated_by)`,
      [correo, nivel, por],
    );
  } else {
    await db.execute("DELETE FROM agenteia_permisos WHERE email = ?", [correo]);
  }
  cache = null;
}

/** Nivel de la sesión en el agente: null = sin acceso. El SuperAdmin es editor. */
export async function nivelAgente(payload: any): Promise<Nivel | null> {
  if (esSuperadmin(payload?.role)) return "editor";
  try {
    return (await permisosAgente()).get(normCorreo(payload?.email)) ?? null;
  } catch (e: any) {
    console.error("[agenteia] no se pudo leer el acceso:", e?.message);
    return null;
  }
}

/** Sesión válida con acceso al agente (el SuperAdmin siempre). */
export async function requireAgente(
  request: NextRequest,
): Promise<{ payload?: any; nivel?: Nivel; error?: NextResponse }> {
  const s = await requireSession(request);
  if (s.error) return s;
  const nivel = await nivelAgente(s.payload);
  if (!nivel) return { error: NextResponse.json({ error: "No tienes acceso al Agente IA." }, { status: 403 }) };
  return { ...s, nivel };
}
