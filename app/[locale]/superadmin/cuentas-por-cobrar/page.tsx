import CxCReport from "@/components/superadmin/CxCReport";

export const metadata = {
  title: "Cuentas por Cobrar | Dashboard",
  description: "Dashboard de Cuentas por Cobrar - KPIs de cartera",
};

export default function CuentasPorCobrarPage() {
  return (
    <div className="w-full h-full min-h-screen bg-slate-50/50">
      <CxCReport />
    </div>
  );
}
