"use client";

import { useTranslations } from "next-intl";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  Download,
  History,
  Info,
  Loader2,
  Pencil,
  RefreshCw,
  RotateCcw,
  Save,
  Split,
} from "lucide-react";
import {
  Card,
  SectionTitle,
  Pill,
  BotonPrimario,
  BotonSecundario,
  Buscador,
  inputClases,
  labelClases,
  normalizar,
} from "@/components/seguridad/mercancia-ui";
import {
  CARACAS,
  PESO_ROTACION_DEFECTO,
  VALENCIA,
  VENTANAS_DIAS,
  VENTANA_DIAS_DEFECTO,
  errorCantidadManual,
} from "@/lib/recepcion/repartoSedes";
import type { Reparto, LineaGuardada, EventoReparto } from "@/lib/recepcion/repartoSedesDatos";
import { useRecepcionEnVivo } from "@/lib/recepcion/useRecepcionEnVivo";

/**
 * Reparto de la mercancía de un packing list entre Valencia y Caracas
 * (lib/recepcion/repartoSedes.ts + repartoSedesDatos.ts).
 *
 * No tiene que ver con el "reparto" por contenedor (cuánto trae cada
 * contenedor) ni con la Factura Especial de Caracas, que es otra compra y
 * nunca entra aquí. Tampoco cambia la recepción ni la carga en Odoo: dice
 * cuánto de cada producto le toca a cada sede y por qué.
 *
 * Compras y el SuperAdmin lo activan, recalculan y ajustan a mano (siempre
 * con motivo); Almacén lo ve en solo lectura para separar la mercancía.
 */

type Respuesta = {
  success?: boolean;
  reparto: Reparto;
  puedeEditar: boolean;
  repartible: boolean;
  cids: number;
};

const num = (n: number | null | undefined) => Number(n ?? 0).toLocaleString("es-VE", { maximumFractionDigits: 3 });
const pct = (p: number | null | undefined, dec = 0) =>
  p == null || !Number.isFinite(p)
    ? "—"
    : `${(p * 100).toLocaleString("es-VE", { maximumFractionDigits: dec, minimumFractionDigits: 0 })} %`;
const usd = (n: number | null | undefined) =>
  n == null ? "—" : `$${Number(n).toLocaleString("es-VE", { maximumFractionDigits: 0 })}`;

function fechaHora(valor: string | null | undefined): string {
  if (!valor) return "—";
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return String(valor);
  return new Intl.DateTimeFormat("es-VE", {
    timeZone: "America/Caracas",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** Cajas enteras de una cantidad, o null si no caben exactas. */
const cajasDe = (cantidad: number, porCaja: number | null) => {
  if (!porCaja || porCaja <= 0) return null;
  const c = cantidad / porCaja;
  return Math.abs(c - Math.round(c)) < 1e-9 ? Math.round(c) : null;
};

const nombreSede = (cids: number) => (cids === VALENCIA ? "Valencia" : cids === CARACAS ? "Caracas" : "—");

function RepartoSedes({
  id,
  cids,
  etapa,
}: {
  id: number | string;
  /** Sede donde llega el packing list. */
  cids: number;
  /** Para recargar cuando cambia (al cerrar, el reparto se compara con lo contado). */
  etapa?: string;
}) {
  const t = useTranslations("recepcion.reparto_sedes");
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [oculto, setOculto] = useState(false);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Parámetros (solo edición).
  const [peso, setPeso] = useState(Math.round(PESO_ROTACION_DEFECTO * 100));
  const [ventana, setVentana] = useState<number>(VENTANA_DIAS_DEFECTO);
  const [reiniciar, setReiniciar] = useState(false);
  const [motivoCalculo, setMotivoCalculo] = useState("");

  // Apagar pide confirmación.
  const [confirmarApagar, setConfirmarApagar] = useState(false);
  const [motivoApagar, setMotivoApagar] = useState("");

  // Ajuste a mano.
  const [ajustando, setAjustando] = useState(false);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [motivo, setMotivo] = useState("");
  const [pctTodo, setPctTodo] = useState("");
  // Versión del reparto que se estaba viendo al empezar a ajustar: se manda
  // al guardar, así un cambio de otra persona en el medio da 409 y no se pisa.
  const [versionAjuste, setVersionAjuste] = useState<number | null>(null);

  const [filtro, setFiltro] = useState("");
  const [verHistorial, setVerHistorial] = useState(false);

  const pedido = useRef(0);
  const cargar = useCallback(async () => {
    const n = ++pedido.current;
    try {
      const res = await fetch(`/api/recepcion/${id}/reparto-sedes`, { cache: "no-store" });
      if (n !== pedido.current) return;
      if (res.status === 404 || res.status === 403) {
        setOculto(true);
        return;
      }
      const j = await res.json().catch(() => null);
      if (n !== pedido.current) return;
      if (!res.ok || !j?.reparto) {
        // "" = mensaje genérico (se traduce al pintar: `t` no va en las dependencias).
        setErrorCarga(j?.error || "");
        return;
      }
      setOculto(false);
      setErrorCarga(null);
      setDatos(j as Respuesta);
    } catch {
      if (n === pedido.current) setErrorCarga("");
    } finally {
      if (n === pedido.current) setCargando(false);
    }
  }, [id]);

  useEffect(() => {
    void cargar();
  }, [cargar, etapa]);

  // En vivo: una edición del packing list lo recalcula en el servidor; el
  // cierre cambia la base (lo contado). Se recarga cuando paran los avisos.
  const recarga = useRef<ReturnType<typeof setTimeout> | null>(null);
  useRecepcionEnVivo((a) => {
    if (Number(a?.id) !== Number(id) || a?.accion === "conteo" || a?.accion === "eliminado") return;
    if (recarga.current) clearTimeout(recarga.current);
    recarga.current = setTimeout(() => void cargar(), 500);
  });
  useEffect(
    () => () => {
      if (recarga.current) clearTimeout(recarga.current);
    },
    [],
  );

  // Los parámetros del formulario siguen a los guardados cuando cambian.
  const cab = datos?.reparto.cabecera ?? null;
  const pesoGuardado = cab?.parametros.pesoRotacion;
  const ventanaGuardada = cab?.parametros.ventanaDias;
  useEffect(() => {
    if (pesoGuardado != null) setPeso(Math.round(pesoGuardado * 100));
    if (ventanaGuardada != null) setVentana(ventanaGuardada);
  }, [pesoGuardado, ventanaGuardada]);

  const lineas = datos?.reparto.lineas ?? [];
  const porClave = useMemo(() => new Map(lineas.map((l) => [l.clave, l])), [lineas]);

  const enviar = async (
    accion: string,
    cuerpo: Record<string, unknown>,
    okMsg?: string,
    version?: number | null,
  ): Promise<boolean> => {
    if (!datos) return false;
    setEnviando(accion);
    setError(null);
    setAviso(null);
    try {
      const res = await fetch(`/api/recepcion/${id}/reparto-sedes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion, version: version ?? datos.reparto.cabecera?.version ?? 0, ...cuerpo }),
      });
      const j = await res.json().catch(() => null);
      if (res.status === 409) {
        if (j?.reparto) setDatos((d) => (d ? { ...d, ...(j.puedeEditar !== undefined ? j : {}), reparto: j.reparto } : d));
        else void cargar();
        // Lo que se estaba ajustando se vuelve a mostrar con lo de ahora.
        if (ajustando) {
          setValores({});
          setVersionAjuste(null);
        }
        setAviso(j?.error || t("conflicto"));
        return false;
      }
      if (!res.ok || !j?.reparto) {
        setError(j?.error || t("error_guardar"));
        // Un cálculo que falla deja su error anotado (y sube la versión).
        if (j?.reparto) setDatos((d) => (d ? { ...d, reparto: j.reparto } : d));
        else void cargar();
        return false;
      }
      setDatos(j as Respuesta);
      if (okMsg) setAviso(okMsg);
      return true;
    } catch {
      setError(t("error_red"));
      return false;
    } finally {
      setEnviando(null);
    }
  };

  // ---------------------------------------------------------------------
  // Ajuste a mano

  const empezarAjuste = () => {
    const v: Record<string, string> = {};
    for (const l of lineas) v[l.clave] = String(l.cantidadCaracas);
    setValores(v);
    setMotivo("");
    setPctTodo("");
    setError(null);
    setVersionAjuste(datos?.reparto.cabecera?.version ?? 0);
    setAjustando(true);
  };
  const terminarAjuste = () => {
    setAjustando(false);
    setMotivo("");
    setVersionAjuste(null);
  };
  // Tras un 409 se toma la versión recién leída (con los valores ya puestos al día).
  const versionVista = datos?.reparto.cabecera?.version;
  useEffect(() => {
    if (ajustando && versionAjuste === null && versionVista != null) setVersionAjuste(versionVista);
  }, [ajustando, versionAjuste, versionVista]);
  const cambiados = useMemo(() => {
    if (!ajustando) return [] as { clave: string; cantidadCaracas: number }[];
    const out: { clave: string; cantidadCaracas: number }[] = [];
    for (const [clave, v] of Object.entries(valores)) {
      const l = porClave.get(clave);
      if (!l || v.trim() === "") continue;
      const n = Number(v.replace(",", "."));
      if (Number.isFinite(n) && Math.abs(n - l.cantidadCaracas) > 1e-9) out.push({ clave, cantidadCaracas: n });
    }
    return out;
  }, [ajustando, valores, porClave]);
  const errorDe = (l: LineaGuardada): boolean => {
    const v = valores[l.clave];
    if (v === undefined) return false;
    return errorCantidadManual(v.trim() === "" ? "" : v.replace(",", "."), l.cantidad) !== null;
  };
  const conErrores = ajustando && lineas.some(errorDe);
  const motivoOk = motivo.trim().length >= 3;

  const guardarAjuste = async () => {
    if (conErrores) return setError(t("hay_errores"));
    if (!cambiados.length) return setError(t("sin_cambios"));
    if (!motivoOk) return setError(t("motivo_falta"));
    if (await enviar("manual", { cambios: cambiados, motivo: motivo.trim() }, t("guardado"), versionAjuste)) terminarAjuste();
  };
  const aplicarPct = async () => {
    const p = Number(pctTodo.replace(",", "."));
    if (pctTodo.trim() === "" || !Number.isFinite(p) || p < 0 || p > 100) return setError(t("pct_rango"));
    if (!motivoOk) return setError(t("motivo_falta"));
    if (!window.confirm(t("pct_confirmar", { pct: pct(p / 100, 1) }))) return;
    if (await enviar("porcentaje", { pctCaracas: p, motivo: motivo.trim() }, t("guardado"), versionAjuste)) terminarAjuste();
  };
  const alAutomatico = async (claves: string[] | null) => {
    if (!claves && !window.confirm(t("todo_auto_confirmar", { count: datos?.reparto.resumen.manuales ?? 0 }))) return;
    const ok = await enviar(
      "automatico",
      { claves, motivo: ajustando ? motivo.trim() || null : null },
      t("guardado"),
      ajustando ? versionAjuste : undefined,
    );
    if (ok && ajustando) {
      // Lo guardado subió la versión: lo que sigue se compara con la nueva.
      setVersionAjuste(null);
      // Lo devuelto al automático se ve con su cantidad nueva en el campo.
      setValores((v) => {
        const n = { ...v };
        for (const k of claves ?? Object.keys(n)) delete n[k];
        return n;
      });
      if (!claves) terminarAjuste();
    }
  };
  // Tras guardar, los campos que no se tocaron muestran lo de la base.
  useEffect(() => {
    if (!ajustando) return;
    setValores((v) => {
      const n = { ...v };
      for (const l of lineas) if (n[l.clave] === undefined) n[l.clave] = String(l.cantidadCaracas);
      return n;
    });
  }, [lineas, ajustando]);

  // ---------------------------------------------------------------------
  // CSV para que Almacén separe la mercancía

  const descargarCsv = () => {
    const celda = (c: unknown) => `"${String(c ?? "").replace(/"/g, '""')}"`;
    const cab = [
      t("csv.codigo"),
      t("csv.producto"),
      t("csv.cantidad"),
      t("csv.valencia"),
      t("csv.caracas"),
      t("csv.cajas_valencia"),
      t("csv.cajas_caracas"),
      t("csv.origen"),
    ];
    const filas = lineas.map((l) =>
      [
        l.codigo || "",
        l.producto,
        l.cantidad,
        l.cantidadValencia,
        l.cantidadCaracas,
        cajasDe(l.cantidadValencia, l.porCaja) ?? "",
        cajasDe(l.cantidadCaracas, l.porCaja) ?? "",
        l.origen === "manual" ? t("origen.manual") : t("origen.auto"),
      ]
        .map(celda)
        .join(","),
    );
    const csv = [cab.map(celda).join(","), ...filas].join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `reparto_sedes_${id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ---------------------------------------------------------------------

  if (oculto) return null;
  if (cargando && !datos) {
    return (
      <Card>
        <p className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" /> {t("cargando")}
        </p>
      </Card>
    );
  }
  if (!datos) {
    return errorCarga !== null ? (
      <Card>
        <p className="text-sm text-red-600">{errorCarga || t("error_cargar")}</p>
      </Card>
    ) : null;
  }

  const { reparto, puedeEditar, repartible } = datos;
  const activo = !!cab?.activo;
  // Sin nada que mostrar: no se puede repartir y nunca se repartió, o Almacén
  // sin reparto activo.
  if (!repartible && !cab) return null;
  if (!puedeEditar && !activo) return null;

  const r = reparto.resumen;
  const sedeLlegada = nombreSede(Number(datos.cids ?? cids));
  const hayLineas = lineas.length > 0;
  const trabajando = enviando !== null;

  const filtradas = filtro.trim()
    ? lineas.filter((l) => normalizar(`${l.codigo || ""} ${l.producto}`).includes(normalizar(filtro.trim())))
    : lineas;

  return (
    <Card className="space-y-4">
      <SectionTitle
        action={
          puedeEditar && (repartible || activo) ? (
            <Interruptor
              activo={activo}
              disabled={trabajando}
              etiqueta={t("interruptor")}
              onClick={() => {
                if (activo) {
                  setMotivoApagar("");
                  setConfirmarApagar(true);
                } else {
                  void enviar(
                    "activar",
                    { activo: true, parametros: { pesoRotacion: peso / 100, ventanaDias: ventana } },
                    t("activado_ok"),
                  );
                }
              }}
            />
          ) : undefined
        }
      >
        <span className="inline-flex items-center gap-2">
          <Split className="w-4 h-4 text-slate-400" />
          {t("titulo")}
        </span>
      </SectionTitle>

      {/* Estado */}
      <div className="-mt-2 space-y-1">
        <p className="text-sm text-slate-700">
          {activo ? (
            <Pill tono="conforme">{t("estado_si")}</Pill>
          ) : (
            <Pill>{t("estado_no")}</Pill>
          )}{" "}
          {!activo && <span className="text-slate-500">{t("estado_no_detalle", { sede: sedeLlegada })}</span>}
        </p>
        {cab?.calculadoAt && (
          <p className="text-[12px] text-slate-500">
            {t("calculado_por", { nombre: cab.calculadoPor || "—", fecha: fechaHora(cab.calculadoAt) })}
            {cab.updatedAt && cab.updatedAt !== cab.calculadoAt && cab.updatedPor && (
              <> · {t("actualizado_por", { nombre: cab.updatedPor, fecha: fechaHora(cab.updatedAt) })}</>
            )}
          </p>
        )}
        {activo && <p className="text-[12px] text-slate-500">{t("nota_odoo", { sede: sedeLlegada })}</p>}
        {!puedeEditar && activo && <p className="text-[12px] text-slate-500">{t("almacen_ayuda")}</p>}
        {!repartible && <p className="text-[12px] text-amber-700">{t("no_repartible")}</p>}
        {puedeEditar && !activo && repartible && !cab && (
          <p className="text-[12px] text-slate-500">{t("activar_ayuda")}</p>
        )}
      </div>

      {confirmarApagar && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
          <p className="text-sm text-amber-900">{t("desactivar_confirmar", { sede: sedeLlegada })}</p>
          <input
            className={inputClases}
            value={motivoApagar}
            onChange={(e) => setMotivoApagar(e.target.value)}
            placeholder={t("motivo_opcional")}
            maxLength={500}
          />
          <div className="flex flex-wrap gap-2">
            <BotonPrimario
              disabled={trabajando}
              icon={trabajando ? Loader2 : undefined}
              onClick={async () => {
                const ok = await enviar("activar", { activo: false, motivo: motivoApagar.trim() || null }, t("desactivado_ok"));
                if (ok) {
                  setConfirmarApagar(false);
                  terminarAjuste();
                }
              }}
            >
              {t("desactivar_si")}
            </BotonPrimario>
            <BotonSecundario onClick={() => setConfirmarApagar(false)} disabled={trabajando}>
              {t("cancelar")}
            </BotonSecundario>
          </div>
        </div>
      )}

      {aviso && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-800">{aviso}</div>
      )}
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {activo && (
        <>
          <Avisos reparto={reparto} t={t} />

          {hayLineas && cab && <Resumen reparto={reparto} t={t} />}

          {puedeEditar && (
            <details className="group rounded-xl border border-slate-200 bg-slate-50/60" open={!hayLineas || !!cab?.error || reparto.diferencias.length > 0}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-[13px] font-semibold text-slate-700">
                <span>
                  {t("parametros_titulo")}
                  {cab && (
                    <span className="ml-2 font-normal text-slate-500">
                      {t("parametros_resumen", {
                        rot: pct(cab.parametros.pesoRotacion),
                        dias: cab.parametros.ventanaDias,
                      })}
                    </span>
                  )}
                </span>
                <ChevronDown className="w-4 h-4 text-slate-400 transition-transform group-open:rotate-180" />
              </summary>
              <div className="space-y-3 border-t border-slate-200 px-3 py-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelClases} htmlFor={`rs-peso-${id}`}>
                      {t("peso")}
                    </label>
                    <input
                      id={`rs-peso-${id}`}
                      type="range"
                      min={0}
                      max={100}
                      step={10}
                      value={peso}
                      onChange={(e) => setPeso(Number(e.target.value))}
                      className="w-full accent-[color:var(--portal-primary,#741DFE)]"
                    />
                    <p className="text-[12px] text-slate-600 tabular-nums">
                      {t("peso_valor", { rot: `${peso} %`, cuota: `${100 - peso} %` })}
                    </p>
                    <p className="text-[11px] text-slate-400">{t("peso_ayuda")}</p>
                  </div>
                  <div>
                    <label className={labelClases} htmlFor={`rs-ventana-${id}`}>
                      {t("ventana")}
                    </label>
                    <select
                      id={`rs-ventana-${id}`}
                      className={inputClases}
                      value={ventana}
                      onChange={(e) => setVentana(Number(e.target.value))}
                    >
                      {VENTANAS_DIAS.map((d) => (
                        <option key={d} value={d}>
                          {t("ventana_dias", { dias: d })}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <input
                  className={inputClases}
                  value={motivoCalculo}
                  onChange={(e) => setMotivoCalculo(e.target.value)}
                  placeholder={t("motivo_recalculo_ph")}
                  maxLength={500}
                />
                {r.manuales > 0 && (
                  <label className="flex items-start gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={reiniciar}
                      onChange={(e) => setReiniciar(e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-[color:var(--portal-primary,#741DFE)]"
                    />
                    <span>{t("reiniciar", { count: r.manuales })}</span>
                  </label>
                )}
                <BotonPrimario
                  disabled={trabajando}
                  icon={enviando === "calcular" ? Loader2 : RefreshCw}
                  onClick={async () => {
                    const ok = await enviar(
                      "calcular",
                      {
                        parametros: { pesoRotacion: peso / 100, ventanaDias: ventana },
                        reiniciarManuales: reiniciar,
                        motivo: motivoCalculo.trim() || null,
                      },
                      t("recalculado_ok"),
                    );
                    if (ok) {
                      setReiniciar(false);
                      setMotivoCalculo("");
                    }
                  }}
                >
                  {t("recalcular")}
                </BotonPrimario>
              </div>
            </details>
          )}

          {hayLineas && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <Buscador
                  valor={filtro}
                  onChange={setFiltro}
                  placeholder={t("buscar")}
                  limpiar={t("limpiar")}
                  className="flex-1"
                />
                <div className="flex flex-wrap gap-2">
                  <BotonSecundario icon={Download} onClick={descargarCsv}>
                    {t("descargar_csv")}
                  </BotonSecundario>
                  {puedeEditar && !ajustando && (
                    <BotonSecundario icon={Pencil} onClick={empezarAjuste} disabled={trabajando}>
                      {t("ajustar")}
                    </BotonSecundario>
                  )}
                  {puedeEditar && r.manuales > 0 && (
                    <BotonSecundario icon={RotateCcw} onClick={() => void alAutomatico(null)} disabled={trabajando}>
                      {t("todo_auto")}
                    </BotonSecundario>
                  )}
                </div>
              </div>

              {ajustando && (
                <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3 space-y-3">
                  <p className="text-sm text-slate-700">{t("ajuste_ayuda")}</p>
                  <div>
                    <label className={labelClases} htmlFor={`rs-motivo-${id}`}>
                      {t("motivo")}
                    </label>
                    <textarea
                      id={`rs-motivo-${id}`}
                      className={`${inputClases} h-auto min-h-[64px] py-2`}
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      placeholder={t("motivo_ph")}
                      maxLength={500}
                    />
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-end gap-2">
                    <div className="sm:w-48">
                      <label className={labelClases} htmlFor={`rs-pct-${id}`}>
                        {t("pct_todo")}
                      </label>
                      <input
                        id={`rs-pct-${id}`}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={100}
                        step={1}
                        className={inputClases}
                        value={pctTodo}
                        onChange={(e) => setPctTodo(e.target.value)}
                        placeholder="45"
                      />
                    </div>
                    <BotonSecundario onClick={() => void aplicarPct()} disabled={trabajando || pctTodo.trim() === ""}>
                      {t("pct_aplicar")}
                    </BotonSecundario>
                  </div>
                  <p className="text-[11px] text-slate-500">{t("pct_ayuda")}</p>
                  <div className="flex flex-wrap gap-2">
                    <BotonPrimario
                      icon={enviando === "manual" ? Loader2 : Save}
                      onClick={() => void guardarAjuste()}
                      disabled={trabajando || !cambiados.length}
                    >
                      {t("guardar_cambios", { count: cambiados.length })}
                    </BotonPrimario>
                    <BotonSecundario
                      onClick={() => {
                        terminarAjuste();
                        setError(null);
                      }}
                      disabled={trabajando}
                    >
                      {t("cancelar")}
                    </BotonSecundario>
                  </div>
                </div>
              )}

              <Tabla
                lineas={filtradas}
                ventanaDias={cab?.parametros.ventanaDias ?? VENTANA_DIAS_DEFECTO}
                ajustando={ajustando}
                valores={valores}
                setValor={(clave, v) => setValores((x) => ({ ...x, [clave]: v }))}
                errorDe={errorDe}
                puedeEditar={puedeEditar}
                trabajando={trabajando}
                alAutomatico={(clave) => void alAutomatico([clave])}
                t={t}
              />
              {filtro.trim() && !filtradas.length && <p className="text-sm text-slate-400">{t("sin_resultados")}</p>}
            </div>
          )}
        </>
      )}

      {/* Historial */}
      {reparto.eventos.length > 0 && (puedeEditar || activo) && (
        <div className="border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={() => setVerHistorial((v) => !v)}
            className="flex w-full items-center justify-between gap-2 text-[13px] font-semibold text-slate-700"
            aria-expanded={verHistorial}
          >
            <span className="inline-flex items-center gap-2">
              <History className="w-4 h-4 text-slate-400" />
              {t("historial", { count: reparto.eventos.length })}
            </span>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${verHistorial ? "rotate-180" : ""}`} />
          </button>
          {verHistorial && (
            <ol className="mt-3 space-y-3">
              {reparto.eventos.map((e) => (
                <Evento key={e.id} e={e} porClave={porClave} t={t} />
              ))}
            </ol>
          )}
        </div>
      )}
    </Card>
  );
}

export default memo(RepartoSedes);

// ---------------------------------------------------------------------------

type T = ReturnType<typeof useTranslations>;

function Interruptor({
  activo,
  disabled,
  etiqueta,
  onClick,
}: {
  activo: boolean;
  disabled?: boolean;
  etiqueta: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center gap-2 text-[12px] font-medium text-slate-600 disabled:opacity-50"
    >
      <span className="hidden sm:inline">{etiqueta}</span>
      <span
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          activo ? "bg-[color:var(--portal-primary,#741DFE)]" : "bg-slate-300"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
            activo ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}

function Avisos({ reparto, t }: { reparto: Reparto; t: T }) {
  const cab = reparto.cabecera;
  const difs = reparto.diferencias;
  const otraBase = !!cab?.baseCantidad && cab.baseCantidad !== reparto.baseActual;
  const nombre = (clave: string) => {
    const l = reparto.lineas.find((x) => x.clave === clave);
    return l ? l.codigo || l.producto : clave.replace(/^N:/, "");
  };
  return (
    <>
      {cab?.error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{t("error_calculo", { error: cab.error })}</span>
        </div>
      )}
      {!reparto.lineas.length && !cab?.error && (
        <p className="text-sm text-slate-500">{t("vacio_calculo")}</p>
      )}
      {(difs.length > 0 || otraBase) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 space-y-1">
          <p className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              {otraBase
                ? t("diferencias_base", { antes: t(`base.${cab!.baseCantidad}`), ahora: t(`base.${reparto.baseActual}`) })
                : t("diferencias", { count: difs.length })}
            </span>
          </p>
          {difs.length > 0 && (
            <details className="pl-6">
              <summary className="cursor-pointer text-[12px] font-medium">{t("ver_diferencias", { count: difs.length })}</summary>
              <ul className="mt-1 space-y-0.5 text-[12px]">
                {difs.slice(0, 100).map((d) => (
                  <li key={d.clave}>
                    {t("diferencia_linea", { producto: nombre(d.clave), antes: num(d.enReparto), ahora: num(d.enPacking) })}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      {reparto.renglonesFacturaEspecial > 0 && (
        <p className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
          <Info className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" />
          <span>{t("factura_especial", { count: reparto.renglonesFacturaEspecial })}</span>
        </p>
      )}
    </>
  );
}

function Resumen({ reparto, t }: { reparto: Reparto; t: T }) {
  const cab = reparto.cabecera!;
  const r = reparto.resumen;
  const cuotaC = cab.pctCuotaCaracas;
  const sinCuotaV = cab.cuotaFuenteValencia === "sin_cuota" || !(Number(cab.cuotaValencia) > 0);
  const sinCuotaC = cab.cuotaFuenteCaracas === "sin_cuota" || !(Number(cab.cuotaCaracas) > 0);
  const mes = cab.cuotaMes || "—";
  const pc = r.pctUnidadesCaracas;

  let frase: string | null = null;
  if (pc != null && cuotaC != null) {
    const dif = pc - cuotaC;
    const args = { pct: pct(pc, 1), cuota: pct(cuotaC, 1) };
    frase =
      Math.abs(dif) < 0.005 ? t("frase_igual", args) : dif > 0 ? t("frase_sube", args) : t("frase_baja", args);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {/* Cuota */}
      <div className="rounded-xl border border-slate-200 p-3 space-y-2">
        <p className="text-[12px] font-semibold text-slate-700">{t("cuota_titulo", { mes })}</p>
        <Barra pctCaracas={cuotaC} />
        <div className="grid grid-cols-2 gap-2 text-[12px]">
          <Sede
            nombre={t("sede_valencia")}
            color="bg-violet-500"
            principal={pct(cuotaC == null ? null : 1 - cuotaC, 1)}
            detalle={`${usd(cab.cuotaValencia)} · ${t(`fuente.${cab.cuotaFuenteValencia || "sin_cuota"}`)}`}
          />
          <Sede
            nombre={t("sede_caracas")}
            color="bg-sky-500"
            principal={pct(cuotaC, 1)}
            detalle={`${usd(cab.cuotaCaracas)} · ${t(`fuente.${cab.cuotaFuenteCaracas || "sin_cuota"}`)}`}
          />
        </div>
        {sinCuotaV && sinCuotaC ? (
          <p className="text-[12px] text-amber-700">{t("sin_cuota_ninguna", { mes })}</p>
        ) : sinCuotaV || sinCuotaC ? (
          <p className="text-[12px] text-amber-700">
            {t("sin_cuota_una", { sede: sinCuotaV ? t("sede_valencia") : t("sede_caracas"), mes })}
          </p>
        ) : null}
      </div>

      {/* Resultado */}
      <div className="rounded-xl border border-slate-200 p-3 space-y-2">
        <p className="text-[12px] font-semibold text-slate-700">{t("resultado_titulo")}</p>
        <Barra pctCaracas={pc} marca={cuotaC} marcaTitulo={t("marca_cuota", { pct: pct(cuotaC, 1) })} />
        <div className="grid grid-cols-2 gap-2 text-[12px]">
          <Sede
            nombre={t("sede_valencia")}
            color="bg-violet-500"
            principal={pct(pc == null ? null : 1 - pc, 1)}
            detalle={`${t("uds", { n: num(r.unidadesValencia) })}${
              r.pctValorCaracas != null ? ` · ${t("valor_pct", { pct: pct(1 - r.pctValorCaracas, 1) })}` : ""
            }`}
          />
          <Sede
            nombre={t("sede_caracas")}
            color="bg-sky-500"
            principal={pct(pc, 1)}
            detalle={`${t("uds", { n: num(r.unidadesCaracas) })}${
              r.pctValorCaracas != null ? ` · ${t("valor_pct", { pct: pct(r.pctValorCaracas, 1) })}` : ""
            }`}
          />
        </div>
        <p className="text-[11px] text-slate-400">{t("resultado_ayuda", { n: num(r.unidades), productos: r.productos })}</p>
        {r.sinCosto > 0 && <p className="text-[11px] text-slate-400">{t("sin_costo", { count: r.sinCosto })}</p>}
      </div>

      {frase && (
        <div className="lg:col-span-2 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700 space-y-0.5">
          <p>{frase}</p>
          {(r.manuales > 0 || r.sinVentas > 0) && (
            <p className="text-[12px] text-slate-500">
              {[
                r.manuales > 0 ? t("frase_manuales", { count: r.manuales }) : null,
                r.sinVentas > 0 ? t("frase_sin_ventas", { count: r.sinVentas }) : null,
              ]
                .filter(Boolean)
                .join(" ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Sede({ nombre, color, principal, detalle }: { nombre: string; color: string; principal: string; detalle: string }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-slate-500">
        <span className={`inline-block h-2.5 w-2.5 rounded-sm ${color}`} />
        {nombre}
      </p>
      <p className="text-base font-semibold text-slate-900 tabular-nums">{principal}</p>
      <p className="text-[11px] text-slate-500 truncate" title={detalle}>
        {detalle}
      </p>
    </div>
  );
}

/** Barra de dos colores: Valencia a la izquierda, Caracas a la derecha. */
function Barra({ pctCaracas, marca, marcaTitulo }: { pctCaracas: number | null; marca?: number | null; marcaTitulo?: string }) {
  const c = pctCaracas == null ? 0 : Math.min(1, Math.max(0, pctCaracas));
  return (
    <div className="relative h-3 w-full overflow-hidden rounded-full bg-slate-100">
      {pctCaracas != null && (
        <>
          <div className="absolute inset-y-0 left-0 bg-violet-500" style={{ width: `${(1 - c) * 100}%` }} />
          <div className="absolute inset-y-0 right-0 bg-sky-500" style={{ width: `${c * 100}%` }} />
        </>
      )}
      {marca != null && (
        <div
          className="absolute inset-y-0 w-0.5 bg-slate-900/70"
          style={{ left: `calc(${(1 - Math.min(1, Math.max(0, marca))) * 100}% - 1px)` }}
          title={marcaTitulo}
        />
      )}
    </div>
  );
}

function porQue(l: LineaGuardada, t: T): string {
  let base: string;
  if (!l.odooProductId) base = t("porque_sin_odoo", { pct: pct(l.pctCuotaCaracas) });
  else if (l.base === "cuota" || l.pctRotacionCaracas == null) base = t("porque_sin_ventas", { pct: pct(l.pctCuotaCaracas) });
  else base = t("porque_rotacion", { rot: pct(l.pctRotacionCaracas), obj: pct(l.pctObjetivoCaracas) });
  const partes = [base];
  if (l.porCaja) partes.push(t("porque_cajas", { n: l.porCaja }));
  if (l.origen === "manual") partes.push(t("porque_manual_auto", { n: num(l.autoCaracas) }));
  return partes.join(" · ");
}

function Tabla({
  lineas,
  ventanaDias,
  ajustando,
  valores,
  setValor,
  errorDe,
  puedeEditar,
  trabajando,
  alAutomatico,
  t,
}: {
  lineas: LineaGuardada[];
  ventanaDias: number;
  ajustando: boolean;
  valores: Record<string, string>;
  setValor: (clave: string, v: string) => void;
  errorDe: (l: LineaGuardada) => boolean;
  puedeEditar: boolean;
  trabajando: boolean;
  alAutomatico: (clave: string) => void;
  t: T;
}) {
  const th = "px-2 py-2 text-[11px] font-semibold text-slate-500 text-right whitespace-nowrap";
  const td = "px-2 py-2 text-right tabular-nums whitespace-nowrap align-top";
  const ventasTitulo = t("ventas_ayuda", { dias: ventanaDias });
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full min-w-[860px] text-sm">
        <thead className="border-b border-slate-200">
          <tr>
            <th className={`${th} text-left`}>{t("col.producto")}</th>
            <th className={th}>{t("col.cantidad")}</th>
            <th className={th} title={ventasTitulo}>
              {t("col.ventas_v", { dias: ventanaDias })}
            </th>
            <th className={th} title={ventasTitulo}>
              {t("col.ventas_c", { dias: ventanaDias })}
            </th>
            <th className={th}>{t("col.rotacion")}</th>
            <th className={th}>{t("col.objetivo")}</th>
            <th className={th}>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-sm bg-violet-500" />
                {t("sede_valencia")}
              </span>
            </th>
            <th className={th}>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-sm bg-sky-500" />
                {t("sede_caracas")}
              </span>
            </th>
            <th className={`${th} text-left`}>{t("col.origen")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {lineas.map((l) => {
            const v = valores[l.clave];
            const enAjuste = ajustando && v !== undefined;
            const nC = enAjuste && v.trim() !== "" && Number.isFinite(Number(v.replace(",", "."))) ? Number(v.replace(",", ".")) : null;
            const malo = enAjuste && errorDe(l);
            const valencia = enAjuste ? (nC == null || malo ? null : Math.round((l.cantidad - nC) * 1000) / 1000) : l.cantidadValencia;
            const cajasV = valencia == null ? null : cajasDe(valencia, l.porCaja);
            const cajasC = cajasDe(enAjuste ? (nC ?? 0) : l.cantidadCaracas, l.porCaja);
            const cambiado = enAjuste && nC != null && Math.abs(nC - l.cantidadCaracas) > 1e-9;
            const tituloManual =
              l.origen === "manual"
                ? t("manual_titulo", {
                    nombre: l.manualPor || "—",
                    fecha: fechaHora(l.manualAt),
                    motivo: l.motivoManual || "—",
                  })
                : undefined;
            return (
              <tr key={l.clave} className={cambiado ? "bg-violet-50/50" : undefined}>
                <td className="px-2 py-2 align-top min-w-[220px] max-w-[320px]">
                  <p className="text-slate-900">
                    {l.codigo && <span className="font-semibold">{l.codigo}</span>}
                    {l.codigo && " · "}
                    <span className="text-slate-700">{l.producto}</span>
                  </p>
                  <p className="text-[11px] text-slate-400">{porQue(l, t)}</p>
                </td>
                <td className={td}>
                  <p className="text-slate-900">{num(l.cantidad)}</p>
                  {l.cajas != null && (
                    <p className="text-[11px] text-slate-400">
                      {l.porCaja ? t("cajas", { cajas: num(l.cajas), porCaja: num(l.porCaja) }) : t("cajas_solo", { cajas: num(l.cajas) })}
                    </p>
                  )}
                </td>
                <td className={td}>
                  <p className="text-slate-700">{num(l.ventasValencia)}</p>
                  {l.stockValencia != null && (
                    <p className="text-[11px] text-slate-400" title={t("stock_ayuda")}>
                      {t("stock", { n: num(l.stockValencia) })}
                    </p>
                  )}
                </td>
                <td className={td}>
                  <p className="text-slate-700">{num(l.ventasCaracas)}</p>
                  {l.stockCaracas != null && (
                    <p className="text-[11px] text-slate-400" title={t("stock_ayuda")}>
                      {t("stock", { n: num(l.stockCaracas) })}
                    </p>
                  )}
                </td>
                <td className={`${td} text-slate-600`}>{l.pctRotacionCaracas == null ? "—" : pct(l.pctRotacionCaracas)}</td>
                <td className={`${td} text-slate-600`}>{pct(l.pctObjetivoCaracas)}</td>
                <td className={td}>
                  <p className="font-semibold text-slate-900">{valencia == null ? "—" : num(valencia)}</p>
                  {cajasV != null && <p className="text-[11px] text-slate-400">{t("cajas_solo", { cajas: num(cajasV) })}</p>}
                </td>
                <td className={td}>
                  {enAjuste ? (
                    <div className="flex flex-col items-end gap-0.5">
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={l.cantidad}
                        step={l.porCaja || 1}
                        value={v}
                        onChange={(e) => setValor(l.clave, e.target.value)}
                        aria-label={`${t("sede_caracas")} · ${l.codigo || l.producto}`}
                        aria-invalid={malo}
                        className={`w-24 h-9 rounded-lg border px-2 text-right text-sm tabular-nums focus:outline-none focus:ring-2 ${
                          malo
                            ? "border-red-300 bg-red-50 focus:ring-red-100"
                            : "border-slate-200 bg-white focus:border-[color:var(--portal-primary,#741DFE)] focus:ring-violet-100"
                        }`}
                      />
                      {malo ? (
                        <span className="text-[11px] text-red-600">{t("ajuste_rango", { max: num(l.cantidad) })}</span>
                      ) : (
                        cajasC != null && <span className="text-[11px] text-slate-400">{t("cajas_solo", { cajas: num(cajasC) })}</span>
                      )}
                    </div>
                  ) : (
                    <>
                      <p className="font-semibold text-slate-900">{num(l.cantidadCaracas)}</p>
                      {cajasC != null && <p className="text-[11px] text-slate-400">{t("cajas_solo", { cajas: num(cajasC) })}</p>}
                    </>
                  )}
                </td>
                <td className="px-2 py-2 align-top whitespace-nowrap">
                  {l.origen === "manual" ? (
                    <div className="flex flex-col items-start gap-1">
                      <span title={tituloManual}>
                        <Pill tono="pendiente">{t("origen.manual")}</Pill>
                      </span>
                      <span className="text-[11px] text-slate-400 max-w-[160px] truncate" title={tituloManual}>
                        {l.manualPor || "—"}
                      </span>
                      {puedeEditar && (
                        <button
                          type="button"
                          onClick={() => alAutomatico(l.clave)}
                          disabled={trabajando}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-violet-700 hover:underline disabled:opacity-40"
                        >
                          <RotateCcw className="w-3 h-3" />
                          {t("volver_auto")}
                        </button>
                      )}
                    </div>
                  ) : (
                    <Pill>{t("origen.auto")}</Pill>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Evento({ e, porClave, t }: { e: EventoReparto; porClave: Map<string, LineaGuardada>; t: T }) {
  const d = (e.detalle && typeof e.detalle === "object" ? e.detalle : {}) as any;
  const nombre = (x: { clave?: string; codigo?: string | null; producto?: string | null }) => {
    if (x.codigo || x.producto) return x.codigo || x.producto || "";
    const l = x.clave ? porClave.get(x.clave) : undefined;
    return l ? l.codigo || l.producto : String(x.clave || "").replace(/^N:/, "");
  };
  const etiqueta = ["activado", "desactivado", "calculado", "recalculado", "manual", "automatico", "porcentaje", "error_calculo"].includes(
    e.accion,
  )
    ? t(`accion.${e.accion}`)
    : e.accion;
  const antes = d.resumenAntes?.pctUnidadesCaracas;
  const despues = d.resumen?.pctUnidadesCaracas;
  const cambios: any[] = Array.isArray(d.cambios) ? d.cambios : [];
  const descartados: any[] = Array.isArray(d.manualesDescartados) ? d.manualesDescartados : [];
  const conservados: any[] = Array.isArray(d.manualesConservados) ? d.manualesConservados : [];
  // "activado" también recalcula (con lo de hoy) y trae el mismo detalle; los de antes solo el resumen.
  const esCalculo = e.accion === "calculado" || e.accion === "recalculado" || (e.accion === "activado" && !!d?.parametros);
  const cuota = d.cuota;
  const tono =
    e.accion === "error_calculo"
      ? "border-red-200"
      : e.accion === "manual" || e.accion === "porcentaje" || e.accion === "automatico"
        ? "border-amber-200"
        : e.accion === "desactivado"
          ? "border-slate-300"
          : "border-violet-200";

  return (
    <li className={`border-l-2 pl-3 ${tono}`}>
      <p className="text-sm font-medium text-slate-900">{etiqueta}</p>
      <p className="text-[11px] text-slate-500">
        {e.usuario} · {fechaHora(e.createdAt)}
      </p>
      {d.motivo && <p className="text-[12px] text-slate-700">“{String(d.motivo)}”</p>}
      {antes != null && despues != null ? (
        <p className="text-[12px] text-slate-600">{t("ev_resumen", { antes: pct(antes, 1), despues: pct(despues, 1) })}</p>
      ) : despues != null ? (
        <p className="text-[12px] text-slate-600">{t("ev_resumen_solo", { pct: pct(despues, 1) })}</p>
      ) : null}
      {e.accion === "porcentaje" && d.pctCaracas != null && (
        <p className="text-[12px] text-slate-600">{t("ev_pct", { pct: pct(Number(d.pctCaracas) / 100, 1) })}</p>
      )}
      {(esCalculo || e.accion === "error_calculo") && d.parametros && (
        <p className="text-[12px] text-slate-600">
          {t("ev_parametros", {
            peso: pct(Number(d.parametros.pesoRotacion)),
            dias: Number(d.parametros.ventanaDias) || 0,
          })}
          {d.base ? ` · ${t("ev_base", { base: t(`base.${d.base === "recibida" ? "recibida" : "esperada"}`) })}` : ""}
        </p>
      )}
      {esCalculo && cuota && (
        <p className="text-[12px] text-slate-600">
          {cuota.sinCuota
            ? t("ev_sin_cuota", { mes: cuota.mes || "—" })
            : t("ev_cuota", {
                mes: cuota.mes || "—",
                v: usd(cuota.valencia?.monto ?? null),
                c: usd(cuota.caracas?.monto ?? null),
                pct: pct(cuota.pctCaracas, 1),
              })}
        </p>
      )}
      {esCalculo && d.reiniciarManuales && <p className="text-[12px] text-slate-600">{t("ev_reiniciados")}</p>}
      {esCalculo && conservados.length > 0 && (
        <p className="text-[12px] text-slate-600">{t("ev_conservados", { count: conservados.length })}</p>
      )}
      {esCalculo && descartados.length > 0 && !d.reiniciarManuales && (
        <details className="text-[12px] text-slate-600">
          <summary className="cursor-pointer">{t("ev_descartados", { count: descartados.length })}</summary>
          <ul className="mt-1 space-y-0.5 pl-3">
            {descartados.map((x, i) => (
              <li key={i}>
                {t("ev_descartado", {
                  producto: nombre(x),
                  caracas: num(x.caracasAntes),
                  antes: num(x.cantidadAntes),
                  ahora: num(x.cantidadAhora),
                })}
              </li>
            ))}
          </ul>
        </details>
      )}
      {cambios.length > 0 && (
        <details className="text-[12px] text-slate-600">
          <summary className="cursor-pointer">{t("ev_cambios", { count: cambios.length })}</summary>
          <ul className="mt-1 space-y-0.5 pl-3">
            {cambios.map((c, i) => (
              <li key={i}>
                {t("ev_cambio", { producto: nombre(c), antes: num(c.caracasAntes), despues: num(c.caracasDespues) })}
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}
