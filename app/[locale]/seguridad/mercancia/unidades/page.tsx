import MercanciaCatalogoUnidades from "@/components/seguridad/MercanciaCatalogoUnidades";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <MercanciaCatalogoUnidades volverA={`/${locale}/seguridad/mercancia/egreso`} />;
}
