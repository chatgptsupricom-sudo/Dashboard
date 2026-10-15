"use client";

import PlanContenidoMarcas from "@/components/plan-contenido/plan-contenido-marcas";

export default function FrecuenciaCpmDisenadorPage() {
  return (
    <PlanContenidoMarcas
      base="frecuencia_cpm"
      title="Frecuencia CPM"
      canUpload={false}
      emptyHint="El administrador aun no ha subido el HTML"
    />
  );
}
