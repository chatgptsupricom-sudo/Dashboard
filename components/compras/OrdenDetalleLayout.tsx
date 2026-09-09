"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { OrdenEstadoBadge } from "@/components/compras/OrdenEstadoBadge";
import { OrdenOdooBadge } from "@/components/compras/OrdenOdooBadge";
import { OrdenForm, type OrdenFormValue } from "@/components/compras/OrdenForm";
import { SEDES } from "@/lib/compras/constants";
import {
  ESTADO_ACCENT,
  ESTADO_DOT,
  ESTADO_LABEL,
  fmtMoneda,
  type OrdenDetalle,
} from "@/lib/compras/ordenes-types";

function sedeLabel(id: number | null) {
  return SEDES.find((s) => s.id === String(id))?.label ?? (id ? `Sede ${id}` : "—");
}

function fechaCorta(iso: string | null) {
  return iso ? iso.slice(0, 10) : "—";
}

export function OrdenDetalleEstados({
  loading,
  notFound,
  backHref,
}: {
  loading: boolean;
  notFound: boolean;
  backHref: string;
}) {
  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-slate-400">
        <Loader2 className="mr-2 h-6 w-6 animate-spin" /> Cargando orden…
      </div>
    );
  }
  if (notFound) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-slate-500">
        <AlertTriangle className="h-10 w-10 text-red-400" />
        <p>No encontramos esta orden.</p>
        <Link href={backHref} className="text-sm underline">
          Volver al listado
        </Link>
      </div>
    );
  }
  return null;
}

export function OrdenDetalleLayout({
  orden,
  form,
  onFormChange,
  disabled,
  saving,
  onSubmit,
  submitLabel,
  actions,
  backHref,
}: {
  orden: OrdenDetalle;
  form: OrdenFormValue;
  onFormChange: (v: OrdenFormValue) => void;
  disabled?: boolean;
  saving?: boolean;
  onSubmit?: () => void;
  submitLabel?: string;
  actions?: React.ReactNode;
  backHref: string;
}) {
  const datos = [
    { k: "Proveedor", v: orden.supplier_name || "—" },
    { k: "Sede", v: sedeLabel(orden.company_id) },
    { k: "Fecha esperada", v: fechaCorta(orden.expected_date) },
    { k: "Total", v: fmtMoneda(orden.total, orden.currency), strong: true },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Cabecera con riel de estado */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <span
          className={`absolute inset-y-0 left-0 w-1.5 ${ESTADO_ACCENT[orden.status]}`}
          aria-hidden
        />
        <div className="space-y-4 p-5 pl-6 sm:p-6 sm:pl-7">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Link href={backHref}>
              <Button variant="ghost" size="icon" className="-ml-2 h-8 w-8">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <h1 className="font-mono text-xl font-black tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">
              {orden.order_number}
            </h1>
            <OrdenEstadoBadge estado={orden.status} />
            <OrdenOdooBadge
              status={orden.odoo_sync_status}
              error={orden.odoo_sync_error}
              odooLive={orden.odoo_live}
            />
            <span className="w-full text-xs text-slate-400 sm:w-auto">
              Creada por {orden.created_by}
            </span>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            {datos.map((d) => (
              <div key={d.k} className="min-w-0">
                <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {d.k}
                </dt>
                <dd
                  className={
                    d.strong
                      ? "truncate text-sm font-black tabular-nums text-slate-900 dark:text-slate-100"
                      : "truncate text-sm text-slate-700 dark:text-slate-200"
                  }
                  title={String(d.v)}
                >
                  {d.v}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {orden.status === "rechazada" && orden.rejection_reason && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-950/40">
          <p className="text-sm font-semibold text-red-700 dark:text-red-300">
            Rechazada por {orden.approved_by ?? "el aprobador"}
          </p>
          <p className="mt-0.5 text-sm text-red-600 dark:text-red-300/90">
            {orden.rejection_reason}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="rounded-3xl border-slate-200 shadow-sm dark:border-slate-800 lg:col-span-2">
          <CardContent className="p-5 sm:p-6">
            <OrdenForm
              value={form}
              onChange={onFormChange}
              disabled={disabled}
              saving={saving}
              onSubmit={onSubmit}
              submitLabel={submitLabel}
              extraActions={actions}
            />
          </CardContent>
        </Card>

        <Card className="h-fit rounded-3xl border-slate-200 shadow-sm dark:border-slate-800">
          <CardContent className="p-5 sm:p-6">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Historial
            </h3>
            <ol className="mt-4 space-y-4">
              {(orden.history ?? []).length === 0 && (
                <li className="text-sm text-slate-400">Sin movimientos.</li>
              )}
              {(orden.history ?? []).map((h, i, arr) => (
                <li key={h.id} className="relative flex gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-white dark:ring-slate-900 ${ESTADO_DOT[h.to_status]}`}
                    />
                    {i < arr.length - 1 && (
                      <span className="mt-1 w-px flex-1 bg-slate-200 dark:bg-slate-700" />
                    )}
                  </div>
                  <div className="-mt-0.5 min-w-0 pb-1">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      {h.from_status ? `${ESTADO_LABEL[h.from_status]} → ` : ""}
                      {ESTADO_LABEL[h.to_status]}
                    </p>
                    <p className="text-xs text-slate-400">
                      {h.changed_by} ·{" "}
                      {new Date(h.created_at).toLocaleString("es", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    {h.comment && (
                      <p className="mt-1 rounded-lg bg-slate-50 px-2 py-1 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                        {h.comment}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
