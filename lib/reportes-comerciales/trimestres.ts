/**
 * Utilidades de trimestre CALENDARIO para los Reportes Comerciales.
 *
 *   Q1 = ene-feb-mar   Q2 = abr-may-jun   Q3 = jul-ago-sep   Q4 = oct-nov-dic
 *
 * El identificador de trimestre es un string `"2026-Q3"` (mismo estilo que
 * `mes VARCHAR(7)` en el resto del sistema, pero con `Q`).
 */

export interface Trimestre {
  anio: number;
  q: 1 | 2 | 3 | 4;
}

export interface RangoFechas {
  desde: string; // YYYY-MM-DD (inclusive)
  hasta: string; // YYYY-MM-DD (inclusive)
}

const RE_TRIMESTRE = /^(\d{4})-Q([1-4])$/;

/** Primer trimestre para el que existe data en el sistema (Panama arranco 2026). */
export const TRIMESTRE_MINIMO: Trimestre = { anio: 2026, q: 1 };

export function formatTrimestre(t: Trimestre): string {
  return `${t.anio}-Q${t.q}`;
}

export function parseTrimestre(valor: string): Trimestre {
  const m = RE_TRIMESTRE.exec((valor || "").trim().toUpperCase());
  if (!m) {
    throw new Error(`Trimestre invalido: "${valor}" (se espera "2026-Q3")`);
  }
  return { anio: Number(m[1]), q: Number(m[2]) as 1 | 2 | 3 | 4 };
}

export function limitesTrimestre(t: Trimestre): RangoFechas {
  const mesInicio = (t.q - 1) * 3; // 0, 3, 6, 9
  const desde = new Date(Date.UTC(t.anio, mesInicio, 1));
  const hasta = new Date(Date.UTC(t.anio, mesInicio + 3, 0)); // dia 0 del mes siguiente = ultimo dia
  return { desde: iso(desde), hasta: iso(hasta) };
}

export function trimestreAnterior(t: Trimestre): Trimestre {
  if (t.q === 1) return { anio: t.anio - 1, q: 4 };
  return { anio: t.anio, q: (t.q - 1) as 1 | 2 | 3 | 4 };
}

export function trimestreDeFecha(fecha: Date): Trimestre {
  return { anio: fecha.getFullYear(), q: (Math.floor(fecha.getMonth() / 3) + 1) as 1 | 2 | 3 | 4 };
}

export function trimestreActual(): Trimestre {
  return trimestreDeFecha(new Date());
}

/**
 * Lista de trimestres seleccionables, del mas reciente al mas antiguo,
 * desde `TRIMESTRE_MINIMO` hasta el trimestre en curso.
 */
export function trimestresDisponibles(hasta: Trimestre = trimestreActual()): Trimestre[] {
  const lista: Trimestre[] = [];
  let cursor: Trimestre = { ...hasta };
  const tope = TRIMESTRE_MINIMO.anio * 4 + (TRIMESTRE_MINIMO.q - 1);
  while (cursor.anio * 4 + (cursor.q - 1) >= tope) {
    lista.push({ ...cursor });
    cursor = trimestreAnterior(cursor);
  }
  return lista;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
