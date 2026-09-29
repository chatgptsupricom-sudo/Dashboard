// "use client";

// import { useAuthStore } from "@/lib/stores/auth.store";
// import { useParams, usePathname, useRouter } from "next/navigation";
// import { useEffect } from "react";

// export function AuthProvider({ children }: { children: React.ReactNode }) {
//   const { user, isAuthenticated, isLoading, initializeFromToken } =
//     useAuthStore();
//   const router = useRouter();
//   const pathname = usePathname();
//   const params = useParams();
//   const locale = params?.locale || "es";

//   // 1. Inicialización de sesión al cargar la app
//   useEffect(() => {
//     initializeFromToken();
//   }, [initializeFromToken]);

//   // 2. Lógica de Redirección Inteligente
//   useEffect(() => {
//     if (!isLoading && isAuthenticated && user) {
//       const role = user.role?.toLowerCase();

//       // Caso: Es SuperAdmin pero está en una ruta que no le pertenece (o en el login)
//       if (role === "superadmin") {
//         if (!pathname.includes("/superadmin")) {
//           router.push(`/${locale}/superadmin`);
//         }
//       }
//       // Caso: NO es SuperAdmin pero intentó entrar a /superadmin
//       else if (pathname.includes("/superadmin")) {
//         router.push(`/${locale}/dashboard`);
//       }
//     }
//   }, [user, isAuthenticated, isLoading, pathname, locale, router]);

//   // Feedback visual durante la validación de hidratación
//   if (isLoading) {
//     return (
//       <div className="flex h-screen w-full flex-col items-center justify-center bg-slate-50">
//         <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
//         <p className="mt-4 text-sm font-medium text-slate-500">
//           Sincronizando sesión...
//         </p>
//       </div>
//     );
//   }

//   return <>{children}</>;
// }
"use client";

import { useAuthStore } from "@/lib/stores/auth.store";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

// Rutas públicas: las ve un cliente final sin sesión, así que no tiene sentido
// pedirle /api/auth/verify ni mostrarle el spinner de "sincronizando sesión"
// mientras esa llamada falla.
const RUTAS_PUBLICAS = ["/servicio-tecnico"];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isLoading, user, initializeFromToken } = useAuthStore();
  const pathname = usePathname();
  const router = useRouter();
  const esPublica = RUTAS_PUBLICAS.some((ruta) => pathname?.includes(ruta));
  const esLogin = pathname?.includes("/login") ?? false;

  useEffect(() => {
    if (esPublica) return;
    initializeFromToken();
  }, [initializeFromToken, esPublica]);

  // Sin sesión se vuelve al login. El middleware ya hace esto, pero solo en
  // las rutas que enumera `isProtectedPath`, y hay pantallas fuera de esa
  // lista (/gestion/actividades, entre otras) a las que se llega desde el
  // propio menú. Ahí la página se montaba sin usuario y se quedaba clavada
  // en su texto de "Cargando...", sin error y sin salida — que es como se
  // ve una sesión vencida desde el lado de quien la está usando. El
  // middleware tampoco alcanza para el caso de un token válido cuyo
  // /api/auth/verify falla: pasa el guard y se cuelga igual.
  useEffect(() => {
    if (esPublica || esLogin || isLoading || user) return;
    const locale = pathname?.split("/")[1] || "es";
    router.replace(`/${locale}/login`);
  }, [esPublica, esLogin, isLoading, user, pathname, router]);

  if (esPublica) {
    return <>{children}</>;
  }

  // El spinner cubre también el instante entre quedarse sin usuario y que
  // el redirect de arriba se concrete, para que no asome la pantalla rota.
  if (isLoading || (!user && !esLogin)) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  return <>{children}</>;
}
