import * as XLSX from "xlsx";
import { CATEGORIAS_PRECIOS } from "@/lib/inteligencia-negocio/precios/estructuras";

/**
 * Lee una lista de precios de un mayorista tal como llega (cada uno con su
 * formato) y la deja en filas parejas: código, modelo, marca, descripción,
 * línea y precio. No clasifica (eso es clasificar.ts).
 *
 * Lo que resuelve, visto en las listas de oct-2026:
 * - Encabezado en cualquier fila (debajo de logos, datos del vendedor…) y
 *   varias hojas: la que es copia de otra (ECD trae la lista completa y una
 *   hoja por categoría) no duplica.
 * - Filas de sección: una sola celda con texto ("DECIBEL", "ADAPTADOR",
 *   "Categoría: ACCESORIOS (25 productos)"): es la marca si sale en las
 *   descripciones de abajo, si no la línea.
 * - Línea escrita solo en el primer renglón del grupo (PAH): se arrastra.
 * - Varias columnas de precio (PAH: transferencia y efectivo): el menor que
 *   no sea cero (regla del precio más bajo).
 * - Sin precio, "Consultar", $0, stock 0 o "Agotado": fuera.
 * - Precios con IVA (columna o leyenda "IVA incluido"): se les quita el 16 %.
 * - Un mismo producto repetido en la lista: se queda el precio más bajo.
 *
 * Si el archivo ya viene ordenado (formato del Excel de ejemplo: Código,
 * Marca, Categoría, Subcategoría, Mayorista, Fecha, PVP…) se lee tal cual.
 */

export const IVA_VE = 0.16;

export interface FilaLeida {
  codigo: string;
  modelo: string;
  marca: string;
  /** La marca salió de una columna o sección de la lista (se respeta tal cual); si no, se dedujo de la descripción. */
  marcaDeLista: boolean;
  descripcion: string;
  /** Categoría o línea que trae la lista (pista para clasificar). */
  linea: string;
  pvp: number;
}

export interface FilaOrdenada {
  codigo: string;
  marca: string;
  categoria: string;
  subcategoria: string;
  confianza: number;
  observaciones: string;
  mayorista: string;
  fecha: string; // YYYY-MM-DD
  pvp: number;
  descripcion: string;
}

export interface ListaLeida {
  ordenada: boolean;
  filas: FilaLeida[];
  ordenadas: FilaOrdenada[];
  hojas: string[];
  mayoristaSugerido: string;
  fechaLista: string | null;
  ivaIncluido: boolean;
  descartes: { sinPrecio: number; sinStock: number; duplicados: number; copias: number };
  avisos: string[];
}

export const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
const H = (s: unknown) => norm(s).replace(/[^A-Z0-9]/g, "");
const limpio = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();

/** Número de un precio escrito de cualquier forma ("$1,699.00", "12,50", 7.5). NaN si no es número. */
export function numero(v: unknown): number {
  if (typeof v === "number") return v;
  if (v == null) return NaN;
  let s = String(v).replace(/[$\s]|USD|US\$|DOLARES?/gi, "");
  if (!s || /[A-Z]{3,}/i.test(s)) return NaN;
  if (/,\d{1,2}$/.test(s) && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  else s = s.replace(/,/g, "");
  return /^-?\d+(\.\d+)?$/.test(s) ? parseFloat(s) : NaN;
}

/** Celda de código: los números largos que Excel muestra como 8.40081E+11 vuelven a ser el código entero. */
function textoCodigo(v: unknown): string {
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  return limpio(v).replace(/^'/, "");
}

const MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
const iso = (y: number, m: number, d: number) =>
  y > 2000 && m >= 1 && m <= 12 && d >= 1 && d <= 31
    ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
    : null;

/** Fecha escrita en un texto: 16-10-2026, 21-10- 2026, 14-10 (año en curso), "21 de octubre de 2026". */
export function fechaEnTexto(texto: string, anioPorDefecto = new Date().getFullYear()): string | null {
  const t = norm(texto);
  let m = t.match(/\b(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{2,4})\b/);
  if (m) {
    let y = +m[3];
    if (y < 100) y += 2000;
    return iso(y, +m[2], +m[1]);
  }
  m = t.match(/\b(\d{1,2})\s+DE\s+([A-Z]+)(?:\s+(?:DE|DEL)\s+(\d{4}))?/);
  if (m && MESES.includes(m[2])) return iso(m[3] ? +m[3] : anioPorDefecto, MESES.indexOf(m[2]) + 1, +m[1]);
  m = t.match(/(?:^|[^\d])(\d{1,2})\s*[-/.]\s*(\d{1,2})(?:[^\d]|$)/);
  if (m) return iso(anioPorDefecto, +m[2], +m[1]);
  return null;
}

function fechaDeCelda(v: unknown): string | null {
  if (v instanceof Date && !isNaN(+v)) return iso(v.getFullYear(), v.getMonth() + 1, v.getDate());
  if (typeof v === "number" && v > 40000 && v < 60000) {
    const d = new Date(Math.round((v - 25569) * 86400000));
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  if (typeof v === "string") {
    const t = v.trim();
    const m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return iso(+m[1], +m[2], +m[3]);
    return fechaEnTexto(t);
  }
  return null;
}

/**
 * Mayorista por el nombre del archivo: se quitan "lista de precios", "LP",
 * fechas, días y meses; si lo que queda contiene un mayorista ya conocido
 * (sin espacios: GAHLTECH = GAHL TECH), ese.
 */
export function mayoristaDelArchivo(nombre: string, conocidos: string[]): string {
  const base = norm(nombre.replace(/\.[a-z0-9]+$/i, ""));
  const plano = base.replace(/[^A-Z0-9]/g, "");
  const porLargo = [...conocidos].sort((a, b) => b.length - a.length);
  for (const c of porLargo) {
    const k = H(c);
    if (k.length >= 3 && plano.includes(k)) return c;
  }
  const resto = base
    .replace(/\b\d{1,4}\b/g, " ")
    .replace(/[^A-Z ]/g, " ")
    .split(/\s+/)
    .filter(
      (w) =>
        w &&
        !MESES.includes(w) &&
        !/^(LISTAS?|LP|LDP|DE|DEL|LA|EL|PRECIOS?|COMPUTADORAS?|LUNES|MARTES|MIERCOLES|JUEVES|VIERNES|SABADO|DOMINGO|GENERAL|ACTUALIZADA|NUEVA|COPIA|FINAL|USD)$/.test(w),
    );
  return resto.join(" ").trim();
}

// ---------------------------------------------------------------------------
// Encabezados
// ---------------------------------------------------------------------------

type Rol = "desc" | "codigo" | "modelo" | "marca" | "linea" | "precio" | "stock";

function rolDe(h: string): Rol | null {
  if (!h) return null;
  if (/GARANTIA|IMAGEN|FOTO|LINK|URL|ITEM$|^ITS$|^N$|^NO$|^NRO$|^#$/.test(h)) return null;
  if (/STOCK|EXISTENCIA|DISPONIB|INVENTARIO|^CANT|UNIDADES/.test(h)) return "stock";
  if (/PRECIO|PVP|PRICE|COSTO|EFECT|TRANSF|DIVISA|^USD|^MONTO|CONTADO|MAYORISTA$|DISTRIBUIDOR/.test(h)) return "precio";
  if (/^MARCA|^BRAND|FABRICANTE/.test(h)) return "marca";
  if (/^MODELO|^MODEL/.test(h)) return "modelo";
  if (/DESCRIPCION|NOMBREDELPRODUCTO|^NOMBRE|^DESCRIPTION|^ARTICULO|^PRODUCTO$/.test(h)) return "desc";
  if (/CODIGO|^COD|^SKU|NODEPARTE|NUMERODEPARTE|PARTNUMBER|^PN$|^REF|^PART/.test(h)) return "codigo";
  if (/^LINEA|CATEGORIA|TIPODEPRODUCTO|^TIPO$|FAMILIA|^GRUPO|^CLASE/.test(h)) return "linea";
  return null;
}

interface Columnas {
  fila: number;
  desc: number;
  codigo: number;
  modelo: number;
  marca: number;
  linea: number;
  precios: { col: number; conIva: boolean; bolivares: boolean; nombre: string }[];
  stock: number;
}

function buscarEncabezado(aoa: unknown[][]): Columnas | null {
  for (let i = 0; i < Math.min(aoa.length, 80); i++) {
    const fila = aoa[i] || [];
    const hs = fila.map(H);
    const roles = hs.map(rolDe);
    if (!roles.includes("desc") || !roles.includes("precio")) continue;
    const col = (r: Rol) => roles.indexOf(r);
    const precios = roles
      .map((r, c) => (r === "precio" ? c : -1))
      .filter((c) => c >= 0)
      .map((c) => ({
        col: c,
        nombre: limpio(fila[c]),
        conIva: /CONIVA|IVAINCLUIDO|INCLUYEIVA|INCIVA/.test(hs[c]),
        bolivares: /BS$|^BS|BOLIVAR|VES$/.test(hs[c]),
      }));
    return {
      fila: i,
      desc: col("desc"),
      codigo: col("codigo"),
      modelo: col("modelo"),
      marca: col("marca"),
      linea: col("linea"),
      precios,
      stock: col("stock"),
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Formato ordenado (el del Excel de ejemplo)
// ---------------------------------------------------------------------------

function leerOrdenada(aoa: unknown[][]): FilaOrdenada[] | null {
  for (let i = 0; i < Math.min(aoa.length, 20); i++) {
    const hs = (aoa[i] || []).map(H);
    const ix = (...nombres: string[]) => {
      for (const n of nombres) {
        const j = hs.findIndex((h) => h === n);
        if (j >= 0) return j;
      }
      for (const n of nombres) {
        const j = hs.findIndex((h) => h.startsWith(n));
        if (j >= 0) return j;
      }
      return -1;
    };
    const c = {
      codigo: ix("CODIGO"),
      marca: ix("MARCA"),
      categoria: ix("CATEGORIA"),
      sub: ix("SUBCATEGORIANOMBRECORTO", "SUBCATEGORIA", "NOMBRECORTO"),
      conf: ix("GRADODECONFIANZA", "CONFIANZA"),
      obs: ix("OBSERVACIONESVERIFICAR", "OBSERVACIONES"),
      may: ix("MAYORISTA"),
      fecha: ix("FECHA"),
      pvp: ix("PVP", "PRECIO"),
      desc: ix("DESCRIPCIONORIGINAL", "DESCRIPCION"),
    };
    if (c.categoria < 0 || c.sub < 0 || c.may < 0 || c.pvp < 0 || c.fecha < 0) continue;
    const out: FilaOrdenada[] = [];
    for (let k = i + 1; k < aoa.length; k++) {
      const r = aoa[k] || [];
      const g = (j: number) => (j < 0 ? "" : limpio(r[j]));
      const pvp = numero(r[c.pvp]);
      const fecha = fechaDeCelda(r[c.fecha]);
      if (!(pvp > 0) || !fecha || !g(c.may)) continue;
      out.push({
        codigo: c.codigo < 0 ? "" : textoCodigo(r[c.codigo]),
        marca: g(c.marca).toUpperCase(),
        categoria: g(c.categoria).toUpperCase(),
        subcategoria: g(c.sub),
        confianza: c.conf < 0 ? 0 : Math.min(1, Math.max(0, numero(r[c.conf]) || 0)),
        observaciones: g(c.obs),
        mayorista: g(c.may).toUpperCase(),
        fecha,
        pvp: Math.round(pvp * 100) / 100,
        descripcion: g(c.desc),
      });
    }
    return out;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Lista desordenada
// ---------------------------------------------------------------------------

const RE_SECCION = /^CATEGORIA\s*:\s*(.+?)(\s*\(\d+\s*PRODUCTOS?\))?$/;
const RE_AGOTADO = /\b(AGOTADO|SIN STOCK|SIN EXISTENCIA|NO DISPONIBLE)\b/;

export function leerLista(
  buffer: Buffer,
  nombreArchivo: string,
  opciones: { marcasConocidas: Set<string>; mayoristasConocidos: string[] },
): ListaLeida {
  if (/\.pdf$/i.test(nombreArchivo)) throw new Error("Por ahora las listas se cargan en Excel o CSV, no en PDF.");
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true, codepage: 65001 });
  const hojas = wb.SheetNames.map((n) => ({
    nombre: n,
    aoa: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: false }),
  }));
  const res: ListaLeida = {
    ordenada: false,
    filas: [],
    ordenadas: [],
    hojas: [],
    mayoristaSugerido: mayoristaDelArchivo(nombreArchivo, opciones.mayoristasConocidos),
    fechaLista: fechaEnTexto(nombreArchivo),
    ivaIncluido: false,
    descartes: { sinPrecio: 0, sinStock: 0, duplicados: 0, copias: 0 },
    avisos: [],
  };

  // 1) ¿Ya viene ordenada? (hoja "Catalogo" del ejemplo, o la primera que tenga esas columnas)
  const candidatas = [...hojas].sort((a, b) => Number(/CATALOG/.test(norm(b.nombre))) - Number(/CATALOG/.test(norm(a.nombre))));
  for (const h of candidatas) {
    const ord = leerOrdenada(h.aoa);
    if (ord) {
      res.ordenada = true;
      res.ordenadas = ord;
      res.hojas = [h.nombre];
      return res;
    }
  }

  // Leyendas de IVA y fecha en las primeras filas de la primera hoja con encabezado.
  const vistos = new Map<string, FilaLeida>();
  const firmas = new Map<string, string>(); // clave → precio+desc, para distinguir copia de duplicado
  let hayBolivares = false;

  for (const h of hojas) {
    const cols = buscarEncabezado(h.aoa);
    if (!cols) continue;
    res.hojas.push(h.nombre);
    const cabecera = h.aoa
      .slice(0, cols.fila + 1)
      .map((r) => (r || []).map((c) => limpio(c)).join(" "))
      .join(" ");
    const nc = norm(cabecera);
    if (!res.fechaLista) {
      for (const r of h.aoa.slice(0, cols.fila + 1)) {
        for (const c of r || []) {
          const f = c instanceof Date || typeof c === "string" ? fechaDeCelda(c) : null;
          if (f) {
            res.fechaLista = f;
            break;
          }
        }
        if (res.fechaLista) break;
      }
    }
    const preciosUsd = cols.precios.filter((p) => !p.bolivares);
    if (preciosUsd.length < cols.precios.length) hayBolivares = true;
    if (!preciosUsd.length) continue;
    const sinIvaCols = preciosUsd.filter((p) => !p.conIva);
    const usar = sinIvaCols.length ? sinIvaCols : preciosUsd;
    // Leyenda "IVA incluido" / "precios con IVA" (y no "+ IVA" ni "sin IVA") o solo columnas con IVA.
    const ivaPorLeyenda = /IVA INCLUIDO|INCLUYEN? (EL )?IVA|PRECIOS? CON IVA|CON IVA INCLUIDO/.test(nc) && !/SIN IVA|\+\s*IVA|MAS IVA/.test(nc);
    const conIva = !sinIvaCols.length || ivaPorLeyenda;
    if (conIva) res.ivaIncluido = true;

    // La primera sección puede estar justo encima del encabezado (ECD: "Categoría: ACCESORIOS (25 productos)").
    let seccion = "";
    for (let i = cols.fila - 1; i >= Math.max(0, cols.fila - 3); i--) {
      const celdas = (h.aoa[i] || []).map((c) => limpio(c)).filter(Boolean);
      const m = celdas.length === 1 ? norm(celdas[0]).match(RE_SECCION) : null;
      if (m) {
        seccion = m[1].trim();
        break;
      }
    }
    let lineaArrastrada = "";
    for (let i = cols.fila + 1; i < h.aoa.length; i++) {
      const r = h.aoa[i] || [];
      const celdas = r.map((c) => limpio(c)).filter(Boolean);
      if (!celdas.length) continue;
      const desc = limpio(r[cols.desc]);
      const preciosFila = usar.map((p) => numero(r[p.col]));
      const hayPrecio = preciosFila.some((p) => p > 0);
      // Fila de sección / título / encabezado repetido
      if (!desc || (celdas.length === 1 && !hayPrecio)) {
        if (celdas.length === 1 && !hayPrecio) {
          const t = norm(celdas[0]).replace(/\s+/g, " ").trim();
          const m = t.match(RE_SECCION);
          const s = (m ? m[1] : t).trim();
          if (s.length >= 2 && s.length <= 60 && !/^\d+$/.test(s)) seccion = s;
        }
        continue;
      }
      if (rolDe(H(desc)) === "desc") continue; // encabezado repetido dentro de la hoja
      let codigo = cols.codigo >= 0 ? textoCodigo(r[cols.codigo]) : "";
      const modelo = cols.modelo >= 0 ? limpio(r[cols.modelo]) : "";
      if (!codigo) codigo = modelo;
      let linea = cols.linea >= 0 ? limpio(r[cols.linea]) : "";
      if (linea) lineaArrastrada = linea;
      else linea = lineaArrastrada;
      const marcaCol = cols.marca >= 0 ? limpio(r[cols.marca]) : "";
      const textoFila = norm(r.map((c) => limpio(c)).join(" "));

      const validos = preciosFila.filter((p) => p > 0);
      if (!validos.length) {
        if (codigo || desc.length > 8) res.descartes.sinPrecio++;
        continue;
      }
      if (cols.stock >= 0) {
        const st = r[cols.stock];
        const n = numero(st);
        if ((typeof st === "number" && st <= 0) || (!isNaN(n) && n <= 0 && limpio(st) !== "") || RE_AGOTADO.test(norm(st))) {
          res.descartes.sinStock++;
          continue;
        }
      }
      if (RE_AGOTADO.test(textoFila)) {
        res.descartes.sinStock++;
        continue;
      }
      let pvp = Math.min(...validos);
      if (conIva) pvp = pvp / (1 + IVA_VE);
      pvp = Math.round(pvp * 100) / 100;

      // Marca: columna; si no, la sección si es una marca (conocida, o escrita dentro de la
      // descripción pero no al principio, que es donde va el tipo de producto: "ADAPTADOR …");
      // si no, se busca en la descripción.
      let marca = marcaCol;
      const ns = norm(seccion);
      const nd = norm(desc);
      const seccionEsMarca =
        !!ns &&
        !CATEGORIAS_PRECIOS.some((c) => norm(c).startsWith(ns)) &&
        (opciones.marcasConocidas.has(ns) || (nd.includes(ns) && !nd.startsWith(ns)));
      if (!marca && seccionEsMarca) marca = seccion;
      const marcaDeLista = !!marca;
      if (!marca) marca = marcaEnTexto(desc, opciones.marcasConocidas);
      if (!linea && seccion && !seccionEsMarca) linea = seccion;

      const fila: FilaLeida = {
        codigo,
        modelo: modelo && modelo !== codigo ? modelo : "",
        marca: marca.toUpperCase(),
        marcaDeLista,
        descripcion: desc,
        linea: linea.toUpperCase(),
        pvp,
      };
      const clave = H(codigo) || "D:" + H(desc);
      const firma = `${pvp}|${H(desc)}`;
      const previo = vistos.get(clave);
      if (previo) {
        if (firmas.get(clave) === firma) res.descartes.copias++;
        else res.descartes.duplicados++;
        if (pvp < previo.pvp) {
          vistos.set(clave, { ...previo, pvp });
          firmas.set(clave, firma);
        }
        if (!previo.linea && fila.linea) previo.linea = fila.linea;
        continue;
      }
      vistos.set(clave, fila);
      firmas.set(clave, firma);
    }
  }
  res.filas = [...vistos.values()];
  if (!res.hojas.length) {
    throw new Error("No se encontró el encabezado de la lista: hace falta una columna de descripción y una de precio.");
  }
  if (hayBolivares) res.avisos.push("Se ignoraron las columnas de precio en bolívares; solo se toman los precios en dólares.");
  if (res.ivaIncluido) res.avisos.push("Los precios traían IVA: se les quitó el 16 %.");
  return res;
}

/** Nombres de marca que también son palabras comunes en las descripciones: no se buscan en el texto. */
const NO_SON_MARCA = new Set(["RJ45", "NANO", "DATO", "TARGET", "EXPLORE", "NOVA", "OMEGA", "FUSION", "EAGLE", "TIPO", "COD", "SAT", "GP", "AST", "PRO", "MAX", "ULTRA", "SMART"]);

/** Marca conocida escrita en la descripción (la más larga que aparezca como palabra). */
export function marcaEnTexto(texto: string, marcas: Set<string>): string {
  const t = " " + norm(texto).replace(/[^A-Z0-9&+]+/g, " ") + " ";
  let mejor = "";
  for (const m of marcas) {
    if (m.length < 3 || m.length <= mejor.length || NO_SON_MARCA.has(m)) continue;
    const k = " " + m.replace(/[^A-Z0-9&+]+/g, " ").trim() + " ";
    if (k.trim().length >= 2 && t.includes(k)) mejor = m;
  }
  return mejor;
}
