import RecepcionFactura from "@/components/recepcion/RecepcionFactura";

// Almacen: recibir con la factura la mercancia que vendio otra sede (Valencia -> Caracas).
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <RecepcionFactura base={`/${locale}/seguridad/mercancia/recepcion`} />;
}
