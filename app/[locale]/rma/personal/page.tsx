import CatalogoPersonal from "@/components/seguridad/CatalogoPersonal";

// Personal de RMA: la lista de "Recibió por RMA" del ingreso. La administra
// RMA; Seguridad solo la lee para elegir en el formulario.
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <CatalogoPersonal rol="rma" volverA={`/${locale}/rma`} />;
}
