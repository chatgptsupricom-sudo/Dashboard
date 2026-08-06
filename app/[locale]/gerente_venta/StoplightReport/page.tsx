import StoplightReportSuperadmin from "@/components/superadmin/StoplightReport";

export const metadata = {
  title: "Stoplight Reports | Gerente de Ventas",
  description: "Gestión y evaluación de KPIs estratégicos del equipo de ventas",
};

export default function StoplightGerenteVentaPage() {
  return (
    <div className="w-full h-full min-h-screen bg-slate-50/50">
      <StoplightReportSuperadmin gerenteVentaMode={true} />
    </div>
  );
}
