import { ReporteForm } from "@/components/servicio-tecnico/reporte-form";
import { sucursalPorSlug } from "@/lib/servicio-tecnico/sucursales";
import { notFound } from "next/navigation";

export default async function NuevoReportePage({
  params,
}: {
  params: Promise<{ locale: string; sucursal: string }>;
}) {
  const { locale, sucursal } = await params;

  // El layout de [sucursal] ya valida el slug antes de llegar acá; se
  // repite acá para no depender de que nadie mueva esa validación de sitio
  // el día que se refactorice el layout.
  const sucursalResuelta = sucursalPorSlug(sucursal);
  if (!sucursalResuelta) notFound();

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

  return (
    <ReporteForm
      locale={locale}
      turnstileSiteKey={turnstileSiteKey}
      sucursalCid={sucursalResuelta.cid}
      sucursalSlug={sucursalResuelta.slug}
    />
  );
}
