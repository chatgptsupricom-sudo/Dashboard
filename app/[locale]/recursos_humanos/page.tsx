import { redirect } from "next/navigation";

/** Inicio del rol Recursos Humanos: por ahora, la matriz de selección de personal. */
export default async function RecursosHumanosPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}/recursos_humanos/seleccion`);
}
