/**
 * Centro de gráficas del SuperAdmin (/superadmin/graficas). Cada área
 * (lib/graficas/<area>.ts) devuelve sus indicadores y gráficas ya armados con
 * esta forma, y la pantalla (components/graficas/) los dibuja sin saber de qué
 * son. Sin dependencias: lo usan el servidor y la pantalla.
 */

export const AREAS = ["ventas", "cobranza", "inventario", "rma", "rrhh"] as const;
export type Area = (typeof AREAS)[number];

export const NOMBRE_AREA: Record<Area, string> = {
  ventas: "Ventas",
  cobranza: "Cobranza",
  inventario: "Inventario y Compras",
  rma: "Servicio técnico (RMA)",
  rrhh: "Recursos Humanos",
};

/** `?sede=` de la pantalla → company_id de Odoo. */
export const SEDES_GRAFICAS: Record<string, number[]> = {
  todas: [9, 10, 7],
  valencia: [9],
  caracas: [10],
  panama: [7],
};
export const NOMBRE_SEDE: Record<number, string> = { 9: "Valencia", 10: "Caracas", 7: "Panamá" };

export type Formato = "usd" | "num" | "pct" | "dias";

export type Kpi = {
  id: string;
  etiqueta: string;
  valor: number | null;
  formato: Formato;
  /** Variación en % contra la referencia (`referencia` dice contra qué). */
  delta?: number | null;
  referencia?: string;
  /** Si subir es bueno (ventas) o malo (vencido). Default "sube". */
  mejor?: "sube" | "baja";
  nota?: string;
};

export type TipoGrafica = "barras" | "barras_h" | "apiladas" | "apiladas_h" | "lineas" | "area" | "dona";

export type Serie = { clave: string; etiqueta: string; color: string; punteada?: boolean };

export type Grafica = {
  id: string;
  titulo: string;
  descripcion?: string;
  tipo: TipoGrafica;
  formato: Formato;
  /** 1 = media fila, 2 = fila entera. */
  ancho?: 1 | 2;
  /** Cada fila: `etiqueta` (eje) + un valor por clave de serie. */
  datos: Record<string, string | number | null>[];
  series: Serie[];
  /** Una sola serie con un color por barra (ej. antigüedad de verde a rojo). */
  colorPorFila?: string[];
  /** Texto cuando no hay datos. */
  vacio?: string;
  /** Al hacer clic en una barra: lo que la compone (ej. los productos de esa marca). */
  detalle?: Detalle;
  /** La misma gráfica en otra medida (ej. unidades): la tarjeta muestra un selector. */
  alterna?: { etiqueta: string; formato: Formato; datos: Record<string, string | number | null>[]; detalle?: Detalle };
  /** Nombre de la medida principal en ese selector (default "Monto"). */
  etiquetaPrincipal?: string;
};

/** Separa las etiquetas del camino de clics en las llaves de `Detalle`. */
export const SEP = "\u001f";

export type FilaDetalle = { etiqueta: string; valor: number };

/**
 * Lo que se ve al hacer clic en una barra y, dentro, en cada fila: la llave
 * es el camino de etiquetas clicadas unidas por SEP (["ANDREA MARQUEZ"] →
 * sus clientes; ["ANDREA MARQUEZ", cliente] → los productos de ese cliente con
 * ella). Una fila se puede clicar si su camino tiene llave.
 */
export type Detalle = Record<string, { que: string; filas: FilaDetalle[] }>;

/** Valores acumulados por camino (ej. vendedor → cliente → producto). */
export type Arbol = Map<string, { valor: number; hijos: Arbol }>;

/** Filas del detalle por nivel. */
export const MAX_DETALLE = 30;

/** Suma `v` en cada nivel del camino. */
export function agregarRuta(arbol: Arbol, ruta: string[], v: number) {
  let nivel = arbol;
  for (const k of ruta) {
    let n = nivel.get(k);
    if (!n) {
      n = { valor: 0, hijos: new Map() };
      nivel.set(k, n);
    }
    n.valor += v;
    nivel = n.hijos;
  }
}

/**
 * Detalle de las barras de `datos` según `arbol`: el nivel i del árbol (desde
 * los hijos de la barra) se lista como `niveles[i].que`, con sus
 * `niveles[i].max` mayores. La barra "Otros…", que no está en el árbol,
 * lista lo que agrupa (como `otros`) y de ahí sigue igual que las demás.
 */
export function detalleDe(
  datos: Record<string, string | number | null>[],
  arbol: Arbol,
  niveles: { que: string; max: number }[],
  otros?: string,
  redondeo: (n: number) => number = r2,
): Detalle {
  const out: Detalle = {};
  const nivel = (i: number) => (i < 0 ? { que: otros!, max: MAX_DETALLE } : niveles[i]);
  const bajar = (ruta: string[], hijos: Arbol, i: number) => {
    if (i >= niveles.length || !hijos.size) return;
    const top = [...hijos].sort((a, b) => b[1].valor - a[1].valor).slice(0, nivel(i).max);
    out[ruta.join(SEP)] = { que: nivel(i).que, filas: top.map(([etiqueta, n]) => ({ etiqueta, valor: redondeo(n.valor) })) };
    for (const [etiqueta, n] of top) bajar([...ruta, etiqueta], n.hijos, i + 1);
  };
  const conBarra = new Set(datos.map((d) => String(d.etiqueta)));
  for (const d of datos) {
    const k = String(d.etiqueta);
    const n = arbol.get(k);
    if (n) bajar([k], n.hijos, 0);
    else if (otros) bajar([k], new Map([...arbol].filter(([e]) => !conBarra.has(e))), -1);
  }
  return out;
}

export type DatosArea = {
  area: Area;
  sede: string;
  mes: string;
  generado: string;
  kpis: Kpi[];
  graficas: Grafica[];
  /** Bloques que no se pudieron leer o que llevan una aclaración. */
  avisos: string[];
};

/* ------------------------------------------------------------------ colores */

/**
 * Paleta categórica en orden fijo (validada para daltonismo; ver la skill de
 * dataviz). Las series se asignan en este orden, nunca saltadas ni recicladas:
 * de 8 en adelante se juntan en "Otros".
 */
export const PALETA = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];

/** Cada sede tiene siempre su color, aunque se filtre a una sola. */
export const COLOR_SEDE: Record<number, string> = { 9: PALETA[0], 10: PALETA[1], 7: PALETA[2] };

/** Estados: reservados para bien / aviso / serio / crítico, nunca para una serie cualquiera. */
export const ESTADO = { bien: "#0ca30c", aviso: "#fab219", serio: "#ec835a", critico: "#d03b3b" };

/** Una sola magnitud ordenada (azul de claro a oscuro). */
export const RAMPA = ["#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281"];

/** Gris de "Otros" / "anterior". */
export const GRIS = "#a3a29c";

/* ------------------------------------------------------------------ ayudas */

export const r2 = (n: number) => Math.round(n * 100) / 100;

/** Variación en % de `actual` contra `antes` (null si no hay base). */
export function variacion(actual: number | null | undefined, antes: number | null | undefined): number | null {
  if (actual == null || antes == null || !antes) return null;
  return Math.round(((actual - antes) / Math.abs(antes)) * 1000) / 10;
}

/** "2026-10" → "oct 26". */
export function etiquetaMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  const nombres = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${nombres[m - 1]} ${String(a).slice(2)}`;
}

/** Los `n` meses que terminan en `mes` (inclusive), del más viejo al más nuevo. */
export function mesesHasta(mes: string, n: number): string[] {
  const [a, m] = mes.split("-").map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(a, m - 1 - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

export function finDeMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

/**
 * Los `max` mayores por valor y el resto sumado en "Otros" (así ninguna
 * gráfica pasa de 8 colores ni de una lista ilegible).
 */
export function topConOtros<T extends { etiqueta: string; valor: number }>(filas: T[], max: number, otros = "Otros"): { etiqueta: string; valor: number }[] {
  const orden = [...filas].sort((a, b) => b.valor - a.valor);
  const top = orden.slice(0, max).map((f) => ({ etiqueta: f.etiqueta, valor: r2(f.valor) }));
  const resto = orden.slice(max).reduce((s, f) => s + f.valor, 0);
  if (Math.abs(resto) >= 0.5) top.push({ etiqueta: otros, valor: r2(resto) });
  return top;
}

/** Corre un bloque y, si falla, deja el aviso en vez de tumbar el área entera. */
export async function bloque<T>(avisos: string[], nombre: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e: any) {
    console.error(`[graficas] ${nombre}:`, e?.message || e);
    avisos.push(`No se pudo leer ${nombre}.`);
    return null;
  }
}
