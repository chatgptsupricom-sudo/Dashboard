import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n.config";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";

// Layout del modulo Seguridad.
//
// Usa el MISMO DashboardLayout y el mismo sidebar que el resto del panel.
//
// Antes tenia layout y paleta propios —morado sobre fondo claro, como el
// portal publico— porque el modulo iba a vivir en su propio subdominio,
// seguridad.supricom.com.ve. Esa decision se revirtio en el issue #30: ahora
// se llega desde el panel. La apariencia se habia quedado atras, asi que
// entrar al modulo parecia salir a otra aplicacion.
//
// Se conservan las variables --portal-* porque las pantallas las usan para el
// morado de sus botones y acentos. Son un color de marca, no un layout.

export default async function SeguridadLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as any)) {
    notFound();
  }

  const messages = await getMessages({ locale });

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <div
        style={
          {
            "--portal-primary": "#741DFE",
            "--portal-primary-soft": "rgba(116, 29, 254, 0.1)",
            "--portal-muted": "#64748b",
            "--portal-line": "#e2e8f0",
            "--portal-surface-soft": "#f8fafc",
          } as React.CSSProperties
        }
      >
        <DashboardLayout>{children}</DashboardLayout>
      </div>
    </NextIntlClientProvider>
  );
}
