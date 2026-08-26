import { ReporteForm } from "@/components/servicio-tecnico/reporte-form";

export default async function NuevoReportePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // La clave del sitio se lee AQUÍ, en el servidor y en ejecución, y se pasa
  // como prop. Depender de que Next la incruste en el bundle exige declararla
  // como ARG en el Dockerfile, y si alguien lo olvida el captcha desaparece sin
  // ningún error: la variable está puesta, el deploy sale bien y el widget
  // simplemente no existe. Peor aún, el servidor sí lo exige, así que el
  // formulario queda imposible de enviar.
  const turnstileSiteKey =
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ||
    process.env.TURNSTILE_SITE_KEY ||
    "";

  return <ReporteForm locale={locale} turnstileSiteKey={turnstileSiteKey} />;
}
