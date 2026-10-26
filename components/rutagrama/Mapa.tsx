"use client";

import type { Mapa as MapaRuta, Punto } from "@/lib/rutagrama/tipos";
import type * as Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";

/**
 * El croquis del rutagrama sobre OpenStreetMap (Leaflet, sin React-Leaflet).
 * `modo` dice qué hace un toque en el mapa: poner la casa, el trabajo o el
 * siguiente punto de la ruta de ida o de regreso. Sin `onChange` es solo
 * para mirar (la vista de RRHH).
 */

export type ModoMapa = "casa" | "trabajo" | "ida" | "vuelta" | null;

export const CENTRO_SEDE: Record<number, Punto> = {
  9: [10.162, -68.0077],
  10: [10.4806, -66.9036],
  7: [8.9824, -79.5199],
};

export const COLOR_IDA = "#741dfe";
export const COLOR_VUELTA = "#0a9a8d";

const pin = (texto: string, color: string) =>
  `<div style="transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center">
     <span style="background:${color};color:#fff;font:700 12px/1 system-ui,sans-serif;padding:5px 8px;border-radius:999px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.35)">${texto}</span>
     <span style="width:2px;height:10px;background:${color}"></span>
     <span style="width:10px;height:10px;border-radius:50%;background:${color};border:2px solid #fff;margin-top:-2px"></span>
   </div>`;

export function Mapa({
  mapa,
  rutaVuelta,
  modo = null,
  onChange,
  centro,
  enfoque,
  alto = 380,
}: {
  mapa: MapaRuta;
  /** La ruta de regreso a dibujar (el mismo camino o la suya). */
  rutaVuelta?: Punto[] | null;
  modo?: ModoMapa;
  onChange?: (m: MapaRuta) => void;
  centro: Punto;
  /** Cambia `n` para mover el mapa a ese punto (búsqueda, "mi ubicación"). */
  enfoque?: { punto: Punto; zoom: number; n: number } | null;
  alto?: number;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<Leaflet.Map | null>(null);
  const capaRef = useRef<Leaflet.LayerGroup | null>(null);
  const LRef = useRef<typeof Leaflet | null>(null);
  const ultimo = useRef({ mapa, modo, onChange });
  ultimo.current = { mapa, modo, onChange };
  const ajustado = useRef(false);

  // Crear el mapa una vez (Leaflet usa window: se importa aquí adentro).
  useEffect(() => {
    let vivo = true;
    import("leaflet").then((mod) => {
      const L = (mod as any).default ?? mod;
      if (!vivo || !contenedor.current || mapaRef.current) return;
      LRef.current = L;
      const m = L.map(contenedor.current, { zoomControl: true, attributionControl: true }).setView(centro, 13);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(m);
      capaRef.current = L.layerGroup().addTo(m);
      m.on("click", (e: Leaflet.LeafletMouseEvent) => {
        const { mapa: actual, modo: md, onChange: cb } = ultimo.current;
        if (!cb || !md) return;
        const p: Punto = [Math.round(e.latlng.lat * 1e6) / 1e6, Math.round(e.latlng.lng * 1e6) / 1e6];
        if (md === "casa" || md === "trabajo") cb({ ...actual, [md]: p });
        else cb({ ...actual, [md]: [...actual[md], p] });
      });
      mapaRef.current = m;
      dibujar();
    });
    return () => {
      vivo = false;
      mapaRef.current?.remove();
      mapaRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dibujar = () => {
    const L = LRef.current;
    const m = mapaRef.current;
    const capa = capaRef.current;
    if (!L || !m || !capa) return;
    capa.clearLayers();
    const { casa, trabajo, ida } = mapa;
    const lineaIda = [casa, ...ida, trabajo].filter(Boolean) as Punto[];
    const vuelta = rutaVuelta ?? [];
    const lineaVuelta = vuelta.length ? ([trabajo, ...vuelta, casa].filter(Boolean) as Punto[]) : [];
    if (lineaVuelta.length > 1) {
      L.polyline(lineaVuelta, { color: COLOR_VUELTA, weight: 5, opacity: 0.85, dashArray: "8 8" }).addTo(capa);
    }
    if (lineaIda.length > 1) {
      L.polyline(lineaIda, { color: COLOR_IDA, weight: 6, opacity: 0.85 }).addTo(capa);
      ida.forEach((p) => L.circleMarker(p, { radius: 4, color: "#fff", weight: 2, fillColor: COLOR_IDA, fillOpacity: 1 }).addTo(capa));
    }
    const icono = (t: string, c: string) => L.divIcon({ html: pin(t, c), className: "", iconSize: [0, 0] });
    if (casa) L.marker(casa, { icon: icono("Casa", "#10101a"), keyboard: false }).addTo(capa);
    if (trabajo) L.marker(trabajo, { icon: icono("Trabajo", COLOR_IDA), keyboard: false }).addTo(capa);

    if (!ajustado.current) {
      const todos = [...lineaIda, ...lineaVuelta];
      if (todos.length > 1) m.fitBounds(L.latLngBounds(todos), { padding: [40, 40], maxZoom: 16 });
      else if (todos.length === 1) m.setView(todos[0], 15);
      ajustado.current = todos.length > 0;
    }
  };

  useEffect(dibujar, [mapa, rutaVuelta]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (enfoque && mapaRef.current) mapaRef.current.setView(enfoque.punto, enfoque.zoom);
  }, [enfoque?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (contenedor.current) contenedor.current.style.cursor = modo && onChange ? "crosshair" : "";
  }, [modo, onChange]);

  return <div ref={contenedor} style={{ height: alto }} className="z-0 w-full overflow-hidden rounded-xl border border-black/10" />;
}
