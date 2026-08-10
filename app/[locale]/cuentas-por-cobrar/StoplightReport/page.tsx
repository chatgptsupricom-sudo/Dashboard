import StoplightReportSuperadmin from "@/components/superadmin/StoplightReport";

export const metadata = {
  title: "Stoplight Reports | Cuentas por Cobrar",
  description: "Gestión y evaluación de KPIs estratégicos",
};

export default function StoplightReportPage() {
  return (
    <div className="w-full h-full min-h-screen bg-slate-50/50">
      <StoplightReportSuperadmin cxCMode />
    </div>
  );
}
