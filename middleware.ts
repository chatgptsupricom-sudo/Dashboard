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

export default async function middleware(request: NextRequest) {
  const response = intlMiddleware(request);
  const { pathname } = request.nextUrl;

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
      if (pathname.includes("/seguridad") && !isSeguridad && !isAlmacen && !isSuperAdmin) {
        return NextResponse.redirect(
          new URL(`/${locale}/login`, request.url),
        );
      }
      // Ademas, si Seguridad o Almacen estan logueados e intentan entrar al
      // /dashboard comun, los devolvemos a su modulo (no tienen nada que
      // hacer ahi). El gate de arriba solo cubre entrada al modulo; este
      // cubre la salida hacia el panel general.
      //
      // Almacen NO va a `/seguridad` (ese es el home de Seguridad para RMA:
      // ingresos/despachos, con un dashboard que llama a
      // /api/seguridad/dashboard, exclusivo de Seguridad). Almacen solo tiene
      // una pantalla — el egreso de mercancia — asi que va directo ahi.
      if (pathname.includes("/dashboard") && isAlmacen) {
        return NextResponse.redirect(
          new URL(`/${locale}/seguridad/mercancia/egreso`, request.url),
        );
      }
      if (pathname.includes("/dashboard") && isSeguridad) {
        return NextResponse.redirect(
          new URL(`/${locale}/seguridad`, request.url),
        );
      }
      // El gate de la seccion 11 deja pasar a Almacen por CUALQUIER ruta bajo
      // /seguridad (incluida la bare /seguridad), asi que no basta con
      // atajar el /dashboard -> /seguridad de arriba: si Almacen entra
      // directo a /seguridad (link viejo, favorito, historial), cae en el
      // mismo home de RMA que no le corresponde. Solo la ruta exacta, no sus
      // subrutas (/seguridad/mercancia/egreso si debe renderizar).
      if (/^\/(es|en)\/seguridad\/?$/.test(pathname) && isAlmacen) {
        return NextResponse.redirect(
          new URL(`/${locale}/seguridad/mercancia/egreso`, request.url),
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
  // Excluimos las rutas que no queremos que pase por el middleware
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
