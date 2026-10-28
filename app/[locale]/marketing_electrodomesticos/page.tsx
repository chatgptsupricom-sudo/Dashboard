import { redirect } from "next/navigation";

/** Inicio del rol Marketing y Electrodomésticos: las ventas de sus marcas. */
export default async function MarketingElectroPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}/marketing_electrodomesticos/ventas`);
}
