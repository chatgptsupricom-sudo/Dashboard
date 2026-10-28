import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { jwtSecretBytes } from "@/lib/secretos";
import { respuestaSesionTerminada, sesionVigente } from "@/lib/auth/vigencia";
import { esEscrituraBI, esRolBI, MENSAJE_SOLO_LECTURA_BI, ROL_BI } from "@/lib/auth/inteligenciaNegocio";
import { esEscrituraMarketingElectro, esRolMarketingElectro } from "@/lib/auth/marketingElectro";

/**
 * Guard genérico por rol para las rutas de API.
 *
 * El `matcher` del middleware excluye /api, así que ninguna ruta de API está
 * protegida por defecto: cada una tiene que pedir su guard explícitamente.
 * Esto vive en un solo lugar porque la vez que estuvo copiado en 15 archivos
 * se olvidó en uno (`/api/seguridad/almacenistas`, que quedó devolviendo
 * nombres de empleados a cualquiera).
 *
 * Los roles se comparan en minúsculas y sin espacios, igual que en
 * `middleware.ts`, porque los strings de `UserRole` tienen casing
 * inconsistente. `superadmin` entra siempre.
 */
const JWT_SECRET = jwtSecretBytes();

async function verificarSesion(
  request: NextRequest,
): Promise<{ payload?: any; error?: NextResponse }> {
  const token = request.cookies.get("token")?.value;
  if (!token) {
    return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  }

  let payload: any;
  try {
    payload = (await jwtVerify(token, JWT_SECRET)).payload;
  } catch {
    return { error: NextResponse.json({ error: "Token invalido" }, { status: 401 }) };
  }

  // La firma no basta: si le quitaron o cambiaron el rol, el token viejo deja
  // de servir aunque no haya vencido (ver lib/auth/vigencia.ts).
  if (!(await sesionVigente(payload))) {
    return { error: respuestaSesionTerminada() };
  }
  return { payload };
}

/**
 * Roles que manejan Leads: AdminLeads y Gerencia de Operaciones, que el
 * middleware deja entrar a /adminleads y tiene el desplegable "Leads" en el
 * menú. Las APIs de esas pantallas tienen que aceptar a los dos: con solo
 * "adminleads", Gerencia de Operaciones veía "Error 403" en el Dashboard Leads.
 * Inteligencia de Negocio también tiene el desplegable, solo para leer
 * (requireRoles le corta lo que escribe).
 */
export const ROLES_LEADS = ["adminleads", "gerente de operaciones", ROL_BI];

export async function requireRoles(
  request: NextRequest,
  roles: string[],
  opciones: {
    /** El handler no escribe aunque sea POST (ej. armar un .zip): BI puede llamarlo. */
    soloLee?: boolean;
    /**
     * Lo que se escribe es de Inteligencia de Negocio (ej. la Clasificación de
     * productos y clientes, lib/inteligencia-negocio/clasificacion): BI sí escribe.
     */
    escribeBI?: boolean;
  } = {},
): Promise<{ payload?: any; error?: NextResponse }> {
  const sesion = await verificarSesion(request);
  if (sesion.error) return sesion;

  const userRole = ((sesion.payload!.role as string) || "").toLowerCase().trim();
  const permitidos = roles.map((r) => r.toLowerCase().trim());
  // Marketing y Electrodomésticos entra donde entra BI (ROLES_BI).
  const comoBI = esRolBI(userRole) && permitidos.includes(ROL_BI);
  if (userRole !== "superadmin" && !permitidos.includes(userRole) && !comoBI) {
    return {
      error: NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 }),
    };
  }
  // Inteligencia de Negocio entra a leer: aunque la ruta lo liste (el mismo
  // guard suele cubrir GET y POST), nunca escribe.
  if (!opciones.soloLee && !opciones.escribeBI && esEscrituraBI(userRole, request.method)) {
    return { error: respuestaSoloLecturaBI() };
  }
  // Marketing y Electrodomésticos también entra solo a leer.
  if (!opciones.soloLee && esEscrituraMarketingElectro(userRole, request.method)) {
    return {
      error: NextResponse.json({ error: "Marketing y Electrodomésticos es de solo lectura" }, { status: 403 }),
    };
  }

  return sesion;
}

export function respuestaSoloLecturaBI() {
  return NextResponse.json({ error: MENSAJE_SOLO_LECTURA_BI }, { status: 403 });
}

/**
 * Exige solo una sesion valida, sin restringir por rol.
 *
 * Para endpoints que de verdad usan varios roles distintos (ej. la pagina
 * generica de "Mis actividades" que ve casi cualquiera) enumerar los roles
 * uno por uno es fragil: los strings reales en la tabla `roles` no siempre
 * coinciden con el enum UserRole (el login acepta indistintamente
 * "vendedor" y "seller" para el mismo rol — ver app/api/auth/login/route.ts
 * — y hay mas casos de casing/alias parecidos). Enumerar `Object.values
 * (UserRole)` como sustituto de "cualquiera" deja afuera a quien tenga el
 * alias que el enum no contempla.
 */
export async function requireSession(
  request: NextRequest,
  opciones: {
    /**
     * Lo que se guarda es del propio usuario (ej. el orden de su menú), no de
     * la operación: Inteligencia de Negocio también puede.
     */
    escrituraPropia?: boolean;
  } = {},
): Promise<{ payload?: any; error?: NextResponse }> {
  const sesion = await verificarSesion(request);
  if (sesion.error) return sesion;
  // Inteligencia de Negocio es de solo lectura también en las rutas abiertas
  // a cualquier sesión (actividades, leads del vendedor...).
  // Marketing y Electrodomésticos sí escribe aquí (sus Actividades).
  const rol = sesion.payload?.role;
  if (!opciones.escrituraPropia && esEscrituraBI(rol, request.method) && !esRolMarketingElectro(rol)) {
    return { error: respuestaSoloLecturaBI() };
  }
  return sesion;
}

/**
 * Rol del token de la sesión ("" sin token o con firma inválida), sin el
 * resto de los chequeos: sirve para decidir *cómo* responder (ej. sin
 * intercompañía para BI, lib/intercompania.ts) antes de que el handler haga
 * su propio requireRoles, que es el que decide si entra.
 */
export async function rolDelToken(request: NextRequest): Promise<string> {
  const token = request.cookies.get("token")?.value;
  if (!token) return "";
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return String(payload.role || "").toLowerCase().trim();
  } catch {
    return "";
  }
}
