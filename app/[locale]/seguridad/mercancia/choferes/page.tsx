import { redirect } from "next/navigation";

// Almacenistas y choferes ahora viven juntos en la seccion Personal de Almacen.
// Se conserva la ruta vieja para enlaces guardados.
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/seguridad/mercancia/personal`);
}
