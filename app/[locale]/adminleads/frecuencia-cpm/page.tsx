"use client";

import PlanContenidoMarcas from "@/components/plan-contenido/plan-contenido-marcas";
import { useAuthStore } from "@/lib/stores/auth.store";
import { UserRole } from "@/lib/types";

export default function FrecuenciaCpmPage() {
  const { user } = useAuthStore();

  // Mismo corte que el Plan de Contenido: superadmin y adminleads de Valencia.
  const canUpload =
    user?.role === UserRole.SUPER_ADMIN ||
    (user?.role === UserRole.ADMIN_LEADS && Number((user as any).cids) === 9);

  return <PlanContenidoMarcas base="frecuencia_cpm" title="Frecuencia CPM" canUpload={canUpload} />;
}
