"use client";

import PlanContenidoMarcas from "@/components/plan-contenido/plan-contenido-marcas";
import { useAuthStore } from "@/lib/stores/auth.store";
import { UserRole } from "@/lib/types";

export default function FrecuenciaCpmSuperadminPage() {
  const { user } = useAuthStore();
  return (
    <PlanContenidoMarcas
      base="frecuencia_cpm"
      title="Frecuencia CPM"
      canUpload={user?.role === UserRole.SUPER_ADMIN}
    />
  );
}
