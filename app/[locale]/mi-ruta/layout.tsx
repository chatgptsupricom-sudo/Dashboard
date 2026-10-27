// Rutagrama que llena el nuevo ingreso desde el enlace de RRHH (lib/rutagrama/).
// Público, con el diseño del portal de clientes (bloque .portal-supricom de globals.css).
import { PortalFooter } from "@/components/servicio-tecnico/portal-footer";
import { PortalHeader } from "@/components/servicio-tecnico/portal-header";
import type { Metadata } from "next";
import { Manrope, Syne } from "next/font/google";

const syne = Syne({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-syne", display: "swap" });
const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-manrope", display: "swap" });

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
