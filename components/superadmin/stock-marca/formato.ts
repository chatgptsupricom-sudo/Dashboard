import { AlertOctagon, Archive, CheckCircle2, Hourglass, PackageX, Snail } from "lucide-react";
import type { EstadoStock, FilaMarca, FilaProducto, PuntoSerie, ResultadoStockMarca } from "@/lib/stock-marca/calculo";

export type { EstadoStock, FilaMarca, FilaProducto, PuntoSerie };
export { LIMITES } from "@/lib/stock-marca/calculo";
export { CONTROL_UI, dinero, dineroCorto, porcentaje, unidadesFmt } from "../metas-marca/formato";

export type DatosStock = ResultadoStockMarca & { generado: string; productos?: FilaProducto[] };

/** Estado de la marca según cuántos días le dura el stock al ritmo de venta del período. */
export const ESTADO_UI: Record<EstadoStock, { label: string; ayuda: string; chip: string; punto: string; icono: typeof CheckCircle2 }> = {
  agotada: { label: "Agotada", ayuda: "Vendió y no le queda stock", chip: "bg-violet-50 text-violet-700 ring-violet-600/20", punto: "bg-violet-500", icono: PackageX },
  por_agotarse: { label: "Por agotarse", ayuda: "El stock dura menos de 30 días", chip: "bg-amber-50 text-amber-700 ring-amber-600/20", punto: "bg-amber-500", icono: Hourglass },
  sana: { label: "Sana", ayuda: "Stock para 30 a 90 días", chip: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", punto: "bg-emerald-500", icono: CheckCircle2 },
  lenta: { label: "Lenta", ayuda: "Stock para 3 a 6 meses", chip: "bg-orange-50 text-orange-700 ring-orange-600/20", punto: "bg-orange-500", icono: Snail },
  sobrestock: { label: "Sobrestock", ayuda: "Stock para más de 6 meses", chip: "bg-red-50 text-red-700 ring-red-600/20", punto: "bg-red-500", icono: AlertOctagon },
  sin_venta: { label: "Sin venta", ayuda: "Tiene stock y no vendió nada", chip: "bg-slate-100 text-slate-700 ring-slate-500/20", punto: "bg-slate-500", icono: Archive },
};

export const ORDEN_ESTADOS: EstadoStock[] = ["agotada", "por_agotarse", "sana", "lenta", "sobrestock", "sin_venta"];

export const nombreMes = (mes: string, corto = false) => {
  const [y, m] = mes.split("-").map(Number);
  const s = new Date(y, m - 1, 1).toLocaleString("es-VE", { month: corto ? "short" : "long", year: corto ? "2-digit" : "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** "8 oct" / "8 oct 2026". */
export const fechaCorta = (dia: string | null | undefined, conAnio = false) => {
  if (!dia) return "–";
  const [y, m, d] = dia.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-VE", { day: "numeric", month: "short", ...(conAnio ? { year: "numeric" } : {}) });
};

/** Cobertura legible: días si es corta, meses si es larga. */
export const cobertura = (dias: number | null | undefined) => {
  if (dias == null) return "–";
  if (dias < 60) return `${dias} ${dias === 1 ? "día" : "días"}`;
  const meses = dias / 30;
  if (meses >= 24) return `${(meses / 12).toLocaleString("es-VE", { maximumFractionDigits: 1 })} años`;
  return `${meses.toLocaleString("es-VE", { maximumFractionDigits: 1 })} meses`;
};

/** Diferencia en puntos porcentuales ("+3,2 pp"). */
export const puntos = (actual: number | null | undefined, anterior: number | null | undefined) => {
  if (actual == null || anterior == null) return null;
  const d = Math.round((actual - anterior) * 10) / 10;
  return { d, texto: `${d > 0 ? "+" : ""}${d.toLocaleString("es-VE", { maximumFractionDigits: 1 })} pp` };
};

/** Texto del período ("1 al 8 de oct 2026"). */
export const textoPeriodo = (desde: string, corte: string) => {
  const [y1, m1] = desde.split("-");
  const [y2, m2] = corte.split("-");
  if (y1 === y2 && m1 === m2) return `${Number(desde.slice(8))} al ${fechaCorta(corte, true)}`;
  return `${fechaCorta(desde, y1 !== y2)} al ${fechaCorta(corte, true)}`;
};

export const COLOR_VENDIDO = "#2563eb"; // blue-600
export const COLOR_STOCK = "#cbd5e1"; // slate-300
