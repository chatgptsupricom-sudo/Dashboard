"use client";

import Link from "next/link";
import { PenLine } from "lucide-react";

/**
 * Piezas de las actas del mostrador de Seguridad (ingreso y despacho de RMA):
 * un dato de solo lectura, el campo de firma, la persona que firma (de su
 * catálogo) y los controles Sí / No que exigen respuesta explícita.
 */

export type Persona = { id: number; nombre: string };

/** Un dato del acta, de solo lectura. */
export function Dato({
  etiqueta,
  valor,
  mono,
  multilinea,
}: {
  etiqueta: string;
  valor: React.ReactNode;
  mono?: boolean;
  multilinea?: boolean;
}) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{etiqueta}</dt>
      <dd
        className={`rounded-[10px] bg-slate-50 border border-slate-100 px-3 py-2.5 text-sm text-slate-800 ${
          mono ? "font-mono" : ""
        } ${multilinea ? "whitespace-pre-wrap min-h-[60px]" : ""}`}
      >
        {valor}
      </dd>
    </div>
  );
}

export function FirmaCampo({
  etiqueta,
  firmada,
  children,
}: {
  etiqueta: string;
  firmada: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-1.5">
        <PenLine className="w-3.5 h-3.5" />
        {etiqueta} <span className="text-red-500">*</span>
      </label>
      <div className={`rounded-[10px] ${firmada ? "" : "ring-1 ring-amber-300"}`}>{children}</div>
    </div>
  );
}

export function PersonaSelect({
  label,
  value,
  onChange,
  opciones,
  placeholder,
  vacio,
  gestionarHref,
  gestionarLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  opciones: Persona[];
  placeholder: string;
  vacio: string;
  gestionarHref?: string;
  gestionarLabel?: string;
}) {
  // Si el catálogo está vacío no hay nada que elegir: se manda a la pantalla
  // de administración en vez de dejar un select muerto.
  const sinOpciones = opciones.length === 0;
  // El valor guardado podría no estar en la lista actual (alguien dado de baja
  // después de empezar el acta). Se muestra igual para no perder la selección.
  const faltaValor = value !== "" && !opciones.some((o) => o.nombre === value);

  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1.5">
        {label} <span className="text-red-500">*</span>
      </label>
      {sinOpciones ? (
        <p className="text-sm text-slate-500">
          {vacio}{" "}
          {gestionarHref && (
            <Link
              href={gestionarHref}
              className="font-semibold text-[color:var(--portal-primary,#741DFE)] hover:underline"
            >
              {gestionarLabel}
            </Link>
          )}
        </p>
      ) : (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          className="w-full h-11 px-3 border border-slate-200 rounded-[10px] text-sm bg-white focus:outline-none focus:border-[color:var(--portal-primary,#741DFE)] focus:ring-2 focus:ring-violet-100"
        >
          <option value="">{placeholder}</option>
          {faltaValor && <option value={value}>{value}</option>}
          {opciones.map((o) => (
            <option key={o.id} value={o.nombre}>
              {o.nombre}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

export function CheckRow({
  label,
  value,
  onChange,
  yes,
  no,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
  yes: string;
  no: string;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-[10px] border px-3 py-2.5 ${
        value === null ? "border-amber-300 bg-amber-50" : "border-slate-200"
      }`}
    >
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {/* h-12 y no h-8: son los controles mas tocados del formulario y se usan
          de pie con el telefono en una mano. El criterio de #39 pide 48px. */}
      <div
        role="group"
        className="inline-flex shrink-0 rounded-[10px] border border-slate-200 overflow-hidden text-sm font-semibold"
      >
        <button
          type="button"
          onClick={() => onChange(true)}
          aria-pressed={value === true}
          className={`min-w-[56px] px-4 h-12 transition-colors ${
            value === true ? "bg-emerald-500 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
          }`}
        >
          {yes}
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          aria-pressed={value === false}
          className={`min-w-[56px] px-4 h-12 border-l border-slate-200 transition-colors ${
            // `value === false`, no `!value`: con null ninguno va resaltado, que
            // es la señal de que falta responder.
            value === false ? "bg-red-500 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
          }`}
        >
          {no}
        </button>
      </div>
    </div>
  );
}
