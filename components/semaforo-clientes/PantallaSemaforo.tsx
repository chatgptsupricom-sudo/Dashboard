"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Loader2, RefreshCw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Aviso, EstadoCarga, Pestanas, Tarjeta, fechaCorta, money } from "@/components/administracion/comunes";
import { TablaReporte, type Columna } from "@/components/inteligencia-negocio/reportes/comunes";
import {
  ESTADO,
  MESES_HISTORIA,
  ESTADOS,
  NOMBRE_SEDE,
  ORDEN_ESTADO,
  VENTANAS,
  cambioDeEstado,
  resumenPorVendedor,
  type ConfigSemaforo,
  type EstadoSemaforo,
  type FilaSemaforo,
  type RespuestaSemaforo,
  type ResumenVendedor,
  type Ventana,
} from "@/lib/semaforo-clientes/tipos";

/**
 * Semáforo de clientes (lib/semaforo-clientes): el estado de cada cliente de
 * la cartera contra su propio historial. El vendedor ve solo lo suyo; la
 * gerencia, su sede con el resumen por vendedor; la dirección, las tres sedes.
 */

type Pestana = "clientes" | "vendedores" | "reglas";
type Fila = FilaSemaforo & { sede: string; estadoTexto: string; cambio: string };

function Luz({ estado, tam = 10 }: { estado: EstadoSemaforo; tam?: number }) {
  return (
    <span
      className="inline-block rounded-full shrink-0"
      style={{ width: tam, height: tam, background: ESTADO[estado].color }}
      aria-hidden
    />
  );
}

function Insignia({ estado }: { estado: EstadoSemaforo }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${ESTADO[estado].fondo}`}>
      <Luz estado={estado} tam={8} />
      {ESTADO[estado].corto}
    </span>
  );
}

function Variacion({ v }: { v: number | null }) {
  if (v === null) return <span className="text-slate-300">—</span>;
  const color = v <= -30 ? "text-red-600" : v < 0 ? "text-amber-600" : "text-emerald-600";
  return (
    <span className={`inline-flex items-center gap-0.5 font-medium ${color}`}>
      {v < 0 ? <ArrowDownRight className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
      {`${v > 0 ? "+" : ""}${v.toFixed(0)}%`}
    </span>
  );
}

const TEXTO_CAMBIO = { mejoro: "Mejoró", empeoro: "Empeoró" } as const;

export default function PantallaSemaforo() {
  const [sede, setSede] = useState("9");
  const [ventana, setVentana] = useState<Ventana | null>(null);
  const [datos, setDatos] = useState<RespuestaSemaforo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<{ mensaje: string; odooCaido: boolean } | null>(null);
  const [pestana, setPestana] = useState<Pestana>("clientes");
  const [estados, setEstados] = useState<EstadoSemaforo[]>([]);
  const [vendedor, setVendedor] = useState("");
  const [soloCambios, setSoloCambios] = useState(false);
  const [detalle, setDetalle] = useState<Fila | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ sede });
      if (ventana) qs.set("ventana", String(ventana));
      const r = await fetch(`/api/semaforo-clientes?${qs}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw Object.assign(new Error(j.error || "No se pudo cargar"), { odooCaido: !!j.odooCaido });
      setDatos(j);
      if (!ventana) setVentana(j.ventana);
    } catch (e: any) {
      setError({ mensaje: e.message, odooCaido: !!e.odooCaido });
    } finally {
      setCargando(false);
    }
  }, [sede, ventana]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const filas: Fila[] = useMemo(
    () =>
      (datos?.filas ?? [])
        .map((f) => {
          const cambio = cambioDeEstado(f);
          return {
            ...f,
            sede: NOMBRE_SEDE[f.companyId] ?? String(f.companyId),
            estadoTexto: ESTADO[f.estado].label,
            cambio: cambio ? TEXTO_CAMBIO[cambio] : "",
          };
        })
        .sort((a, b) => ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado] || b.enRiesgo - a.enRiesgo || b.base - a.base),
    [datos],
  );

  const vendedores = useMemo(
    () => [...new Set(filas.map((f) => f.vendedor))].sort((a, b) => a.localeCompare(b)),
    [filas],
  );
  const deVendedor = useMemo(() => (vendedor ? filas.filter((f) => f.vendedor === vendedor) : filas), [filas, vendedor]);
  const visibles = useMemo(
    () => deVendedor.filter((f) => (!estados.length || estados.includes(f.estado)) && (!soloCambios || f.cambio)),
    [deVendedor, estados, soloCambios],
  );
  const conteo = useMemo(() => {
    const c = Object.fromEntries(ESTADOS.map((e) => [e.value, 0])) as Record<EstadoSemaforo, number>;
    for (const f of deVendedor) c[f.estado]++;
    return c;
  }, [deVendedor]);
  const resumen = useMemo(() => resumenPorVendedor(deVendedor), [deVendedor]);
  const enRiesgo = deVendedor.reduce((s, f) => s + f.enRiesgo, 0);
  const dejaron = deVendedor.filter((f) => f.dejoDeComprar).length;
  const mejoraron = deVendedor.filter((f) => f.cambio === "Mejoró").length;
  const empeoraron = deVendedor.filter((f) => f.cambio === "Empeoró").length;

  const alternarEstado = (e: EstadoSemaforo) =>
    setEstados((v) => (v.includes(e) ? v.filter((x) => x !== e) : [...v, e]));

  const columnas: Columna<Fila>[] = [
    { clave: "estadoTexto", titulo: "Estado", mostrar: (f) => <Insignia estado={f.estado} /> },
    {
      clave: "cliente",
      titulo: "Cliente",
      ancho: "min-w-[200px]",
      mostrar: (f) => (
        <button onClick={() => setDetalle(f)} className="text-left text-blue-700 hover:underline font-medium">
          {f.cliente}
          {(f.estacional || f.dejoDeComprar) && (
            <span className="block text-[10px] font-normal text-slate-500">
              {f.dejoDeComprar ? "Dejó de comprar" : "Estacional"}
            </span>
          )}
        </button>
      ),
    },
    ...(datos?.soloCartera ? [] : [{ clave: "vendedor", titulo: "Vendedor" } as Columna<Fila>]),
    ...((datos?.sedes.length ?? 1) > 1 ? [{ clave: "sede", titulo: "Sede" } as Columna<Fila>] : []),
    { clave: "promedio6m", titulo: "Prom. mensual 6 m", tipo: "dinero", sumar: true },
    { clave: "venta30", titulo: "Últ. 30 días", tipo: "dinero", sumar: true },
    { clave: "venta60", titulo: "Últ. 60 días", tipo: "dinero", sumar: true },
    { clave: "venta90", titulo: "Últ. 90 días", tipo: "dinero", sumar: true },
    {
      clave: "variacion",
      titulo: "Variación",
      tipo: "porcentaje",
      mostrar: (f) => <Variacion v={f.variacion} />,
    },
    { clave: "ultimaCompra", titulo: "Última compra", tipo: "fecha" },
    {
      clave: "diasSinComprar",
      titulo: "Días sin comprar",
      tipo: "numero",
      mostrar: (f) =>
        f.diasSinComprar === null ? (
          <span className="text-slate-300">—</span>
        ) : (
          <span>
            {f.diasSinComprar}
            {f.frecuencia !== null && <span className="text-slate-400"> / {f.frecuencia}</span>}
          </span>
        ),
      excel: (f) => f.diasSinComprar,
    },
    { clave: "frecuencia", titulo: "Compra cada (días)", tipo: "numero" },
    {
      clave: "ultimoContacto",
      titulo: "Último contacto",
      tipo: "fecha",
      mostrar: (f) =>
        f.ultimoContacto ? (
          <span title={f.contactoOrigen ?? ""}>{fechaCorta(f.ultimoContacto)}</span>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
    { clave: "contactoOrigen", titulo: "Contacto por", soloExcel: true },
    { clave: "enRiesgo", titulo: "En riesgo / mes", tipo: "dinero", sumar: true },
    ...(datos?.fotoAnterior
      ? [
          {
            clave: "cambio",
            titulo: "Vs. semana pasada",
            mostrar: (f: Fila) =>
              f.estadoAnterior ? (
                <span className="inline-flex items-center gap-1 whitespace-nowrap">
                  <Luz estado={f.estadoAnterior} tam={8} />
                  <span className={f.cambio === "Empeoró" ? "text-red-600" : f.cambio === "Mejoró" ? "text-emerald-600" : "text-slate-400"}>
                    {f.cambio || "Igual"}
                  </span>
                </span>
              ) : (
                <span className="text-slate-300">—</span>
              ),
            excel: (f: Fila) => (f.estadoAnterior ? `${ESTADO[f.estadoAnterior].corto} → ${f.cambio || "igual"}` : ""),
          } as Columna<Fila>,
        ]
      : []),
    { clave: "motivos", titulo: "Motivo", soloExcel: true, excel: (f) => f.motivos.join(" ") },
  ];

  return (
    <div className="space-y-5 p-3 sm:p-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
            <span className="flex flex-col gap-1 rounded-lg bg-slate-800 p-1.5" aria-hidden>
              <Luz estado="rojo" />
              <Luz estado="amarillo" />
              <Luz estado="verde" />
            </span>
            Semáforo de clientes
          </h1>
          <p className="text-gray-500 text-sm">
            {datos?.soloCartera
              ? "Tu cartera de clientes según cómo vienen comprando contra su propio historial."
              : "Cómo viene comprando cada cliente de la cartera contra su propio historial."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {datos?.eligeSede && (
            <select
              value={sede}
              onChange={(e) => {
                setSede(e.target.value);
                setVendedor("");
              }}
              className="border rounded-lg px-3 py-2 text-sm bg-white"
              aria-label="Sede"
            >
              <option value="9">Valencia</option>
              <option value="10">Caracas</option>
              <option value="7">Panamá</option>
              <option value="todas">Las tres sedes</option>
            </select>
          )}
          <div className="flex rounded-lg border bg-white p-0.5" role="group" aria-label="Período de comparación">
            {VENTANAS.map((v) => (
              <button
                key={v}
                onClick={() => setVentana(v)}
                className={`px-3 py-1.5 text-xs rounded-md ${ventana === v ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
              >
                {v} días
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={cargar} disabled={cargando} className="h-9">
            <RefreshCw className={`h-4 w-4 mr-2 ${cargando ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
        </div>
      </div>

      {cargando || error || !datos ? (
        <EstadoCarga
          cargando={cargando}
          error={error}
          texto="Leyendo las compras de la cartera en Odoo… la primera vez del día puede tardar un minuto."
        />
      ) : (
        <>
          {datos.sinSmartbit && (
            <Aviso>
              No se pudo leer el histórico de Smartbit: las compras antes del {fechaCorta("2026-04-01")} no están y
              algunos clientes pueden salir como nuevos.
            </Aviso>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
            <Tarjeta titulo="Clientes en cartera" valor={deVendedor.length.toLocaleString("en-US")} detalle={vendedor || undefined} />
            {(["verde", "amarillo", "rojo"] as const).map((e) => (
              <button key={e} onClick={() => setEstados(estados.length === 1 && estados[0] === e ? [] : [e])} className="text-left">
                <Tarjeta
                  titulo={`${ESTADO[e].corto} · ${ESTADO[e].label}`}
                  valor={
                    <span className="flex items-center gap-2">
                      <Luz estado={e} tam={12} />
                      {conteo[e].toLocaleString("en-US")}
                    </span>
                  }
                  tono={e === "verde" ? "verde" : e === "amarillo" ? "ambar" : "rojo"}
                />
              </button>
            ))}
            <Tarjeta titulo="Dejaron de comprar" valor={dejaron.toLocaleString("en-US")} detalle={`Sin compras en ${datos.ventana} días`} />
            <Tarjeta
              titulo="Facturación en riesgo"
              valor={<span className="whitespace-nowrap text-lg sm:text-2xl">{money(enRiesgo)}</span>}
              detalle="por mes, amarillos y rojos"
              tono="rojo"
            />
            <Tarjeta
              titulo="Nuevos / sin compras"
              valor={`${conteo.nuevo} / ${conteo.sin_compras}`}
              detalle="no se juzgan como riesgo"
            />
          </div>

          {datos.fotoAnterior ? (
            <p className="text-xs text-slate-500">
              Contra la semana del {fechaCorta(datos.fotoAnterior)}:{" "}
              <button onClick={() => setSoloCambios(true)} className="text-red-600 font-medium hover:underline">
                {empeoraron} empeoraron
              </button>{" "}
              ·{" "}
              <button onClick={() => setSoloCambios(true)} className="text-emerald-600 font-medium hover:underline">
                {mejoraron} mejoraron
              </button>
              .
            </p>
          ) : (
            datos.fotoEstaSemana && (
              <p className="text-xs text-slate-500">
                Esta semana se guardó la primera foto del semáforo: desde la próxima se ve quién cambió de color.
              </p>
            )
          )}

          <Pestanas<Pestana>
            opciones={[
              { value: "clientes", label: "Clientes", contador: visibles.length },
              ...(datos.soloCartera ? [] : [{ value: "vendedores" as Pestana, label: "Por vendedor", contador: resumen.length }]),
              { value: "reglas", label: datos.puedeConfigurar ? "Reglas y umbrales" : "Cómo se calcula" },
            ]}
            valor={pestana}
            onChange={setPestana}
          />

          {pestana === "clientes" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {!datos.soloCartera && (
                  <select
                    value={vendedor}
                    onChange={(e) => setVendedor(e.target.value)}
                    className="border rounded-lg px-3 h-9 text-sm bg-white max-w-[260px]"
                    aria-label="Vendedor"
                  >
                    <option value="">Todos los vendedores</option>
                    {vendedores.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                )}
                {ESTADOS.map((e) => (
                  <button
                    key={e.value}
                    onClick={() => alternarEstado(e.value)}
                    aria-pressed={estados.includes(e.value)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                      estados.includes(e.value) ? e.fondo + " font-medium" : "bg-white text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    <Luz estado={e.value} tam={8} />
                    {e.corto} ({conteo[e.value]})
                  </button>
                ))}
                {datos.fotoAnterior && (
                  <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 ml-1">
                    <input type="checkbox" checked={soloCambios} onChange={(e) => setSoloCambios(e.target.checked)} />
                    Solo los que cambiaron de color
                  </label>
                )}
                {(estados.length > 0 || soloCambios || vendedor) && (
                  <button
                    onClick={() => {
                      setEstados([]);
                      setSoloCambios(false);
                      setVendedor("");
                    }}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Quitar filtros
                  </button>
                )}
              </div>
              <TablaReporte<Fila>
                filas={visibles}
                columnas={columnas}
                buscarEn={(f) => `${f.cliente} ${f.rif} ${f.vendedor}`}
                archivo={`semaforo-clientes-${datos.hoy}`}
              />
              <p className="text-[11px] text-slate-400">
                Montos en USD sin IVA, notas de crédito restando. «Días sin comprar» va con la frecuencia habitual del
                cliente (cada cuántos días suele comprar). Toca un cliente para ver por qué salió de ese color.
              </p>
            </div>
          )}

          {pestana === "vendedores" && (
            <TablaVendedores
              filas={resumen}
              variasSedes={datos.sedes.length > 1}
              conFoto={!!datos.fotoAnterior}
              hoy={datos.hoy}
              alElegir={(v) => {
                setVendedor(v);
                setPestana("clientes");
              }}
            />
          )}

          {pestana === "reglas" && (
            <Reglas config={datos.config} editable={datos.puedeConfigurar} alGuardar={cargar} />
          )}
        </>
      )}

      <Dialog open={!!detalle} onOpenChange={(o) => !o && setDetalle(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {detalle && datos && <Detalle fila={detalle} hoy={datos.hoy} ventana={datos.ventana} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------

function TablaVendedores({
  filas,
  variasSedes,
  conFoto,
  hoy,
  alElegir,
}: {
  filas: ResumenVendedor[];
  variasSedes: boolean;
  conFoto: boolean;
  hoy: string;
  alElegir: (vendedor: string) => void;
}) {
  type FilaV = ResumenVendedor & { sede: string };
  const columnas: Columna<FilaV>[] = [
    {
      clave: "vendedor",
      titulo: "Vendedor",
      mostrar: (f) => (
        <button onClick={() => alElegir(f.vendedor)} className="text-left text-blue-700 hover:underline font-medium">
          {f.vendedor}
        </button>
      ),
    },
    ...(variasSedes ? [{ clave: "sede", titulo: "Sede" } as Columna<FilaV>] : []),
    { clave: "total", titulo: "Clientes", tipo: "numero", sumar: true },
    { clave: "verde", titulo: "Verdes", tipo: "numero", sumar: true },
    { clave: "amarillo", titulo: "Amarillos", tipo: "numero", sumar: true },
    { clave: "rojo", titulo: "Rojos", tipo: "numero", sumar: true },
    { clave: "dejaronDeComprar", titulo: "Dejaron de comprar", tipo: "numero", sumar: true },
    { clave: "nuevo", titulo: "Nuevos", tipo: "numero", sumar: true },
    { clave: "sinCompras", titulo: "Sin compras", tipo: "numero", sumar: true },
    {
      clave: "pctRiesgo",
      titulo: "% en riesgo",
      tipo: "porcentaje",
      mostrar: (f) => (
        <span className="inline-flex items-center gap-2 justify-end w-full">
          <span className="h-1.5 w-16 rounded-full bg-slate-100 overflow-hidden">
            <span
              className="block h-full rounded-full"
              style={{ width: `${Math.min(100, f.pctRiesgo)}%`, background: f.pctRiesgo >= 40 ? ESTADO.rojo.color : ESTADO.amarillo.color }}
            />
          </span>
          {f.pctRiesgo.toFixed(1)}%
        </span>
      ),
    },
    { clave: "enRiesgo", titulo: "Facturación en riesgo / mes", tipo: "dinero", sumar: true },
    { clave: "venta90", titulo: "Venta 90 días", tipo: "dinero", sumar: true },
    ...(conFoto
      ? [
          { clave: "empeoraron", titulo: "Empeoraron", tipo: "numero", sumar: true } as Columna<FilaV>,
          { clave: "mejoraron", titulo: "Mejoraron", tipo: "numero", sumar: true } as Columna<FilaV>,
        ]
      : []),
  ];
  return (
    <div className="space-y-2">
      <TablaReporte<FilaV>
        filas={filas.map((f) => ({ ...f, sede: NOMBRE_SEDE[f.companyId] ?? String(f.companyId) }))}
        columnas={columnas}
        buscarEn={(f) => f.vendedor}
        archivo={`semaforo-por-vendedor-${hoy}`}
        ordenInicial={{ clave: "enRiesgo", desc: true }}
      />
      <p className="text-[11px] text-slate-400">
        % en riesgo = amarillos + rojos sobre los clientes que se pueden juzgar (sin nuevos ni sin compras). Una cartera
        grande con mucho % en riesgo es la candidata a repartir; la reasignación se hace en Odoo, a criterio del gerente.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Detalle({ fila, hoy, ventana }: { fila: Fila; hoy: string; ventana: number }) {
  const meses = useMemo(() => {
    const lista: { mes: string; valor: number }[] = [];
    const [a, m] = hoy.split("-").map(Number);
    for (let i = MESES_HISTORIA - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(a, m - 1 - i, 1));
      const mes = d.toISOString().slice(0, 7);
      lista.push({ mes, valor: fila.meses[mes] ?? 0 });
    }
    return lista;
  }, [fila, hoy]);
  const max = Math.max(1, ...meses.map((x) => x.valor));
  const datosFila: [string, React.ReactNode][] = [
    ["Vendedor", fila.vendedor],
    ["Sede", fila.sede],
    ["RIF", fila.rif || "—"],
    ["Promedio mensual (base)", money(fila.base)],
    [`Ritmo mensual últimos ${ventana} días`, money(fila.ritmo)],
    ["Variación", <Variacion key="v" v={fila.variacion} />],
    ["Primera compra", fechaCorta(fila.primeraCompra)],
    ["Última compra", fechaCorta(fila.ultimaCompra)],
    ["Compra cada", fila.frecuencia ? `${fila.frecuencia} días` : "—"],
    [`Compras en ${ventana} días`, `${fila.comprasVentana}${fila.comprasEsperadas !== null ? ` (le tocaban ~${Math.round(fila.comprasEsperadas)})` : ""}`],
    ["Último contacto", fila.ultimoContacto ? `${fechaCorta(fila.ultimoContacto)} · ${fila.contactoOrigen}` : "Sin registro"],
    ["En riesgo por mes", money(fila.enRiesgo)],
  ];
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 pr-6">
          <Insignia estado={fila.estado} />
          <span className="truncate">{fila.cliente}</span>
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <ul className="space-y-1.5">
          {fila.motivos.map((m, i) => (
            <li key={i} className="text-sm text-slate-700 flex gap-2">
              <span className="text-slate-400">•</span>
              {m}
            </li>
          ))}
        </ul>

        <div>
          <p className="text-xs font-medium text-slate-500 mb-2">Compras por mes (neto, USD sin IVA)</p>
          <div className="flex items-end gap-1">
            {meses.map((x) => (
              <div key={x.mes} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${x.mes}: ${money(x.valor)}`}>
                <div className="w-full h-28 flex items-end">
                  <div
                    className="w-full rounded-t"
                    style={{
                      height: `${Math.max(0, (x.valor / max) * 100)}%`,
                      minHeight: x.valor > 0 ? 2 : 0,
                      background: ESTADO[fila.estado === "sin_compras" || fila.estado === "nuevo" ? "nuevo" : fila.estado].color,
                      opacity: 0.75,
                    }}
                  />
                </div>
                <span className="text-[9px] text-slate-400">{x.mes.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
          {datosFila.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-dashed border-slate-100 py-1">
              <dt className="text-slate-500">{k}</dt>
              <dd className="text-slate-800 text-right">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

const CAMPOS_CONFIG: { clave: keyof ConfigSemaforo; titulo: string; ayuda: string; paso?: number }[] = [
  { clave: "caidaAmarillo", titulo: "Caída para amarillo (%)", ayuda: "Compra este % menos que su promedio." },
  { clave: "caidaRojo", titulo: "Caída para rojo (%)", ayuda: "Compra este % menos que su promedio." },
  { clave: "factorAmarillo", titulo: "Veces su frecuencia sin comprar: amarillo", ayuda: "Si compra cada 20 días, 1,5 = amarillo a los 30.", paso: 0.1 },
  { clave: "factorRojo", titulo: "Veces su frecuencia sin comprar: rojo", ayuda: "Si compra cada 20 días, 2 = rojo a los 40.", paso: 0.1 },
  { clave: "diasMinimos", titulo: "Días mínimos sin comprar para alertar", ayuda: "Antes no hay amarillo; rojo, nunca antes del doble." },
  { clave: "caidaFrecuencia", titulo: "Compras de menos para amarillo (%)", ayuda: "Compró este % menos veces de las que le tocaban." },
  { clave: "minCompras", titulo: "Compras mínimas para juzgarlo", ayuda: "Con menos, sale como nuevo / sin historial." },
  { clave: "diasNuevo", titulo: "Días como cliente nuevo", ayuda: "Desde su primera compra." },
];

function Reglas({ config, editable, alGuardar }: { config: ConfigSemaforo; editable: boolean; alGuardar: () => void }) {
  const [valores, setValores] = useState<ConfigSemaforo>(config);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  useEffect(() => setValores(config), [config]);

  const guardar = async () => {
    setGuardando(true);
    setMensaje(null);
    try {
      const r = await fetch("/api/semaforo-clientes/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(valores),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "No se pudo guardar");
      setMensaje("Guardado. El semáforo se recalcula con los nuevos umbrales.");
      alGuardar();
    } catch (e: any) {
      setMensaje(e.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card>
        <CardContent className="p-5 space-y-3 text-sm text-slate-700">
          <h3 className="font-semibold text-slate-900">Cómo se calcula</h3>
          <p>Cada cliente se compara contra su propio historial, no contra los demás:</p>
          <ul className="space-y-2">
            <li className="flex gap-2"><Luz estado="rojo" /> <span><b>Rojo</b>: su compra mensual cayó {config.caidaRojo} % o más contra su promedio, o lleva más de {config.factorRojo} veces su frecuencia habitual sin comprar.</span></li>
            <li className="flex gap-2"><Luz estado="amarillo" /> <span><b>Amarillo</b>: cayó entre {config.caidaAmarillo} % y {config.caidaRojo - 1} %, compró {config.caidaFrecuencia} % menos veces de las que le tocaban sin comprar más plata, o lleva más de {config.factorAmarillo} veces su frecuencia sin comprar.</span></li>
            <li className="flex gap-2"><Luz estado="verde" /> <span><b>Verde</b>: compra dentro de su ritmo y frecuencia.</span></li>
            <li className="flex gap-2"><Luz estado="nuevo" /> <span><b>Nuevo / sin historial</b>: menos de {config.minCompras} compras o primera compra hace menos de {config.diasNuevo} días. No se juzga.</span></li>
          </ul>
          <p>
            <b>Promedio</b> = lo que compró por mes en los 12 meses anteriores al período (desde su primera compra si es
            más reciente). Se compara con lo que compró en los últimos 30, 60 o 90 días llevado a mes. Por monto solo se
            juzga si en el período le tocaban al menos 1,5 compras: a quien compra cada tres meses, un mes sin comprar no
            dice nada.
          </p>
          <p>
            <b>Frecuencia habitual</b> = cada cuántos días suele comprar (mediana). Nunca hay alerta por días antes de{" "}
            {config.diasMinimos} días sin comprar (rojo, antes de {config.diasMinimos * 2}).
          </p>
          <p>
            Si en el período compró su promedio o más, los días sin comprar pesan un nivel menos: puede estar abastecido.
          </p>
          <p>
            <b>Estacional</b>: si el año pasado, en las mismas fechas, también compró poco y después volvió, baja un nivel.
          </p>
          <p>
            <b>Venta</b>: facturas y recibos de Odoo en USD sin IVA, notas de crédito restando, sin servicios ni empresas
            del grupo; antes de abril de 2026, Smartbit por RIF. <b>Último contacto</b>: la cotización o pedido más reciente,
            una nota, correo o actividad en el contacto de Odoo, o una visita del vendedor anotada en el panel.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-5 space-y-3">
          <h3 className="font-semibold text-slate-900">Umbrales</h3>
          {!editable && <p className="text-xs text-slate-500">Los ajusta la dirección (SuperAdmin).</p>}
          <div className="grid sm:grid-cols-2 gap-3">
            {CAMPOS_CONFIG.map((c) => (
              <label key={c.clave} className="text-xs space-y-1">
                <span className="font-medium text-slate-700">{c.titulo}</span>
                <Input
                  type="number"
                  step={c.paso ?? 1}
                  value={String(valores[c.clave])}
                  disabled={!editable}
                  onChange={(e) => setValores((v) => ({ ...v, [c.clave]: Number(e.target.value) }))}
                  className="h-9"
                />
                <span className="block text-slate-400">{c.ayuda}</span>
              </label>
            ))}
            <label className="text-xs space-y-1">
              <span className="font-medium text-slate-700">Período con que abre y se guarda la foto semanal</span>
              <select
                value={valores.ventanaDias}
                disabled={!editable}
                onChange={(e) => setValores((v) => ({ ...v, ventanaDias: Number(e.target.value) as Ventana }))}
                className="border rounded-md px-3 h-9 text-sm bg-white w-full"
              >
                {VENTANAS.map((v) => (
                  <option key={v} value={v}>
                    {v} días
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs flex items-center gap-2 pt-5">
              <input
                type="checkbox"
                checked={valores.detectarEstacional}
                disabled={!editable}
                onChange={(e) => setValores((v) => ({ ...v, detectarEstacional: e.target.checked }))}
              />
              <span className="font-medium text-slate-700">Detectar clientes estacionales</span>
            </label>
          </div>
          {editable && (
            <div className="flex items-center gap-3 pt-2">
              <Button onClick={guardar} disabled={guardando} size="sm">
                {guardando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Guardar umbrales
              </Button>
              {mensaje && <span className="text-xs text-slate-600">{mensaje}</span>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
