"use client";

import PlanContenidoPanel from "@/components/plan-contenido/plan-contenido-panel";

export default function FrecuenciaCpmDisenadorPage() {
  return (
    <PlanContenidoPanel
      view="frecuencia_cpm"
      title="Frecuencia CPM"
      canUpload={false}
      emptyHint="El administrador aun no ha subido el HTML"
    />
  );
}
