import StoplightReportSuperadmin from "@/components/superadmin/StoplightReport";

export const metadata = {
  title: "Stoplight Reports | Gerente de Operaciones",
  description: "Gestión y evaluación de KPIs estratégicos",
};

export default function StoplightReportPage() {
  return (
    <div className="w-full h-full min-h-screen bg-slate-50/50">
      <StoplightReportSuperadmin gerenteOpsMode />
    </div>
  );
}
