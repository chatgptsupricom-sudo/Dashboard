// Tipos, geometría y ejemplo de los Flujogramas, compartidos por la API y la
// pantalla (archivo aparte de datos.ts, que usa MySQL).

/** terminal = inicio, fin o cierre (recuadro gris redondeado); decision = rombo. */
export type TipoPaso = "terminal" | "actividad" | "decision";

export type Paso = { id: string; tipo: TipoPaso; texto: string; x: number; y: number };
export type Conexion = { id: string; desde: string; hasta: string; etiqueta: string };

/** Encabezado y pie del formato "Diagrama de procesos". */
export type Meta = {
  codigo: string;
  version: string;
  fecha: string;
  elaboradoPor: string;
  elaboradoFecha: string;
  revisadoPor: string;
  revisadoFecha: string;
  aprobadoPor: string;
  aprobadoFecha: string;
};

export type Flujograma = {
  id: number;
  proceso: string;
  subproceso: string;
  meta: Meta;
  pasos: Paso[];
  conexiones: Conexion[];
  updatedBy: string | null;
  updatedAt: string | null;
};

export const META_VACIA: Meta = {
  codigo: "",
  version: "1.0",
  fecha: "",
  elaboradoPor: "",
  elaboradoFecha: "",
  revisadoPor: "",
  revisadoFecha: "",
  aprobadoPor: "",
  aprobadoFecha: "",
};

/** Quién entra a Flujogramas: los mismos del Organigrama (SuperAdmin y Procesos; los dos editan). */
export const ROLES_FLUJOGRAMAS = ["superadmin", "procesos"];
export const puedeFlujogramas = (rol: unknown) =>
  ROLES_FLUJOGRAMAS.includes(String(rol ?? "").toLowerCase().trim());

/** Ancho fijo de cada figura; el alto sale del texto (la pantalla lo mide). */
export const ANCHO: Record<TipoPaso, number> = { terminal: 190, actividad: 190, decision: 170 };
export const ALTO_MIN: Record<TipoPaso, number> = { terminal: 44, actividad: 64, decision: 96 };

type Rect = { x: number; y: number; w: number; h: number };

/**
 * Recorrido de una flecha en ángulo recto entre dos figuras. Si la de destino
 * está más hacia un lado que hacia abajo, sale por el costado; si está debajo,
 * por abajo; si está arriba (vuelta atrás), sale por la derecha y entra por la
 * derecha. Devuelve el path SVG y dónde poner la etiqueta (SI/NO).
 */
export function recorrido(a: Rect, b: Rect): { d: string; lx: number; ly: number } {
  const ax = a.x + a.w / 2;
  const ay = a.y + a.h / 2;
  const bx = b.x + b.w / 2;
  const by = b.y + b.h / 2;
  const abajo = b.y - (a.y + a.h);
  const derecha = b.x - (a.x + a.w);
  const izquierda = a.x - (b.x + b.w);
  const lado = Math.max(derecha, izquierda);

  if (lado > 0 && lado >= abajo) {
    const x1 = derecha > 0 ? a.x + a.w : a.x;
    const x2 = derecha > 0 ? b.x : b.x + b.w;
    const mx = (x1 + x2) / 2;
    return { d: `M${x1},${ay} H${mx} V${by} H${x2}`, lx: x1 + (derecha > 0 ? 8 : -26), ly: ay - 6 };
  }
  if (abajo > 0) {
    const y1 = a.y + a.h;
    const my = (y1 + b.y) / 2;
    return { d: `M${ax},${y1} V${my} H${bx} V${b.y}`, lx: ax + 6, ly: y1 + 14 };
  }
  // Destino arriba o encimado: rodea por la derecha.
  const x = Math.max(a.x + a.w, b.x + b.w) + 24;
  return { d: `M${a.x + a.w},${ay} H${x} V${by} H${b.x + b.w}`, lx: a.x + a.w + 6, ly: ay - 6 };
}

let contador = 0;
export const nuevoId = (prefijo: string) => `${prefijo}${Date.now().toString(36)}${(contador++).toString(36)}`;

/** Ejemplo: Recursos Humanos › Captación, reclutamiento y selección de personal (el diagrama en Word de RRHH). */
export function ejemploReclutamiento(): Pick<Flujograma, "proceso" | "subproceso" | "meta" | "pasos" | "conexiones"> {
  const A = 40;
  const B = 320;
  const C = 600;
  const pasos: Paso[] = [
    { id: "inicio", tipo: "terminal", texto: "INICIO", x: A, y: 20 },
    { id: "a1", tipo: "actividad", texto: "RECEPCIÓN DE REQUISICIÓN DE PERSONAL", x: A, y: 100 },
    { id: "a2", tipo: "actividad", texto: "DISEÑO DEL PERFIL DE CARGO Y ANUNCIO PARA PUBLICACIÓN", x: A, y: 210 },
    { id: "a3", tipo: "actividad", texto: "RECLUTAMIENTO: PUBLICACIÓN DE VACANTE Y ANUNCIOS EN PORTALES DE EMPLEO", x: A, y: 330 },
    { id: "a4", tipo: "actividad", texto: "FILTRADO DE SÍNTESIS CURRICULARES", x: A, y: 470 },
    { id: "a5", tipo: "actividad", texto: "PRE SELECCIÓN: SONDEOS TELEFÓNICOS", x: A, y: 580 },
    { id: "a6", tipo: "actividad", texto: "CONSTRUCCIÓN DE TERNA (3 CANDIDATOS)", x: A, y: 690 },
    { id: "a7", tipo: "actividad", texto: "ENTREVISTA PRESENCIAL/ONLINE CON RECURSOS HUMANOS", x: A, y: 800 },
    { id: "b1", tipo: "actividad", texto: "EVALUACIONES // TEST PROYECTIVOS", x: B, y: 20 },
    { id: "b2", tipo: "actividad", texto: "SOLICITUD DE DOCUMENTOS", x: B, y: 120 },
    { id: "b3", tipo: "actividad", texto: "CHEQUEOS (REFERENCIAS LABORALES Y OTROS)", x: B, y: 220 },
    { id: "b4", tipo: "actividad", texto: "ENTREVISTA TÉCNICA CON LA UNIDAD SOLICITANTE", x: B, y: 340 },
    { id: "b5", tipo: "actividad", texto: "OFERTA SALARIAL", x: B, y: 480 },
    { id: "b6", tipo: "actividad", texto: "EXÁMENES MÉDICOS PRE EMPLEO", x: B, y: 600 },
    { id: "b7", tipo: "actividad", texto: "CONTRATACIÓN", x: B, y: 720 },
    { id: "b8", tipo: "actividad", texto: "ONBOARDING Y PRESENTACIÓN", x: B, y: 820 },
    { id: "fin", tipo: "terminal", texto: "FIN", x: B, y: 930 },
    { id: "c1", tipo: "terminal", texto: "CIERRE DE PROCESO CON EL CANDIDATO SELECCIONADO", x: C, y: 420 },
    { id: "c2", tipo: "terminal", texto: "CIERRE DE PROCESO CON EL CANDIDATO SELECCIONADO", x: C, y: 540 },
    { id: "c3", tipo: "terminal", texto: "CIERRE DE PROCESO CON EL CANDIDATO SELECCIONADO", x: C, y: 660 },
  ];
  const cadena = ["inicio", "a1", "a2", "a3", "a4", "a5", "a6", "a7", "b1", "b2", "b3", "b4"];
  const conexiones: Conexion[] = cadena.slice(1).map((h, i) => ({ id: `k${i}`, desde: cadena[i], hasta: h, etiqueta: "" }));
  conexiones.push(
    { id: "k20", desde: "b4", hasta: "b5", etiqueta: "SI" },
    { id: "k21", desde: "b4", hasta: "c1", etiqueta: "NO" },
    { id: "k22", desde: "b5", hasta: "b6", etiqueta: "SI" },
    { id: "k23", desde: "b5", hasta: "c2", etiqueta: "NO" },
    { id: "k24", desde: "b6", hasta: "b7", etiqueta: "SI" },
    { id: "k25", desde: "b6", hasta: "c3", etiqueta: "NO" },
    { id: "k26", desde: "b7", hasta: "b8", etiqueta: "" },
    { id: "k27", desde: "b8", hasta: "fin", etiqueta: "" },
  );
  return {
    proceso: "Proceso de Recursos Humanos",
    subproceso: "Captación, reclutamiento y selección de personal",
    meta: { ...META_VACIA },
    pasos,
    conexiones,
  };
}
