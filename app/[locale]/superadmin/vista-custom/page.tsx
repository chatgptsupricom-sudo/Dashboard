"use client";

import PlanContenidoPanel from "@/components/plan-contenido/plan-contenido-panel";
import { useAuthStore } from "@/lib/stores/auth.store";
import { UserRole } from "@/lib/types";

export default function VistaCustomSuperadminPage() {
  const { user } = useAuthStore();
  return <PlanContenidoPanel canUpload={user?.role === UserRole.SUPER_ADMIN} />;
}
