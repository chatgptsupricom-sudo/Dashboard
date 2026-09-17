import PersonalAlmacen from "@/components/seguridad/PersonalAlmacen";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <PersonalAlmacen volverA={`/${locale}/seguridad/mercancia/egreso`} />;
}
