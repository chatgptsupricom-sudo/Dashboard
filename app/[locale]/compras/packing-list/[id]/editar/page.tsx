import PackingListForm from "@/components/recepcion/PackingListForm";

// Corregir el packing list: solo mientras el contenedor no llega (la API lo impone).
export default async function Page({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  return <PackingListForm base={`/${locale}/compras/packing-list`} id={id} />;
}
