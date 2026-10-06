import MantenimientoUnidades from "@/components/seguridad/mantenimiento/MantenimientoUnidades";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <MantenimientoUnidades volverA={`/${locale}/seguridad/mercancia/unidades`} />;
}
