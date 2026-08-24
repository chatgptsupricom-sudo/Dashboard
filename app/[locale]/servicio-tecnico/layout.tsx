// Layout del portal público de Servicio Técnico.
// A diferencia del panel administrativo, esto lo ve un cliente final sin
// sesión: no lleva sidebar, ni topbar de la app, ni nada que dependa del
// usuario autenticado. El diseño replica supricom.com.ve (ver globals.css,
// bloque .portal-supricom).
import { PortalFooter } from "@/components/servicio-tecnico/portal-footer";
import { PortalHeader } from "@/components/servicio-tecnico/portal-header";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Manrope, Syne } from "next/font/google";

const syne = Syne({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-syne",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-manrope",
  display: "swap",
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "servicioTecnico" });

  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

export default async function ServicioTecnicoLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  return (
    <div
      className={`${syne.variable} ${manrope.variable} portal-supricom flex min-h-screen flex-col`}
    >
      <PortalHeader locale={locale} />
      <main className="flex-1">{children}</main>
      <PortalFooter />
    </div>
  );
}
