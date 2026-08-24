import { PortalPlaceholder } from "@/components/servicio-tecnico/portal-placeholder";
import { getTranslations } from "next-intl/server";

export default async function ConsultarReportePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: "servicioTecnico",
  });

  return (
    <PortalPlaceholder
      locale={locale}
      title={t("check.title")}
      description={t("soon")}
      backLabel={t("back")}
      phoneLabel={t("callUs")}
    />
  );
}
