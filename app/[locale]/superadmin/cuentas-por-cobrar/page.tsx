import CxCReport from "@/components/superadmin/CxCReport";
import { getTranslations } from "next-intl/server";

export async function generateMetadata({ params }: { params: { locale: string } }) {
  const t = await getTranslations({ locale: params.locale, namespace: "cxc" });
  return {
    title: `${t("titulo")} | Dashboard`,
    description: t("descripcion"),
  };
}

export default function CuentasPorCobrarPage() {
  return (
    <div className="w-full h-full min-h-screen bg-slate-50/50">
      <CxCReport />
    </div>
  );
}
