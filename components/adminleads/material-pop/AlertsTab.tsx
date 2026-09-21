"use client";

import { AlertTriangle, Building2, Warehouse } from "lucide-react";
import type { PopProduct } from "@/lib/adminleads/material-pop/types";
import { Button } from "@/components/ui/button";

export function AlertsTab({
  products,
  onGoToCatalog,
}: {
  products: PopProduct[];
  onGoToCatalog: () => void;
}) {
  const alerts = products.filter((product) => product.has_alert);

  if (alerts.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <p className="text-sm font-semibold text-emerald-800">No hay productos agotados</p>
        <p className="mt-1 text-xs text-emerald-700">Todos los productos tienen existencia en alguna ubicación.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {alerts.map((product) => (
        <div key={product.id} className="flex flex-col gap-3 rounded-xl border border-red-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-slate-900">{product.name}</p>
            <p className="font-mono text-xs text-slate-500">{product.code}</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-medium">
            <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-red-700">
              <Building2 className="h-3.5 w-3.5" />
              <Warehouse className="h-3.5 w-3.5" /> Sin existencia en Oficina ni Almacén
            </span>
          </div>
        </div>
      ))}
      <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        Revisa las entradas o traslados para reponer estas ubicaciones.
        <Button type="button" variant="link" size="sm" className="ml-auto h-auto p-0" onClick={onGoToCatalog}>
          Ver catálogo
        </Button>
      </div>
    </div>
  );
}
