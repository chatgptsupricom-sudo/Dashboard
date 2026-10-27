"use client";

import { hayGoogle } from "@/lib/rutagrama/google";
import dynamic from "next/dynamic";
import { useState } from "react";
import type { PropsMapa } from "./Mapa";

const cargando = (alto?: number) => <div style={{ height: alto ?? 380 }} className="animate-pulse rounded-xl bg-black/5" />;

const Mapa = dynamic(() => import("./Mapa").then((m) => m.Mapa), { ssr: false, loading: () => cargando() });
const MapaGoogle = dynamic(() => import("./MapaGoogle").then((m) => m.MapaGoogle), { ssr: false, loading: () => cargando() });

/**
 * El croquis del rutagrama: Google Maps si hay key (lib/rutagrama/google.ts),
 * si no (o si Google no carga) el de OpenStreetMap.
 */
export function MapaRuta(props: PropsMapa) {
  const [google, setGoogle] = useState(hayGoogle);
  return google ? <MapaGoogle {...props} onFalla={() => setGoogle(false)} /> : <Mapa {...props} />;
}
