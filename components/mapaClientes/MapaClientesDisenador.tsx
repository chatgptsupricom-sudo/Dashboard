"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Building2, Loader2, LocateFixed, MapPinned, Minus, Plus, RefreshCw, Users, X } from "lucide-react";
import type { Mapa3D } from "@/lib/mapaClientes/mapa3d";
import { PAISES_MAPA, type MapaClientesRespuesta, type PaisMapa, type ZonaConteo } from "@/lib/mapaClientes/zonas";

/**
 * Mapa de clientes del Diseñador: cuántos clientes hay en cada estado del país
 * de su sede, en 3D (lib/mapaClientes/mapa3d). Solo cantidades: la API no
 * manda nombres, RIF ni montos. three.js se carga aparte y solo en el
 * navegador; sin WebGL queda la lista.
 */

const numero = (n: number) => n.toLocaleString("es");

// Los mismos tonos del mapa (PALETA.claro.escala), para la leyenda y las barras.
const DEGRADADO = "linear-gradient(90deg, #bae6fd, #38bdf8, #6366f1, #7c3aed)";

export default function MapaClientesDisenador() {
  const [pais, setPais] = useState<PaisMapa | null>(null);
  const [datos, setDatos] = useState<MapaClientesRespuesta | null>(null);
  const [geojson, setGeojson] = useState<{ pais: PaisMapa; datos: any } | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [elegida, setElegida] = useState<string | null>(null);
  const [encima, setEncima] = useState<{ clave: string; x: number; y: number } | null>(null);
  const [listo3d, setListo3d] = useState(false);
  const [sinWebgl, setSinWebgl] = useState(false);

  const caja = useRef<HTMLDivElement>(null);
  const mapa = useRef<Mapa3D | null>(null);
  const figurasDe = useRef<typeof import("@/lib/mapaClientes/mapa3d").figurasDelGeojson | null>(null);

  const cargar = useCallback(async (elegido: PaisMapa | null) => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/disenador/mapa-clientes${elegido ? `?pais=${elegido}` : ""}`, { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "No se pudo cargar el mapa");
      const respuesta = j as MapaClientesRespuesta;
      if (geojson?.pais !== respuesta.pais) {
        const geo = await fetch(PAISES_MAPA[respuesta.pais].geojson).then((r) => {
          if (!r.ok) throw new Error("No se pudo cargar el mapa del país");
          return r.json();
        });
        setGeojson({ pais: respuesta.pais, datos: geo });
      }
      setDatos(respuesta);
      setPais(respuesta.pais);
      setElegida(null);
    } catch (e: any) {
      setError(e?.message || "No se pudo cargar el mapa");
    } finally {
      setCargando(false);
    }
  }, [geojson?.pais]);

  useEffect(() => {
    void cargar(null);
    // Solo al entrar: después se recarga con el botón o al cambiar de país.
  }, []);

  // ── Escena 3D ────────────────────────────────────────────────────────────
  useEffect(() => {
    let viva = true;
    void import("@/lib/mapaClientes/mapa3d")
      .then(({ crearMapa3D, figurasDelGeojson }) => {
        if (!viva || !caja.current) return;
        figurasDe.current = figurasDelGeojson;
        mapa.current = crearMapa3D(caja.current, {
          onEncima: (clave, x, y) => setEncima(clave ? { clave, x, y } : null),
          onSeleccion: (clave) => setElegida(clave),
          movimientoReducido: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
          oscuro: document.documentElement.classList.contains("dark"),
        });
        setListo3d(true);
      })
      .catch((e) => {
        console.error("No se pudo iniciar el mapa 3D:", e);
        if (viva) setSinWebgl(true);
      });
    // Si el panel pasa a modo oscuro, el mapa también.
    const tema = new MutationObserver(() => mapa.current?.tema(document.documentElement.classList.contains("dark")));
    tema.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => {
      viva = false;
      tema.disconnect();
      mapa.current?.destruir();
      mapa.current = null;
    };
  }, []);

  useEffect(() => {
    if (!listo3d || !datos || !geojson || geojson.pais !== datos.pais || !figurasDe.current) return;
    mapa.current?.dibujar(figurasDe.current(geojson.datos, datos.pais), datos.zonas);
  }, [listo3d, datos, geojson]);

  useEffect(() => {
    mapa.current?.seleccionar(elegida);
  }, [elegida, listo3d]);

  // ── Números ──────────────────────────────────────────────────────────────
  const zonas = datos?.zonas ?? [];
  const conClientes = useMemo(() => zonas.filter((z) => z.clientes > 0), [zonas]);
  const maximo = conClientes[0]?.clientes ?? 1;
  const ubicados = conClientes.reduce((s, z) => s + z.clientes, 0);
  const porClave = useMemo(() => new Map(zonas.map((z) => [z.clave, z])), [zonas]);
  const zonaElegida = elegida ? porClave.get(elegida) ?? null : null;
  const zonaEncima = encima ? porClave.get(encima.clave) ?? null : null;
  const pct = (n: number) => (ubicados > 0 ? `${((n / ubicados) * 100).toLocaleString("es", { maximumFractionDigits: 1 })} %` : "—");

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 px-4 py-6 sm:px-6">
      {/* Encabezado */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-500">Clientes</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-slate-900 sm:text-3xl">
            <MapPinned className="h-7 w-7 text-indigo-500" />
            Mapa de clientes
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Cuántos clientes hay en cada estado{datos ? ` de ${datos.nombre_pais}` : ""}. Gira, inclina y toca un estado para ver sus ciudades.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {datos?.puede_elegir_pais && (
            <div className="flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
              {(Object.keys(PAISES_MAPA) as PaisMapa[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={cargando}
                  onClick={() => p !== pais && void cargar(p)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    p === pais ? "bg-indigo-600 text-white shadow" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {PAISES_MAPA[p].nombre}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => void cargar(pais)}
            disabled={cargando}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Actualizar</span>
          </button>
        </div>
      </div>

      {/* Tarjetas */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tarjeta icono={Users} titulo="Clientes" valor={datos ? numero(datos.total) : "—"} nota={datos?.nombre_pais} destacado />
        <Tarjeta icono={MapPinned} titulo="Estados con clientes" valor={datos ? `${conClientes.length} de ${zonas.length}` : "—"} />
        <Tarjeta icono={Building2} titulo="Estado con más clientes" valor={conClientes[0]?.nombre ?? "—"} nota={conClientes[0] ? `${numero(conClientes[0].clientes)} clientes` : undefined} />
        <Tarjeta
          icono={AlertCircle}
          titulo="Sin ubicar"
          valor={datos ? numero(datos.sin_ubicar) : "—"}
          nota="Sin estado en Odoo: no salen en el mapa"
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Mapa */}
        <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-[radial-gradient(ellipse_at_top,_#eef2ff_0%,_#f8fafc_55%,_#f1f5f9_100%)] shadow-sm">
          <div ref={caja} className="relative h-[440px] w-full sm:h-[560px] lg:h-[640px]" />

          {(cargando || (!listo3d && !sinWebgl)) && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm text-slate-600 shadow">
                <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                Cargando mapa…
              </div>
            </div>
          )}
          {sinWebgl && (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-slate-500">
              Este equipo no puede mostrar el mapa en 3D. La lista de la derecha tiene las mismas cantidades.
            </div>
          )}

          {/* Cartel de la zona bajo el puntero */}
          {zonaEncima && encima && (
            <div
              className="pointer-events-none absolute z-10 min-w-[150px] rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur"
              style={{
                left: Math.min(encima.x + 14, (caja.current?.clientWidth ?? 400) - 170),
                top: Math.max(8, encima.y - 64),
              }}
            >
              <p className="text-xs font-medium text-slate-500">{zonaEncima.nombre}</p>
              <p className="text-lg font-bold text-slate-900">
                {numero(zonaEncima.clientes)} <span className="text-sm font-medium text-slate-500">{zonaEncima.clientes === 1 ? "cliente" : "clientes"}</span>
              </p>
            </div>
          )}

          {/* Controles */}
          {listo3d && (
            <div className="absolute right-3 top-3 flex flex-col gap-1.5">
              <BotonMapa titulo="Acercar" onClick={() => mapa.current?.acercar(0.8)}>
                <Plus className="h-4 w-4" />
              </BotonMapa>
              <BotonMapa titulo="Alejar" onClick={() => mapa.current?.acercar(1.25)}>
                <Minus className="h-4 w-4" />
              </BotonMapa>
              <BotonMapa titulo="Vista inicial" onClick={() => mapa.current?.centrar()}>
                <LocateFixed className="h-4 w-4" />
              </BotonMapa>
            </div>
          )}

          {/* Leyenda */}
          {datos && conClientes.length > 0 && (
            <div className="pointer-events-none absolute bottom-3 left-3 rounded-xl border border-slate-200 bg-white/90 px-3 py-2 shadow-sm backdrop-blur">
              <p className="text-[11px] font-medium text-slate-500">Clientes por estado</p>
              <div className="mt-1 h-2 w-36 rounded-full sm:w-44" style={{ background: DEGRADADO }} />
              <div className="mt-0.5 flex justify-between text-[11px] tabular-nums text-slate-500">
                <span>1</span>
                <span>{numero(maximo)}</span>
              </div>
            </div>
          )}
          <p className="pointer-events-none absolute bottom-3 right-3 hidden text-[11px] text-slate-400 md:block">
            Arrastra para girar · clic derecho para mover · Ctrl + rueda para acercar
          </p>
        </div>

        {/* Lista / detalle */}
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          {zonaElegida ? (
            <DetalleZona zona={zonaElegida} maximo={maximo} pct={pct(zonaElegida.clientes)} onCerrar={() => setElegida(null)} />
          ) : (
            <>
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="font-semibold text-slate-900">Estados</h2>
                <p className="text-xs text-slate-500">Toca uno para ver sus ciudades</p>
              </div>
              <ol className="space-y-1 p-3 lg:max-h-[560px] lg:overflow-y-auto">
                {!datos &&
                  Array.from({ length: 8 }).map((_, i) => <li key={i} className="h-11 animate-pulse rounded-xl bg-slate-100" />)}
                {zonas.map((z, i) => (
                  <li key={z.clave}>
                    <button
                      type="button"
                      onClick={() => setElegida(z.clave)}
                      onMouseEnter={() => mapa.current?.resaltar(z.clave)}
                      onMouseLeave={() => mapa.current?.resaltar(null)}
                      className="group w-full rounded-xl px-3 py-2 text-left transition hover:bg-indigo-50/70"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-5 shrink-0 text-right text-xs tabular-nums text-slate-400">{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700 group-hover:text-indigo-700">{z.nombre}</span>
                        <span className="text-sm font-semibold tabular-nums text-slate-900">{numero(z.clientes)}</span>
                      </div>
                      <div className="ml-8 mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full transition-[width] duration-700"
                          style={{ width: `${z.clientes > 0 ? Math.max(3, (z.clientes / maximo) * 100) : 0}%`, background: DEGRADADO }}
                        />
                      </div>
                    </button>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Tarjeta({
  icono: Icono,
  titulo,
  valor,
  nota,
  destacado = false,
}: {
  icono: typeof Users;
  titulo: string;
  valor: string;
  nota?: string;
  destacado?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 shadow-sm ${
        destacado ? "border-transparent bg-gradient-to-br from-indigo-600 to-violet-600 text-white" : "border-slate-200 bg-white"
      }`}
    >
      <div className={`flex items-center gap-2 text-xs font-medium ${destacado ? "text-indigo-100" : "text-slate-500"}`}>
        <Icono className="h-4 w-4" />
        {titulo}
      </div>
      <p className={`mt-1 truncate text-xl font-bold sm:text-2xl ${destacado ? "" : "text-slate-900"}`}>{valor}</p>
      {nota && <p className={`truncate text-xs ${destacado ? "text-indigo-100" : "text-slate-400"}`}>{nota}</p>}
    </div>
  );
}

function BotonMapa({ titulo, onClick, children }: { titulo: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={titulo}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white/90 text-slate-600 shadow-sm backdrop-blur transition hover:bg-white hover:text-indigo-600"
    >
      {children}
    </button>
  );
}

function DetalleZona({ zona, maximo, pct, onCerrar }: { zona: ZonaConteo; maximo: number; pct: string; onCerrar: () => void }) {
  const mayorCiudad = Math.max(1, ...zona.ciudades.map((c) => c.clientes));
  return (
    <div>
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-indigo-500">Estado</p>
          <h2 className="truncate text-lg font-bold text-slate-900">{zona.nombre}</h2>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Volver a la lista"
          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 px-5 py-4">
        <div className="rounded-2xl bg-indigo-50 p-3">
          <p className="text-xs text-indigo-600">Clientes</p>
          <p className="text-2xl font-bold text-indigo-900">{numero(zona.clientes)}</p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Del país</p>
          <p className="text-2xl font-bold text-slate-900">{pct}</p>
        </div>
        <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full" style={{ width: `${(zona.clientes / maximo) * 100}%`, background: DEGRADADO }} />
        </div>
      </div>
      <div className="px-5 pb-5">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Ciudades</h3>
        {zona.ciudades.length === 0 ? (
          <p className="text-sm text-slate-400">{zona.clientes > 0 ? "Los clientes de este estado no tienen ciudad en Odoo." : "No hay clientes en este estado."}</p>
        ) : (
          <ul className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
            {zona.ciudades.map((c) => (
              <li key={c.nombre}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-slate-700">{c.nombre}</span>
                  <span className="font-semibold tabular-nums text-slate-900">{numero(c.clientes)}</span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-indigo-400" style={{ width: `${(c.clientes / mayorCiudad) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
        {(zona.otras_ciudades > 0 || zona.sin_ciudad > 0) && (
          <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-500">
            {zona.otras_ciudades > 0 && (
              <p className="flex justify-between">
                <span>Otras ciudades</span>
                <span className="tabular-nums">{numero(zona.otras_ciudades)}</span>
              </p>
            )}
            {zona.sin_ciudad > 0 && (
              <p className="flex justify-between">
                <span>Sin ciudad en Odoo</span>
                <span className="tabular-nums">{numero(zona.sin_ciudad)}</span>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
