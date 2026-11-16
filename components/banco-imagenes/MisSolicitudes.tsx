"use client";

import type { ReactNode } from "react";
import { Check, Clock, X } from "lucide-react";
import { SOMBRA } from "@/components/banco-imagenes/GaleriaFlyers";
import type { ItemFlyer, SolicitudFlyer } from "@/lib/banco-imagenes/solicitudes";
import { cn } from "@/lib/utils";

export type { ItemFlyer, SolicitudFlyer };

export const ESTADO_VENDEDOR: Record<SolicitudFlyer["estado"], string> = {
  pendiente: "Pendiente de revisión",
  en_desarrollo: "En desarrollo",
  completada: "Lista",
  rechazada: "Rechazada",
  cancelada: "Cancelada",
};

export const PILL_ESTADO: Record<SolicitudFlyer["estado"], string> = {
  pendiente: "bg-amber-50 text-amber-700",
  en_desarrollo: "bg-blue-50 text-blue-600",
  completada: "bg-emerald-50 text-emerald-700",
  rechazada: "bg-red-50 text-red-600",
  cancelada: "bg-slate-100 text-slate-400",
};

export const fechaCorta = (s: string | null) => (s ? s.slice(0, 10).split("-").reverse().join("-") : "");

export const tituloSolicitud = (s: SolicitudFlyer) =>
  s.tipo === "categoria"
    ? `Categoría completa: ${s.categoria}`
    : s.items.length === 1
      ? s.items[0].nombre
      : `${s.items.length} productos`;

const ICONO = {
  hecho: <Check className="h-3.5 w-3.5" strokeWidth={3} />,
  pendiente: <Clock className="h-3.5 w-3.5" strokeWidth={2.5} />,
  descartado: <X className="h-3.5 w-3.5" strokeWidth={2.5} />,
};

/** Avance "3 de 5 listos". */
export function Avance({ s }: { s: SolicitudFlyer }) {
  if (s.estado !== "en_desarrollo" && s.estado !== "completada") return null;
  return (
    <div className="grid gap-1.5">
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <i
          className="block h-full rounded-full bg-gradient-to-r from-blue-600 to-blue-400 transition-[width] duration-500"
          style={{ width: `${s.avance.pct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-slate-500">
        <span>
          {s.avance.hechos} de {s.avance.total} listos
        </span>
        <span>{s.avance.pct}%</span>
      </div>
    </div>
  );
}

/** Lista de productos de una solicitud: ✓ hechos, reloj pendientes, tachados los descartados. */
export function ItemsSolicitud({
  s,
  acciones,
}: {
  s: SolicitudFlyer;
  /** Botones a la derecha de cada ítem. */
  acciones: (item: ItemFlyer) => ReactNode;
}) {
  if (s.items.length === 0) {
    return (
      <p className="rounded-xl bg-slate-50 px-3 py-2 text-[13px] text-slate-600">
        {s.tipo === "categoria"
          ? `Al aprobarla se arma la lista con los productos de ${s.categoria} que todavía no tienen flyer.`
          : "Sin productos."}
      </p>
    );
  }
  return (
    <ul className="grid gap-1.5">
      {s.items.map((i) => (
        <li key={i.id} className="flex min-w-0 items-center gap-2.5 rounded-2xl bg-slate-50 px-2.5 py-2">
          <span
            className={cn(
              "grid h-[26px] w-[26px] flex-none place-items-center rounded-full",
              i.estado === "hecho" && "bg-emerald-700 text-white",
              i.estado === "pendiente" && "bg-amber-50 text-amber-700",
              i.estado === "descartado" && "bg-slate-200 text-slate-400",
            )}
          >
            {ICONO[i.estado]}
          </span>
          <div className="min-w-0 flex-1">
            <b className={cn("block truncate text-[13px] font-semibold", i.estado === "descartado" && "text-slate-400 line-through")}>
              {i.nombre}
            </b>
            <small className="text-[11px] text-slate-500">
              {[
                i.productCode,
                i.estado === "hecho" ? "listo" : i.estado === "descartado" ? i.nota || "descartado" : "en espera",
                i.estado === "pendiente" && i.otrosVendedores > 0
                  ? i.otrosVendedores === 1
                    ? "también lo pide 1 vendedor"
                    : `también lo piden ${i.otrosVendedores} vendedores`
                  : null,
              ]
                .filter(Boolean)
                .join(", ")}
            </small>
          </div>
          {acciones(i)}
        </li>
      ))}
    </ul>
  );
}

/** Pestaña "Mis solicitudes" del vendedor. */
export function MisSolicitudes({
  solicitudes,
  cargando,
  onCancelar,
}: {
  solicitudes: SolicitudFlyer[];
  cargando: boolean;
  onCancelar: (id: number) => void;
}) {
  return (
    <div className="grid gap-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-slate-900">Mis solicitudes</h2>
        <span className="text-[13px] text-slate-400">Te avisamos por correo cuando cambien</span>
      </div>
      {!cargando && solicitudes.length === 0 && (
        <p className="rounded-[22px] border-2 border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
          Todavía no has pedido flyers
        </p>
      )}
      {solicitudes.map((s) => (
        <article key={s.id} className={cn("grid min-w-0 gap-3 rounded-[22px] bg-white p-[18px]", SOMBRA)}>
          <div className="flex flex-wrap items-start justify-between gap-2.5">
            <div className="min-w-0">
              <b className="text-[15px] text-slate-900">{tituloSolicitud(s)}</b>
              <small className="block text-xs text-slate-500">
                {s.codigo}, pedida el {fechaCorta(s.createdAt)}
                {s.paraCuando ? `, para el ${fechaCorta(s.paraCuando)}` : ""}
              </small>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {s.urgencia === "alta" && <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-600">Urgente</span>}
              <span className={cn("whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold", PILL_ESTADO[s.estado])}>
                {ESTADO_VENDEDOR[s.estado]}
              </span>
            </div>
          </div>
          <Avance s={s} />
          {s.estado === "rechazada" && s.motivoRechazo && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-[13px] text-red-700">Motivo: {s.motivoRechazo}</p>
          )}
          <ItemsSolicitud
            s={s}
            acciones={(i) =>
              i.estado === "hecho" && i.productImageId ? (
                <a
                  href={`/api/adminleads/banco-imagenes/image/${i.productImageId}`}
                  download
                  className="flex-none rounded-full bg-[#0F172A] px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Descargar
                </a>
              ) : null
            }
          />
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-[13px] text-slate-600">{s.motivo}</p>
          {s.estado === "pendiente" && (
            <div>
              <button
                type="button"
                onClick={() => onCancelar(s.id)}
                className="h-9 rounded-full border border-slate-200 bg-white px-3.5 text-[13px] font-semibold text-slate-600 hover:text-red-600"
              >
                Cancelar solicitud
              </button>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
