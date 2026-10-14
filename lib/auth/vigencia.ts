import { query } from "@/lib/db";
import { NextResponse } from "next/server";

/**
 * ¿Sigue valiendo lo que dice el token?
 *
 * El rol y la sede viajan dentro del JWT (7 días) y antes nadie los volvía a
 * mirar: si en SuperAdmin › Usuarios se le quitaba o cambiaba el rol a
 * alguien, esa persona seguía dentro con el rol viejo hasta que le vencía la
 * sesión. Aquí se compara el token con su fila de `users_config`: si ya no
 * está, o el rol o la sede cambiaron, la sesión se da por terminada y tiene
 * que volver a entrar (y el login le da lo que tenga ahora, o nada).
 *
 * No hace falta tabla ni columna nueva, y vale también para los tokens que
 * ya estaban emitidos. Volver a guardar el mismo rol (o cambiar solo el
 * nombre) no saca a nadie.
 *
 * La consulta se guarda `CACHE_MS` por usuario para no sumar un SELECT a cada
 * llamada; el POST y el DELETE de usuarios la borran con `olvidarSesion()`,
 * así que en este proceso el cambio pega al instante y como mucho tarda
 * `CACHE_MS` si lo hizo otro proceso o un UPDATE a mano.
 *
 * Si la MySQL no responde, la sesión se da por buena: la firma del token ya
 * se verificó y tumbar a todo el mundo por un problema de base de datos es
 * peor que dejar entrar 30 s de más a alguien a quien se le quitó el rol
 * (mismo criterio que `/api/auth/verify` con `sellers.activo`).
 */
const CACHE_MS = 30_000;

type Fila = { roleId: number; roleName: string; cids: string } | null;

const cache = new Map<number, { fila: Fila; hasta: number }>();

function normalizarCids(valor: unknown): string {
  return valor === null || valor === undefined || valor === "" ? "" : String(valor);
}

async function leerFila(userId: number): Promise<Fila> {
  const guardada = cache.get(userId);
  if (guardada && guardada.hasta > Date.now()) return guardada.fila;

  const res = await query(
    `SELECT uc.role_id, uc.cids, r.name AS role_name
       FROM users_config uc
       LEFT JOIN roles r ON uc.role_id = r.id
      WHERE uc.id = ?
      LIMIT 1`,
    [userId],
  );
  const row = res?.rows?.[0];
  const fila: Fila = row
    ? {
        roleId: Number(row.role_id),
        roleName: ((row.role_name as string) || "").toLowerCase().trim(),
        cids: normalizarCids(row.cids),
      }
    : null;
  cache.set(userId, { fila, hasta: Date.now() + CACHE_MS });
  return fila;
}

/** Borra lo guardado de un usuario: llamarlo después de cambiarle el rol o la sede. */
export function olvidarSesion(userId: number | string) {
  cache.delete(Number(userId));
}

export async function sesionVigente(payload: any): Promise<boolean> {
  const userId = Number(payload?.sub || payload?.userId || 0);
  // Un token sin usuario no sale del login; no hay contra qué compararlo.
  if (!userId) return true;

  let fila: Fila;
  try {
    fila = await leerFila(userId);
  } catch (error) {
    console.error(`[sesion] no se pudo leer users_config de user_id=${userId}:`, error);
    return true;
  }

  if (!fila) return false;

  if (payload.role_id !== undefined && payload.role_id !== null) {
    if (Number(payload.role_id) !== fila.roleId) return false;
  } else if (((payload.role as string) || "").toLowerCase().trim() !== fila.roleName) {
    return false;
  }

  return normalizarCids(payload.cids) === fila.cids;
}

/** 401 que además borra la cookie, para que el middleware mande al login. */
export function respuestaSesionTerminada(): NextResponse {
  const response = NextResponse.json(
    { error: "Tu acceso al panel cambió. Vuelve a iniciar sesión." },
    { status: 401 },
  );
  response.cookies.set("token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
