import { redirect } from "next/navigation";

// El ingreso de mercancia por factura de compra ya no se registra: ahora es
// por packing list (Compras lo carga, Almacen lo recibe en
// /seguridad/mercancia/recepcion). El listado de ingresos queda solo para
// consultar los registros anteriores.
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}/seguridad/mercancia/ingreso`);
}
