import StoplightReportSuperadmin from "@/components/superadmin/StoplightReport";

export const metadata = {
  title: "Mi Stoplight | Vendedor",
  description: "Consulta tu rendimiento de KPIs",
};

export default function StoplightVendedorPage() {
  return (
    <div className="w-full h-full min-h-screen bg-slate-50/50">
      <StoplightReportSuperadmin vendorMode={true} />
    </div>
  );
}
