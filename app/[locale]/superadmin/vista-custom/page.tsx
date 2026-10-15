"use client";

import PlanContenidoMarcas from "@/components/plan-contenido/plan-contenido-marcas";
import { useAuthStore } from "@/lib/stores/auth.store";
import { UserRole } from "@/lib/types";

export default function VistaCustomSuperadminPage() {
  const { user } = useAuthStore();
  return <PlanContenidoMarcas canUpload={user?.role === UserRole.SUPER_ADMIN} />;
}
