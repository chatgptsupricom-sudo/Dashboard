"use client";
import SpiffManager from "@/components/spiff/spiff-manager";

export default function SuperadminSpiffPage() {
  return (
    <div className="space-y-6 bg-slate-50/50 p-8 min-h-screen">
      <SpiffManager
        title="Monitoreo de Spiffs"
        subtitle="Administrar y monitorear spiffs de todas las empresas"
        showCompanyFilter={true}
      />
    </div>
  );
}
