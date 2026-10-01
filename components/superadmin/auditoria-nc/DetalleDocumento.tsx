"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, CircleDot, Loader2, PenLine } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ALERTAS } from "@/lib/auditoria-nc/analisis";
import { ChipEstado, ChipSeveridad, LinkOdoo } from "./Comunes";
import { ESTADO_EVENTO, PAGO, dinero, fecha, fechaHora, type Alerta, type Cambio, type Documento, type Evento } from "./formato";

export interface DocumentoAbierto { id: number; numero: string; sede: string; alertas: Alerta[] }

interface Detalle {
  documento: Documento;
  origen: Documento | null;
  notasCredito: { id: number; numero: string; base: number; fecha: string | null }[];
  eventos: Evento[];
  cambios: Cambio[];
  impuestos: { hay: boolean; aExento: boolean; soloIgtf: boolean; detalle: string };
  lineasImpuesto: number;
}

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-0.5 text-sm text-slate-800 break-words">{children}</div>
    </div>
  );
}

const valor = (c: Cambio, lado: "antes" | "despues") => {
  const n = lado === "antes" ? c.antesNum : c.despuesNum;
  if (c.campo === "amount_untaxed" || c.campo === "amount_total") return n != null ? dinero(n) : "–";
  const t = lado === "antes" ? c.antes : c.despues;
  return t && t !== "0" ? t : "–";
};

export function DetalleDocumento({ abierto, onClose }: { abierto: DocumentoAbierto | null; onClose: () => void }) {
  const [det, setDet] = useState<Detalle | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    let cancelado = false;
    setDet(null);
    setError(null);
    setCargando(true);
    fetch(`/api/superadmin/auditoria-nc/documento?id=${abierto.id}`)
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (cancelado) return;
        if (r.ok && j?.success) setDet(j.data);
        else setError(j?.error || "No se pudo leer el documento");
      })
      .catch(() => { if (!cancelado) setError("No se pudo leer el documento"); })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
  }, [abierto]);

  const d = det?.documento;
  // Línea de tiempo: cambios de estado y de campos, en orden.
  const linea = det
    ? [
        ...det.eventos.map((e) => ({ fecha: e.fecha, usuario: e.usuario, tipo: "estado" as const, texto: `${ESTADO_EVENTO[e.de] || "Nuevo"} → ${ESTADO_EVENTO[e.a]}`, a: e.a })),
        ...det.cambios.map((c) => ({ fecha: c.fecha, usuario: c.usuario, tipo: "cambio" as const, texto: `${c.etiqueta}: ${valor(c, "antes")} → ${valor(c, "despues")}`, a: "" })),
      ].sort((x, y) => x.fecha.localeCompare(y.fecha))
    : [];

  return (
    <Sheet open={!!abierto} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
        {abierto && (
          <>
            <SheetHeader className="border-b border-slate-100 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle className="text-xl font-black">{abierto.numero}</SheetTitle>
                {d && <ChipEstado estado={d.estado} />}
                {d?.intercompania && <span className="rounded-md bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700 ring-1 ring-inset ring-violet-600/20">Intercompañía</span>}
              </div>
              <SheetDescription>
                {d ? `${d.tipo === "out_refund" ? "Nota de crédito" : "Factura"} · ${abierto.sede} · ${d.cliente}` : abierto.sede}
              </SheetDescription>
              <div><LinkOdoo id={abierto.id} /></div>
            </SheetHeader>

            <div className="space-y-6 p-5">
              {abierto.alertas.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-bold text-slate-800">Alertas</p>
                  {abierto.alertas.map((a, i) => (
                    <div key={i} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <ChipSeveridad severidad={a.severidad} texto={ALERTAS[a.codigo]?.titulo ?? a.codigo} />
                        <span className="text-sm text-slate-700">{a.texto}</span>
                      </div>
                      {ALERTAS[a.codigo] && <p className="mt-1.5 text-xs text-slate-500">{ALERTAS[a.codigo].explicacion}</p>}
                    </div>
                  ))}
                </div>
              )}

              {cargando && <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Leyendo historial en Odoo…</div>}
              {error && <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"><AlertTriangle size={16} /> {error}</div>}

              {d && (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <Dato label="Fecha">{fecha(d.fecha)}</Dato>
                  <Dato label="Base sin IVA">{dinero(d.base)}</Dato>
                  <Dato label="Total">{dinero(d.total)}</Dato>
                  <Dato label="Vendedor">{d.vendedor || "–"}</Dato>
                  <Dato label="Creado por">{d.creadoPor || "–"}<p className="text-xs text-slate-400">{fechaHora(d.creado)}</p></Dato>
                  <Dato label="Pago">{PAGO[d.estadoPago] || d.estadoPago || "–"}{d.residual > 0.01 && <p className="text-xs text-slate-400">Pendiente {dinero(d.residual)}</p>}</Dato>
                  {d.tipo === "out_refund" && <div className="col-span-2 sm:col-span-3"><Dato label="Motivo">{d.motivo || <span className="text-red-600">Sin motivo</span>}</Dato></div>}
                  <Dato label="Diario">{d.diario || "–"}</Dato>
                </div>
              )}

              {det?.origen && (
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Factura que revierte</p>
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-800">{det.origen.numero} · {fecha(det.origen.fecha)} · {dinero(det.origen.base)}</p>
                    <LinkOdoo id={det.origen.id} texto="Ver factura" />
                  </div>
                  <p className="text-xs text-slate-500">{det.origen.cliente} · Vendedor {det.origen.vendedor || "–"} · {PAGO[det.origen.estadoPago] || det.origen.estadoPago}</p>
                </div>
              )}

              {det && det.notasCredito.length > 0 && (
                <div>
                  <p className="text-sm font-bold text-slate-800 mb-2">Notas de crédito sobre {det.documento.tipo === "out_invoice" ? "esta factura" : "la misma factura"}</p>
                  <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {det.notasCredito.map((n) => (
                      <li key={n.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                        <span className={n.id === abierto.id ? "font-bold" : ""}>{n.numero} · {fecha(n.fecha)}</span>
                        <span className="flex items-center gap-3"><span className="tabular-nums">{dinero(n.base)}</span><LinkOdoo id={n.id} texto="Odoo" /></span>
                      </li>
                    ))}
                    <li className="flex justify-between px-3 py-2 text-sm font-semibold bg-slate-50">
                      <span>Total acreditado</span>
                      <span className="tabular-nums">{dinero(det.notasCredito.reduce((s, n) => s + n.base, 0))}{det.origen ? ` de ${dinero(det.origen.base)}` : ""}</span>
                    </li>
                  </ul>
                </div>
              )}

              {det && (
                <div>
                  <p className="text-sm font-bold text-slate-800 mb-2">Historial en Odoo</p>
                  {det.impuestos.hay && (
                    <p className={`mb-2 rounded-lg px-3 py-2 text-xs ${det.impuestos.aExento ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>
                      Impuestos cambiados ({det.lineasImpuesto} registros de línea): {det.impuestos.detalle}
                    </p>
                  )}
                  {linea.length === 0 ? (
                    <p className="text-sm text-slate-400">Sin cambios registrados.</p>
                  ) : (
                    <ol className="relative space-y-3 border-l border-slate-200 pl-5">
                      {linea.map((x, i) => (
                        <li key={i} className="relative">
                          <span className={`absolute -left-[27px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white ring-2 ${x.tipo === "estado" ? (x.a === "cancel" ? "ring-red-400" : x.a === "draft" ? "ring-amber-400" : "ring-emerald-400") : "ring-slate-300"}`}>
                            {x.tipo === "estado" ? <CircleDot size={10} className="text-slate-500" /> : <PenLine size={9} className="text-slate-400" />}
                          </span>
                          <p className={`text-sm ${x.tipo === "estado" ? "font-semibold text-slate-800" : "text-slate-700"}`}>
                            {x.texto.split(" → ").length === 2 && x.tipo === "estado"
                              ? <>{x.texto.split(" → ")[0]} <ArrowRight size={12} className="inline" /> {x.texto.split(" → ")[1]}</>
                              : x.texto}
                          </p>
                          <p className="text-xs text-slate-400">{fechaHora(x.fecha)} · {x.usuario || "–"}</p>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
