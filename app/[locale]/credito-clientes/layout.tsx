// Servicio de notas de crédito para clientes, aparte del portal de servicio
// técnico pero con su mismo diseño (bloque .portal-supricom de globals.css).
// En su dominio (NC_HOSTS) se ve como /<idioma>/notas-credito: ver
// lib/notas-credito/hostCliente.ts y el middleware.
import { PortalFooter } from "@/components/servicio-tecnico/portal-footer";
import { PortalHeader } from "@/components/servicio-tecnico/portal-header";
import { baseNC } from "@/lib/notas-credito/hostCliente";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import localFont from "next/font/local";
import { headers } from "next/headers";

// Las fuentes van locales: bajarlas de Google en el build rompio el deploy
// (Turbopack, "next/font/google queries have exactly one entry": Syne en
// oct-2026, Manrope en nov-2026). Son variables: Syne 600-800, Manrope 200-800.
const syne = localFont({ src: "../../fonts/syne-latin.woff2", weight: "600 800", variable: "--font-syne", display: "swap" });
const manrope = localFont({ src: "../../fonts/manrope-latin.woff2", weight: "200 800", variable: "--font-manrope", display: "swap" });

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "creditoClientes" });
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default async function CreditoClientesLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const base = baseNC((await headers()).get("host"), locale);
  return (
    <div className={`${syne.variable} ${manrope.variable} portal-supricom flex min-h-screen flex-col`}>
      <PortalHeader locale={locale} inicio={base} email={null} />
      <main className="flex-1">{children}</main>
      <PortalFooter email={null} />
    </div>
  );
}
