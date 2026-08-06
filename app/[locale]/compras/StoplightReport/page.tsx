import StoplightReportSuperadmin from "@/components/superadmin/StoplightReport";

export const metadata = {
  title: "Stoplight Report | Compras",
  description: "Reporte de rendimiento KPIs para compras",
};

export default function StoplightComprasPage() {
  return (
    <div className="w-full h-full min-h-screen bg-slate-50/50">
      <StoplightReportSuperadmin comprasMode={true} />
    </div>
  );
}