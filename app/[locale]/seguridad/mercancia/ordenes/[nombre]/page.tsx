import MercanciaOrdenDetalle from "@/components/seguridad/MercanciaOrdenDetalle";

export default async function Page({
  params,
}: {
  params: Promise<{ nombre: string }>;
}) {
  const { nombre } = await params;
  return <MercanciaOrdenDetalle nombre={decodeURIComponent(nombre)} />;
}
