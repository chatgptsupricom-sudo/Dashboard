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
import { usePathname } from "next/navigation";
import { useEffect } from "react";

// Rutas públicas: las ve un cliente final sin sesión, así que no tiene sentido
// pedirle /api/auth/verify ni mostrarle el spinner de "sincronizando sesión"
// mientras esa llamada falla.
const RUTAS_PUBLICAS = ["/servicio-tecnico"];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isLoading, initializeFromToken } = useAuthStore();
  const pathname = usePathname();
  const esPublica = RUTAS_PUBLICAS.some((ruta) => pathname?.includes(ruta));

  useEffect(() => {
    if (esPublica) return;
    initializeFromToken();
  }, [initializeFromToken, esPublica]);

  if (esPublica) {
    return <>{children}</>;
  }

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  return <>{children}</>;
}
