// "use client";

// import type { AuthUser } from "@/lib/types";
// import Cookies from "js-cookie";
// import { create } from "zustand";
// import { persist } from "zustand/middleware";

// interface AuthStore {
//   user: AuthUser | null;
//   token: string | null;
//   isLoading: boolean;
//   isAuthenticated: boolean;
//   setUser: (user: AuthUser | null) => void;
//   setToken: (token: string | null) => void;
//   setLoading: (loading: boolean) => void;
//   logout: () => void;
//   initializeFromToken: (token: string) => Promise<void>;
// }

// export const useAuthStore = create<AuthStore>()(
//   persist(
//     (set, get) => ({
//       user: null,
//       token: null,
//       isLoading: true,
//       isAuthenticated: false,

//       setUser: (user) => {
//         set({ user, isAuthenticated: !!user });
//       },

//       setToken: (token) => {
//         set({ token });
//         if (token) {
//           Cookies.set("token", token, {
//             secure: process.env.NODE_ENV === "production",
//             sameSite: "Lax",
//             expires: 7,
//             path: "/",
//           });
//         } else {
//           Cookies.remove("token");
//         }
//       },

//       setLoading: (loading) => {
//         set({ isLoading: loading });
//       },

//       logout: () => {
//         set({
//           user: null,
//           token: null,
//           isAuthenticated: false,
//         });
//         Cookies.remove("token");
//       },

//       // initializeFromToken: async (token: string) => {
//       //   try {
//       //     const response = await fetch("/api/auth/verify", {
//       //       headers: {
//       //         Authorization: `Bearer ${token}`,
//       //       },
//       //     });

//       //     if (response.ok) {
//       //       const data = await response.json();
//       //       set({
//       //         user: data.user,
//       //         token,
//       //         isAuthenticated: true,
//       //       });
//       //     } else {
//       //       // CORREGIDO: Limpieza consistente si el token no es válido
//       //       set({
//       //         user: null,
//       //         token: null,
//       //         isAuthenticated: false,
//       //       });
//       //       Cookies.remove("token"); // Antes decía 'authToken'
//       //     }
//       //   } catch (error) {
//       //     console.error("Error verifying token:", error);
//       //     set({
//       //       user: null,
//       //       token: null,
//       //       isAuthenticated: false,
//       //     });
//       //     Cookies.remove("token");
//       //   }
//       // },
//       // lib/stores/auth.store.ts
//       initializeFromToken: async () => {
//         set({ isLoading: true });
//         try {
//           const res = await fetch("/api/auth/verify", {
//             method: "GET",
//             headers: { "Content-Type": "application/json" },
//             credentials: "include", // <--- ESTO ES LO QUE TE FALTA. Sin esto, la cookie no viaja.
//           });

//           if (res.ok) {
//             const data = await res.json();
//             // Al hacer este 'set', Zustand disparará un renderizado en todos los componentes
//             // que usen useAuthStore (como tu Sidebar)
//             set({ user: data.user, isAuthenticated: true, isLoading: false });
//           } else {
//             set({ user: null, isAuthenticated: false, isLoading: false });
//           }
//         } catch (error) {
//           set({ user: null, isAuthenticated: false, isLoading: false });
//         }
//       },
//     }),
//     {
//       name: "auth-storage",
//     },
//   ),
// );
"use client";

import type { AuthUser } from "@/lib/types";
import Cookies from "js-cookie";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthStore {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  setUser: (user: AuthUser | null) => void;
  setToken: (token: string | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
  initializeFromToken: () => Promise<void>; // Ajustado: ya no necesita token por parámetro
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isLoading: true, // Empezamos en true
      isAuthenticated: false,

      setUser: (user) => set({ user, isAuthenticated: !!user }),

      setToken: (token) => {
        set({ token });
        if (token) {
          Cookies.set("token", token, {
            secure: process.env.NODE_ENV === "production",
            sameSite: "Lax",
            expires: 7,
            path: "/",
          });
        } else {
          Cookies.remove("token");
        }
      },

      setLoading: (loading) => set({ isLoading: loading }),

      logout: () => {
        set({ user: null, token: null, isAuthenticated: false });
        Cookies.remove("token");
      },

      initializeFromToken: async () => {
        // Solo verificamos si no estamos ya cargando
        set({ isLoading: true });
        try {
          const res = await fetch("/api/auth/verify", {
            method: "GET",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
          });

          if (res.ok) {
            const data = await res.json();
            set({ user: data.user, isAuthenticated: true, isLoading: false });
          } else {
            set({ user: null, isAuthenticated: false, isLoading: false });
          }
        } catch (error) {
          set({ user: null, isAuthenticated: false, isLoading: false });
        }
      },
    }),
    {
      name: "auth-storage",
      // ESTA ES LA CLAVE PARA EL F5
      onRehydrateStorage: () => (state) => {
        // Cuando Zustand termina de leer del localStorage,
        // no marcamos isLoading como false aún, porque debemos
        // esperar a que initializeFromToken valide con el servidor.
        console.log("Zustand hidratado, iniciando validación con servidor...");
      },
    },
  ),
);
