import { FormularioRutagrama } from "@/components/rutagrama/FormularioRutagrama";

/** Rutagrama del nuevo ingreso: /<idioma>/mi-ruta/<token> (lib/rutagrama/). */
export default async function MiRutaPage({ params }: { params: Promise<{ token: string }> }) {
  return <FormularioRutagrama token={(await params).token} />;
}
