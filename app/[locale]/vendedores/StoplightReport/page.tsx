"use client";

import StoplightReportSuperadmin from "@/components/superadmin/StoplightReport";
import { useAuthStore } from "@/lib/stores/auth.store";

export default function StoplightVendedorPage() {
  const { user } = useAuthStore();
  const cid = user?.cids ?? 9;

  // El vendedor solo ve el KPI de ventas y con sus propias cifras. Un
  // superadmin que abra esta pantalla directo ve el reporte de ventas
  // completo (los otros KPIs de gestion).
  const rol = (user?.role || "").toLowerCase().trim();
  const esVendedor = rol === "seller" || rol === "vendedor";

  return (
    <div className="w-full h-full min-h-screen bg-slate-50/50">
      <StoplightReportSuperadmin
        vendorMode={true}
        soloVentasKpi={esVendedor}
        companyId={cid}
      />
    </div>
  );
}
