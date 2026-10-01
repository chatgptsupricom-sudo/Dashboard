"use client";

import PlanContenidoPanel from "@/components/plan-contenido/plan-contenido-panel";

export default function VistaCustomDisenadorPage() {
  // El disenador no sube el HTML, pero todo lo que marque o mueva en el panel
  // se guarda igual que para los demas roles.
  return <PlanContenidoPanel canUpload={false} emptyHint="El administrador aun no ha subido ningun plan" />;
}
