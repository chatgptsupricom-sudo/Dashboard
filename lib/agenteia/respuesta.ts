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
  const sinPasos = crudo.replace(MARCA_PASO, "");
  const marcas = [...sinPasos.matchAll(MARCA_AVANCE)];
  const ultima = marcas[marcas.length - 1];
  const corte = ultima ? ultima.index! + ultima[0].length : 0;
  const proceso = sinPasos.slice(0, corte).replace(MARCA_AVANCE, "\n\n").replace(/\n{3,}/g, "\n\n").trim();
  let contenido = sinPasos.slice(corte).trimStart();
  if (!final) contenido = contenido.replace(/\[\[[^\]]*$/, "");
  return { contenido, proceso, avance: ultima && contenido.trim() === "" ? ultima[1] : "" };
}
