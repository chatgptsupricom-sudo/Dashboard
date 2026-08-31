import { getTranslations } from "next-intl/server";
import MercanciaCatalogoNombre from "@/components/seguridad/MercanciaCatalogoNombre";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seguridad.mercancia.choferes_catalogo" });

  return (
    <MercanciaCatalogoNombre
      endpoint="/api/seguridad/mercancia/catalogo/choferes"
      listKey="choferes"
      namespace="seguridad.mercancia.choferes_catalogo"
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
