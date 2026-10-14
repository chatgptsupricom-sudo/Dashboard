"use client";

import { FacturaBuscador, type FacturaElegida } from "@/components/notas-credito/FacturaBuscador";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  COLOR_ESTADO,
  ETIQUETA_ESTADO,
  formatoMonto,
  NOMBRE_SEDE,
  type BorradorNC,
  type CandidataNC,
  type SolicitudNC,
} from "@/lib/notas-credito/tipos";
import { CheckCircle2, Circle, ExternalLink, Loader2, RefreshCw, Trash2, XCircle } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Puede = { preaprobar: boolean; aprobar: boolean; rechazar: boolean; factura: boolean; odoo: boolean; superadmin: boolean };
type Evento = { accion: string; por: string | null; nota: string | null; created_at: string };
type Detalle = { solicitud: SolicitudNC; eventos: Evento[]; borrador: BorradorNC | null; candidatas: CandidataNC[]; puede: Puede };

const fecha = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString("es-VE", { dateStyle: "short", timeStyle: "short", timeZone: "America/Caracas" }) : "";

const ACCION_EVENTO: Record<string, string> = {
  solicitada: "Solicitada por RMA",
  creada: "Creada",
  preaprobada: "Preaprobada",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  factura: "Factura asignada",
  odoo_vinculada: "Nota de Odoo vinculada",
  odoo_editada: "Borrador ajustado",
  odoo_anulada: "Nota de Odoo anulada",
  procesada: "Hecha en Odoo",
  aviso: "Aviso",
};

export function DetalleNota({ id, onCerrar, onCambio }: { id: number; onCerrar: () => void; onCambio: () => void }) {
  const params = useParams();
  const locale = (params?.locale as string) || "es";
  const [d, setD] = useState<Detalle | null>(null);
  const [cargando, setCargando] = useState(true);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [nota, setNota] = useState("");
  const [rechazando, setRechazando] = useState(false);
  const [factura, setFactura] = useState<FacturaElegida | null>(null);
  const [cambiandoFactura, setCambiandoFactura] = useState(false);
  const [montoFactura, setMontoFactura] = useState("");
  const [candidatas, setCandidatas] = useState<CandidataNC[]>([]);
  // Borrador editable
  const [lineas, setLineas] = useState<Record<number, { cantidad: string; precio: string; quitar: boolean }>>({});
  const [nroCtrl, setNroCtrl] = useState("");
  const [fechaNC, setFechaNC] = useState("");

  const cargar = useCallback(async () => {
    setError("");
    try {
      const r = await fetch(`/api/notas-credito/${id}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "No se pudo cargar");
      setD(j);
      setCandidatas(j.candidatas || []);
      const b: BorradorNC | null = j.borrador;
      if (b) {
        setLineas(Object.fromEntries(b.lineas.map((l) => [l.id, { cantidad: String(l.cantidad), precio: String(l.precio), quitar: false }])));
        setNroCtrl(b.nro_ctrl || "");
        setFechaNC(b.fecha || "");
      }
    } catch (e: any) {
      setError(e?.message || "No se pudo cargar");
    } finally {
      setCargando(false);
    }
  }, [id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const accion = async (cuerpo: Record<string, unknown>, ok?: string) => {
    setTrabajando(true);
    setError("");
    setAviso("");
    try {
      const r = await fetch(`/api/notas-credito/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      const j = await r.json().catch(() => ({}));
      if (Array.isArray(j?.candidatas)) setCandidatas(j.candidatas);
      if (!r.ok) throw new Error(j?.error || "No se pudo hacer");
      if (j?.aviso) setAviso(j.aviso);
      else if (ok) setAviso(ok);
      setNota("");
      setRechazando(false);
      await cargar();
      onCambio();
    } catch (e: any) {
      setError(e?.message || "No se pudo hacer");
    } finally {
      setTrabajando(false);
    }
  };

  const s = d?.solicitud;
  const b = d?.borrador;
  const puede = d?.puede;
  const totalEditado = b
    ? b.lineas.reduce((acc, l) => {
        const e = lineas[l.id];
        if (!e || e.quitar) return acc;
        const factor = l.cantidad && l.precio ? (Number(e.cantidad) * Number(e.precio)) / (l.cantidad * l.precio) : 1;
        return acc + l.total * (Number.isFinite(factor) ? factor : 1);
      }, 0)
    : 0;
  const hayCambios =
    !!b &&
    (nroCtrl !== (b.nro_ctrl || "") ||
      fechaNC !== (b.fecha || "") ||
      b.lineas.some((l) => {
        const e = lineas[l.id];
        return e && (e.quitar || Number(e.cantidad) !== l.cantidad || Number(e.precio) !== l.precio);
      }));

  const guardarBorrador = () =>
    accion(
      {
        accion: "guardar_borrador",
        nro_ctrl: nroCtrl,
        ...(fechaNC ? { fecha: fechaNC } : {}),
        lineas: b!.lineas.map((l) => ({
          id: l.id,
          quitar: lineas[l.id]?.quitar,
          cantidad: Number(lineas[l.id]?.cantidad),
          precio: Number(lineas[l.id]?.precio),
        })),
      },
      "Borrador guardado en Odoo.",
    );

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            Nota de crédito NC-{id}
            {s && <Badge className={`${COLOR_ESTADO[s.estado]} border text-[11px]`}>{ETIQUETA_ESTADO[s.estado]}</Badge>}
          </DialogTitle>
        </DialogHeader>

        {cargando ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
          </div>
        ) : !s ? (
          <p className="text-sm text-red-600">{error || "No encontrada"}</p>
        ) : (
          <div className="space-y-5 text-sm">
            {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-red-700">{error}</div>}
            {aviso && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">{aviso}</div>}

            {/* Datos */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-4 space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {s.origen === "rma" ? "Equipo de RMA que no se puede reparar" : "Nota de crédito directa"} · {NOMBRE_SEDE[s.company_id] || s.company_id}
                </p>
                <p className="font-semibold text-slate-800">{s.cliente || "—"}</p>
                <p className="text-slate-600">Factura {s.factura_nombre || "sin asignar"}</p>
                {s.origen === "rma" && (
                  <p className="text-slate-600">
                    {s.case_id ? (
                      <Link href={`/${locale}/rma/casos/${s.case_id}`} className="text-blue-600 hover:underline">
                        RMA N.º {s.case_number}
                      </Link>
                    ) : (
                      `RMA N.º ${s.case_number}`
                    )}
                    {s.producto ? ` · ${s.producto}` : ""}
                    {s.serial ? <span className="font-mono text-xs"> · {s.serial}</span> : null}
                  </p>
                )}
                <p className="pt-1 text-base font-bold text-slate-900">
                  {s.monto != null ? formatoMonto(s.monto, s.moneda) : "Monto por definir"}
                  {s.total_factura != null && (
                    <span className="ml-2 text-xs font-normal text-slate-500">de {formatoMonto(s.total_factura, s.moneda)} facturado</span>
                  )}
                </p>
              </div>
              <div className="rounded-2xl bg-orange-50/60 p-4 space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-wider text-orange-700/70">Motivo</p>
                <p className="whitespace-pre-wrap text-slate-800">{s.motivo}</p>
                <p className="pt-1 text-xs text-slate-500">
                  {s.creado_por || "—"} · {fecha(s.created_at)}
                </p>
              </div>
            </div>

            {/* Pasos */}
            <ol className="grid gap-2 sm:grid-cols-4">
              {[
                { t: s.origen === "rma" ? "Solicitada (RMA)" : "Creada", hecho: true, quien: s.creado_por, cuando: s.created_at },
                ...(s.origen === "rma"
                  ? [{ t: "Preaprobada", hecho: !!s.preaprobado_at, quien: s.preaprobado_por, cuando: s.preaprobado_at, no: s.rechazado_paso === "preaprueba" }]
                  : []),
                { t: "Aprobada", hecho: !!s.aprobado_at, quien: s.aprobado_por, cuando: s.aprobado_at, no: s.rechazado_paso === "aprueba" },
                { t: "Hecha en Odoo", hecho: s.estado === "procesada", quien: s.procesado_por, cuando: s.procesado_at },
              ].map((p, i) => (
                <li key={i} className={`rounded-xl border px-3 py-2 ${p.no ? "border-rose-200 bg-rose-50" : p.hecho ? "border-emerald-200 bg-emerald-50" : "bg-white"}`}>
                  <p className="flex items-center gap-1.5 font-medium text-slate-800">
                    {p.no ? (
                      <XCircle className="h-4 w-4 text-rose-600" />
                    ) : p.hecho ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <Circle className="h-4 w-4 text-slate-300" />
                    )}
                    {p.no ? "Rechazada" : p.t}
                  </p>
                  {p.no ? (
                    <p className="text-xs text-slate-500">{s.rechazado_por} · {fecha(s.rechazado_at)}</p>
                  ) : p.hecho && p.quien ? (
                    <p className="text-xs text-slate-500">{p.quien} · {fecha(p.cuando)}</p>
                  ) : null}
                </li>
              ))}
            </ol>
            {s.estado === "rechazada" && s.motivo_rechazo && (
              <div className="rounded-xl bg-rose-50 px-4 py-2.5 text-rose-800 whitespace-pre-wrap">
                <span className="font-semibold">No procede:</span> {s.motivo_rechazo}
              </div>
            )}

            {/* Factura */}
            {puede?.factura && s.factura_id && !cambiandoFactura && (
              <button type="button" className="text-xs font-medium text-blue-700 hover:underline" onClick={() => setCambiandoFactura(true)}>
                ¿No es esa la factura? Cambiarla
              </button>
            )}
            {puede?.factura && (!s.factura_id || cambiandoFactura) && (
              <div className="rounded-2xl border p-4 space-y-2">
                <p className="font-semibold text-slate-800">{s.factura_id ? "Cambiar la factura" : "Asignar la factura de Odoo"}</p>
                {!s.factura_id && <p className="text-xs text-slate-500">No se encontró en Odoo la factura del caso; búscala para tener el monto.</p>}
                <FacturaBuscador companyId={s.company_id} elegida={factura} onElegir={setFactura} />
                {factura && (
                  <div className="flex flex-wrap items-end gap-2">
                    {s.origen === "directa" && (
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        className="w-40"
                        placeholder="Monto"
                        value={montoFactura}
                        onChange={(e) => setMontoFactura(e.target.value)}
                      />
                    )}
                    <Button
                      size="sm"
                      disabled={trabajando}
                      onClick={() =>
                        accion(
                          { accion: "factura", factura_id: factura.id, ...(montoFactura ? { monto: Number(montoFactura) } : {}) },
                          "Factura asignada.",
                        ).then(() => {
                          setFactura(null);
                          setCambiandoFactura(false);
                        })
                      }
                    >
                      Usar esta factura
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Decisión */}
            {(puede?.preaprobar || puede?.aprobar) && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-4 space-y-3">
                <p className="font-semibold text-slate-800">
                  {puede.preaprobar ? "¿Pasa a Gabriel para aprobación?" : "¿Se aprueba la nota de crédito?"}
                </p>
                <Textarea
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  placeholder={rechazando ? "Por qué no procede (obligatorio)" : "Comentario (opcional)"}
                  rows={2}
                />
                <div className="flex flex-wrap gap-2">
                  {!rechazando ? (
                    <>
                      <Button
                        disabled={trabajando}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => accion({ accion: puede.preaprobar ? "preaprobar" : "aprobar", nota }, puede.preaprobar ? "Preaprobada." : "Aprobada.")}
                      >
                        {trabajando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {puede.preaprobar ? "Preaprobar" : "Aprobar"}
                      </Button>
                      <Button variant="outline" className="border-rose-300 text-rose-700" disabled={trabajando} onClick={() => setRechazando(true)}>
                        Rechazar
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        disabled={trabajando || nota.trim().length < 5}
                        className="bg-rose-600 hover:bg-rose-700 text-white"
                        onClick={() => accion({ accion: "rechazar", motivo: nota }, "Rechazada: no procede.")}
                      >
                        Confirmar rechazo
                      </Button>
                      <Button variant="ghost" disabled={trabajando} onClick={() => setRechazando(false)}>
                        Cancelar
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Odoo */}
            {(s.estado === "aprobada" || s.estado === "procesada") && (
              <div className="rounded-2xl border p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-slate-800">Nota de crédito en Odoo</p>
                  <div className="flex items-center gap-2">
                    {b && (
                      <a href={b.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline">
                        Abrir en Odoo <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    <Button size="sm" variant="ghost" disabled={trabajando} onClick={() => accion({ accion: "sincronizar" })} title="Actualizar desde Odoo">
                      <RefreshCw className={`h-4 w-4 ${trabajando ? "animate-spin" : ""}`} />
                    </Button>
                  </div>
                </div>

                {!s.odoo_move_id ? (
                  puede?.odoo ? (
                    <div className="space-y-3">
                      <p className="text-slate-600">
                        Hazla aquí o directo en Odoo (Revertir la factura {s.factura_nombre || ""}): si la haces en Odoo, el panel la
                        encuentra sola al actualizar.
                      </p>
                      {candidatas.length > 0 && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
                          <p className="text-amber-900">Ya hay en Odoo una nota de crédito de esta factura hecha después de la solicitud:</p>
                          {candidatas.map((c) => (
                            <div key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                              <span>
                                <strong>{c.nombre}</strong> · {c.estado === "posted" ? "publicada" : "borrador"} · {formatoMonto(c.total, s.moneda)} ·{" "}
                                {c.creado_por}
                              </span>
                              <Button size="sm" variant="outline" disabled={trabajando} onClick={() => accion({ accion: "vincular", move_id: c.id }, "Vinculada.")}>
                                Es esta, vincular
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                      <Button
                        disabled={trabajando || !s.factura_id}
                        onClick={() => accion({ accion: "crear_odoo", crear_igual: candidatas.length > 0 }, "Borrador creado en Odoo.")}
                      >
                        {trabajando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {candidatas.length ? "Crear otra en Odoo igual" : "Crear el borrador en Odoo"}
                      </Button>
                      {!s.factura_id && <p className="text-xs text-rose-600">Falta asignar la factura.</p>}
                    </div>
                  ) : (
                    <p className="text-slate-500">Aprobada: la orden de crédito está con quien hace la nota.</p>
                  )
                ) : !b ? (
                  <p className="text-slate-500">{s.odoo_move_nombre || "Nota vinculada"} · no se pudo leer de Odoo ahora.</p>
                ) : (
                  <div className="space-y-3">
                    <p className="text-slate-700">
                      <strong>{b.nombre}</strong> · {b.estado === "posted" ? "publicada" : b.estado === "draft" ? "borrador" : b.estado} · {b.ref}
                    </p>
                    <div className="overflow-x-auto rounded-xl border">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 text-slate-500">
                          <tr>
                            <th className="px-2 py-1.5 text-left">Producto</th>
                            <th className="px-2 py-1.5 text-right">Cant.</th>
                            <th className="px-2 py-1.5 text-right">Precio</th>
                            <th className="px-2 py-1.5 text-left">Impuestos</th>
                            <th className="px-2 py-1.5 text-right">Total</th>
                            {b.estado === "draft" && puede?.odoo && <th />}
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {b.lineas.map((l) => {
                            const e = lineas[l.id];
                            const editable = b.estado === "draft" && puede?.odoo;
                            return (
                              <tr key={l.id} className={e?.quitar ? "opacity-40 line-through" : ""}>
                                <td className="px-2 py-1.5">{l.producto || l.descripcion}</td>
                                <td className="px-2 py-1.5 text-right">
                                  {editable ? (
                                    <Input
                                      type="number"
                                      step="any"
                                      className="h-7 w-20 text-right text-xs"
                                      value={e?.cantidad ?? ""}
                                      onChange={(ev) => setLineas((x) => ({ ...x, [l.id]: { ...x[l.id], cantidad: ev.target.value } }))}
                                    />
                                  ) : (
                                    l.cantidad
                                  )}
                                </td>
                                <td className="px-2 py-1.5 text-right">
                                  {editable ? (
                                    <Input
                                      type="number"
                                      step="any"
                                      className="h-7 w-24 text-right text-xs"
                                      value={e?.precio ?? ""}
                                      onChange={(ev) => setLineas((x) => ({ ...x, [l.id]: { ...x[l.id], precio: ev.target.value } }))}
                                    />
                                  ) : (
                                    l.precio.toFixed(2)
                                  )}
                                </td>
                                <td className="px-2 py-1.5 text-slate-500">{l.impuestos}</td>
                                <td className="px-2 py-1.5 text-right">{l.total.toFixed(2)}</td>
                                {editable && (
                                  <td className="px-1">
                                    <button
                                      type="button"
                                      title={e?.quitar ? "Dejar la línea" : "Quitar la línea"}
                                      onClick={() => setLineas((x) => ({ ...x, [l.id]: { ...x[l.id], quitar: !x[l.id]?.quitar } }))}
                                    >
                                      <Trash2 className="h-3.5 w-3.5 text-slate-400 hover:text-rose-600" />
                                    </button>
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-right text-slate-700">
                      Total en Odoo <strong>{formatoMonto(b.total, b.moneda)}</strong>
                      {hayCambios && <span className="text-slate-500"> · con tus cambios ≈ {formatoMonto(totalEditado, b.moneda)}</span>}
                      {s.monto != null && <span className="text-slate-500"> · aprobado {formatoMonto(s.monto, s.moneda)}</span>}
                    </p>
                    {b.estado === "draft" && puede?.odoo && (
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-3">
                          <label className="space-y-1">
                            <span className="text-xs text-slate-500">Número de control</span>
                            <Input value={nroCtrl} onChange={(e) => setNroCtrl(e.target.value)} className="w-44" />
                          </label>
                          <label className="space-y-1">
                            <span className="text-xs text-slate-500">Fecha</span>
                            <Input type="date" value={fechaNC} onChange={(e) => setFechaNC(e.target.value)} className="w-44" />
                          </label>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" disabled={trabajando || !hayCambios} onClick={guardarBorrador}>
                            Guardar en Odoo
                          </Button>
                          <Button
                            className="bg-emerald-600 hover:bg-emerald-700 text-white"
                            disabled={trabajando || hayCambios}
                            title={hayCambios ? "Guarda los cambios primero" : ""}
                            onClick={() => accion({ accion: "publicar" }, "Publicada en Odoo.")}
                          >
                            {trabajando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Publicar en Odoo
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Historial */}
            {d!.eventos.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Historial</p>
                <ul className="space-y-1">
                  {d!.eventos.map((e, i) => (
                    <li key={i} className="text-xs text-slate-600">
                      <span className="text-slate-400">{fecha(e.created_at)}</span> · <strong>{ACCION_EVENTO[e.accion] || e.accion}</strong>
                      {e.por ? ` · ${e.por}` : ""}
                      {e.nota ? <span className="block whitespace-pre-wrap pl-3 text-slate-500">{e.nota}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
