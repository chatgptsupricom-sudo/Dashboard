import StoplightReportSuperadmin from "@/components/superadmin/StoplightReport";

export const metadata = {
  title: "Stoplight Reports | Compras",
  description: "Gestión y evaluación de KPIs estratégicos del departamento de compras",
};

export default function StoplightComprasPage() {
  return (
    <div className="w-full h-full min-h-screen bg-slate-50/50">
      <StoplightReportSuperadmin comprasMode={true} />
    </div>
  );
}
