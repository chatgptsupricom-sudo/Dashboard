"use client";
import { useState } from "react";
import SpiffManager from "@/components/spiff/spiff-manager";
import SpiffResumen from "@/components/spiff/SpiffResumen";

type Props = React.ComponentProps<typeof SpiffManager>;

/**
 * Sección de Spiff: "Resumen del mes" (lo ganado en un mes y sede, con sus
 * métricas y facturas) y "Reglas" (el administrador). La misma para
 * SuperAdmin, BI, Gerencia de Ventas y Gerente de Operaciones.
 */
export default function SpiffSeccion(props: Props) {
  const [tab, setTab] = useState<"resumen" | "reglas">("resumen");

  return (
    <div className="space-y-6">
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

      {tab === "resumen" ? <SpiffResumen /> : <SpiffManager {...props} />}
    </div>
  );
}
