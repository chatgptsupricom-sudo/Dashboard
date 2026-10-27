"use client";

import { MAX_PUNTOS, conVehiculo, type Punto, type Tramo } from "@/lib/rutagrama/tipos";

/**
 * Google Maps para el rutagrama (solo en el navegador). Con
 * NEXT_PUBLIC_GOOGLE_MAPS_API_KEY el mapa es de Google y la ruta sale sola:
 * el trabajador busca su dirección (Places API (New), PlaceAutocompleteElement)
 * y la ruta casa–trabajo la calcula Google (Routes API, clase Route). Sin la
 * key queda el mapa de OpenStreetMap con la ruta tocada a mano.
 *
 * La key va al navegador: en Google Cloud se restringe por sitio web (los
 * dominios del panel) y a esas APIs (Maps JavaScript, Places API (New),
 * Routes). NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID es el Map ID de los marcadores
 * (sin él, DEMO_MAP_ID).
 */

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
export const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID";
export const hayGoogle = KEY.length > 0;

let carga: Promise<any> | null = null;

// Una key mala (o sin la API de Maps habilitada) no falla al cargar: Google
// llama a window.gm_authFailure. Quien muestre un mapa se anota aquí para
// cambiar al de OpenStreetMap.
let fallo = false;
const alFallar = new Set<() => void>();
export function siGoogleFalla(cb: () => void): () => void {
  if (fallo) cb();
  alFallar.add(cb);
  return () => {
    alFallar.delete(cb);
  };
}

/** Carga la API de Maps una sola vez; devuelve `google.maps`. */
export function cargarGoogle(): Promise<any> {
  if (!hayGoogle) return Promise.reject(new Error("Sin key de Google Maps"));
  const w = window as any;
  if (w.google?.maps?.importLibrary) return Promise.resolve(w.google.maps);
  if (!carga) {
    carga = new Promise((resolve, reject) => {
      w.__rutagramaGoogle = () => resolve(w.google.maps);
      w.gm_authFailure = () => {
        fallo = true;
        alFallar.forEach((cb) => cb());
      };
      const s = document.createElement("script");
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(KEY)}&v=weekly&loading=async&language=es&region=VE&callback=__rutagramaGoogle`;
      s.async = true;
      s.onerror = () => {
        carga = null;
        reject(new Error("No cargó Google Maps"));
      };
      document.head.appendChild(s);
    });
  }
  return carga;
}

/* ------------------------------------------------------------------ rutas */

export type ModoGoogle = "WALKING" | "TRANSIT" | "DRIVING" | "TWO_WHEELER" | "BICYCLING";

export const NOMBRE_MODO: Record<ModoGoogle, string> = {
  WALKING: "a pie",
  TRANSIT: "en transporte público",
  DRIVING: "en vehículo",
  TWO_WHEELER: "en moto",
  BICYCLING: "en bicicleta",
};

/**
 * El modo para Google según los tramos que declaró: si toma transporte
 * colectivo, transporte público; si solo camina, a pie; si va en moto o
 * bicicleta propia, eso; cualquier otro vehículo (de la empresa, taxi), carro.
 */
export function modoDeTramos(tramos: Tramo[]): ModoGoogle {
  const medios = tramos.map((t) => t.medio);
  if (medios.includes("colectivo")) return "TRANSIT";
  if (medios.every((m) => m === "caminando")) return "WALKING";
  const vehiculos = tramos.filter((t) => conVehiculo(t.medio)).map((t) => t.vehiculo);
  if (vehiculos.length && vehiculos.every((v) => v === "motocicleta")) return "TWO_WHEELER";
  if (vehiculos.length && vehiculos.every((v) => v === "bicicleta")) return "BICYCLING";
  return "DRIVING";
}

/** Si Google no tiene ruta en un modo (en Venezuela casi no hay datos de transporte público), se prueba el siguiente. */
const RESPALDO: Record<ModoGoogle, ModoGoogle[]> = {
  TRANSIT: ["TRANSIT", "DRIVING"],
  TWO_WHEELER: ["TWO_WHEELER", "DRIVING"],
  BICYCLING: ["BICYCLING", "DRIVING"],
  WALKING: ["WALKING", "DRIVING"],
  DRIVING: ["DRIVING"],
};

export type RutaGoogle = { puntos: Punto[]; minutos: number; km: number; modo: ModoGoogle };

/** Rutas posibles de `origen` a `destino` (con alternativas), en el primer modo que Google resuelva. */
export async function calcularRutas(origen: Punto, destino: Punto, modo: ModoGoogle): Promise<RutaGoogle[]> {
  const maps = await cargarGoogle();
  const { Route } = await maps.importLibrary("routes");
  for (const m of RESPALDO[modo]) {
    try {
      const { routes } = await Route.computeRoutes({
        origin: { lat: origen[0], lng: origen[1] },
        destination: { lat: destino[0], lng: destino[1] },
        travelMode: m,
        computeAlternativeRoutes: m !== "TRANSIT",
        language: "es",
        region: "VE",
        fields: ["path", "durationMillis", "distanceMeters"],
      });
      const rutas: RutaGoogle[] = (routes ?? []).flatMap((r: any) => {
        const puntos: Punto[] = (r.path ?? []).map((p: any) => [redondear(leer(p, "lat")), redondear(leer(p, "lng"))]);
        if (puntos.length < 2) return [];
        return [{ puntos: simplificar(puntos, MAX_PUNTOS - 20), minutos: Math.round((r.durationMillis ?? 0) / 60000), km: Math.round((r.distanceMeters ?? 0) / 100) / 10, modo: m }];
      });
      if (rutas.length) return rutas;
    } catch {
      // Sin ruta en este modo: se prueba el siguiente.
    }
  }
  return [];
}

const leer = (p: any, k: "lat" | "lng") => (typeof p[k] === "function" ? p[k]() : Number(p[k]));
const redondear = (n: number) => Math.round(n * 1e6) / 1e6;

/** Ramer–Douglas–Peucker hasta que quepa en `max` puntos (la ruta de Google trae cientos). */
export function simplificar(puntos: Punto[], max: number): Punto[] {
  if (puntos.length <= max) return puntos;
  let tolerancia = 0.00002;
  let r = puntos;
  while (r.length > max && tolerancia < 1) {
    r = rdp(puntos, tolerancia);
    tolerancia *= 2;
  }
  return r;
}

function rdp(p: Punto[], tol: number): Punto[] {
  if (p.length < 3) return p;
  const [a, b] = [p[0], p[p.length - 1]];
  let maxD = 0;
  let idx = 0;
  for (let i = 1; i < p.length - 1; i++) {
    const d = distanciaSegmento(p[i], a, b);
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD <= tol) return [a, b];
  return [...rdp(p.slice(0, idx + 1), tol).slice(0, -1), ...rdp(p.slice(idx), tol)];
}

function distanciaSegmento(p: Punto, a: Punto, b: Punto) {
  const [x, y] = p;
  const [x1, y1] = a;
  const [x2, y2] = b;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / l)) : 0;
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

/** Sin el primer y último punto: en el rutagrama la ruta va entre la casa y el trabajo, que se guardan aparte. */
export const tramoIntermedio = (puntos: Punto[]) => puntos.slice(1, -1);
