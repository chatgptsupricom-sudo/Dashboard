import { getTranslations } from "next-intl/server";
import MercanciaCatalogoNombre from "@/components/seguridad/MercanciaCatalogoNombre";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seguridad.mercancia.almacenistas_catalogo" });

  return (
    <MercanciaCatalogoNombre
      endpoint="/api/seguridad/mercancia/catalogo/almacenistas"
      listKey="almacenistas"
      titulo={t("titulo")}
      subtitulo={t("subtitulo")}
      campoLabel={t("campo")}
      campoPlaceholder={t("campo_ph")}
      vacioTexto={t("vacio")}
      errorTexto={t("error")}
      volverA={`/${locale}/seguridad/mercancia/egreso`}
    />
  );
}
