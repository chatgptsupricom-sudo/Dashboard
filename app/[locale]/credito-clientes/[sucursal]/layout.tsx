import { SucursalBadge } from "@/components/servicio-tecnico/sucursal-badge";
import { baseNC } from "@/lib/notas-credito/hostCliente";
import { sucursalPorSlug } from "@/lib/servicio-tecnico/sucursales";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

/** Valida la sucursal de la URL (valencia, caracas, panama) para todo lo que cuelga debajo. */
export default async function SucursalNCLayout({
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
      <SucursalBadge locale={locale} nombre={resuelta.nombre} cambiarHref={baseNC((await headers()).get("host"), locale)} />
      {children}
    </>
  );
}
