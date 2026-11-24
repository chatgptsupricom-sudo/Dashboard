/**
 * Cómo se lee lo que manda el agente en streaming (lib/agenteia/agente.ts):
 * texto con marcas [[paso:…]] (herramientas) y [[avance:…]] (estado). Lo usan
 * la pantalla mientras llega la respuesta y el servidor para armar la que se
 * guarda cuando se cortó la conexión (lib/agenteia/enCurso.ts). Sin nada de
 * Node ni del navegador: corre en los dos lados.
 */

// Herramientas que va usando el agente: el backend intercala
// [[paso:<json base64url>]] con { id, fase: inicio|detalle|fin, nombre, detalle, ok }.
export interface Paso {
  id: string;
  nombre: string;
  detalle?: string;
  estado: "corriendo" | "ok" | "error";
  inicio: number;
  fin?: number;
}
export const MARCA_PASO = /\[\[paso:([A-Za-z0-9_-]+)\]\]/g;
export function leerPaso(b64: string): any {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(b64.replace(/-/g, "+").replace(/_/g, "/")))));
  } catch {
    return null;
  }
}

// Mientras trabaja, el backend intercala [[avance:texto]] en la respuesta: no
// es parte del mensaje, es el estado que se muestra debajo ("Consultando…").
export const MARCA_AVANCE = /\[\[avance:([^\]\n]*)\]\]/g;

/**
 * Anota en `pasos` las marcas de herramientas de `crudo` a partir de la
 * número `leidos` (las anteriores ya se leyeron), con la hora `ahora`.
 * Devuelve cuántas marcas hay en total, para la próxima llamada.
 */
export function aplicarPasos(crudo: string, pasos: Map<string, Paso>, leidos: number, ahora = Date.now()): number {
  const marcas = [...crudo.matchAll(MARCA_PASO)];
  for (const m of marcas.slice(leidos)) {
    const e = leerPaso(m[1]);
    if (!e?.id) continue;
    const actual: Paso = pasos.get(e.id) || { id: e.id, nombre: e.nombre || "Herramienta", estado: "corriendo", inicio: ahora };
    if (e.nombre) actual.nombre = e.nombre;
    if (e.detalle) actual.detalle = e.detalle;
    if (e.fase === "fin") {
      actual.estado = e.ok === false ? "error" : "ok";
      actual.fin = ahora;
    }
    pasos.set(e.id, actual);
  }
  return marcas.length;
}

/**
 * La respuesta es lo que viene después de la última consulta. Lo que el
 * agente escribió antes (entre consulta y consulta) es su proceso: va aparte
 * y se muestra plegado. `avance` es el estado mientras no hay respuesta.
 * Con `final` en false, una marca que llegó a medias no se muestra.
 */
export function partirRespuesta(crudo: string, final: boolean): { contenido: string; proceso: string; avance: string } {
  const sinPasos = crudo.replace(MARCA_PASO, "").replace(MARCA_EQUIPO, "");
  const marcas = [...sinPasos.matchAll(MARCA_AVANCE)];
  const ultima = marcas[marcas.length - 1];
  const corte = ultima ? ultima.index! + ultima[0].length : 0;
  const proceso = sinPasos.slice(0, corte).replace(MARCA_AVANCE, "\n\n").replace(/\n{3,}/g, "\n\n").trim();
  let contenido = sinPasos.slice(corte).trimStart();
  if (!final) contenido = contenido.replace(/\[\[[^\]]*$/, "");
  return { contenido, proceso, avance: ultima && contenido.trim() === "" ? ultima[1] : "" };
}

// ── Equipo de Supri (lib/agenteia/equipo.ts) ─────────────────────────────────
// El coordinador (Supri) reparte tareas a especialistas. El backend intercala
// [[equipo:<json base64url>]] con lo que hace cada uno en ese momento
// ({ ag, estado?, est?, txt?, consulta? }) o con una entrega entre dos de
// ellos ({ de, a, txt }). La pantalla lo dibuja en la oficina del panel
// lateral (lib/agenteia/oficina.ts); no es texto de la respuesta.

export type IdAgente = "sup" | "inv" | "com" | "ven" | "fin";
export type Estacion = "odoo" | "archivos" | "internet" | "escritorio" | "caja" | "mesa";

/** Quiénes son, para la pantalla y el servidor: nombre, qué hacen y su camisa (clara, oscura). */
export const AGENTES: { id: IdAgente; nombre: string; rol: string; camisa: [string, string] }[] = [
  { id: "sup", nombre: "Supri", rol: "Coordinador", camisa: ["#2f6db5", "#1f4f8a"] },
  { id: "inv", nombre: "Inventario", rol: "Existencias y quiebres", camisa: ["#2f8fd8", "#1f6aa8"] },
  { id: "com", nombre: "Compras", rol: "Cuánto reponer", camisa: ["#d8473f", "#a8302a"] },
  { id: "ven", nombre: "Ventas", rol: "Clientes y pedidos", camisa: ["#2fa564", "#1f7a49"] },
  { id: "fin", nombre: "Finanzas", rol: "Caja, pagos y crédito", camisa: ["#8a63d2", "#6444a8"] },
];

export interface EstadoAgente {
  estado: "esperando" | "trabajando" | "listo";
  est: Estacion;
  txt: string;
  consultas: number;
}
export interface EntregaEquipo {
  de: IdAgente;
  a: IdAgente;
  txt: string;
}
export interface EstadoEquipo {
  agentes: Partial<Record<IdAgente, EstadoAgente>>;
  entregas: EntregaEquipo[];
  /** true si trabajó algún especialista (no solo Supri). */
  usado: boolean;
}

export const MARCA_EQUIPO = /\[\[equipo:([A-Za-z0-9_-]+)\]\]/g;
export const equipoVacio = (): EstadoEquipo => ({ agentes: {}, entregas: [], usado: false });
const ES_AGENTE = (v: unknown): v is IdAgente => AGENTES.some((a) => a.id === v);
const ESTACIONES: Estacion[] = ["odoo", "archivos", "internet", "escritorio", "caja", "mesa"];

/** Aplica a `eq` las marcas del equipo desde la número `leidos`; devuelve cuántas hay. */
export function aplicarEquipo(crudo: string, eq: EstadoEquipo, leidos: number): number {
  const marcas = [...crudo.matchAll(MARCA_EQUIPO)];
  for (const m of marcas.slice(leidos)) {
    const e = leerPaso(m[1]);
    if (!e) continue;
    if (ES_AGENTE(e.de) && ES_AGENTE(e.a) && typeof e.txt === "string") {
      eq.entregas.push({ de: e.de, a: e.a, txt: e.txt });
      continue;
    }
    const ag: unknown = e.ag;
    if (!ES_AGENTE(ag)) continue;
    const antes: EstadoAgente = eq.agentes[ag] ?? { estado: "esperando", est: "mesa", txt: "", consultas: 0 };
    eq.agentes[ag] = {
      estado: e.estado === "listo" || e.estado === "esperando" ? e.estado : "trabajando",
      est: ESTACIONES.includes(e.est) ? e.est : antes.est,
      txt: typeof e.txt === "string" ? e.txt : antes.txt,
      consultas: antes.consultas + (e.consulta ? 1 : 0),
    };
    if (ag !== "sup") eq.usado = true;
  }
  return marcas.length;
}
