import { ReporteForm } from "@/components/servicio-tecnico/reporte-form";

export default async function NuevoReportePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <ReporteForm locale={locale} />;
}
