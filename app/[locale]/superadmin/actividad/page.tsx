// La sección de actividades del SuperAdmin es la misma de todos los roles:
// el menú lleva a /gestion/actividades. Esta ruta vieja muestra el mismo panel.
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
