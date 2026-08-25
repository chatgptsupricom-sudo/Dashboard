import { LoginPage } from "@/components/auth/login-page";

// Login del modulo Seguridad (Almacén / Control de acceso).
// Reusa el componente de login del panel. El LoginForm ya está configurado
// para redirigir al rol "seguridad" a /seguridad (ver components/auth/login-form.tsx).
export default function SeguridadLoginPage() {
  return <LoginPage />;
}