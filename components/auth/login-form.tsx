// "use client";

// import { useAuthStore } from "@/lib/stores/auth.store";
// import { motion } from "framer-motion";
// import { EyeIcon, EyeOff } from "lucide-react";
// import { useTranslations } from "next-intl";
// import { useParams, useRouter } from "next/navigation";
// import { useState } from "react";

// export function LoginForm() {
//   const t = useTranslations("auth");
//   const router = useRouter();
//   const params = useParams();
//   const locale = params?.locale || "es";

//   // Estados para los campos
//   const [email, setEmail] = useState("");
//   const [password, setPassword] = useState("");
//   const [showPassword, setShowPassword] = useState(false);
//   const [isLoading, setIsLoading] = useState(false);
//   const [error, setError] = useState("");

//   const { setUser, setToken } = useAuthStore();

//   // Función de envío corregida
//   // components/auth/login-form.tsx

//   const onFormSubmit = async (e: React.FormEvent) => {
//     e.preventDefault();
//     setIsLoading(true);
//     setError("");

//     try {
//       const res = await fetch("/api/auth/login", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ email, password }),
//       });

//       // 1. PRIMERO validamos si la respuesta tiene contenido
//       const contentType = res.headers.get("content-type");
//       if (!contentType || !contentType.includes("application/json")) {
//         const textError = await res.text();
//         console.error("El servidor no envió JSON:", textError);
//         throw new Error("Respuesta del servidor inválida");
//       }

//       // 2. AHORA sí intentamos parsear
//       const result = await res.json();

//       if (!res.ok) {
//         setError(result.error || "Error de credenciales");
//         return;
//       }

//       // Éxito
//       setToken(result.token);
//       setUser(result.user);

//       // Redirección condicional por rol
//       const rawRole = result.user.role || "";
//       const role = rawRole.toLowerCase().trim(); // .trim() elimina espacios invisibles al final

//       console.log("Rol crudo:", rawRole);
//       console.log("Rol procesado para comparar:", `"${role}"`);

//       if (role === "superadmin") {
//         router.push(`/${locale}/superadmin`);
//       } else if (role === "seller" || role === "vendedor") {
//         router.push(`/${locale}/vendedores`);
//       } else if (role === "adminleads") {
//         router.push(`/${locale}/adminleads`);
//       } else if (
//         role === "gerencia de ventas" ||
//         role === "gerencia de ventas"
//       ) {
//         router.push(`/${locale}/gerente_venta`);
//       } else if (role.includes("gerente de operaciones")) {
//         // Usamos .includes() en lugar de === para ser más flexibles
//         router.push(`/${locale}/gerente_operaciones`);
//       } else {
//         console.log("Redirigiendo a /dashboard por fallo de coincidencia");
//         router.push(`/${locale}/dashboard`);
//       }
//     } catch (err: any) {
//       console.error("Error capturado:", err.message);
//       setError("Error de conexión o fallo en el servidor");
//     } finally {
//       setIsLoading(false);
//     }
//   };

//   return (
//     <form onSubmit={onFormSubmit} className="space-y-6">
//       {/* Campo: Email */}
//       <div className="relative">
//         <input
//           type="email"
//           value={email}
//           onChange={(e) => setEmail(e.target.value)}
//           placeholder={t("email")}
//           required
//           className="w-full px-0 py-2 bg-transparent border-0 border-b border-gray-300 text-gray-800 placeholder-gray-400 focus:ring-0 focus:border-blue-500 transition-colors text-base"
//         />
//       </div>

//       {/* Campo: Contraseña */}
//       <div className="relative">
//         <input
//           type={showPassword ? "text" : "password"}
//           value={password}
//           onChange={(e) => setPassword(e.target.value)}
//           placeholder={t("password")}
//           required
//           className="w-full px-0 py-2 bg-transparent border-0 border-b border-gray-300 text-gray-800 placeholder-gray-400 focus:ring-0 focus:border-blue-500 transition-colors text-base"
//         />
//         <button
//           type="button"
//           onClick={() => setShowPassword(!showPassword)}
//           className="absolute right-0 top-2 text-gray-400 hover:text-blue-500 transition-colors"
//         >
//           {showPassword ? <EyeOff size={18} /> : <EyeIcon size={18} />}
//         </button>
//       </div>

//       {/* Enlace: Olvidé mi contraseña */}
//       {/* <div className="flex justify-end -mt-4">
//         <Link
//           href={`/${locale}/forgot-password`}
//           className="text-sm text-blue-500 hover:text-blue-600 font-medium"
//         >
//           {t("forgotPassword")}
//         </Link>
//       </div> */}

//       {/* Mensaje de Error dinámico */}
//       {error && (
//         <motion.p
//           initial={{ opacity: 0, scale: 0.95 }}
//           animate={{ opacity: 1, scale: 1 }}
//           className="text-sm text-red-500 text-center bg-red-50 py-2 rounded-md border border-red-100"
//         >
//           {error}
//         </motion.p>
//       )}

//       {/* Botón de Acción */}
//       <motion.button
//         whileHover={{ scale: 1.01 }}
//         whileTap={{ scale: 0.99 }}
//         type="submit"
//         disabled={isLoading}
//         className="w-full h-12 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
//       >
//         {isLoading ? (
//           <span className="flex items-center justify-center gap-2">
//             <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
//             {t("loading")}
//           </span>
//         ) : (
//           t("submit")
//         )}
//       </motion.button>

//       {/* Registro */}
//       {/* <p className="text-center text-sm text-gray-600">
//         {t("noAccount")}{" "}
//         <Link
//           href={`/${locale}/register`}
//           className="text-blue-600 hover:underline font-bold"
//         >
//           {t("register")}
//         </Link>
//       </p> */}
//     </form>
//   );
// }
"use client";

import { useAuthStore } from "@/lib/stores/auth.store";
import { motion } from "framer-motion";
import { EyeIcon, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const params = useParams();
  const locale = params?.locale || "es";

  // Estados para los campos
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const { setUser, setToken } = useAuthStore();

  const onFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      // 1. PRIMERO validamos si la respuesta tiene contenido
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const textError = await res.text();
        console.error("El servidor no envió JSON:", textError);
        throw new Error("Respuesta del servidor inválida");
      }

      // 2. AHORA sí intentamos parsear
      const result = await res.json();

      if (!res.ok) {
        setError(result.error || "Error de credenciales");
        return;
      }

      // Éxito
      setToken(result.token);
      setUser(result.user);

      // Redirección condicional por rol
      const rawRole = result.user.role || "";
      const role = rawRole.toLowerCase().trim(); // .trim() elimina espacios invisibles al final

      console.log("Rol crudo:", rawRole);
      console.log("Rol procesado para comparar:", `"${role}"`);

      if (role === "superadmin") {
        router.push(`/${locale}/superadmin`);
      } else if (role === "seller" || role === "vendedor") {
        router.push(`/${locale}/vendedores`);
      } else if (role === "adminleads") {
        router.push(`/${locale}/adminleads`);
      } else if (role === "gerencia de ventas") {
        router.push(`/${locale}/gerente_venta`);
      } else if (role.includes("gerente de operaciones")) {
        router.push(`/${locale}/gerente_operaciones`);
      } else if (role === "Recursos Humanos") {
        // Redirección para el nuevo rol de Recursos Humanos
        router.push(`/${locale}/recursos_humanos`);
      } else if (role === "compras") {
        router.push(`/${locale}/compras`);
      } else if (role === "cuentas por cobrar") {
        router.push(`/${locale}/cuentas-por-cobrar`);
      } else if (role === "asistente de ventas") {
        router.push(`/${locale}/gerente_venta`);
      } else if (role === "administración") {
        router.push(`/${locale}/dashboard`);
      } else if (role === "seguridad") {
        router.push(`/${locale}/seguridad`);
      } else {
        console.log("Redirigiendo a /dashboard por fallo de coincidencia");
        router.push(`/${locale}/dashboard`);
      }
    } catch (err: any) {
      console.error("Error capturado:", err.message);
      setError("Error de conexión o fallo en el servidor");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={onFormSubmit} className="space-y-6">
      {/* Campo: Email */}
      <div className="relative">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("email")}
          required
          className="w-full px-0 py-2 bg-transparent border-0 border-b border-gray-300 text-gray-800 placeholder-gray-400 focus:ring-0 focus:border-blue-500 transition-colors text-base"
        />
      </div>

      {/* Campo: Contraseña */}
      <div className="relative">
        <input
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("password")}
          required
          className="w-full px-0 py-2 bg-transparent border-0 border-b border-gray-300 text-gray-800 placeholder-gray-400 focus:ring-0 focus:border-blue-500 transition-colors text-base"
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-0 top-2 text-gray-400 hover:text-blue-500 transition-colors"
        >
          {showPassword ? <EyeOff size={18} /> : <EyeIcon size={18} />}
        </button>
      </div>

      {/* Mensaje de Error dinámico */}
      {error && (
        <motion.p
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-sm text-red-500 text-center bg-red-50 py-2 rounded-md border border-red-100"
        >
          {error}
        </motion.p>
      )}

      {/* Botón de Acción */}
      <motion.button
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        type="submit"
        disabled={isLoading}
        className="w-full h-12 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            {t("loading")}
          </span>
        ) : (
          t("submit")
        )}
      </motion.button>
    </form>
  );
}
