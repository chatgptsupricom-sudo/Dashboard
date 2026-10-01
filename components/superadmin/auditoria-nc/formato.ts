import { AlertOctagon, AlertTriangle, Info } from "lucide-react";
import type { Alerta, FilaAnulada, FilaNC, FilaReabierta, Severidad } from "@/lib/auditoria-nc/analisis";
import type { Cambio, Evento, Documento } from "@/lib/auditoria-nc/odoo";

export type { Alerta, FilaAnulada, FilaNC, FilaReabierta, Severidad, Cambio, Evento, Documento };

type ConSede<T> = T & { sede: string };

export interface Agrupado { clave: string; nombre: string; cantidad: number; monto: number; alertas: number; altas: number }

export interface DatosAuditoriaNC {
  desde: string;
  hasta: string;
  sedes: { id: number; nombre: string }[];
  resumen: {
    ventas: number;
    facturas: number;
    nc: { cantidad: number; monto: number; pctVentas: number | null; intercompania: number; importadas: number; importadasMonto: number; borradores: number; conAlertaAlta: number };
    anuladas: { cantidad: number; publicadas: number; monto: number; sinReemplazo: number };
    reabiertas: { cantidad: number; conCambios: number; bajaronMonto: number; reduccion: number; sinCambios: number };
    alertas: { alta: number; media: number; baja: number; porCodigo: { codigo: string; cantidad: number; titulo: string; severidad: Severidad; explicacion: string }[] };
    porCategoria: Agrupado[];
    porCliente: Agrupado[];
    porVendedor: (Agrupado & { ventas: number; tasa: number | null })[];
    porUsuario: { usuario: string; ncCreadas: number; ncMonto: number; anuladas: number; anuladoMonto: number; reabiertas: number; alertasAltas: number }[];
  };
  serie: { mes: string; ventas: number; notas: number; cantidadNotas: number; pct: number | null }[];
  notas: ConSede<FilaNC>[];
  anuladas: ConSede<FilaAnulada>[];
  reabiertas: ConSede<FilaReabierta>[];
  generado: string;
}

export const SEV_UI: Record<Severidad, { label: string; chip: string; punto: string; icono: typeof Info }> = {
  alta: { label: "Alta", chip: "bg-red-50 text-red-700 ring-red-600/20", punto: "bg-red-500", icono: AlertOctagon },
  media: { label: "Media", chip: "bg-amber-50 text-amber-700 ring-amber-600/20", punto: "bg-amber-500", icono: AlertTriangle },
  baja: { label: "Baja", chip: "bg-slate-100 text-slate-600 ring-slate-500/20", punto: "bg-slate-400", icono: Info },
};

export const ESTADO_DOC: Record<string, { label: string; chip: string }> = {
  posted: { label: "Publicada", chip: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  draft: { label: "Borrador", chip: "bg-slate-100 text-slate-600 ring-slate-500/20" },
  cancel: { label: "Anulada", chip: "bg-red-50 text-red-700 ring-red-600/20" },
};

export const ESTADO_EVENTO: Record<string, string> = { posted: "Publicada", draft: "Borrador", cancel: "Anulada", "": "–" };

export const PAGO: Record<string, string> = {
  not_paid: "Sin aplicar", partial: "Parcial", paid: "Aplicada", in_payment: "En pago", reversed: "Revertida", invoicing_legacy: "–",
};

export const dinero = (n: number | null | undefined, dec = 2) =>
  n == null ? "–" : `$${n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
export const dineroCorto = (n: number | null | undefined) => {
  if (n == null) return "–";
  const a = Math.abs(n);
  if (a >= 1e6) return `$${(n / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 })}M`;
  if (a >= 1e4) return `$${(n / 1e3).toLocaleString("en-US", { maximumFractionDigits: 1 })}K`;
  return dinero(n, 0);
};
export const pct = (n: number | null | undefined, dec = 1) =>
  n == null ? "–" : `${n.toLocaleString("es-VE", { minimumFractionDigits: dec, maximumFractionDigits: dec })}%`;
export const fecha = (s: string | null | undefined) => {
  if (!s) return "–";
  const [y, m, d] = s.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};
export const fechaHora = (s: string | null | undefined) => (s ? `${fecha(s)} ${s.slice(11, 16)}` : "–");
export const nombreMes = (mes: string) => {
  const [y, m] = mes.split("-").map(Number);
  const s = new Date(y, m - 1, 1).toLocaleString("es-VE", { month: "short", year: "2-digit" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export const urlOdoo = (id: number) =>
  `${(process.env.NEXT_PUBLIC_ODOO_URL || "https://supricom2.odoo.com").replace(/\/$/, "")}/web#id=${id}&model=account.move&view_type=form`;

/** Severidad más alta de un documento (para ordenar y colorear). */
export const peorSeveridad = (alertas: Alerta[]): Severidad | null =>
  alertas.some((a) => a.severidad === "alta") ? "alta" : alertas.some((a) => a.severidad === "media") ? "media" : alertas.length ? "baja" : null;
