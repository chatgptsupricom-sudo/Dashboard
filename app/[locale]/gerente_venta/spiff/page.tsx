"use client";
import SpiffManager from "@/components/spiff/spiff-manager";

export default function GerenteVentaSpiffPage() {
  return (
    <div className="space-y-6 bg-slate-50/50 p-8 min-h-screen">
      <SpiffManager
        title="Gestión de Spiffs"
        subtitle="Configurar reglas de spiff por marca para tu empresa"
      />
    </div>
  );
}
