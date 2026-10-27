"use client";

import { MAP_ID, cargarGoogle, siGoogleFalla } from "@/lib/rutagrama/google";
import type { Punto } from "@/lib/rutagrama/tipos";
import { useEffect, useRef } from "react";
import { COLOR_IDA, COLOR_VUELTA, type PropsMapa } from "./Mapa";

/**
 * El mismo croquis que `Mapa` pero sobre Google Maps (lib/rutagrama/google.ts):
 * mismas props, así la página elige uno u otro con `MapaRuta`. Si Google no
 * carga (key mala, API sin habilitar) avisa con `onFalla` y se usa el otro.
 */

const pin = (texto: string, color: string) => {
  const el = document.createElement("div");
  el.style.cssText = "display:flex;flex-direction:column;align-items:center;transform:translateY(4px)";
  el.innerHTML = `<span style="background:${color};color:#fff;font:700 12px/1 system-ui,sans-serif;padding:5px 8px;border-radius:999px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.35)">${texto}</span>
    <span style="width:2px;height:10px;background:${color}"></span>
    <span style="width:10px;height:10px;border-radius:50%;background:${color};border:2px solid #fff;margin-top:-2px"></span>`;
  return el;
};

const ll = (p: Punto) => ({ lat: p[0], lng: p[1] });

export function MapaGoogle({ mapa, rutaVuelta, modo = null, onChange, centro, enfoque, alto = 380, onFalla }: PropsMapa & { onFalla?: () => void }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const gm = useRef<any>(null);
  const mapaRef = useRef<any>(null);
  const capas = useRef<any[]>([]);
  const ultimo = useRef({ mapa, modo, onChange });
  ultimo.current = { mapa, modo, onChange };
  const ajustado = useRef(false);

  useEffect(() => siGoogleFalla(() => onFalla?.()), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let vivo = true;
    cargarGoogle()
      .then(async (maps) => {
        const { Map } = await maps.importLibrary("maps");
        const { AdvancedMarkerElement } = await maps.importLibrary("marker");
        if (!vivo || !contenedor.current) return;
        gm.current = { maps, AdvancedMarkerElement };
        const m = new Map(contenedor.current, {
          center: ll(centro),
          zoom: 13,
          mapId: MAP_ID,
          gestureHandling: "greedy",
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          clickableIcons: false,
        });
        m.addListener("click", (e: any) => {
          const { mapa: actual, modo: md, onChange: cb } = ultimo.current;
          if (!cb || !md || !e.latLng) return;
          const p: Punto = [Math.round(e.latLng.lat() * 1e6) / 1e6, Math.round(e.latLng.lng() * 1e6) / 1e6];
          if (md === "casa" || md === "trabajo") cb({ ...actual, [md]: p });
          else cb({ ...actual, [md]: [...actual[md], p] });
        });
        mapaRef.current = m;
        dibujar();
      })
      .catch(() => vivo && onFalla?.());
    return () => {
      vivo = false;
      capas.current.forEach((c) => (c.setMap ? c.setMap(null) : (c.map = null)));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dibujar = () => {
    const g = gm.current;
    const m = mapaRef.current;
    if (!g || !m) return;
    capas.current.forEach((c) => (c.setMap ? c.setMap(null) : (c.map = null)));
    capas.current = [];
    const { casa, trabajo, ida } = mapa;
    const lineaIda = [casa, ...ida, trabajo].filter(Boolean) as Punto[];
    const vuelta = rutaVuelta ?? [];
    const lineaVuelta = vuelta.length ? ([trabajo, ...vuelta, casa].filter(Boolean) as Punto[]) : [];
    if (lineaVuelta.length > 1) {
      capas.current.push(
        new g.maps.Polyline({
          map: m,
          path: lineaVuelta.map(ll),
          strokeOpacity: 0,
          icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 0.9, strokeColor: COLOR_VUELTA, scale: 3 }, offset: "0", repeat: "14px" }],
        }),
      );
    }
    if (lineaIda.length > 1) {
      capas.current.push(new g.maps.Polyline({ map: m, path: lineaIda.map(ll), strokeColor: COLOR_IDA, strokeOpacity: 0.85, strokeWeight: 6 }));
    }
    if (casa) capas.current.push(new g.AdvancedMarkerElement({ map: m, position: ll(casa), content: pin("Casa", "#10101a"), title: "Casa" }));
    if (trabajo) capas.current.push(new g.AdvancedMarkerElement({ map: m, position: ll(trabajo), content: pin("Trabajo", COLOR_IDA), title: "Trabajo" }));

    if (!ajustado.current) {
      const todos = [...lineaIda, ...lineaVuelta];
      if (todos.length > 1) {
        const b = new g.maps.LatLngBounds();
        todos.forEach((p) => b.extend(ll(p)));
        m.fitBounds(b, 40);
      } else if (todos.length === 1) {
        m.setCenter(ll(todos[0]));
        m.setZoom(15);
      }
      ajustado.current = todos.length > 0;
    }
  };

  useEffect(dibujar, [mapa, rutaVuelta]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mover el mapa a un punto (búsqueda, "mi ubicación") o encuadrar una ruta nueva.
  useEffect(() => {
    const g = gm.current;
    const m = mapaRef.current;
    if (!enfoque || !g || !m) return;
    if (enfoque.ruta && enfoque.ruta.length > 1) {
      const b = new g.maps.LatLngBounds();
      enfoque.ruta.forEach((p) => b.extend(ll(p)));
      m.fitBounds(b, 40);
    } else {
      m.setCenter(ll(enfoque.punto));
      m.setZoom(enfoque.zoom);
    }
  }, [enfoque?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={contenedor} style={{ height: alto }} className="z-0 w-full overflow-hidden rounded-xl border border-black/10" />;
}
