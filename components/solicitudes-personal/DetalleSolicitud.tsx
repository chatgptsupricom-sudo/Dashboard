"use client";

import { inputCls, Pastilla } from "@/components/rrhh/seleccion/comunes";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SEDES_SELECCION } from "@/lib/seleccion/tipos";
import { ESTADOS, MOTIVOS, URGENCIAS, type Evento, type Solicitud } from "@/lib/solicitudes-personal/tipos";
import { ExternalLink, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { enviar } from "./FormSolicitud";

export const fechaHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("es-VE", { timeZone: "America/Caracas", dateStyle: "short", timeStyle: "short" }) : "—";

const ACCIONES: Record<string, string> = {
  creada: "Creó la solicitud",
  editada: "Editó la solicitud",
  retirada: "Retiró la solicitud",
  aprobada: "Aprobó la solicitud",
  rechazada: "Rechazó la solicitud",
};

function Dato({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500">{titulo}</p>
      <div className="whitespace-pre-wrap text-sm text-slate-800">{children || "—"}</div>
    </div>
  );
}

/** Avance de la búsqueda en Selección, en una línea (lo usan la lista y el detalle). */
export function LineaAvance({ s }: { s: Solicitud }) {
  const a = s.avance;
  if (!a) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
      <Pastilla tono={a.tono}>Búsqueda: {a.etiqueta}</Pastilla>
      <span>
        {a.contratados} de {a.vacantes} contratado{a.vacantes === 1 ? "" : "s"}
      </span>
      <span>
        {a.candidatos} candidato{a.candidatos === 1 ? "" : "s"} en proceso
      </span>
      {a.fase && <span>Más avanzado: {a.fase.toLowerCase()}</span>}
      {a.dias != null && (
        <span className={a.dias > a.meta ? "font-semibold text-red-600" : ""}>
          {a.dias} de {a.meta} días
        </span>
      )}
    </div>
  );
}

export function DetalleSolicitud({
  id,
  locale,
  esSuper,
  esRRHH,
  miEmail,
  onCerrar,
  onEditar,
  onCambio,
}: {
  id: number | null;
  locale: string;
  esSuper: boolean;
  esRRHH: boolean;
  miEmail: string;
  onCerrar: () => void;
  onEditar: (s: Solicitud) => void;
  onCambio: () => void;
}) {
  const [s, setS] = useState<Solicitud | null>(null);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    setS(null);
    setError(null);
    setRechazando(false);
    setMotivo("");
    if (id == null) return;
    fetch(`/api/solicitudes-personal/${id}`)
      .then((r) => r.json().then((j) => (r.ok ? j : Promise.reject(new Error(j?.error || "Error")))))
      .then((j) => {
        setS(j.solicitud);
        setEventos(j.historial || []);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  const accion = async (cuerpo: object) => {
    setOcupado(true);
    setError(null);
    try {
      await enviar(`/api/solicitudes-personal/${id}`, "PATCH", cuerpo);
      onCambio();
      onCerrar();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setOcupado(false);
    }
  };

  const mia = s?.solicitante_email === miEmail;
  const pendiente = s?.estado === "pendiente";

  return (
    <Dialog open={id != null} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{s ? `SP-${s.id} · ${s.cargo}` : "Solicitud de personal"}</DialogTitle>
        </DialogHeader>

        {!s && !error && <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />}

        {s && (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <Pastilla tono={ESTADOS[s.estado].tono}>{ESTADOS[s.estado].etiqueta}</Pastilla>
              <Pastilla tono={URGENCIAS[s.urgencia].tono}>Urgencia {URGENCIAS[s.urgencia].etiqueta.toLowerCase()}</Pastilla>
            </div>

            {s.estado === "aprobada" && (
              <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                <p>
                  Aprobada por <b>{s.decidido_por_nombre}</b> el {fechaHora(s.decidido_at)}.
                </p>
                <LineaAvance s={s} />
                {(esRRHH || esSuper) && s.avance && (
                  <Link
                    href={`/${locale}/recursos_humanos/seleccion`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 underline"
                  >
                    Abrir {s.avance.codigo} en Selección <ExternalLink className="h-3 w-3" />
                  </Link>
                )}
              </div>
            )}
            {s.estado === "rechazada" && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                Rechazada por <b>{s.decidido_por_nombre}</b> el {fechaHora(s.decidido_at)}: {s.motivo_rechazo}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Dato titulo="Pedida por">
                {s.solicitante_nombre} · {fechaHora(s.created_at)}
              </Dato>
              <Dato titulo="Sede y área">
                {SEDES_SELECCION[s.sede]}
                {s.area && ` · ${s.area}`}
              </Dato>
              <Dato titulo="Cantidad">{s.cantidad}</Dato>
              <Dato titulo="Motivo">
                {MOTIVOS[s.motivo]}
                {s.reemplaza && `: reemplaza a ${s.reemplaza}`}
              </Dato>
              <Dato titulo="Ingreso deseado">{s.fecha_deseada ? s.fecha_deseada.split("-").reverse().join("/") : ""}</Dato>
              <Dato titulo="Salario o rango">{s.salario}</Dato>
            </div>
            <Dato titulo="Perfil y funciones">{s.perfil}</Dato>
            <Dato titulo="Requisitos">{s.requisitos}</Dato>

            {eventos.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold text-slate-500">Historial</p>
                <ul className="space-y-1 text-xs text-slate-600">
                  {eventos.map((e) => (
                    <li key={e.id}>
                      {fechaHora(e.created_at)} · <b>{e.usuario}</b> · {ACCIONES[e.accion] ?? e.accion}
                      {e.detalle && e.accion !== "rechazada" ? ` (${e.detalle})` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {esSuper && pendiente && rechazando && (
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-slate-600">Motivo del rechazo (lo ve quien la pidió)</span>
                <textarea className={`${inputCls} min-h-20`} value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={2000} autoFocus />
              </label>
            )}
          </div>
        )}

        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {s && pendiente && (esSuper || mia) && (
          <DialogFooter className="flex-wrap gap-2">
            {mia && !rechazando && (
              <>
                <Button variant="outline" disabled={ocupado} onClick={() => accion({ accion: "retirar" })}>
                  Retirar
                </Button>
                <Button variant="outline" disabled={ocupado} onClick={() => onEditar(s)}>
                  Editar
                </Button>
              </>
            )}
            {esSuper &&
              (rechazando ? (
                <>
                  <Button variant="outline" disabled={ocupado} onClick={() => setRechazando(false)}>
                    Volver
                  </Button>
                  <Button variant="destructive" disabled={ocupado || !motivo.trim()} onClick={() => accion({ accion: "rechazar", motivo })}>
                    Confirmar rechazo
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" disabled={ocupado} onClick={() => setRechazando(true)}>
                    Rechazar
                  </Button>
                  <Button disabled={ocupado} onClick={() => accion({ accion: "aprobar" })}>
                    {ocupado && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Aprobar y pasar a RRHH
                  </Button>
                </>
              ))}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
