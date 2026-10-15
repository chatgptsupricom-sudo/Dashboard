"use client";

import { useState } from "react";
import PlanContenidoPanel from "@/components/plan-contenido/plan-contenido-panel";
import { PESTANAS_MARCA, vistaDeMarca } from "@/lib/customView/marcas";

/**
 * Plan de Contenido / Frecuencia CPM con una pestaña por marca (Supricom,
 * Asta, Bluetti). Cada marca es su propia vista de custom_views, con su HTML,
 * su estado y su historial; el panel se monta de nuevo al cambiar de marca.
 * `base`: la vista de Supricom ("frecuencia_cpm"); sin ella, el plan.
 */
export default function PlanContenidoMarcas({
  base,
  ...props
}: {
  base?: string;
  canUpload: boolean;
  emptyHint?: string;
  title?: string;
}) {
  const [marca, setMarca] = useState("supricom");
  // Supricom con el plan conserva la vista de siempre (sin `view`).
  const view = marca === "supricom" ? base : vistaDeMarca(base || "adminleads", marca);

  const pestanas = (
    <div role="tablist" aria-label="Marca" className="flex gap-1 p-1 rounded-xl bg-slate-100 text-sm font-medium">
      {PESTANAS_MARCA.map((p) => (
        <button
          key={p.marca}
          type="button"
          role="tab"
          aria-selected={marca === p.marca}
          onClick={() => setMarca(p.marca)}
          className={`h-8 px-3 rounded-lg transition-colors ${
            marca === p.marca ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          {p.etiqueta}
        </button>
      ))}
    </div>
  );

  return <PlanContenidoPanel key={marca} view={view} encabezado={pestanas} {...props} />;
}
