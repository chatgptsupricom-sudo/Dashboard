import { jwtVerify } from "jose";
import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { routing } from "./i18n.config";
import { jwtSecretBytes } from "@/lib/secretos";

const intlMiddleware = createMiddleware(routing);

const JWT_SECRET = jwtSecretBytes();

/**
 * Subdominios de cara al cliente. Quien entre por acá va al portal de servicio
 * técnico, no al login del panel: es la dirección que se publica en
 * supricom.com.ve y el cliente no tiene nada que hacer en el panel interno.
 *
 * Se configura con PORTAL_HOSTS (separados por coma) para no tener que tocar
 * código al agregar o cambiar un dominio.
 */
const HOSTS_DEL_PORTAL = (
  process.env.PORTAL_HOSTS || "servicio.supricom.com.ve,soporte.supricom.com.ve"
)
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

const METODOS_ESCRITURA = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Mismo criterio que origenPermitido() en server.js (ahi para el handshake
// de Socket.io, aca para el header Origin de fetch/XHR/form): localhost,
// *.easypanel.host, *.supricom.com.ve.
function origenDePanelPermitido(origin: string): boolean {
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return (
      host === "localhost" ||
      host.endsWith(".easypanel.host") ||
      host.endsWith(".supricom.com.ve")
    );
  } catch {
    return false;
  }
}

/**
 * Defensa en profundidad contra CSRF para /api/*: el matcher de abajo
 * excluye /api del resto del middleware (auth por cookie de sesion + rol,
 * pensado para paginas), asi que hoy ninguna API tiene chequeo de Origin —
 * la unica proteccion contra un POST/PUT/PATCH/DELETE forjado desde otro
 * sitio es que la cookie de sesion usa sameSite=lax (ver
 * app/api/auth/login/route.ts). Es agregado, no reemplazo: sameSite=lax
 * sigue siendo la barrera principal.
 *
 * Solo bloquea cuando el header Origin SI viene y NO matchea el allowlist
 * — si el header no viene (curl, llamada servidor-a-servidor, navegador
 * viejo) se deja pasar, igual que origenPermitido() en server.js, para no
 * arriesgar romper trafico legitimo por un falso negativo. GET/HEAD no se
 * tocan: no hay ninguna ruta GET que mute datos (confirmado en el estudio
 * de seguridad), asi que no hay nada que este chequeo proteja ahi.
 */
function verificarOrigenApi(request: NextRequest): NextResponse {
  if (!METODOS_ESCRITURA.has(request.method.toUpperCase())) {
    return NextResponse.next();
  }
  const origin = request.headers.get("origin");
  if (!origin) return NextResponse.next();
  if (!origenDePanelPermitido(origin)) {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  }
  return NextResponse.next();
}

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/")) {
    return verificarOrigenApi(request);
  }

  const response = intlMiddleware(request);

  const host = (request.headers.get("host") || "").toLowerCase().split(":")[0];

  if (HOSTS_DEL_PORTAL.includes(host)) {
    // Raíz de un subdominio de clientes -> portal, no login.
    const esRaiz = pathname === "/" || /^\/(es|en)\/?$/.test(pathname);
    if (esRaiz) {
      const idioma = /^\/(es|en)/.test(pathname)
        ? pathname.split("/")[1]
        : "es";
      return NextResponse.redirect(
        new URL(`/${idioma}/servicio-tecnico`, request.url),
      );
    }

    // Fuera del portal, nada más existe en este dominio.
    //
    // El panel no queda expuesto —el guard de JWT ya impedía entrar— pero su
    // pantalla de login se servía completa en la dirección que se publica en
    // supricom.com.ve. Un cliente curioso llegaba al login de la empresa, y
    // quien escanee el dominio encontraba el panel.
    //
    // Se responde 404 y no 403: un 403 confirmaría que ahí hay algo.
    //
    // OJO: esto cubre las páginas. Las rutas de /api quedan fuera del matcher
    // de este middleware (ver config abajo), así que las APIs del panel siguen
    // respondiendo en este dominio. El login ya tiene su propio límite de
    // intentos; el resto sigue igual de alcanzable en panel.supricom.com.ve.
    if (!pathname.includes("/servicio-tecnico")) {
      return new NextResponse(null, { status: 404 });
    }
  }
  const token = request.cookies.get("token")?.value;
  const locale = pathname.split("/")[1] || "es";

  // Agregamos /recursos_humanos, /compras y /seguridad a las rutas protegidas
  const isProtectedPath =
    pathname.includes("/dashboard") ||
    pathname.includes("/superadmin") ||
    pathname.includes("/vendedores") ||
    pathname.includes("/adminleads") ||
    pathname.includes("/gerente_venta") ||
    pathname.includes("/gerente_operaciones") ||
    pathname.includes("/recursos_humanos") ||
    pathname.includes("/compras") ||
    pathname.includes("/rma") ||
    pathname.includes("/disenador") ||
    pathname.includes("/administracion") ||
    pathname.includes("/seguridad");

  if (isProtectedPath) {
    if (!token) {
      return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
    }

    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);

      // Aseguramos que sea string y normalizamos
      const userRole = ((payload.role as string) || "").toLowerCase().trim();
      console.log("DEBUG: Rol detectado en token:", userRole);

      // Definición clara de las constantes de rol
      const isVendedor = userRole === "vendedor" || userRole === "seller";
      const isSuperAdmin = userRole === "superadmin";
      const isAdminLeads = userRole === "adminleads";
      const isGerenciaVentas = userRole === "gerencia de ventas";
      const isGerenciaOperaciones = userRole === "gerente de operaciones";
      const isRecursosHumanos = userRole === "recursos humanos"; // Ajustado a minúsculas por el .toLowerCase()

      // Nueva constante para el rol de Compras
      const isCompras = userRole === "compras";

      // Nueva constante para el rol de RMA (Servicio Técnico)
      const isRma = userRole === "rma";
      // Nueva constante para el rol de Cuentas por Cobrar
      const isCxC = userRole === "cuentas por cobrar";
      // Nueva constante para el rol de Diseñador
      const isDisenador = userRole === "diseñador";
      // Nueva constante para Asistente de Ventas
      const isAsistenteVentas = userRole === "asistente de ventas";
      // Nueva constante para Administración
      const isAdministracion = userRole === "administración";
      // Nueva constante para el rol de Seguridad (Almacén / Control de acceso)
      const isSeguridad = userRole === "seguridad";
      // Rol Almacen (issue #42): prepara el egreso de mercancia y se lo
      // entrega a Seguridad. Vive dentro de /seguridad, no en una ruta propia
      // — sin esto, el guard de la seccion 11 lo redirige antes de llegar a
      // ninguna pantalla del modulo.
      const isAlmacen = userRole === "almacen";

      // 1. Lógica para Vendedores
      if (pathname.includes("/vendedores") && !isVendedor && !isSuperAdmin) {
        return NextResponse.redirect(
          new URL(`/${locale}/dashboard`, request.url),
        );
      }

      // 2. Lógica para SuperAdmin (solo rutas que NO son stoplight)
      if (pathname.includes("/superadmin") && !pathname.includes("/stoplight") && !isSuperAdmin) {
        return NextResponse.redirect(
          new URL(`/${locale}/dashboard`, request.url),
        );
      }

      // 2b. Lógica para Stoplight Reports (superAdmin + CxC + gerenciaventas + gerenciaoperaciones)
      if (pathname.includes("/superadmin/stoplight") && !isSuperAdmin && !isCxC && !isGerenciaVentas && !isGerenciaOperaciones) {
        return NextResponse.redirect(
          new URL(`/${locale}/dashboard`, request.url),
        );
      }

      // 3. Lógica para Gerente de Ventas (también accede Asistente de Ventas)
      if (
        pathname.includes("/gerente_venta") &&
        !isGerenciaVentas &&
        !isAsistenteVentas &&
        !isSuperAdmin
      ) {
        return NextResponse.redirect(
          new URL(`/${locale}/dashboard`, request.url),
        );
      }

      // 4. Lógica para Gerente de Operaciones
      if (
        pathname.includes("/gerente_operaciones") &&
        !isGerenciaOperaciones &&
        !isSuperAdmin
      ) {
        return NextResponse.redirect(
          new URL(`/${locale}/dashboard`, request.url),
        );
      }

      // 5. Lógica para AdminLeads
      if (pathname.includes("/adminleads") && !isAdminLeads && !isSuperAdmin && !isGerenciaOperaciones) {
        return NextResponse.redirect(
          new URL(`/${locale}/dashboard`, request.url),
        );
      }

      // 5b. Lógica para Diseñador / Productos (acceso: diseñador, adminleads de Valencia cids=9, superAdmin)
      if (pathname.includes("/disenador")) {
        const userCids = Number(payload.cids);
        if (!isDisenador && !isSuperAdmin && !(isAdminLeads && userCids === 9)) {
          return NextResponse.redirect(
            new URL(`/${locale}/dashboard`, request.url),
          );
        }
      }

      // 6. Lógica para Recursos Humanos
      if (
        pathname.includes("/recursos_humanos") &&
        !isRecursosHumanos &&
        !isSuperAdmin
      ) {
        return NextResponse.redirect(
          new URL(`/${locale}/dashboard`, request.url),
        );
      }

      // 7. Lógica para Compras
      if (pathname.includes("/compras") && !isCompras && !isSuperAdmin) {
        return NextResponse.redirect(
          new URL(`/${locale}/dashboard`, request.url),
        );
      }

      // 8. Lógica para RMA (Servicio Técnico)
      if (pathname.includes("/rma") && !isRma && !isSuperAdmin) {
        return NextResponse.redirect(
          new URL(`/${locale}/dashboard`, request.url),
        );
      }

      // 9. Lógica para Cuentas por Cobrar
      if (pathname.includes("/cuentas-por-cobrar") && !isCxC && !isSuperAdmin && !isGerenciaOperaciones) {
        return NextResponse.redirect(
          new URL(`/${locale}/dashboard`, request.url),
        );
      }

      // 10. Lógica para Administración
      if (pathname.includes("/administracion") && !isAdministracion && !isSuperAdmin) {
        return NextResponse.redirect(
          new URL(`/${locale}/dashboard`, request.url),
        );
      }

      // 11. Lógica para Seguridad (Almacén / Control de acceso)
      // El modulo vive en /seguridad y NO en el dashboard principal.
      // Por eso redirigimos al login del modulo (no al /dashboard comun).
      // Al integrarse al panel hay un solo login: /es/login. El
      // /seguridad/login dedicado se eliminó — con el módulo protegido, esa
      // ruta nunca llegaba a renderizarse (el guard de arriba redirige antes
      // de alcanzar la excepción), así que era código muerto.
      // RMA entra solo al detalle de UN ingreso (llama al cliente y verifica
      // que el acta tenga las 4 firmas y los 4 checks antes de intervenir el
      // equipo) — no al resto del modulo de Seguridad. Por eso no se suma
      // `isRma` al gate general como Almacen: eso abriria tambien el listado
      // de ingresos, despachos y mercancia, que no le corresponden.
      const esIngresoDetalleRma = /^\/(es|en)\/seguridad\/ingreso\/\d+(\/|$)/.test(pathname);
      if (
        pathname.includes("/seguridad") &&
        !isSeguridad &&
        !isAlmacen &&
        !isSuperAdmin &&
        !(isRma && esIngresoDetalleRma)
      ) {
        return NextResponse.redirect(
          new URL(`/${locale}/login`, request.url),
        );
      }
      // Ademas, si Seguridad o Almacen estan logueados e intentan entrar al
      // /dashboard comun, los devolvemos a su modulo (no tienen nada que
      // hacer ahi). El gate de arriba solo cubre entrada al modulo; este
      // cubre la salida hacia el panel general.
      //
      // Match exacto de `/dashboard` como ruta, NO `.includes()`: Almacen
      // ahora tiene su propio dashboard en /seguridad/mercancia/dashboard, que
      // TAMBIEN contiene la substring "/dashboard" — con `.includes()` esta
      // regla se disparaba sobre su propio destino y quedaba en loop infinito
      // de redirect (307 a si misma).
      //
      // Almacen NO va a `/seguridad` (ese es el home de Seguridad para RMA:
      // ingresos/despachos, con un dashboard que llama a
      // /api/seguridad/dashboard, exclusivo de Seguridad). Almacen tiene su
      // propio dashboard (KPIs de sus egresos) en /seguridad/mercancia/dashboard.
      const esDashboardComun = /^\/(es|en)\/dashboard(\/|$)/.test(pathname);
      if (esDashboardComun && isAlmacen) {
        return NextResponse.redirect(
          new URL(`/${locale}/seguridad/mercancia/dashboard`, request.url),
        );
      }
      if (esDashboardComun && isSeguridad) {
        return NextResponse.redirect(
          new URL(`/${locale}/seguridad`, request.url),
        );
      }
      // El gate de la seccion 11 deja pasar a Almacen por CUALQUIER ruta bajo
      // /seguridad (incluida la bare /seguridad), asi que no basta con
      // atajar el /dashboard -> /seguridad de arriba: si Almacen entra
      // directo a /seguridad (link viejo, favorito, historial), cae en el
      // mismo home de RMA que no le corresponde. Solo la ruta exacta, no sus
      // subrutas (/seguridad/mercancia/... si deben renderizar).
      if (/^\/(es|en)\/seguridad\/?$/.test(pathname) && isAlmacen) {
        return NextResponse.redirect(
          new URL(`/${locale}/seguridad/mercancia/dashboard`, request.url),
        );
      }
    } catch (e) {
      console.error("Error en middleware:", e);
      return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
    }
  }

  return response;
}

export const config = {
  // Las paginas siguen excluyendo /api (ese tramo del middleware es
  // auth-por-cookie con redirects, pensado para paginas). /api/:path* es un
  // segundo matcher aparte, solo para el chequeo de Origin de
  // verificarOrigenApi() — ver el branch al inicio de middleware().
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)", "/api/:path*"],
};
