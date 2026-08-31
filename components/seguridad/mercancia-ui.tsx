"use client";

import Link from "next/link";
import { ArrowLeft, LucideIcon } from "lucide-react";

/**
 * Piezas visuales compartidas por las pantallas de Mercancia/Almacen.
 *
 * El resto del modulo Seguridad (RMA: ingreso/despacho) usa Tailwind suelto,
 * no los primitivos de components/ui — son shadcn con el tema global del
 * panel, y Seguridad tiene su propia identidad (--portal-primary). Este
 * archivo no reemplaza eso, solo evita repetir el mismo header/card/badge
 * copiado en cada una de las 8 pantallas de Almacen.
 */

export function PageHeader({
  icon: Icon,
  titulo,
  subtitulo,
  volverA,
  volverLabel,
  accion,
}: {
  icon?: LucideIcon;
  titulo: string;
  subtitulo?: string;
  volverA?: string;
  volverLabel?: string;
  accion?: React.ReactNode;
}) {
  return (
    <header className="bg-white/90 backdrop-blur border-b border-slate-200/70 sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
        {volverA && (
          <Link
            href={volverA}
            aria-label={volverLabel || "Volver"}
            className="p-2 -ml-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
          >
            <ArrowLeft className="w-[18px] h-[18px]" />
          </Link>
        )}
        {Icon && (
          <span className="hidden sm:flex w-9 h-9 rounded-xl items-center justify-center bg-violet-50 text-[color:var(--portal-primary,#741DFE)] shrink-0">
            <Icon className="w-[18px] h-[18px]" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-[15px] font-semibold text-slate-900 tracking-tight truncate">
            {titulo}
          </h1>
          {subtitulo && (
            <p className="text-xs text-slate-500 truncate">{subtitulo}</p>
          )}
        </div>
        {accion && <div className="shrink-0">{accion}</div>}
      </div>
    </header>
  );
}

export function Card({
  children,
  className = "",
  padded = true,
}: {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section
      className={`bg-white border border-slate-200/80 rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${padded ? "p-5" : ""} ${className}`}
    >
      {children}
    </section>
  );
}

export function SectionTitle({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <h2 className="text-[13px] font-semibold text-slate-900">{children}</h2>
      {action}
    </div>
  );
}

/**
 * Borde punteado y no una caja blanca solida: una caja llena vacia se lee
 * como una pantalla rota; un borde punteado se lee como "aca va algo",
 * que es la idea correcta cuando el catalogo todavia no tiene nada.
 */
export function EmptyState({
  icon: Icon,
  texto,
  className = "",
}: {
  icon?: LucideIcon;
  texto: string;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2.5 py-12 px-4 text-center rounded-2xl border-2 border-dashed border-slate-200 ${className}`}
    >
      {Icon && (
        <span className="w-10 h-10 rounded-full bg-slate-50 text-slate-300 flex items-center justify-center">
          <Icon className="w-[18px] h-[18px]" />
        </span>
      )}
      <p className="text-sm text-slate-400 max-w-xs">{texto}</p>
    </div>
  );
}

const ESTADO_ESTILOS: Record<string, string> = {
  pendiente: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
  conforme: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
  descuadre: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200",
  default: "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200",
};

export function Pill({
  tono = "default",
  icon: Icon,
  children,
}: {
  tono?: keyof typeof ESTADO_ESTILOS;
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold ${ESTADO_ESTILOS[tono] || ESTADO_ESTILOS.default}`}
    >
      {Icon && <Icon className="w-3 h-3" />}
      {children}
    </span>
  );
}

export function BotonPrimario({
  children,
  onClick,
  href,
  disabled,
  type = "button",
  icon: Icon,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  type?: "button" | "submit";
  icon?: LucideIcon;
  className?: string;
}) {
  const clases = `inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:pointer-events-none ${className}`;
  const estilo = { backgroundColor: "var(--portal-primary,#741DFE)" };
  if (href) {
    return (
      <Link href={href} className={clases} style={estilo}>
        {Icon && <Icon className="w-4 h-4" />}
        {children}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={clases} style={estilo}>
      {Icon && <Icon className="w-4 h-4" />}
      {children}
    </button>
  );
}

export function BotonSecundario({
  children,
  onClick,
  href,
  disabled,
  icon: Icon,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  icon?: LucideIcon;
  className?: string;
}) {
  const clases = `inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl text-[13px] font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:pointer-events-none ${className}`;
  if (href) {
    return (
      <Link href={href} className={clases}>
        {Icon && <Icon className="w-4 h-4" />}
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={clases}>
      {Icon && <Icon className="w-4 h-4" />}
      {children}
    </button>
  );
}

export const inputClases =
  "w-full h-11 px-3 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 bg-white transition-colors focus:outline-none focus:border-[color:var(--portal-primary,#741DFE)] focus:ring-2 focus:ring-violet-100";

export const labelClases = "block text-[12px] font-medium text-slate-500 mb-1.5";
