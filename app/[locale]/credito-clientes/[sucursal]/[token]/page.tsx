import { SeguimientoNC } from "@/components/credito-clientes/seguimiento";
import { baseNC } from "@/lib/notas-credito/hostCliente";
import { headers } from "next/headers";

/** Seguimiento de la nota de crédito que pidió el cliente, con su token. */
export default async function SeguimientoNCPage({ params }: { params: Promise<{ locale: string; sucursal: string; token: string }> }) {
  const { locale, sucursal, token } = await params;
  const base = `${baseNC((await headers()).get("host"), locale)}/${sucursal}`;
  return <SeguimientoNC locale={locale} base={base} token={token} />;
}
