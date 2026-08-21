"use client";

import ActivityView from "@/components/actividad/standard/ActivityView"; // Mueve tu componente actual a un archivo separado llamado ActivityView.tsx en la misma carpeta
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";

export default function Page() {
  return (
    <DashboardLayout>
      {/* Esto hace que el sidebar y el topbar aparezcan */}
      <div className="p-6">
        <ActivityView />
      </div>
    </DashboardLayout>
  );
}
