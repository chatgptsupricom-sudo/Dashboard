import { AlertTriangle, CheckCircle2, CircleDashed } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OdooSyncStatus } from "@/lib/compras/ordenes-types";

/**
 * Estado de sincronizacion con Odoo (issue #166), aparte del badge de
 * estado del panel (OrdenEstadoBadge). "no_aplica" no es un error -- la
 * orden tiene proveedor y/o lineas escritas a mano, nunca se intento
 * escribir en Odoo para ella.
 */
export function OrdenOdooBadge({
  status,
  error,
  odooLive,
}: {
  status: OdooSyncStatus;
  error?: string | null;
  odooLive?: { state: string; name: string } | null;
}) {
  if (status === "no_aplica") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2.5 py-0.5 text-xs text-slate-400 dark:bg-slate-800/60"
        title="Proveedor o líneas sin producto de Odoo -- esta orden no se sincroniza."
      >
        <CircleDashed className="h-3 w-3" /> Sin sincronizar con Odoo
      </span>
    );
  }

  if (status === "error") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-600 dark:bg-red-950/40 dark:text-red-300"
        title={error || "Error al sincronizar con Odoo"}
      >
        <AlertTriangle className="h-3 w-3" /> Error al sincronizar con Odoo
      </span>
    );
  }

  if (status === "sincronizado") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
        )}
        title={odooLive ? `Odoo: ${odooLive.name} (${odooLive.state})` : "Sincronizada con Odoo"}
      >
        <CheckCircle2 className="h-3 w-3" />
        {odooLive ? `Odoo: ${odooLive.name}` : "Sincronizada con Odoo"}
      </span>
    );
  }

  // "pendiente"
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
      <CircleDashed className="h-3 w-3 animate-spin" /> Sincronizando con Odoo…
    </span>
  );
}
