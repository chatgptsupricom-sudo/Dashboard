// Rutagrama que llena el nuevo ingreso desde el enlace de RRHH (lib/rutagrama/).
// Público, con el diseño del portal de clientes (bloque .portal-supricom de globals.css).
import { PortalFooter } from "@/components/servicio-tecnico/portal-footer";
import { PortalHeader } from "@/components/servicio-tecnico/portal-header";
import type { Metadata } from "next";
import localFont from "next/font/local";

// Fuentes locales, como en los otros portales: bajarlas de Google en el build
// rompe el deploy (Turbopack, "next/font/google queries have exactly one entry").
const syne = localFont({ src: "../../fonts/syne-latin.woff2", weight: "600 800", variable: "--font-syne", display: "swap" });
const manrope = localFont({ src: "../../fonts/manrope-latin.woff2", weight: "200 800", variable: "--font-manrope", display: "swap" });

export const metadata: Metadata = {
  title: "Rutagrama | Supricom",
  description: "Tu ruta entre la casa y el trabajo, para Recursos Humanos.",
  robots: { index: false, follow: false },
};

export default async function MiRutaLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <div className={`${syne.variable} ${manrope.variable} portal-supricom flex min-h-screen flex-col`}>
      <PortalHeader locale={locale} inicio="https://supricom.com.ve" email={null} />
      <main className="flex-1">{children}</main>
      <PortalFooter email={null} />
    </div>
  );
}
