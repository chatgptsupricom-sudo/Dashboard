import { SucursalBadge } from "@/components/servicio-tecnico/sucursal-badge";
import { sucursalPorSlug } from "@/lib/servicio-tecnico/sucursales";
import { notFound } from "next/navigation";

/**
 * Valida el segmento de sucursal de la URL (/servicio-tecnico/valencia,
 * /panama, /caracas) una sola vez para todo lo que cuelga debajo — el
 * formulario, la consulta de ticket, la confirmación — en vez de repetir la
 * validación en cada página.
 *
 * Un slug que no es una sucursal real (typo, sucursal cerrada, lo que sea)
 * da 404 y no una pantalla rota a medio armar.
 */
export default async function SucursalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string; sucursal: string }>;
}) {
  const { locale, sucursal } = await params;
  const resuelta = sucursalPorSlug(sucursal);
  if (!resuelta) notFound();

  return (
    <>
      <SucursalBadge locale={locale} nombre={resuelta.nombre} />
      {children}
    </>
  );
}
