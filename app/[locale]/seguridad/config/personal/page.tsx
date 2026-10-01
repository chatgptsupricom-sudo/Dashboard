import CatalogoPersonal from "@/components/seguridad/CatalogoPersonal";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // Seguridad administra solo a su gente; el personal de RMA lo carga RMA
  // desde /rma/personal.
  return <CatalogoPersonal rol="seguridad" volverA={`/${locale}/seguridad/ingreso`} />;
}
