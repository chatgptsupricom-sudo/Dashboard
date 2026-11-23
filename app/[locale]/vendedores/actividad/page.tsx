"use client";

import { Suspense } from "react";
import PanelActividades from "@/components/actividad/panel/PanelActividades";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PanelActividades />
    </Suspense>
  );
}
