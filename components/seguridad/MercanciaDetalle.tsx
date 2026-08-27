"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth.store";
import { StarRating, StarRatingDisplay } from "@/components/seguridad/StarRating";
import { fechaCorta } from "@/lib/fecha";
import FirmasActa from "@/components/seguridad/FirmasActa";

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
};

type Movimiento = {
  id: number;
  tipo: "ingreso" | "egreso";
  fecha: string;
  odoo_picking_name: string | null;
  cliente_nombre: string | null;
  almacenista_nombre: string;
  chofer_nombre: string | null;
  placa_vehiculo: string | null;
  estado: "pendiente" | "conforme" | "descuadre";
  verificado_por: string | null;
  observaciones: string | null;
};

export default function MercanciaDetalle({
  tipo,
  id,
}: {
  tipo: "ingreso" | "egreso";
  id: string;
}) {
  const tm = useTranslations("seguridad.mercancia");
  const t = useTranslations("seguridad");
  const tc = useTranslations("seguridad.calificacion");
  const params = useParams();
  const locale = (params?.locale as string) || "es";
  const { user } = useAuthStore();
  const base = `/${locale}/seguridad/mercancia/${tipo}`;

  const [mov, setMov] = useState<Movimiento | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [calificacion, setCalificacion] = useState<any>(null);
  const [conteos, setConteos] = useState<Record<number, string>>({});
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [estrellas, setEstrellas] = useState(0);
  const [comentario, setComentario] = useState("");

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/seguridad/mercancia/${id}`);
      if (!res.ok) return;
      const json = await res.json();
      setMov(json.movimiento);
      setItems(json.items || []);
      setCalificacion(json.calificacion ?? null);
      const previos: Record<number, string> = {};
      for (const it of json.items || []) {
        previos[it.id] =
          it.cantidad_verificada === null || it.cantidad_verificada === undefined
            ? ""
            : String(Number(it.cantidad_verificada));
      }
      setConteos(previos);
    } finally {
      setCargando(false);
    }
  }, [id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const verificar = async () => {
    setError(null);
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

  const calificar = async () => {
    if (!mov || estrellas < 1) return;
    try {
      await fetch("/api/seguridad/calificar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          almacenista_nombre: mov.almacenista_nombre,
          calificacion: estrellas,
          relacionado_a: "mercancia",
          relacionado_id: mov.id,
          comentario: comentario.trim() || null,
          calificado_por: user?.name || user?.email || "Seguridad",
        }),
      });
      setEstrellas(0);
      setComentario("");
      void cargar();
    } catch {
      // El fallo de la calificacion no debe tapar la verificacion.
    }
  };

  if (cargando) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }
  if (!mov) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500 text-sm">
        {tm("vacio")}
      </div>
    );
  }

  const diferencias = items.filter(
    (i) =>
      i.cantidad_verificada !== null &&
      Number(i.cantidad_verificada) !== Number(i.cantidad_cargada),
  ).length;

  return (
    <div className="min-h-screen bg-slate-50/50 font-sans">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3 pl-14 lg:pl-4">
          <Link
            href={base}
            className="p-2 rounded-[10px] text-slate-500 hover:bg-slate-100"
            aria-label={t("back")}
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">
              {mov.odoo_picking_name || tm("sin_orden")}
            </h1>
            <p className="text-xs text-slate-500 truncate">
              {fechaCorta(mov.fecha)} · {mov.almacenista_nombre}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4 pb-28">
        {/* Resultado de la verificacion, arriba: es lo que se mira primero */}
        {mov.estado === "descuadre" ? (
          <div className="rounded-2xl border border-red-300 bg-red-50 p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-red-800">{tm("descuadre")}</p>
              <p className="text-sm text-red-700">
                {tm("descuadre_aviso", { count: diferencias })}
              </p>
            </div>
          </div>
        ) : mov.estado === "conforme" ? (
          <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <p className="text-sm font-bold text-emerald-800">
              {tm("conforme_aviso")}
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
            {tm("sin_verificar")}
          </div>
        )}

        {/* Conteo renglon por renglon */}
        <section className="bg-white border border-slate-200 rounded-[10px] p-5">
          <h2 className="text-sm font-bold text-slate-900 mb-1">{tm("items")}</h2>
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 items-center text-[10px] font-bold uppercase tracking-wider text-slate-400 pb-2 border-b border-slate-100">
            <span>{tm("producto")}</span>
            <span className="text-right w-16">{tm("cargado")}</span>
            <span className="text-right w-24">{tm("verificado")}</span>
          </div>
          {items.map((it) => {
            const contado = conteos[it.id];
            const hayDif =
              contado !== "" &&
              contado !== undefined &&
              Number(contado) !== Number(it.cantidad_cargada);
            return (
              <div
                key={it.id}
                className="grid grid-cols-[1fr_auto_auto] gap-x-3 items-center py-2 border-b border-slate-50"
              >
                <div className="min-w-0">
                  <p className="text-sm text-slate-900 truncate">{it.producto}</p>
                  {it.codigo && (
                    <p className="text-[11px] font-mono text-slate-400">
                      {it.codigo}
                    </p>
                  )}
                </div>
                <span className="text-sm font-bold tabular-nums text-slate-700 w-16 text-right">
                  {Number(it.cantidad_cargada)}
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={contado ?? ""}
                  onChange={(e) =>
                    setConteos((p) => ({ ...p, [it.id]: e.target.value }))
                  }
                  className={`w-24 h-11 px-2 text-right rounded-[10px] border text-sm tabular-nums ${
                    hayDif
                      ? "border-red-400 bg-red-50 text-red-700 font-bold"
                      : "border-slate-200"
                  }`}
                />
              </div>
            );
          })}
        </section>

        {/* Firma de Seguridad. Una sola, no las cuatro de la planilla de RMA:
            aqui no hay cliente que reciba ni tecnico que intervenga — es el
            almacen cargando un camion y Seguridad dando fe de lo que salio. */}
        <FirmasActa
          tipo="mercancia"
          actaId={mov.id}
          roles={["seguridad"]}
          nombresSugeridos={{ seguridad: user?.name }}
        />

        {/* Calificacion del almacenista que cargo */}
        <section className="bg-white border border-slate-200 rounded-[10px] p-5">
          <h2 className="text-sm font-bold text-slate-900 mb-3">
            {tc("rate_for", { name: mov.almacenista_nombre })}
          </h2>
          {calificacion ? (
            <StarRatingDisplay value={Number(calificacion.calificacion)} showValue />
          ) : (
            <div className="space-y-3">
              <StarRating value={estrellas} onChange={setEstrellas} />
              <input
                type="text"
                value={comentario}
                onChange={(e) => setComentario(e.target.value.slice(0, 500))}
                placeholder={tc("comment_placeholder")}
                className="w-full h-11 px-3 border border-slate-200 rounded-[10px] text-sm"
              />
              <button
                type="button"
                onClick={calificar}
                disabled={estrellas < 1}
                className="min-h-[44px] px-4 rounded-[10px] text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: "var(--portal-primary,#741DFE)" }}
              >
                {tc("save")}
              </button>
            </div>
          )}
        </section>

        {error && (
          <div className="rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 backdrop-blur lg:pl-60">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3">
          <button
            type="button"
            onClick={verificar}
            disabled={guardando}
            className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-[10px] text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: "var(--portal-primary,#741DFE)" }}
          >
            {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
            {tm("verificar")}
          </button>
        </div>
      </div>
    </div>
  );
}
