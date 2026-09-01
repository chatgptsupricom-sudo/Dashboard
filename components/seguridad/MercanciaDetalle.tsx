"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Loader2, Package } from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth.store";
import { StarRating, StarRatingDisplay } from "@/components/seguridad/StarRating";
import { fechaCorta } from "@/lib/fecha";
import FirmasActa from "@/components/seguridad/FirmasActa";
import { PageHeader, Card, SectionTitle, BotonPrimario, inputClases } from "./mercancia-ui";

/**
 * Verificacion en el porton y calificacion del almacenista.
 *
 * Se cuenta renglon por renglon contra lo que Odoo dice que subio al camion.
 * Un renglon sin contar se queda vacio a proposito: "no lo he contado" y
 * "conte cero" no son lo mismo, y confundirlos marcaria faltante todo lo que
 * aun no se ha revisado.
 */

type Item = {
  id: number;
  producto: string;
  codigo: string | null;
  cantidad_cargada: string | number;
  cantidad_verificada: string | number | null;
  observacion: string | null;
  no_salio: number | boolean;
};

type Movimiento = {
  id: number;
  tipo: "ingreso" | "egreso";
  fecha: string;
  odoo_picking_name: string | null;
  contraparte: string | null;
  almacenista_nombre: string;
  almacenistas: string[];
  facturas: string[];
  chofer_nombre: string | null;
  placa_vehiculo: string | null;
  estado: "pendiente" | "conforme" | "descuadre";
  verificado_por: string | null;
  observaciones: string | null;
};

type Calificacion = {
  id: number;
  almacenista_nombre: string;
  calificacion: number | string;
  comentario: string | null;
};

export default function MercanciaDetalle({
  tipo,
  id,
}: {
  tipo: "ingreso" | "egreso";
  id: string;
}) {
  const tm = useTranslations("seguridad.mercancia");
  const tc = useTranslations("seguridad.calificacion");
  const params = useParams();
  const locale = (params?.locale as string) || "es";
  const { user } = useAuthStore();
  const base = `/${locale}/seguridad/mercancia/${tipo}`;

  const [mov, setMov] = useState<Movimiento | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [calificaciones, setCalificaciones] = useState<Calificacion[]>([]);
  const [conteos, setConteos] = useState<Record<number, string>>({});
  // "No salio" y su motivo (issue #44): senal aparte del conteo numerico, por
  // eso vive en su propio estado en vez de reusar `conteos`.
  const [noSalio, setNoSalio] = useState<Record<number, boolean>>({});
  const [motivos, setMotivos] = useState<Record<number, string>>({});
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Un formulario de calificacion en curso por almacenista, gateado por nombre.
  const [estrellasPor, setEstrellasPor] = useState<Record<string, number>>({});
  const [comentarioPor, setComentarioPor] = useState<Record<string, string>>({});

  const rol = (user?.role || "").toLowerCase().trim();
  // Almacen preparo el registro (issue #43): ve el estado, pero no verifica
  // en el porton ni firma ni califica — eso es exclusivo de Seguridad.
  const esAlmacen = rol === "almacen";

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/seguridad/mercancia/${id}`);
      if (!res.ok) return;
      const json = await res.json();
      setMov(json.movimiento);
      setItems(json.items || []);
      setCalificaciones(json.calificaciones || []);
      const previos: Record<number, string> = {};
      const noSalioPrevios: Record<number, boolean> = {};
      const motivosPrevios: Record<number, string> = {};
      for (const it of json.items || []) {
        previos[it.id] =
          it.cantidad_verificada === null || it.cantidad_verificada === undefined
            ? ""
            : String(Number(it.cantidad_verificada));
        noSalioPrevios[it.id] = Number(it.no_salio) === 1;
        motivosPrevios[it.id] = it.observacion || "";
      }
      setConteos(previos);
      setNoSalio(noSalioPrevios);
      setMotivos(motivosPrevios);
    } finally {
      setCargando(false);
    }
  }, [id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Ningun envio a medias: si algun renglon quedo marcado "No salio" sin
  // motivo, el boton de abajo se desactiva antes de llegar al backend.
  const faltaMotivo = items.some((it) => noSalio[it.id] && !motivos[it.id]?.trim());

  const verificar = async () => {
    setError(null);
    if (faltaMotivo) {
      setError(tm("motivo_obligatorio"));
      return;
    }
    setGuardando(true);
    try {
      const res = await fetch(`/api/seguridad/mercancia/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verificado_por: user?.name || user?.email || "Seguridad",
          items: items.map((it) => ({
            id: it.id,
            cantidad_verificada:
              conteos[it.id] === "" || conteos[it.id] === undefined
                ? null
                : Number(conteos[it.id]),
            no_salio: !!noSalio[it.id],
            observacion: noSalio[it.id] ? (motivos[it.id] || "").trim() : null,
          })),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || tm("error"));
      setMov(json.movimiento);
      setItems(json.items || []);
    } catch (e: any) {
      setError(e?.message || tm("error"));
    } finally {
      setGuardando(false);
    }
  };

  const calificar = async (almacenistaNombre: string) => {
    const estrellas = estrellasPor[almacenistaNombre] || 0;
    if (!mov || estrellas < 1) return;
    try {
      await fetch("/api/seguridad/calificar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          almacenista_nombre: almacenistaNombre,
          calificacion: estrellas,
          relacionado_a: "mercancia",
          relacionado_id: mov.id,
          comentario: (comentarioPor[almacenistaNombre] || "").trim() || null,
          calificado_por: user?.name || user?.email || "Seguridad",
        }),
      });
      setEstrellasPor((p) => ({ ...p, [almacenistaNombre]: 0 }));
      setComentarioPor((p) => ({ ...p, [almacenistaNombre]: "" }));
      void cargar();
    } catch {
      // El fallo de la calificacion no debe tapar la verificacion.
    }
  };

  if (cargando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-300">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }
  if (!mov) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-400 text-sm">
        {tm("vacio")}
      </div>
    );
  }

  // El resumen distingue las dos senales: lo marcado explicitamente "no
  // salio" y lo que solo difiere en cantidad (issue #44). Un renglon
  // marcado "no salio" cuenta ahi, no en la diferencia de cantidad, aunque
  // ademas tenga un numero distinto.
  const noSalioCount = items.filter((i) => noSalio[i.id]).length;
  const diferenciaCantidadCount = items.filter((i) => {
    const contado = conteos[i.id];
    return (
      !noSalio[i.id] &&
      contado !== "" &&
      contado !== undefined &&
      Number(contado) !== Number(i.cantidad_cargada)
    );
  }).length;
  const diferencias = noSalioCount + diferenciaCantidadCount;

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <PageHeader
        titulo={mov.odoo_picking_name || tm("sin_factura")}
        subtitulo={`${fechaCorta(mov.fecha)} · ${(mov.almacenistas?.length ? mov.almacenistas : [mov.almacenista_nombre]).join(", ")}`}
        volverA={base}
      />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-4 pb-28">
        {/* Resultado de la verificacion, arriba: es lo que se mira primero */}
        {mov.estado === "descuadre" ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-800">{tm("descuadre")}</p>
              <p className="text-sm text-red-700">
                {tm("descuadre_aviso", { count: diferencias })}
              </p>
              {(noSalioCount > 0 || diferenciaCantidadCount > 0) && (
                <ul className="mt-1 text-xs text-red-600 list-disc list-inside">
                  {noSalioCount > 0 && (
                    <li>{tm("no_salio_resumen", { count: noSalioCount })}</li>
                  )}
                  {diferenciaCantidadCount > 0 && (
                    <li>
                      {tm("diferencia_cantidad_resumen", {
                        count: diferenciaCantidadCount,
                      })}
                    </li>
                  )}
                </ul>
              )}
            </div>
          </div>
        ) : mov.estado === "conforme" ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <p className="text-sm font-semibold text-emerald-800">
              {tm("conforme_aviso")}
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-center gap-3">
            <Clock className="w-5 h-5 text-amber-600 shrink-0" />
            <p className="text-sm font-semibold text-amber-800">{tm("sin_verificar")}</p>
          </div>
        )}

        {/* Conteo renglon por renglon */}
        <Card>
          <SectionTitle>{tm("items")}</SectionTitle>
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 items-center text-[10px] font-semibold uppercase tracking-wide text-slate-400 pb-2 border-b border-slate-100">
            <span>{tm("producto")}</span>
            <span className="text-right w-16">{tm("cargado")}</span>
            <span className="text-right w-24">{tm("verificado")}</span>
          </div>
          {items.map((it) => {
            const contado = conteos[it.id];
            const marcado = !!noSalio[it.id];
            const hayDif =
              !marcado &&
              contado !== "" &&
              contado !== undefined &&
              Number(contado) !== Number(it.cantidad_cargada);
            const motivoFalta = marcado && !motivos[it.id]?.trim();
            return (
              <div key={it.id} className="py-2.5 border-b border-slate-50 last:border-0">
                <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 items-center">
                  <div className="min-w-0 flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-lg bg-slate-50 text-slate-400 flex items-center justify-center shrink-0">
                      <Package className="w-3.5 h-3.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-slate-800 truncate">{it.producto}</p>
                      {it.codigo && (
                        <p className="text-[11px] font-mono text-slate-400">
                          {it.codigo}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-slate-700 w-16 text-right">
                    {Number(it.cantidad_cargada)}
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={contado ?? ""}
                    disabled={esAlmacen}
                    onChange={(e) =>
                      setConteos((p) => ({ ...p, [it.id]: e.target.value }))
                    }
                    className={`w-24 h-10 px-2 text-right rounded-lg border text-sm tabular-nums disabled:opacity-60 disabled:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-100 ${
                      hayDif
                        ? "border-red-300 bg-red-50 text-red-700 font-semibold"
                        : "border-slate-200 focus:border-[color:var(--portal-primary,#741DFE)]"
                    }`}
                  />
                </div>

                {/* Checkbox "No salio" + motivo obligatorio (issue #44). Senal
                    aparte del conteo: complementa, no sustituye. */}
                <div className="mt-2 pl-9">
                  <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 select-none cursor-pointer">
                    <input
                      type="checkbox"
                      checked={marcado}
                      disabled={esAlmacen}
                      onChange={(e) =>
                        setNoSalio((p) => ({ ...p, [it.id]: e.target.checked }))
                      }
                      className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-400 disabled:opacity-60"
                    />
                    {tm("no_salio_checkbox")}
                  </label>
                  {marcado && (
                    <input
                      type="text"
                      value={motivos[it.id] || ""}
                      disabled={esAlmacen}
                      onChange={(e) =>
                        setMotivos((p) => ({
                          ...p,
                          [it.id]: e.target.value.slice(0, 300),
                        }))
                      }
                      placeholder={tm("motivo_placeholder")}
                      className={`mt-1.5 w-full h-10 px-3 rounded-lg border text-sm disabled:opacity-60 disabled:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-red-100 ${
                        motivoFalta && !esAlmacen
                          ? "border-red-300 bg-red-50"
                          : "border-slate-200 focus:border-red-300"
                      }`}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </Card>

        {/* Firma de Seguridad, verificacion y calificacion: todo esto es exclusivo
            de Seguridad (issue #42/#43). Almacen preparo el registro y aqui solo
            ve el estado — no firma, no verifica, no califica. */}
        {!esAlmacen && (
          <>
            {/* Firma de Seguridad. Una sola, no las cuatro de la planilla de RMA:
                aqui no hay cliente que reciba ni tecnico que intervenga — es el
                almacen cargando un camion y Seguridad dando fe de lo que salio. */}
            <FirmasActa
              tipo="mercancia"
              actaId={mov.id}
              roles={["seguridad"]}
              nombresSugeridos={{ seguridad: user?.name }}
              permitirRehacer={rol === "superadmin"}
            />

            {/* Calificacion de cada almacenista que cargo (issue #43: puede ser mas de uno) */}
            <Card className="space-y-5">
              {(mov.almacenistas?.length ? mov.almacenistas : [mov.almacenista_nombre]).map(
                (nombre) => {
                  const existente = calificaciones.find(
                    (c) => c.almacenista_nombre === nombre,
                  );
                  return (
                    <div key={nombre}>
                      <SectionTitle>{tc("rate_for", { name: nombre })}</SectionTitle>
                      {existente ? (
                        <StarRatingDisplay
                          value={Number(existente.calificacion)}
                          showValue
                        />
                      ) : (
                        <div className="space-y-3">
                          <StarRating
                            value={estrellasPor[nombre] || 0}
                            onChange={(v) =>
                              setEstrellasPor((p) => ({ ...p, [nombre]: v }))
                            }
                          />
                          <input
                            type="text"
                            value={comentarioPor[nombre] || ""}
                            onChange={(e) =>
                              setComentarioPor((p) => ({
                                ...p,
                                [nombre]: e.target.value.slice(0, 500),
                              }))
                            }
                            placeholder={tc("comment_placeholder")}
                            className={inputClases}
                          />
                          <BotonPrimario
                            onClick={() => calificar(nombre)}
                            disabled={(estrellasPor[nombre] || 0) < 1}
                          >
                            {tc("save")}
                          </BotonPrimario>
                        </div>
                      )}
                    </div>
                  );
                },
              )}
            </Card>
          </>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </main>

      {!esAlmacen && (
        <div className="fixed inset-x-0 bottom-0 border-t border-slate-200/70 bg-white/90 backdrop-blur">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 py-3">
            <BotonPrimario onClick={verificar} disabled={guardando || faltaMotivo} className="w-full h-12">
              {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
              {tm("verificar")}
            </BotonPrimario>
          </div>
        </div>
      )}
    </div>
  );
}
