/**
 * Rutagrama de los nuevos ingresos (RRHH, /recursos_humanos/rutagrama).
 *
 * La LOPCYMAT (art. 69, num. 3) cuenta como accidente de trabajo el que pasa
 * en el trayecto habitual entre la casa y el trabajo, siempre que haya
 * "concordancia cronológica y topográfica en el recorrido". Por eso cada
 * trabajador declara bajo juramento cómo va y cómo vuelve, con un croquis.
 * Antes era una planilla de papel; ahora RRHH le manda un enlace personal
 * (/mi-ruta/<token>) y el trabajador la llena en el teléfono: los tramos del
 * camino, la ruta trazada en un mapa y su firma. RRHH la imprime en el formato
 * de siempre (lib/rutagrama/planilla.ts) para estampar las huellas.
 *
 * Todo lo de aquí es puro: lo usan la API, la página pública y la de RRHH.
 */

export const ROLES_RUTAGRAMA = ["recursos humanos"];

export const SEDES_RUTAGRAMA: Record<number, { nombre: string; ciudad: string }> = {
  9: { nombre: "Valencia", ciudad: "Valencia" },
  10: { nombre: "Caracas", ciudad: "Caracas" },
  7: { nombre: "Panamá", ciudad: "Panamá" },
};

/** Lunes a domingo, con la letra de la planilla (miércoles = X para no repetir la M). */
export const DIAS = [
  { id: "L", letra: "L", nombre: "Lunes" },
  { id: "M", letra: "M", nombre: "Martes" },
  { id: "X", letra: "M", nombre: "Miércoles" },
  { id: "J", letra: "J", nombre: "Jueves" },
  { id: "V", letra: "V", nombre: "Viernes" },
  { id: "S", letra: "S", nombre: "Sábado" },
  { id: "D", letra: "D", nombre: "Domingo" },
] as const;
export type DiaId = (typeof DIAS)[number]["id"];

/** Los dos turnos de la planilla; cualquier otro se escribe. */
export const TURNOS = ["8:00 a. m. a 4:30 p. m.", "7:00 a. m. a 7:00 p. m."];

export const MEDIOS = {
  caminando: "Caminando",
  colectivo: "Transporte colectivo",
  empresa: "Transporte de la empresa",
  propio: "Vehículo propio",
  otra_persona: "Vehículo de otra persona",
  taxi: "Taxi o mototaxi",
} as const;
export type Medio = keyof typeof MEDIOS;

export const AYUDA_MEDIO: Record<Medio, string> = {
  caminando: "A pie",
  colectivo: "Autobús, buseta, metro",
  empresa: "Unidad de Supricom",
  propio: "Carro, moto o bicicleta suya",
  otra_persona: "Lo lleva alguien más",
  taxi: "Taxi, mototaxi o app",
};

export const VEHICULOS = { bicicleta: "Bicicleta", motocicleta: "Motocicleta", automovil: "Automóvil", camioneta: "Camioneta" } as const;
export type TipoVehiculo = keyof typeof VEHICULOS;

export const conVehiculo = (m: Medio) => m === "propio" || m === "otra_persona";

export type Tramo = { medio: Medio; desde: string; hasta: string; vehiculo?: TipoVehiculo; maneja?: boolean };

export type Punto = [number, number];
export type Mapa = { casa: Punto | null; trabajo: Punto | null; ida: Punto[]; vuelta: Punto[] };

export type DatosRutagrama = {
  nombre: string;
  cedula: string;
  direccion: string;
  cargo: string;
  turno: string;
  dias: DiaId[];
  ida: Tramo[];
  referencias_ida: string;
  /** El regreso es el mismo camino al revés. */
  vuelta_igual: boolean;
  vuelta: Tramo[];
  referencias_vuelta: string;
  tiempo_min: number | null;
  mapa: Mapa;
};

export type Estado = "pendiente" | "completado";

/** Lo que ve RRHH en la lista. */
export type ResumenRutagrama = {
  id: number;
  /** La llave del enlace /mi-ruta/<token>: solo la ve RRHH. */
  token: string;
  sede: number;
  estado: Estado;
  nombre: string;
  cedula: string;
  cargo: string;
  enviado_at: string | null;
  envios: number;
  created_by: string | null;
  created_at: string | null;
};

export type Rutagrama = ResumenRutagrama &
  DatosRutagrama & {
    firma: string | null;
    versiones: { id: number; enviado_at: string | null }[];
  };

export const MAX_TRAMOS = 12;
export const MAX_PUNTOS = 400;
/** Una firma a mano en PNG pesa pocas decenas de KB; esto deja margen. */
export const MAX_FIRMA = 400_000;

/* ----------------------------------------------------------------- vacío */

export const mapaVacio = (): Mapa => ({ casa: null, trabajo: null, ida: [], vuelta: [] });

export const datosVacios = (): DatosRutagrama => ({
  nombre: "",
  cedula: "",
  direccion: "",
  cargo: "",
  turno: TURNOS[0],
  dias: ["L", "M", "X", "J", "V"],
  ida: [{ medio: "caminando", desde: "", hasta: "" }],
  referencias_ida: "",
  vuelta_igual: true,
  vuelta: [],
  referencias_vuelta: "",
  tiempo_min: null,
  mapa: mapaVacio(),
});

/** El regreso por el mismo camino: los tramos al revés, con desde y hasta cambiados. */
export function invertirTramos(tramos: Tramo[]): Tramo[] {
  return [...tramos].reverse().map((t) => ({ ...t, desde: t.hasta, hasta: t.desde }));
}

export const tramosVuelta = (d: Pick<DatosRutagrama, "vuelta_igual" | "ida" | "vuelta">) =>
  d.vuelta_igual ? invertirTramos(d.ida) : d.vuelta;

export const rutaVuelta = (d: Pick<DatosRutagrama, "vuelta_igual" | "mapa">) =>
  d.vuelta_igual ? [...d.mapa.ida].reverse() : d.mapa.vuelta;

/* ------------------------------------------------------------- validación */

const texto = (v: unknown, max: number) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);

function punto(v: unknown): Punto | null {
  if (!Array.isArray(v) || v.length !== 2) return null;
  const [lat, lng] = v.map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return [Math.round(lat * 1e6) / 1e6, Math.round(lng * 1e6) / 1e6];
}

function puntos(v: unknown): Punto[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, MAX_PUNTOS).flatMap((p) => {
    const x = punto(p);
    return x ? [x] : [];
  });
}

function tramos(v: unknown): Tramo[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, MAX_TRAMOS).flatMap((t: any): Tramo[] => {
    const medio = t?.medio as Medio;
    if (!(medio in MEDIOS)) return [];
    const tramo: Tramo = { medio, desde: texto(t?.desde, 160), hasta: texto(t?.hasta, 160) };
    if (conVehiculo(medio)) {
      if (t?.vehiculo in VEHICULOS) tramo.vehiculo = t.vehiculo;
      tramo.maneja = Boolean(t?.maneja);
    }
    return [tramo];
  });
}

/** Lo que manda la página pública, limpio. No valida que esté completo: eso es `faltantes`. */
export function limpiarDatos(b: any): DatosRutagrama {
  const dias = Array.isArray(b?.dias) ? DIAS.map((d) => d.id).filter((id) => b.dias.includes(id)) : [];
  const tiempo = Number(b?.tiempo_min);
  return {
    nombre: texto(b?.nombre, 160),
    cedula: texto(b?.cedula, 20).replace(/[^0-9VEPJvepj.-]/g, ""),
    direccion: texto(b?.direccion, 400),
    cargo: texto(b?.cargo, 120),
    turno: texto(b?.turno, 60),
    dias,
    ida: tramos(b?.ida),
    referencias_ida: texto(b?.referencias_ida, 400),
    vuelta_igual: b?.vuelta_igual !== false,
    vuelta: b?.vuelta_igual === false ? tramos(b?.vuelta) : [],
    referencias_vuelta: texto(b?.referencias_vuelta, 400),
    tiempo_min: Number.isFinite(tiempo) && tiempo > 0 && tiempo <= 600 ? Math.round(tiempo) : null,
    mapa: {
      casa: punto(b?.mapa?.casa),
      trabajo: punto(b?.mapa?.trabajo),
      ida: puntos(b?.mapa?.ida),
      vuelta: b?.vuelta_igual === false ? puntos(b?.mapa?.vuelta) : [],
    },
  };
}

function faltaEnTramos(lista: Tramo[], cual: string): string | null {
  if (!lista.length) return `Agrega al menos un tramo ${cual}.`;
  for (const [i, t] of lista.entries()) {
    if (!t.desde || !t.hasta) return `Completa desde dónde y hasta dónde en el tramo ${i + 1} ${cual}.`;
    if (conVehiculo(t.medio) && !t.vehiculo) return `Indica el tipo de vehículo en el tramo ${i + 1} ${cual}.`;
  }
  return null;
}

/** Por paso de la página pública: el primer dato que falta, o null. */
export function faltantes(d: DatosRutagrama, paso: "datos" | "puesto" | "ida" | "vuelta" | "mapa"): string | null {
  switch (paso) {
    case "datos":
      if (d.nombre.length < 5) return "Escribe tus apellidos y nombres.";
      if (d.cedula.replace(/\D/g, "").length < 5) return "Escribe tu número de cédula.";
      if (d.direccion.length < 10) return "Escribe la dirección de tu vivienda, con punto de referencia si puedes.";
      return null;
    case "puesto":
      if (!d.cargo) return "Escribe el cargo que vas a ocupar.";
      if (!d.dias.length) return "Marca los días que trabajas.";
      if (!d.turno) return "Indica tu turno de trabajo.";
      return null;
    case "ida":
      if (!d.tiempo_min) return "Indica cuántos minutos tardas en llegar.";
      return faltaEnTramos(d.ida, "de ida");
    case "vuelta":
      return d.vuelta_igual ? null : faltaEnTramos(d.vuelta, "de regreso");
    case "mapa":
      if (!d.mapa.casa) return "Marca tu casa en el mapa.";
      if (!d.mapa.trabajo) return "Marca el sitio de trabajo en el mapa.";
      return null;
  }
}

export function faltanteEnvio(d: DatosRutagrama): string | null {
  for (const paso of ["datos", "puesto", "ida", "vuelta", "mapa"] as const) {
    const f = faltantes(d, paso);
    if (f) return f;
  }
  return null;
}

export const firmaValida = (f: unknown): f is string =>
  typeof f === "string" && f.startsWith("data:image/png;base64,") && f.length > 1000 && f.length <= MAX_FIRMA;

/* -------------------------------------------------------------- planilla */

export type Fila = { si: boolean; texto: string };
export type SeccionTraslado = {
  caminando: Fila;
  colectivo: Fila;
  caminarTrasColectivo: Fila;
  empresa: Fila;
  caminarTrasEmpresa: Fila;
  vehiculo: {
    propio: boolean;
    otraPersona: boolean;
    taxi: boolean;
    maneja: boolean | null;
    tipos: TipoVehiculo[];
    caminarTras: Fila;
  };
};

const tramoTexto = (t: Tramo) => `${t.desde} hasta ${t.hasta}`;
const fila = (ts: Tramo[]): Fila => ({ si: ts.length > 0, texto: ts.map(tramoTexto).join("; ") });

/**
 * Los tramos en las casillas de la planilla de papel: cada medio en su fila y
 * la caminata que sigue a un transporte en su "Al bajarse… debe caminar".
 */
export function seccionTraslado(lista: Tramo[]): SeccionTraslado {
  const caminando: Tramo[] = [];
  const trasColectivo: Tramo[] = [];
  const trasEmpresa: Tramo[] = [];
  const trasVehiculo: Tramo[] = [];
  lista.forEach((t, i) => {
    if (t.medio !== "caminando") return;
    const antes = lista[i - 1]?.medio;
    if (antes === "colectivo") trasColectivo.push(t);
    else if (antes === "empresa") trasEmpresa.push(t);
    else if (antes && antes !== "caminando") trasVehiculo.push(t);
    else caminando.push(t);
  });
  const vehiculos = lista.filter((t) => conVehiculo(t.medio));
  const conManejo = vehiculos.filter((t) => t.maneja !== undefined);
  return {
    caminando: fila(caminando),
    colectivo: fila(lista.filter((t) => t.medio === "colectivo")),
    caminarTrasColectivo: fila(trasColectivo),
    empresa: fila(lista.filter((t) => t.medio === "empresa")),
    caminarTrasEmpresa: fila(trasEmpresa),
    vehiculo: {
      propio: lista.some((t) => t.medio === "propio"),
      otraPersona: lista.some((t) => t.medio === "otra_persona"),
      taxi: lista.some((t) => t.medio === "taxi"),
      maneja: conManejo.length ? conManejo.some((t) => t.maneja) : null,
      tipos: [...new Set(vehiculos.flatMap((t) => (t.vehiculo ? [t.vehiculo] : [])))],
      caminarTras: fila(trasVehiculo),
    },
  };
}

export const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** "26 de octubre de 2026" a partir de un ISO (hora de Caracas). */
export function fechaLarga(iso: string | null): { dia: string; mes: string; anio: string } {
  const f = iso ? new Date(iso) : new Date();
  const [a, m, d] = f.toLocaleDateString("en-CA", { timeZone: "America/Caracas" }).split("-");
  return { dia: String(Number(d)), mes: MESES[Number(m) - 1], anio: a };
}

export const describirTramo = (t: Tramo) => {
  const extra = conVehiculo(t.medio) && t.vehiculo ? ` (${VEHICULOS[t.vehiculo].toLowerCase()}${t.maneja ? ", lo maneja" : ""})` : "";
  return `${MEDIOS[t.medio]}${extra}: ${t.desde || "…"} → ${t.hasta || "…"}`;
};
