"use client";

import StoplightReportSuperadmin from "@/components/superadmin/StoplightReport";
import { useAuthStore } from "@/lib/stores/auth.store";

export default function StoplightVendedorPage() {
  const { user } = useAuthStore();
  const cid = user?.cids ?? 9;

  // `vendorMode` ya deja solo el grupo "Ventas", y la API
  // /api/vendedores/stoplight filtra por s.user_id: el vendedor ve todos los
  // KPIs de ventas pero solo con sus propias cifras.
  return (
    <div className="w-full h-full min-h-screen bg-slate-50/50">
      <StoplightReportSuperadmin vendorMode={true} companyId={cid} />
    </div>
  );
}
