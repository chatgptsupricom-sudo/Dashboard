import { ReporteForm } from "@/components/servicio-tecnico/reporte-form";
import { sucursalPorSlug } from "@/lib/servicio-tecnico/sucursales";
import { notFound } from "next/navigation";

/**
 * Servicio técnico con costo para un producto comprado en Supricom: se le
 * venció la garantía o la falla no la cubre. Mismo formulario que /nuevo (con
 * factura), en modo "con_costo": deja elegir productos fuera de garantía y
 * pide aceptar que el servicio se cobra.
 */
export default async function ServicioConCostoPage({
  params,
}: {
  params: Promise<{ locale: string; sucursal: string }>;
}) {
  const { locale, sucursal } = await params;

  const sucursalResuelta = sucursalPorSlug(sucursal);
  if (!sucursalResuelta) notFound();

  // La clave del captcha se lee en el servidor y en ejecución (ver /nuevo).
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
      modoInicial="con_costo"
    />
  );
}
