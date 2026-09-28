import { ReporteExternoForm } from "@/components/servicio-tecnico/reporte-externo-form";
import { sucursalPorSlug } from "@/lib/servicio-tecnico/sucursales";
import { notFound } from "next/navigation";

/**
 * Servicio técnico para equipos que NO se compraron en Supricom: sin factura,
 * el cliente escribe sus datos y los del equipo. Ver
 * app/api/servicio-tecnico/externo.
 */
export default async function ReporteExternoPage({
  params,
}: {
  params: Promise<{ locale: string; sucursal: string }>;
}) {
  const { locale, sucursal } = await params;

  // Igual que en /nuevo: el layout ya valida el slug, se repite por si acaso.
  const sucursalResuelta = sucursalPorSlug(sucursal);
  if (!sucursalResuelta) notFound();

  // La clave del captcha se lee en el servidor y en ejecución (ver /nuevo).
  const turnstileSiteKey =
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ||
    process.env.TURNSTILE_SITE_KEY ||
    "";

  return (
    <ReporteExternoForm
      locale={locale}
      turnstileSiteKey={turnstileSiteKey}
      sucursalCid={sucursalResuelta.cid}
      sucursalSlug={sucursalResuelta.slug}
    />
  );
}
