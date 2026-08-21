"use client";

import StoplightReportSuperadmin from "@/components/superadmin/StoplightReport";
import { useAuthStore } from "@/lib/stores/auth.store";

export default function StoplightVendedorPage() {
  const { user } = useAuthStore();
  const cid = user?.cids ?? 9;

  return (
    <div className="w-full h-full min-h-screen bg-slate-50/50">
      <StoplightReportSuperadmin vendorMode={true} companyId={cid} />
    </div>
  );
}
