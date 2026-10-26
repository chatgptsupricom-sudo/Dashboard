import * as XLSX from "xlsx";

/**
 * Lector del Excel (o CSV) que exporta el biométrico. Cada equipo lo saca
 * distinto, así que no se asume un formato: se busca la fila de encabezados,
 * se adivinan las columnas (código, nombre, fecha, una o varias de hora) y la
 * pantalla deja corregirlas antes de importar. Sirve tanto el registro crudo
 * (una fila por marca, con fecha y hora juntas o separadas) como el reporte
 * por día (columnas Entrada / Salida, o todas las horas en una sola celda).
 */

export type Hoja = { nombre: string; encabezados: string[]; filas: unknown[][] };
export type Mapeo = { codigo: number; nombre: number; fecha: number; horas: number[] };
export type OrdenFecha = "dmy" | "mdy";
export type MarcaLeida = { codigo: string; nombre: string; fecha: string; hora: string };

const CODIGO = /^(ac-?no\.?|no\.?|n[°º.]?|nro\.?|id|c[oó]d(igo)?\.?|c[eé]dula|ci|enroll\s*(id|no)?|user\s*id|usuario|n[uú]mero|ficha|personal\s*id|emp\.?\s*(id|no)?)$/i;
const NOMBRE = /nombre|name|empleado|trabajador|apellido/i;
const FECHA_HORA = /fecha\s*[/y-]?\s*hora|date\s*[/-]?\s*time|^time$|^marcaje$|^registro$|check\s*time|^tiempo$/i;
const FECHA = /^(fecha|date|d[ií]a|day)$/i;
const HORA = /hora|entrada|salida|^in$|^out$|time|marca|registro|check/i;

const texto = (v: unknown) => (v == null ? "" : String(v).trim());

/** Lee todas las hojas con contenido. */
export async function leerArchivo(archivo: File): Promise<Hoja[]> {
  const libro = XLSX.read(await archivo.arrayBuffer(), { type: "array" });
  return libro.SheetNames.flatMap((nombre) => {
    const filas = XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets[nombre], { header: 1, raw: true, defval: null, blankrows: false });
    const hoja = armarHoja(nombre, filas);
    return hoja ? [hoja] : [];
  });
}

/** La fila de encabezados es la primera (de las 20 de arriba) con un código o nombre reconocible. */
export function armarHoja(nombre: string, filas: unknown[][]): Hoja | null {
  if (!filas.length) return null;
  let i = filas.slice(0, 20).findIndex((f) => {
    const t = f.map(texto);
    return t.some((x) => CODIGO.test(x) || NOMBRE.test(x)) && t.some((x) => FECHA.test(x) || FECHA_HORA.test(x) || HORA.test(x));
  });
  if (i < 0) i = 0;
  const ancho = Math.max(...filas.slice(i, i + 50).map((f) => f.length));
  const encabezados = Array.from({ length: ancho }, (_, c) => texto(filas[i][c]) || `Columna ${c + 1}`);
  const datos = filas.slice(i + 1).filter((f) => f.some((v) => texto(v)));
  return datos.length ? { nombre, encabezados, filas: datos } : null;
}

export function adivinarMapeo(encabezados: string[]): Mapeo {
  const buscar = (re: RegExp, menos: number[] = []) => encabezados.findIndex((h, i) => !menos.includes(i) && re.test(h));
  const codigo = buscar(CODIGO);
  const nombre = buscar(NOMBRE, [codigo]);
  let fecha = buscar(FECHA, [codigo, nombre]);
  const fechaHora = buscar(FECHA_HORA, [codigo, nombre, fecha]);
  let horas: number[];
  if (fechaHora >= 0 && fecha < 0) {
    horas = [fechaHora];
  } else {
    horas = encabezados.map((h, i) => i).filter((i) => ![codigo, nombre, fecha].includes(i) && HORA.test(encabezados[i]));
  }
  if (fecha >= 0 && !horas.length) fecha = -1;
  return { codigo, nombre, fecha, horas };
}

/* ------------------------------------------------------------ fechas/horas */

const dosDig = (n: number) => String(n).padStart(2, "0");

/** Serial de Excel → fecha y/o minutos del día. */
function deSerial(n: number): { fecha: string | null; hora: string | null } {
  const entero = Math.floor(n);
  const minutosDia = Math.round((n - entero) * 1440) % 1440;
  const hora = n - entero > 1e-9 ? `${dosDig(Math.floor(minutosDia / 60))}:${dosDig(minutosDia % 60)}` : null;
  if (entero < 1) return { fecha: null, hora };
  const d = XLSX.SSF.parse_date_code(entero);
  return { fecha: d ? `${d.y}-${dosDig(d.m)}-${dosDig(d.d)}` : null, hora };
}

const RE_ISO = /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/;
const RE_LOCAL = /(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/;
const RE_HORA = /(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap])?\.?\s*\.?\s*m?\.?/gi;

function fechaDeTexto(s: string, orden: OrdenFecha): string | null {
  const iso = s.match(RE_ISO);
  if (iso) return valida(+iso[1], +iso[2], +iso[3]);
  const loc = s.match(RE_LOCAL);
  if (!loc) return null;
  const a = loc[3].length === 2 ? 2000 + +loc[3] : +loc[3];
  return orden === "dmy" ? valida(a, +loc[2], +loc[1]) : valida(a, +loc[1], +loc[2]);
}

function valida(a: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || a < 2000 || a > 2100) return null;
  return `${a}-${dosDig(m)}-${dosDig(d)}`;
}

/** Todas las horas de un texto ("07:55 12:01 16:35", "7:55 a. m."), en 24 h. */
function horasDeTexto(s: string, quitarFecha: boolean): string[] {
  const limpio = quitarFecha ? s.replace(RE_ISO, " ").replace(RE_LOCAL, " ") : s;
  const out: string[] = [];
  for (const m of limpio.matchAll(RE_HORA)) {
    let h = +m[1];
    const min = +m[2];
    const ap = m[3]?.toLowerCase();
    if (ap === "p" && h < 12) h += 12;
    if (ap === "a" && h === 12) h = 0;
    if (h < 24 && min < 60) out.push(`${dosDig(h)}:${dosDig(min)}`);
  }
  return out;
}

/** Día/mes o mes/día: si algún primer número pasa de 12 es día/mes; si es el segundo, mes/día. */
export function detectarOrden(hoja: Hoja, mapeo: Mapeo): OrdenFecha {
  const cols = mapeo.fecha >= 0 ? [mapeo.fecha] : mapeo.horas;
  for (const f of hoja.filas.slice(0, 2000)) {
    for (const c of cols) {
      const m = texto(f[c]).match(RE_LOCAL);
      if (!m) continue;
      if (+m[1] > 12) return "dmy";
      if (+m[2] > 12) return "mdy";
    }
  }
  return "dmy";
}

/** Convierte las filas con el mapeo: marcas (sin repetir) y filas que no se pudieron leer. */
export function extraerMarcas(hoja: Hoja, mapeo: Mapeo, orden: OrdenFecha): { marcas: MarcaLeida[]; omitidas: number } {
  const vistas = new Set<string>();
  const marcas: MarcaLeida[] = [];
  let omitidas = 0;
  for (const f of hoja.filas) {
    const codigo = texto(f[mapeo.codigo]).replace(/\.0+$/, "");
    if (!codigo) {
      omitidas++;
      continue;
    }
    const nombre = mapeo.nombre >= 0 ? texto(f[mapeo.nombre]) : "";
    let fechaFila: string | null = null;
    if (mapeo.fecha >= 0) {
      const v = f[mapeo.fecha];
      fechaFila = typeof v === "number" ? deSerial(v).fecha : fechaDeTexto(texto(v), orden);
    }
    const deLaFila: { fecha: string; hora: string }[] = [];
    for (const c of mapeo.horas) {
      const v = f[c];
      if (v == null || v === "") continue;
      if (typeof v === "number") {
        const s = deSerial(v);
        const fecha = s.fecha ?? fechaFila;
        if (fecha && s.hora) deLaFila.push({ fecha, hora: s.hora });
        continue;
      }
      const t = texto(v);
      const fecha = fechaDeTexto(t, orden) ?? fechaFila;
      if (!fecha) continue;
      for (const hora of horasDeTexto(t, true)) deLaFila.push({ fecha, hora });
    }
    if (!deLaFila.length) {
      omitidas++;
      continue;
    }
    for (const m of deLaFila) {
      const k = `${codigo}|${m.fecha}|${m.hora}`;
      if (vistas.has(k)) continue;
      vistas.add(k);
      marcas.push({ codigo, nombre, ...m });
    }
  }
  return { marcas, omitidas };
}
