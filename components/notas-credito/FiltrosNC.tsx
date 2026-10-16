"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NOMBRE_SEDE } from "@/lib/notas-credito/tipos";
import { Search, X } from "lucide-react";

export type EstadoFiltro =
  | "por_preaprobar"
  | "por_aprobar"
  | "aprobada"
  | "borrador"
  | "publicada"
  | "rechazada"
  | "anulada"
  | "fuera_flujo"
  | "anterior";
export type OrigenFiltro = "rma" | "directa" | "odoo";

export type Filtros = { q: string; sede: number; estado: EstadoFiltro | ""; origen: OrigenFiltro | "" };
export const FILTROS_VACIOS: Filtros = { q: "", sede: 0, estado: "", origen: "" };

export const ETIQUETA_ESTADO_FILTRO: Record<EstadoFiltro, string> = {
  por_preaprobar: "Por preaprobar",
  por_aprobar: "Por aprobar",
  aprobada: "Aprobada, por hacer en Odoo",
  borrador: "Borrador en Odoo",
  publicada: "Publicada en Odoo",
  rechazada: "Rechazada",
  anulada: "Anulada en Odoo",
  fuera_flujo: "Pendiente, fuera del flujo",
  anterior: "Registrada antes del flujo",
};

export const ETIQUETA_ORIGEN: Record<OrigenFiltro, string> = {
  rma: "De RMA",
  directa: "Directa (panel)",
  odoo: "Hecha en Odoo, sin solicitud",
};

const TODAS = "todas";

/**
 * Barra de filtros de la lista de notas de crédito: buscador, sede, estado,
 * origen y (en "Todas") el mes. Muestra cuántas coinciden y limpia todo.
 */
export function FiltrosNC({
  filtros,
  onCambio,
  sedes,
  estados,
  total,
  coinciden,
  mes,
  onMes,
  conOrigen = true,
}: {
  filtros: Filtros;
  onCambio: (f: Filtros) => void;
  sedes: number[];
  estados: EstadoFiltro[];
  total: number;
  coinciden: number;
  mes?: string;
  onMes?: (m: string) => void;
  /** Sin el filtro de origen (pestañas que ya son de un solo origen o paso). */
  conOrigen?: boolean;
}) {
  const activos = !!(filtros.q.trim() || filtros.sede || filtros.estado || filtros.origen);
  const set = (p: Partial<Filtros>) => onCambio({ ...filtros, ...p });

  return (
    <div className="space-y-3 rounded-3xl bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <label className="min-w-0 flex-1 space-y-1">
          <span className="block text-xs font-medium text-slate-500">Buscar</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={filtros.q}
              onChange={(e) => set({ q: e.target.value })}
              placeholder="Cliente, nota, factura, caso RMA, motivo o quién la hizo"
              className="pl-9"
            />
            {filtros.q && (
              <button
                type="button"
                onClick={() => set({ q: "" })}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
                aria-label="Borrar búsqueda"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </label>
        <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
          {onMes && (
            <label className="space-y-1">
              <span className="block text-xs font-medium text-slate-500">Mes</span>
              <Input type="month" value={mes} onChange={(e) => onMes(e.target.value)} className="sm:w-40" />
            </label>
          )}
          {sedes.length > 1 && (
            <label className="space-y-1">
              <span className="block text-xs font-medium text-slate-500">Sede</span>
              <Select value={filtros.sede ? String(filtros.sede) : TODAS} onValueChange={(v) => set({ sede: v === TODAS ? 0 : Number(v) })}>
                <SelectTrigger className="sm:w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODAS}>Todas las sedes</SelectItem>
                  {sedes.map((s) => (
                    <SelectItem key={s} value={String(s)}>
                      {NOMBRE_SEDE[s] || s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          )}
          {estados.length > 1 && (
            <label className="space-y-1">
              <span className="block text-xs font-medium text-slate-500">Estado</span>
              <Select value={filtros.estado || TODAS} onValueChange={(v) => set({ estado: v === TODAS ? "" : (v as EstadoFiltro) })}>
                <SelectTrigger className="sm:w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODAS}>Todos los estados</SelectItem>
                  {estados.map((e) => (
                    <SelectItem key={e} value={e}>
                      {ETIQUETA_ESTADO_FILTRO[e]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          )}
          {conOrigen && (
            <label className="space-y-1">
              <span className="block text-xs font-medium text-slate-500">Origen</span>
              <Select value={filtros.origen || TODAS} onValueChange={(v) => set({ origen: v === TODAS ? "" : (v as OrigenFiltro) })}>
                <SelectTrigger className="sm:w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODAS}>Todos los orígenes</SelectItem>
                  {(Object.keys(ETIQUETA_ORIGEN) as OrigenFiltro[]).map((o) => (
                    <SelectItem key={o} value={o}>
                      {ETIQUETA_ORIGEN[o]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>{activos ? `${coinciden} de ${total} notas de crédito` : `${total} notas de crédito`}</span>
        {activos && (
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onCambio(FILTROS_VACIOS)}>
            <X className="mr-1 h-3.5 w-3.5" /> Limpiar filtros
          </Button>
        )}
      </div>
    </div>
  );
}
