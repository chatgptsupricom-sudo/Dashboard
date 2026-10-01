"use client";
import { useState } from "react";
import SpiffManager from "@/components/spiff/spiff-manager";
import SpiffResumen from "@/components/spiff/SpiffResumen";
import { useAuthStore } from "@/lib/stores/auth.store";

export default function GerenteVentaSpiffPage() {
  const { user } = useAuthStore();
  // El Asistente de Ventas ve las reglas de spiff pero no las edita.
  const readonly =
    (user?.role || "").toLowerCase().trim() === "asistente de ventas";
  const [tab, setTab] = useState<"resumen" | "reglas">("resumen");

  return (
    <div className="space-y-6 bg-slate-50/50 p-4 sm:p-8 min-h-screen">
      <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
        {(["resumen", "reglas"] as const).map((tb) => (
          <button
            key={tb}
            onClick={() => setTab(tb)}
            className={`px-4 h-9 rounded-lg text-sm font-semibold transition-colors ${
              tab === tb ? "bg-amber-600 text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            {tb === "resumen" ? "Resumen del mes" : "Reglas"}
          </button>
        ))}
      </div>

      {tab === "resumen" ? (
        <SpiffResumen />
      ) : (
        <SpiffManager
          title="Gestión de Spiffs"
          subtitle="Configurar reglas de spiff para tu empresa"
          readonly={readonly}
        />
      )}
    </div>
  );
}
