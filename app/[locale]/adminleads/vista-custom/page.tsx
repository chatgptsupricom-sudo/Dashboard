"use client";

import PlanContenidoMarcas from "@/components/plan-contenido/plan-contenido-marcas";
import { useAuthStore } from "@/lib/stores/auth.store";
import { UserRole } from "@/lib/types";

export default function VistaCustomPage() {
  const { user } = useAuthStore();

  // Solo el superadmin y el adminleads de Valencia (cids 9) reemplazan el HTML.
  const canUpload =
    user?.role === UserRole.SUPER_ADMIN ||
    (user?.role === UserRole.ADMIN_LEADS && Number((user as any).cids) === 9);

  return <PlanContenidoMarcas canUpload={canUpload} />;
}
