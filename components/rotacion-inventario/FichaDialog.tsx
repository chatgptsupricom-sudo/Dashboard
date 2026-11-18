"use client";

import { useEffect, useState } from "react";
import { HandCoins, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Aviso } from "@/components/administracion/comunes";
import { Avance, InsigniaColor, InsigniaEstado, fecha, num, pedir, usd } from "@/components/rotacion-inventario/comunes";
import { HORIZONTE_DIAS, etiquetaMes, folio, nombreSede, type EstadoSolicitud, type FichaProducto } from "@/lib/rotacion-inventario/tipos";

interface Detalle {
  hoy: string;
  meses: string[];
  ficha: FichaProducto | null;
  semanas: { semana: string; vendidas: number; meta: number | null }[];
  planes: { id: number; inicio: string; unidadesInicio: number; estado: string; cerradoEl: string | null; creadoPor: string | null; motivo: string | null; vendidas: number }[];
  solicitudes: { id: number; estado: EstadoSolicitud; creada: string; enviada: string | null; accionAcordada: string | null; excluida: boolean; apoyoUnitario: number | null; precioRemate: number | null }[];
}

const ESTADO_PLAN: Record<string, string> = {
  activo: "En curso",
  cumplido: "Cumplido (se agotó)",
  vencido: `Vencido a los ${HORIZONTE_DIAS} días`,
  reiniciado: "Reiniciado a mano",
};

/** Ficha de un producto en una sede: semáforo, plan de 90 días, ventas desde abril y solicitudes a la marca. */
export default function FichaDialog({
  companyId,
  productoId,
  puedeEditar,
  puedeGestionar,
  cerrar,
}: {
  companyId: number;
  productoId: number;
  puedeEditar: boolean;
  puedeGestionar: boolean;
  cerrar: (recargar: boolean) => void;
}) {
  const [d, setD] = useState<Detalle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reiniciando, setReiniciando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [cambio, setCambio] = useState(false);

  const cargar = () =>
    pedir<Detalle>(`/api/rotacion-inventario/producto?sede=${companyId}&id=${productoId}`)
      .then(setD)
      .catch((e) => setError(e.message));

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, productoId]);

  const reiniciar = async () => {
    setOcupado(true);
    try {
      await pedir("/api/rotacion-inventario/producto", { method: "POST", body: JSON.stringify({ sede: companyId, id: productoId, motivo }) });
      setReiniciando(false);
      setMotivo("");
      setCambio(true);
      setMensaje("Plan reiniciado con lo disponible hoy.");
      await cargar();
    } catch (e: any) {
      setMensaje(e.message);
    } finally {
      setOcupado(false);
    }
  };

  const pedirApoyo = async () => {
    setOcupado(true);
    try {
      const r = await pedir<{ solicitudes: number[] }>("/api/rotacion-inventario/solicitudes", {
        method: "POST",
        body: JSON.stringify({ sede: companyId, productos: [productoId] }),
      });
      setCambio(true);
      setMensaje(`Quedó en la solicitud ${r.solicitudes.map(folio).join(", ")} (Por enviar), en «Solicitudes a marcas».`);
      await cargar();
    } catch (e: any) {
      setMensaje(e.message);
    } finally {
      setOcupado(false);
    }
  };

  const f = d?.ficha;
  const p = f?.plan;
  const maxMes = f ? Math.max(1, ...f.vendidasPorMes) : 1;
  const maxSemana = d ? Math.max(1, ...d.semanas.map((s) => Math.max(s.vendidas, s.meta ?? 0))) : 1;
  const solicitudAbierta = d?.solicitudes.some((s) => !s.excluida && ["por_enviar", "enviada", "respondida", "acordada", "liquidando"].includes(s.estado));

  return (
    <Dialog open onOpenChange={(o) => !o && cerrar(cambio)}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-6">{f ? f.nombre : "Producto"}</DialogTitle>
          <DialogDescription>
            {f ? `${f.codigo || "sin código"} · ${f.marca} · ${f.categoria} · ${nombreSede(companyId)}` : nombreSede(companyId)}
          </DialogDescription>
        </DialogHeader>

        {!d && !error && (
          <div className="py-16 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          </div>
        )}
        {error && <Aviso tono="rojo">{error}</Aviso>}
        {d && !f && <Aviso>Este producto ya no tiene unidades disponibles en la sede.</Aviso>}
        {mensaje && <Aviso tono="azul">{mensaje}</Aviso>}

        {f && p && d && (
          <div className="space-y-5 text-sm">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Dato titulo="Semáforo" valor={<InsigniaColor color={f.color} />} detalle={`${f.diasSinVenta} días sin venta · desde ${fecha(f.colorDesde)}`} />
              <Dato titulo="Última venta" valor={fecha(f.ultimaVenta)} detalle={f.enStockDesde ? `Unidad más vieja: ${fecha(f.enStockDesde)}` : undefined} />
              <Dato titulo="Disponibles" valor={num(f.disponible)} detalle={f.reservado ? `${num(f.reservado)} reservadas · ${num(f.fisico)} físicas` : `Costo ${usd(f.costo, 2)}`} />
              <Dato titulo="Valor a costo" valor={usd(f.valorCosto)} detalle={f.costo ? `${usd(f.costo, 2)} c/u` : "Sin costo en Odoo"} />
            </div>

            <div className="rounded-xl border p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">
                  Plan de {HORIZONTE_DIAS} días: {fecha(p.inicio)} → {fecha(p.fin)}
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    {p.id ? `${p.diasTranscurridos} de ${HORIZONTE_DIAS} días · arrancó con ${num(p.unidadesInicio)} unidades` : "empieza hoy"}
                    {p.creadoPor ? ` · reiniciado por ${p.creadoPor}` : ""}
                  </span>
                </p>
                <div className="flex gap-2">
                  {puedeGestionar && !solicitudAbierta && (
                    <Button size="sm" variant="outline" onClick={pedirApoyo} disabled={ocupado}>
                      <HandCoins className="h-4 w-4 mr-2" /> Pedir apoyo a la marca
                    </Button>
                  )}
                  {puedeEditar && (
                    <Button size="sm" variant="outline" onClick={() => setReiniciando((v) => !v)} disabled={ocupado}>
                      <RotateCcw className="h-4 w-4 mr-2" /> Reiniciar plan
                    </Button>
                  )}
                </div>
              </div>
              {p.motivo && <p className="text-xs text-slate-500">Motivo del reinicio: {p.motivo}</p>}
              {reiniciando && (
                <div className="space-y-2 rounded-lg bg-slate-50 p-3">
                  <p className="text-xs text-slate-600">
                    El plan vuelve a empezar hoy con las {num(f.disponible)} unidades disponibles. Queda el historial del anterior.
                  </p>
                  <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por qué (ej. se bajó el precio a remate)" rows={2} />
                  <Button size="sm" onClick={reiniciar} disabled={ocupado || motivo.trim().length < 5}>
                    Reiniciar
                  </Button>
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Dato titulo="Venta diaria necesaria" valor={num(p.necesariaDiaria, 2)} detalle={`ritmo actual ${num(p.ritmoActual, 2)}/día (30 d)`} />
                <Dato titulo="Meta semanal" valor={`${num(p.vendidasSemana)} / ${num(p.metaSemanal, 1)}`} detalle={<Avance valor={p.avanceSemana} />} />
                <Dato titulo="Meta mensual" valor={`${num(p.vendidasMes)} / ${num(p.metaMensual, 1)}`} detalle={<Avance valor={p.avanceMes} />} />
                <Dato titulo="Avance del plan" valor={`${num(p.vendidasPlan)} / ${num(p.esperadoAHoy, 1)}`} detalle={<Avance valor={p.avancePlan} />} />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="rounded-xl border p-4">
                <p className="font-semibold mb-3">Vendidas por mes desde abril</p>
                <div className="flex items-end gap-2 h-32">
                  {d.meses.map((m, i) => (
                    <div key={m} className="flex-1 flex flex-col items-center justify-end h-full gap-1">
                      <span className="text-[10px] tabular-nums text-slate-600">{num(f.vendidasPorMes[i])}</span>
                      <div className="w-full rounded-t bg-blue-500/80" style={{ height: `${(Math.max(0, f.vendidasPorMes[i]) / maxMes) * 100}%`, minHeight: 2 }} />
                      <span className="text-[10px] text-slate-500">{etiquetaMes(m)}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500 mt-2">Total desde abril: {num(f.vendidasSeguimiento)} unidades.</p>
              </div>
              <div className="rounded-xl border p-4">
                <p className="font-semibold mb-3">Vendidas por semana vs. meta del plan</p>
                <div className="flex items-end gap-1 h-32 relative">
                  {d.semanas.slice(-14).map((s) => (
                    <div key={s.semana} className="flex-1 flex flex-col items-center justify-end h-full gap-1" title={`Semana del ${fecha(s.semana)}: ${num(s.vendidas)}`}>
                      <div className="w-full relative flex-1 flex items-end">
                        <div
                          className={`w-full rounded-t ${s.meta !== null && s.vendidas >= s.meta ? "bg-emerald-500" : "bg-amber-500"}`}
                          style={{ height: `${(Math.max(0, s.vendidas) / maxSemana) * 100}%`, minHeight: 2 }}
                        />
                        {s.meta !== null && (
                          <div className="absolute left-0 right-0 border-t-2 border-dashed border-slate-500" style={{ bottom: `${(s.meta / maxSemana) * 100}%` }} />
                        )}
                      </div>
                      <span className="text-[9px] text-slate-500">{s.semana.slice(8, 10)}/{s.semana.slice(5, 7)}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500 mt-2">Línea punteada = meta semanal ({num(p.metaSemanal, 1)} unidades).</p>
              </div>
            </div>
          </div>
        )}

        {d && (d.planes.length > 1 || d.solicitudes.length > 0) && (
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            {d.planes.length > 0 && (
              <div className="rounded-xl border p-4">
                <p className="font-semibold mb-2">Planes</p>
                <ul className="space-y-1.5">
                  {d.planes.map((pl) => (
                    <li key={pl.id} className="text-xs">
                      <b>{fecha(pl.inicio)}</b> · {num(pl.unidadesInicio)} u. · vendidas {num(pl.vendidas)} · {ESTADO_PLAN[pl.estado] ?? pl.estado}
                      {pl.cerradoEl ? ` el ${fecha(pl.cerradoEl)}` : ""}
                      {pl.motivo ? <span className="block text-slate-500">{pl.creadoPor}: {pl.motivo}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {d.solicitudes.length > 0 && (
              <div className="rounded-xl border p-4">
                <p className="font-semibold mb-2">Solicitudes a la marca</p>
                <ul className="space-y-1.5">
                  {d.solicitudes.map((s) => (
                    <li key={s.id} className="text-xs flex flex-wrap items-center gap-1.5">
                      <b>{folio(s.id)}</b>
                      <InsigniaEstado estado={s.estado} />
                      {s.excluida && <span className="text-slate-400">(quitado de la solicitud)</span>}
                      <span className="text-slate-500">
                        {s.enviada ? `enviada ${fecha(s.enviada)}` : `creada ${fecha(s.creada)}`}
                        {s.apoyoUnitario !== null ? ` · apoyo ${usd(s.apoyoUnitario, 2)}/u` : ""}
                        {s.precioRemate !== null ? ` · remate ${usd(s.precioRemate, 2)}` : ""}
                      </span>
                      {s.accionAcordada && <span className="block w-full text-slate-500">{s.accionAcordada}</span>}
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

function Dato({ titulo, valor, detalle }: { titulo: string; valor: React.ReactNode; detalle?: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-[11px] text-slate-500">{titulo}</p>
      <div className="text-base font-semibold mt-0.5">{valor}</div>
      {detalle && <div className="text-[11px] text-slate-500 mt-0.5">{detalle}</div>}
    </div>
  );
}
