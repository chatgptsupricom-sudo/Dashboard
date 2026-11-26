"use client";

import { Suspense } from "react";
import PanelActividades from "@/components/actividad/panel/PanelActividades";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";

export default function Page() {
  return (
    <DashboardLayout>
      <Suspense fallback={null}>
        <PanelActividades />
      </Suspense>
    </DashboardLayout>
  );
}
