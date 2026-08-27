import MercanciaDetalle from "@/components/seguridad/MercanciaDetalle";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <MercanciaDetalle tipo="ingreso" id={id} />;
}
