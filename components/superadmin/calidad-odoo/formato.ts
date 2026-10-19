import { AlertOctagon, AlertTriangle, Lightbulb, type LucideIcon } from "lucide-react";
import type { Area, ChequeoResumen, Columna, Fila, Severidad } from "@/lib/calidad-odoo/tipos";

export type { Area, ChequeoResumen, Columna, Fila, Severidad };

export interface DatosResumen {
  chequeos: ChequeoResumen[];
  totales: Record<Severidad, { chequeos: number; registros: number }> & { revisados: number; limpios: number };
  areas: { id: Area; nombre: string; hallazgos: number }[];
  generado: string;
}

export const SEV_UI: Record<Severidad, { label: string; plural: string; ayuda: string; icono: LucideIcon; chip: string; borde: string; fondo: string; texto: string }> = {
  error: {
    label: "Error", plural: "Errores", ayuda: "Datos mal cargados que ya distorsionan reportes o contabilidad",
    icono: AlertOctagon, chip: "bg-red-50 text-red-700 ring-red-600/20", borde: "border-l-red-500", fondo: "bg-red-50", texto: "text-red-700",
  },
  atencion: {
    label: "Atención", plural: "Atención", ayuda: "Pendientes que quedaron a medias o datos dudosos para revisar",
    icono: AlertTriangle, chip: "bg-amber-50 text-amber-800 ring-amber-600/20", borde: "border-l-amber-500", fondo: "bg-amber-50", texto: "text-amber-800",
  },
  mejora: {
    label: "Mejora", plural: "Mejoras", ayuda: "Orden y estandarización: no rompe nada hoy, pero ensucia",
    icono: Lightbulb, chip: "bg-sky-50 text-sky-700 ring-sky-600/20", borde: "border-l-sky-500", fondo: "bg-sky-50", texto: "text-sky-700",
  },
};

export const SEDES = [
  { id: "todas", nombre: "Todas las sedes" },
  { id: "9", nombre: "Valencia" },
  { id: "10", nombre: "Caracas" },
  { id: "7", nombre: "Panamá" },
];

export const nombreSede = (id: number | null) =>
  id == null ? "Compartido" : SEDES.find((s) => s.id === String(id))?.nombre ?? `Empresa ${id}`;

const ODOO = (process.env.NEXT_PUBLIC_ODOO_URL || "https://supricom2.odoo.com").replace(/\/$/, "");

/** Enlace a la ficha del registro en Odoo, en la empresa del registro. */
export const urlOdoo = (f: Pick<Fila, "id" | "modelo" | "companyId">) =>
  `${ODOO}/web#id=${f.id}&model=${f.modelo}&view_type=form${f.companyId ? `&cids=${f.companyId}` : ""}`;

const DINERO = new Intl.NumberFormat("es-VE", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const NUM = new Intl.NumberFormat("es-VE", { maximumFractionDigits: 2 });

export const numero = (n: number) => NUM.format(n);

export function fechaCorta(s: string) {
  const [y, m, d] = s.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : s;
}

/** Valor de una celda tal como se muestra en la tabla. */
export function celda(valor: unknown, tipo: Columna["tipo"]): string {
  if (valor == null || valor === "") return "–";
  if (tipo === "dinero" && typeof valor === "number") return DINERO.format(valor);
  if ((tipo === "numero" || tipo === "dias") && typeof valor === "number") return NUM.format(valor);
  if (tipo === "fecha" && typeof valor === "string") return fechaCorta(valor);
  return String(valor);
}

export function haceCuanto(iso: string) {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (!Number.isFinite(min) || min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  return `hace ${Math.round(min / 60)} h`;
}
