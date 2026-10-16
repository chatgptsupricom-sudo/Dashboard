import { FormularioNC } from "@/components/credito-clientes/formulario";
import { baseNC } from "@/lib/notas-credito/hostCliente";
import { sucursalPorSlug } from "@/lib/servicio-tecnico/sucursales";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

/**
 * El cliente pide una nota de crédito de su factura (lib/notas-credito/cliente.ts).
 * Le llega a quien preaprueba en /notas-credito del panel y él la sigue con su enlace.
 */
export default async function SolicitarNCPage({ params }: { params: Promise<{ locale: string; sucursal: string }> }) {
  const { locale, sucursal } = await params;
  const resuelta = sucursalPorSlug(sucursal);
  if (!resuelta) notFound();
  // La clave del captcha se lee en el servidor y en ejecución (ver servicio-tecnico/[sucursal]/nuevo).
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || process.env.TURNSTILE_SITE_KEY || "";
  const base = `${baseNC((await headers()).get("host"), locale)}/${resuelta.slug}`;
  return <FormularioNC locale={locale} turnstileSiteKey={turnstileSiteKey} sucursalCid={resuelta.cid} base={base} />;
}
