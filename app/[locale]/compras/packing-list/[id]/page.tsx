import RecepcionDetalle from "@/components/recepcion/RecepcionDetalle";

export default async function Page({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  return <RecepcionDetalle base={`/${locale}/compras/packing-list`} id={id} />;
}
