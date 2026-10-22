// Geometría del organigrama en el lienzo (sin React ni DOM): niveles, franjas,
// acomodo automático y líneas. La pantalla mide el alto de cada recuadro y le
// pasa esos altos; esto devuelve dónde va cada uno.
//
// Reglas:
// - El nivel sale de la jerarquía: la cabeza es el 0 y cada subordinado está un
//   nivel debajo de su jefe; el staff va en el nivel de su jefe, a su lado.
// - Cada nivel es una franja horizontal. Un recuadro se mueve libre a lo ancho,
//   y a lo alto dentro de su franja; en modo libre también fuera de ella (solo
//   cambia dónde se dibuja: el nivel en la jerarquía sale de a quién reporta).
// - Sin posición guardada, se acomoda solo (árbol centrado). Si su jefe se movió,
//   se corre con él.

import { hijosPorPadre, type Nodo } from "@/lib/organigrama/tipos";

export const ANCHO = 200;
const SEP_X = 28; // entre recuadros vecinos
const SEP_RAICES = 80; // entre organigramas sueltos (cargos sin superior)
const HOLGURA = 48; // lo que se puede bajar un recuadro dentro de su franja
const ENTRE_FRANJAS = 56; // espacio entre franjas, por donde pasan las líneas
const MARGEN = 32;

export type Caja = { id: number; x: number; y: number; w: number; h: number; nivel: number };
export type Franja = { nivel: number; top: number; alto: number };
export type Linea = { d: string; staff: boolean };
export type Lienzo = { cajas: Map<number, Caja>; franjas: Franja[]; lineas: Linea[]; ancho: number; alto: number };

/** Nivel de cada cargo: 0 la cabeza, +1 por jefe; el staff, el de su jefe. */
export function niveles(nodos: Nodo[]): Map<number, number> {
  const porId = new Map(nodos.map((n) => [n.id, n]));
  const nivel = new Map<number, number>();
  const de = (n: Nodo, vistos = new Set<number>()): number => {
    if (nivel.has(n.id)) return nivel.get(n.id)!;
    const padre = n.parentId != null ? porId.get(n.parentId) : undefined;
    if (!padre || vistos.has(n.id)) return nivel.set(n.id, 0).get(n.id)!;
    vistos.add(n.id);
    const v = de(padre, vistos) + (n.staff ? 0 : 1);
    nivel.set(n.id, v);
    return v;
  };
  nodos.forEach((n) => de(n));
  return nivel;
}

/** X de cada recuadro en el acomodo automático: cada jefe centrado sobre sus subordinados, su staff a la derecha. */
export function acomodoAutomatico(nodos: Nodo[]): Map<number, number> {
  const mapa = hijosPorPadre(nodos);
  const xs = new Map<number, number>();
  const anchos = new Map<number, number>();
  const partes = (n: Nodo) => {
    const todos = mapa.get(n.id) || [];
    return { hijos: todos.filter((h) => !h.staff), staff: todos.filter((h) => h.staff) };
  };
  const ancho = (n: Nodo): number => {
    if (anchos.has(n.id)) return anchos.get(n.id)!;
    const { hijos, staff } = partes(n);
    const deHijos = hijos.reduce((s, h) => s + ancho(h), 0) + SEP_X * Math.max(0, hijos.length - 1);
    const fila = ANCHO + staff.length * (ANCHO + SEP_X); // el jefe y su staff, uno al lado del otro
    const w = Math.max(fila, deHijos);
    anchos.set(n.id, w);
    return w;
  };
  const colocar = (n: Nodo, izquierda: number) => {
    const { hijos, staff } = partes(n);
    const w = ancho(n);
    const deHijos = hijos.reduce((s, h) => s + ancho(h), 0) + SEP_X * Math.max(0, hijos.length - 1);
    let x = izquierda + (w - deHijos) / 2;
    for (const h of hijos) {
      colocar(h, x);
      x += ancho(h) + SEP_X;
    }
    // El jefe va centrado sobre sus subordinados (o sobre su bloque si no tiene).
    const centro = hijos.length ? (xs.get(hijos[0].id)! + xs.get(hijos[hijos.length - 1].id)! + ANCHO) / 2 : izquierda + w / 2;
    const fila = ANCHO + staff.length * (ANCHO + SEP_X);
    const xJefe = Math.min(Math.max(izquierda, centro - ANCHO / 2), izquierda + w - fila);
    xs.set(n.id, xJefe);
    staff.forEach((s, i) => colocar(s, xJefe + (ANCHO + SEP_X) * (i + 1)));
  };
  let izquierda = MARGEN;
  for (const r of mapa.get(null) || []) {
    colocar(r, izquierda);
    izquierda += ancho(r) + SEP_RAICES;
  }
  return xs;
}

/**
 * Lienzo completo. `altos` = alto medido de cada recuadro (por defecto 64).
 * `mover` = posiciones que se están arrastrando ahora (todavía sin guardar).
 */
export function armarLienzo(
  nodos: Nodo[],
  altos: Map<number, number>,
  mover?: Map<number, { x: number; y: number }>,
): Lienzo {
  const nivel = niveles(nodos);
  const auto = acomodoAutomatico(nodos);
  const porId = new Map(nodos.map((n) => [n.id, n]));
  const alto = (id: number) => altos.get(id) ?? 64;

  // Franjas: cada nivel tan alto como su recuadro más alto, más la holgura.
  const maxNivel = Math.max(0, ...nivel.values());
  const franjas: Franja[] = [];
  let top = MARGEN;
  for (let v = 0; v <= maxNivel; v++) {
    const h = Math.max(64, ...nodos.filter((n) => nivel.get(n.id) === v).map((n) => alto(n.id)));
    franjas.push({ nivel: v, top, alto: h + HOLGURA });
    top += h + HOLGURA + ENTRE_FRANJAS;
  }

  // X: la guardada; si no, la automática corrida lo mismo que se corrió su jefe.
  const xFinal = new Map<number, number>();
  const xDe = (n: Nodo): number => {
    if (xFinal.has(n.id)) return xFinal.get(n.id)!;
    const arrastre = mover?.get(n.id);
    let x: number;
    if (arrastre) x = arrastre.x;
    else if (n.posX != null) x = n.posX;
    else {
      const padre = n.parentId != null ? porId.get(n.parentId) : undefined;
      const corrimiento = padre ? xDe(padre) - (auto.get(padre.id) ?? 0) : 0;
      x = (auto.get(n.id) ?? MARGEN) + corrimiento;
    }
    x = Math.max(0, x);
    xFinal.set(n.id, x);
    return x;
  };

  const cajas = new Map<number, Caja>();
  for (const n of nodos) {
    const v = nivel.get(n.id) ?? 0;
    const f = franjas[v];
    const h = alto(n.id);
    const yRel = mover?.get(n.id)?.y ?? n.posY ?? 0;
    // Fuera de [0, alto de la franja] es una posición del modo libre: se respeta (sin salir por arriba del lienzo).
    const y = f.top + Math.max(-f.top, yRel);
    cajas.set(n.id, { id: n.id, x: xDe(n), y, w: ANCHO, h, nivel: v });
  }

  // Líneas: del jefe a cada subordinado en ángulo recto, cruzando por el
  // espacio entre franjas; el staff, punteada desde el costado del jefe.
  const lineas: Linea[] = [];
  for (const n of nodos) {
    if (n.parentId == null) continue;
    const a = cajas.get(n.parentId);
    const b = cajas.get(n.id);
    if (!a || !b) continue;
    if (n.staff) {
      const derecha = b.x >= a.x;
      const x1 = derecha ? a.x + a.w : a.x;
      const x2 = derecha ? b.x : b.x + b.w;
      const y1 = a.y + a.h / 2;
      const y2 = b.y + b.h / 2;
      const medio = (x1 + x2) / 2;
      lineas.push({ d: `M${x1},${y1} H${medio} V${y2} H${x2}`, staff: true });
    } else {
      const x1 = a.x + a.w / 2;
      const y1 = a.y + a.h;
      const x2 = b.x + b.w / 2;
      const y2 = b.y;
      // Si alguno se movió fuera de su franja (modo libre), la línea quiebra a mitad de camino.
      const enSuFranja = (c: Caja) => c.y >= franjas[c.nivel].top && c.y + c.h <= franjas[c.nivel].top + franjas[c.nivel].alto;
      const bus =
        enSuFranja(a) && enSuFranja(b) && b.nivel > a.nivel ? franjas[b.nivel].top - ENTRE_FRANJAS / 2 : (y1 + y2) / 2;
      lineas.push({ d: `M${x1},${y1} V${bus} H${x2} V${y2}`, staff: false });
    }
  }

  const ancho = Math.max(0, ...[...cajas.values()].map((c) => c.x + c.w)) + MARGEN;
  const ultima = franjas[franjas.length - 1];
  const fondo = Math.max(ultima ? ultima.top + ultima.alto : 0, ...[...cajas.values()].map((c) => c.y + c.h));
  return { cajas, franjas, lineas, ancho, alto: cajas.size ? fondo + MARGEN : 0 };
}

/** Límite vertical de un recuadro dentro de su franja (para arrastrar). */
export function yRelativaMax(franja: Franja, h: number): number {
  return Math.max(0, franja.alto - h);
}
