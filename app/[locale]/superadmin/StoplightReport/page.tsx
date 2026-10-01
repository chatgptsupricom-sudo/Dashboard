import StoplightReportSuperadmin from "@/components/superadmin/StoplightReport";
import { getTranslations } from "next-intl/server";

export async function generateMetadata({ params }: { params: { locale: string } }) {
  const t = await getTranslations({ locale: params.locale, namespace: "stoplight" });
  return {
    title: `${t("page_title")} | Superadmin`,
    description: t("page_subtitle"),
  };
}

export default function StoplightReportPage() {
  return (
    <div className="w-full h-full min-h-screen bg-slate-50/50">
      {/*
        El componente importado ya maneja su propio padding y fondos,
        pero este contenedor asegura que ocupe todo el espacio disponible
        dentro del layout del superadmin.
      */}
      <StoplightReportSuperadmin isSuperAdmin={true} />
    </div>
  );
}
