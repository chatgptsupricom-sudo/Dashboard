import StoplightReportSuperadmin from "@/components/superadmin/StoplightReport";

export const metadata = {
  title: "Stoplight Reports | Inteligencia de Negocio",
  description: "KPIs estratégicos de las tres sedes",
};

export default function StoplightReportPage() {
  return (
    <div className="w-full h-full min-h-screen bg-slate-50/50">
      <StoplightReportSuperadmin biMode />
    </div>
  );
}
