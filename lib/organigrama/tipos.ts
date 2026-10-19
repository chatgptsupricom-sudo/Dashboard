// Tipos y reglas del Organigrama que usan tanto la API como la pantalla
// (archivo aparte de datos.ts, que usa MySQL).

/** direccion = la cabeza (recuadro oscuro); area = jefatura o subárea; cargo = puesto. */
export type TipoNodo = "direccion" | "area" | "cargo";
/** Cómo se dibujan los subordinados: en fila (uno al lado del otro) o en columna. */
export type Disposicion = "fila" | "columna";

export type Actividad = {
  id: string;
  texto: string;
  detalle: string;
};

/** Organigramas que hay: cada uno es un árbol aparte (pestañas de la pantalla). */
export const ORGANIGRAMAS = {
  actual: "Organigrama actual",
  propuesto: "Organigrama propuesto",
} as const;
export type Organigrama = keyof typeof ORGANIGRAMAS;
export const organigramaDe = (v: unknown): Organigrama =>
  typeof v === "string" && v in ORGANIGRAMAS ? (v as Organigrama) : "actual";

export type Nodo = {
  id: number;
  organigrama: Organigrama;
  parentId: number | null;
  orden: number;
  tipo: TipoNodo;
  /** Staff: asesor del superior, se dibuja a su lado y no debajo. */
  staff: boolean;
  disposicion: Disposicion;
  area: string;
  cargo: string;
  nota: string;
  personas: string[];
  proposito: string;
  actividades: Actividad[];
  updatedBy: string | null;
  updatedAt: string | null;
};

/** Quién entra al Organigrama: SuperAdmin y el rol Procesos (los dos editan). */
export const ROLES_ORGANIGRAMA = ["superadmin", "procesos"];
export const puedeOrganigrama = (rol: unknown) =>
  ROLES_ORGANIGRAMA.includes(String(rol ?? "").toLowerCase().trim());

/** Hijos de cada nodo (null = raíces), ordenados. */
export function hijosPorPadre(nodos: Nodo[]): Map<number | null, Nodo[]> {
  const mapa = new Map<number | null, Nodo[]>();
  for (const n of nodos) {
    const k = n.parentId;
    mapa.set(k, [...(mapa.get(k) || []), n]);
  }
  for (const lista of mapa.values()) lista.sort((a, b) => a.orden - b.orden || a.id - b.id);
  return mapa;
}

/** El nodo y todos los que cuelgan de él (para no dejar mover un cargo debajo de sí mismo). */
export function descendientes(nodos: Nodo[], id: number): Set<number> {
  const hijos = hijosPorPadre(nodos);
  const fuera = new Set<number>([id]);
  const pila = [id];
  while (pila.length) {
    for (const h of hijos.get(pila.pop()!) || []) {
      if (!fuera.has(h.id)) {
        fuera.add(h.id);
        pila.push(h.id);
      }
    }
  }
  return fuera;
}

/** Ruta de superiores, de la cabeza al nodo (para el encabezado del panel). */
export function cadenaDeMando(nodos: Nodo[], id: number): Nodo[] {
  const porId = new Map(nodos.map((n) => [n.id, n]));
  const ruta: Nodo[] = [];
  let actual = porId.get(id);
  const vistos = new Set<number>();
  while (actual && !vistos.has(actual.id)) {
    vistos.add(actual.id);
    ruta.unshift(actual);
    actual = actual.parentId != null ? porId.get(actual.parentId) : undefined;
  }
  return ruta;
}
