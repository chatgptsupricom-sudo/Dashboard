"use client";
import SpiffManager from "@/components/spiff/spiff-manager";
import { useAuthStore } from "@/lib/stores/auth.store";

export default function GerenteVentaSpiffPage() {
  const { user } = useAuthStore();
  // El Asistente de Ventas ve las reglas de spiff pero no las edita.
  const readonly =
    (user?.role || "").toLowerCase().trim() === "asistente de ventas";

  return (
    <div className="space-y-6 bg-slate-50/50 p-8 min-h-screen">
      <SpiffManager
        title="Gestión de Spiffs"
        subtitle="Configurar reglas de spiff para tu empresa"
        readonly={readonly}
      />
    </div>
  );
}
