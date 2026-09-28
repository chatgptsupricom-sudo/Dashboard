import { AlertTriangle, CheckCircle2, CircleDashed, Clock, TrendingUp, XCircle } from "lucide-react";
import type { EstadoMarca, FilaMarca, ResumenMetasMarca } from "@/lib/metas-marca/calculo";
import type { AuditoriaSede, EstadoControl } from "@/lib/metas-marca/auditoria";
import type { InventarioMarca } from "@/lib/metas-marca/inventario";

export type { EstadoMarca, FilaMarca, AuditoriaSede, EstadoControl, InventarioMarca };

export interface DatosMetas extends ResumenMetasMarca {
  sedes: { id: number; nombre: string }[];
  editable: boolean;
  incluyeIntercompania: boolean;
  intercompania: number;
  metasMesAnterior: number;
  actualizado: { por: string | null; fecha: string | null };
  catalogo: { clave: string; marca: string }[];
  /** Stock disponible hoy por marca (clave), en el almacén principal. null si no se pudo leer. */
  inventario: Record<string, InventarioMarca> | null;
  inventarioError: string | null;
  generado: string;
}

export const dinero = (n: number | null | undefined, decimales = 0) =>
  n == null
    ? "–"
    : `$${n.toLocaleString("en-US", { minimumFractionDigits: decimales, maximumFractionDigits: decimales })}`;

/** $1.2M / $350K para tarjetas y ejes. */
export const dineroCorto = (n: number | null | undefined) => {
  if (n == null) return "–";
  const a = Math.abs(n);
  if (a >= 1e6) return `$${(n / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 })}M`;
  if (a >= 1e4) return `$${(n / 1e3).toLocaleString("en-US", { maximumFractionDigits: 1 })}K`;
  return dinero(n);
};

export const unidadesFmt = (n: number | null | undefined) =>
  n == null ? "–" : n.toLocaleString("es-VE", { maximumFractionDigits: 0 });

export const porcentaje = (n: number | null | undefined, decimales = 0) =>
  n == null ? "–" : `${n.toLocaleString("es-VE", { minimumFractionDigits: decimales, maximumFractionDigits: decimales })}%`;

export const nombreMes = (mes: string, corto = false) => {
  const [y, m] = mes.split("-").map(Number);
  const s = new Date(y, m - 1, 1).toLocaleString("es-VE", { month: corto ? "short" : "long", year: corto ? "2-digit" : "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Semáforo del panel: verde ≥100, amarillo 70–99, rojo <70. */
export const ESTADO_UI: Record<EstadoMarca, { label: string; chip: string; barra: string; icono: typeof CheckCircle2 }> = {
  cumplida: { label: "Cumplida", chip: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", barra: "bg-emerald-500", icono: CheckCircle2 },
  en_ritmo: { label: "En ritmo", chip: "bg-sky-50 text-sky-700 ring-sky-600/20", barra: "bg-sky-500", icono: TrendingUp },
  atencion: { label: "Atención", chip: "bg-amber-50 text-amber-700 ring-amber-600/20", barra: "bg-amber-500", icono: AlertTriangle },
  riesgo: { label: "En riesgo", chip: "bg-red-50 text-red-700 ring-red-600/20", barra: "bg-red-500", icono: XCircle },
  pendiente: { label: "Por empezar", chip: "bg-slate-50 text-slate-600 ring-slate-500/20", barra: "bg-slate-400", icono: Clock },
  sin_meta: { label: "Sin meta", chip: "bg-slate-50 text-slate-500 ring-slate-400/20", barra: "bg-slate-300", icono: CircleDashed },
};

export const CONTROL_UI: Record<EstadoControl, { label: string; chip: string; borde: string }> = {
  ok: { label: "Correcto", chip: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", borde: "border-l-emerald-500" },
  aviso: { label: "Revisar", chip: "bg-amber-50 text-amber-700 ring-amber-600/20", borde: "border-l-amber-500" },
  error: { label: "Error", chip: "bg-red-50 text-red-700 ring-red-600/20", borde: "border-l-red-500" },
  info: { label: "Informativo", chip: "bg-slate-50 text-slate-600 ring-slate-500/20", borde: "border-l-slate-400" },
};

/** Color del % contra la meta (texto). */
export const colorPct = (p: number | null | undefined) =>
  p == null ? "text-slate-400" : p >= 100 ? "text-emerald-600" : p >= 70 ? "text-amber-600" : "text-red-600";
