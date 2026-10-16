// app/[locale]/layout.tsx
import { AuthProvider } from "@/components/providers/auth-provider";
import { esHostNC } from "@/lib/notas-credito/hostCliente";
import { routing } from "@/i18n.config";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

export default async function LocaleLayout({
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
  // En el dominio de notas de crédito para clientes todo es público, aunque
  // la URL diga /notas-credito (que en el panel es una pantalla con sesión).
  const dominioPublico = esHostNC((await headers()).get("host"));

  // NOTA: Aquí ya NO van <html> ni <body>
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <AuthProvider publico={dominioPublico}>{children}</AuthProvider>
    </NextIntlClientProvider>
  );
}
