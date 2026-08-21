import { jwtVerify } from "jose";
import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { routing } from "./i18n.config";

const intlMiddleware = createMiddleware(routing);

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "GzC8WCMdNfmi9qX7Oj01U/FTwaOAOwMh5EYE8VukFM8=",
);

export default async function middleware(request: NextRequest) {
  const response = intlMiddleware(request);
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("token")?.value;
  const locale = pathname.split("/")[1] || "es";

  // Agregamos /recursos_humanos y /compras a las rutas protegidas
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
    pathname.includes("/administracion");

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
