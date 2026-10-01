import RecepcionLista from "@/components/recepcion/RecepcionLista";

// Almacen: contenedores por recibir y verificar contra su packing list.
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <RecepcionLista base={`/${locale}/seguridad/mercancia/recepcion`} />;
}
