import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n.config";

// Layout dedicado del modulo Seguridad.
// NO usa el DashboardLayout del dashboard: este modulo vive aparte, con su
// propio header, sin sidebar del panel principal.
//
// Estetica consistente con el portal publico de servicio tecnico:
// morado #741DFE, Manrope 600, radio 10px, mobile-first.

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
        className="min-h-screen bg-slate-50/50"
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
        {children}
      </div>
    </NextIntlClientProvider>
  );
}