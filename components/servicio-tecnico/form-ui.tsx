"use client";

import { AlertCircle, Mail } from "lucide-react";

/**
 * Piezas comunes de los formularios del portal: el reporte con factura
 * (reporte-form) y el de equipos externos (reporte-externo-form).
 */

export const EMAIL_SOPORTE = "soporte.tecnico@supricom.com.ve";

export function MensajeError({ id, texto }: { id: string; texto: string }) {
  return (
    <p id={id} role="alert" className="pt-error">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      {texto}
    </p>
  );
}

export function Pasos({ actual, etiquetas }: { actual: number; etiquetas: string[] }) {
  const pct = Math.round((actual / etiquetas.length) * 100);
  return (
    <div
      className="pt-progress"
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={etiquetas.length}
      aria-valuenow={actual}
      aria-label={etiquetas.join(" › ")}
    >
      <div className="pt-progress__track">
        <div className="pt-progress__fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="pt-progress__crumbs">
        {etiquetas.map((etiqueta, i) => {
          const n = i + 1;
          const cls = n === actual ? "is-now" : n < actual ? "is-done" : undefined;
          return (
            <span key={etiqueta}>
              <span className={cls}>{etiqueta}</span>
              {i < etiquetas.length - 1 && (
                <span className="pt-progress__sep" aria-hidden>
                  ›
                </span>
              )}
            </span>
          );
        })}
      </p>
    </div>
  );
}

export function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="pt-summary__row">
      <dt>{etiqueta}</dt>
      <dd>{valor}</dd>
    </div>
  );
}

export function Aviso({ texto, ayuda }: { texto: string; ayuda: string }) {
  return (
    <div className="pt-panel mt-6">
      <p className="flex gap-2 text-sm">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>{texto}</span>
      </p>
      <a
        href={`mailto:${EMAIL_SOPORTE}`}
        className="portal-btn portal-btn-outline mt-3 w-full"
      >
        <Mail className="h-4 w-4" aria-hidden />
        {ayuda}
      </a>
    </div>
  );
}
