// Layout del portal público de Servicio Técnico.
// A diferencia del panel administrativo, esto lo ve un cliente final sin
// sesión: no lleva sidebar, ni topbar de la app, ni nada que dependa del
// usuario autenticado. El diseño replica supricom.com.ve (ver globals.css,
// bloque .portal-supricom).
import { PortalFooter } from "@/components/servicio-tecnico/portal-footer";
import { PortalHeader } from "@/components/servicio-tecnico/portal-header";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import localFont from "next/font/local";

// Las fuentes van locales: bajarlas de Google en el build rompio el deploy
// (Turbopack, "next/font/google queries have exactly one entry": Syne en
// oct-2026, Manrope en nov-2026). Son variables: Syne 600-800, Manrope 200-800.
const syne = localFont({ src: "../../fonts/syne-latin.woff2", weight: "600 800", variable: "--font-syne", display: "swap" });
const manrope = localFont({ src: "../../fonts/manrope-latin.woff2", weight: "200 800", variable: "--font-manrope", display: "swap" });

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
