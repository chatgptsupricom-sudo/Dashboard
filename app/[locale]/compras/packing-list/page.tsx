import RecepcionLista from "@/components/recepcion/RecepcionLista";

// Compras: los packing list que carga y como va cada recepcion (en vivo).
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <RecepcionLista base={`/${locale}/compras/packing-list`} />;
}
