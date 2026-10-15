"use client";

import PlanContenidoMarcas from "@/components/plan-contenido/plan-contenido-marcas";

export default function VistaCustomDisenadorPage() {
  // El disenador no sube el HTML, pero todo lo que marque o mueva en el panel
  // se guarda igual que para los demas roles.
  return <PlanContenidoMarcas canUpload={false} emptyHint="El administrador aun no ha subido ningun plan" />;
}
