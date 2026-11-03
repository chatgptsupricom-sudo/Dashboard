"use client";
import SpiffSeccion from "@/components/spiff/SpiffSeccion";

export default function GerenteOperacionesSpiffPage() {
  return (
    <div className="space-y-6 bg-slate-50/50 p-4 sm:p-8 min-h-screen">
      <SpiffSeccion
        title="Gestión de Spiffs"
        subtitle="Configurar reglas de spiff por marca para tu empresa"
      />
    </div>
  );
}
