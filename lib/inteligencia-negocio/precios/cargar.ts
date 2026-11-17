import { createHash } from "crypto";
import { cerrarCarga, iniciarClasificacion } from "@/lib/inteligencia-negocio/precios/clasificar";
import {
  claveDe,
  crearCarga,
  guardarMemoria,
  leerMemoria,
  marcasYMayoristas,
  type FilaMercado,
} from "@/lib/inteligencia-negocio/precios/datos";
import { MARCAS_BASE } from "@/lib/inteligencia-negocio/precios/estructuras";
import { IVA_VE, leerLista, norm } from "@/lib/inteligencia-negocio/precios/leerLista";

/**
 * Carga de una lista de precios (botón «Cargar listas» del tablero):
 * se lee con leerLista, lo ya clasificado sale de la memoria y lo demás
 * queda pendiente para la IA, que corre en segundo plano.
 *
 * Un archivo que ya viene ordenado (el formato del Excel de ejemplo) entra
 * tal cual, una carga por mayorista y fecha, y alimenta la memoria.
 */

export interface OpcionesCarga {
  /** Mayorista elegido en la pantalla (si no, el que se deduce del nombre del archivo). */
  mayorista?: string;
  /** Fecha de corte: las listas del mismo corte se comparan entre sí. */
  fechaCorte: string;
  /** true/false = la persona dijo si los precios traen IVA; undefined = lo que se detecte. */
  ivaIncluido?: boolean;
  usuario?: string | null;
}

export interface ResultadoCarga {
  archivo: string;
  cargas: { id: number; mayorista: string; fecha: string; productos: number; reemplazo: boolean }[];
  ordenada: boolean;
  productos: number;
  desdeMemoria: number;
  pendientes: number;
  descartes: { sinPrecio: number; sinStock: number; duplicados: number; copias: number };
  ivaIncluido: boolean;
  fechaLista: string | null;
  avisos: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function cargarArchivo(buffer: Buffer, archivo: string, op: OpcionesCarga): Promise<ResultadoCarga> {
  const sha = createHash("sha256").update(buffer).digest("hex");
  const { marcas, mayoristas } = await marcasYMayoristas();
  const marcasConocidas = new Set([...MARCAS_BASE, ...marcas.map((m) => norm(m).trim())].filter(Boolean));
  const lista = leerLista(buffer, archivo, { marcasConocidas, mayoristasConocidos: mayoristas });
  const res: ResultadoCarga = {
    archivo,
    cargas: [],
    ordenada: lista.ordenada,
    productos: 0,
    desdeMemoria: 0,
    pendientes: 0,
    descartes: lista.descartes,
    ivaIncluido: lista.ivaIncluido,
    fechaLista: lista.fechaLista,
    avisos: [...lista.avisos],
  };

  // ---- Ya ordenada: entra tal cual ----
  if (lista.ordenada) {
    const grupos = new Map<string, FilaMercado[]>();
    for (const f of lista.ordenadas) {
      const k = `${f.mayorista}|${f.fecha}`;
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k)!.push({
        codigo: f.codigo,
        marca: f.marca,
        marcaDeLista: true,
        categoria: f.categoria,
        subcategoria: f.subcategoria,
        confianza: f.confianza,
        observaciones: f.observaciones,
        mayorista: f.mayorista,
        fecha: f.fecha,
        pvp: f.pvp,
        descripcion: f.descripcion,
        linea: "",
        clave: claveDe(f.descripcion),
        origen: "lista",
        pendiente: false,
      });
    }
    // La memoria aprende de la lista ordenada (sin pisar lo corregido a mano).
    const memoria = new Map<string, any>();
    for (const filas of grupos.values())
      for (const f of filas) memoria.set(f.clave, { ...f, origen: "lista" });
    await guardarMemoria([...memoria.values()], op.usuario || undefined);
    for (const [k, filas] of grupos) {
      const [mayorista, fecha] = k.split("|");
      const c = await crearCarga(
        {
          mayorista,
          fecha_corte: fecha,
          fecha_lista: fecha,
          archivo,
          archivo_sha: sha,
          ordenada: true,
          estado: "lista",
          resumen: { descartes: lista.descartes, avisos: [] },
          creado_por: op.usuario || null,
        },
        filas,
      );
      await cerrarCarga(c.id);
      res.cargas.push({ id: c.id, mayorista, fecha, productos: filas.length, reemplazo: c.reemplazo });
      res.productos += filas.length;
    }
    return res;
  }

  // ---- Lista desordenada ----
  const mayorista = norm(op.mayorista || lista.mayoristaSugerido).replace(/\s+/g, " ").trim();
  if (!mayorista) throw new Error(`No se pudo saber de qué mayorista es "${archivo}": escríbelo.`);
  if (!lista.filas.length) throw new Error(`"${archivo}" no trae productos con precio.`);

  // IVA: si la persona lo indicó distinto a lo detectado, se corrige.
  let factor = 1;
  if (op.ivaIncluido === true && !lista.ivaIncluido) factor = 1 / (1 + IVA_VE);
  if (op.ivaIncluido === false && lista.ivaIncluido) factor = 1 + IVA_VE;
  if (factor !== 1) {
    res.ivaIncluido = !!op.ivaIncluido;
    res.avisos = res.avisos.filter((a) => !/IVA/.test(a));
    if (op.ivaIncluido) res.avisos.push("Indicaste que los precios traen IVA: se les quitó el 16 %.");
  }

  const filas = lista.filas.map((f) => ({
    ...f,
    pvp: r2(f.pvp * factor),
    descripcionFinal: f.modelo && !norm(f.descripcion).includes(norm(f.modelo)) ? `${f.descripcion} [Modelo: ${f.modelo}]` : f.descripcion,
    clave: claveDe(f.descripcion),
  }));
  const memoria = await leerMemoria(filas.map((f) => f.clave));
  const filasMercado: FilaMercado[] = filas.map((f) => {
    const m = memoria.get(f.clave);
    if (m) res.desdeMemoria++;
    else res.pendientes++;
    return {
      codigo: f.codigo,
      marca: f.marcaDeLista ? f.marca : m?.marca || f.marca,
      marcaDeLista: f.marcaDeLista,
      categoria: m?.categoria || "",
      subcategoria: m?.subcategoria || "",
      confianza: m?.confianza ?? 0,
      observaciones: m?.observaciones || "",
      mayorista,
      fecha: op.fechaCorte,
      pvp: f.pvp,
      descripcion: f.descripcionFinal,
      linea: f.linea,
      clave: f.clave,
      origen: m ? "memoria" : "",
      pendiente: !m,
    };
  });
  res.productos = filasMercado.length;
  const c = await crearCarga(
    {
      mayorista,
      fecha_corte: op.fechaCorte,
      fecha_lista: lista.fechaLista,
      archivo,
      archivo_sha: sha,
      ordenada: false,
      estado: res.pendientes ? "clasificando" : "lista",
      resumen: { descartes: lista.descartes, avisos: res.avisos, ivaIncluido: res.ivaIncluido, desdeMemoria: res.desdeMemoria, hojas: lista.hojas.length },
      creado_por: op.usuario || null,
    },
    filasMercado,
  );
  res.cargas.push({ id: c.id, mayorista, fecha: op.fechaCorte, productos: filasMercado.length, reemplazo: c.reemplazo });
  if (res.pendientes) iniciarClasificacion(op.usuario || undefined);
  else await cerrarCarga(c.id);
  return res;
}
