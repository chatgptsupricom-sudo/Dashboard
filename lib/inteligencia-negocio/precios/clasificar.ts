import { db } from "@/lib/db";
import { hayIA, pedirJSON } from "@/lib/inteligencia-negocio/clasificacion/ia";
import {
  aplicarClasificacion,
  guardarMemoria,
  leerCarga,
  actualizarCarga,
  nivelDeConfianza,
  type Clasificacion,
  type Pendiente,
} from "@/lib/inteligencia-negocio/precios/datos";
import { CATEGORIAS_PRECIOS, EJEMPLOS_PRECIOS, ESTRUCTURAS_PRECIOS } from "@/lib/inteligencia-negocio/precios/estructuras";
import { clasificarPorReglas } from "@/lib/inteligencia-negocio/precios/reglas";

/**
 * Clasifica los productos de las listas cargadas: categoría (una de las 47
 * del Excel de ejemplo), nombre corto con la estructura de su categoría,
 * marca si la lista no la trae, grado de confianza y observaciones.
 *
 * Primero la memoria (lo ya clasificado no se vuelve a pedir); lo que falta
 * va a la IA en segundo plano (lotes de 40, 3 a la vez, la misma IA de la
 * Clasificación de BI: OpenAI si hay `OPENAI_API_KEY`, si no Claude); si no
 * hay IA o un lote falla, ese lote se clasifica por reglas con confianza baja.
 */

const SISTEMA = `Eres un especialista en estructuración de catálogos para el sector mayorista de tecnología en Venezuela.
Recibes productos de listas de precios de mayoristas (competencia de Supricom): código, marca (puede venir vacía), línea o sección de la lista y la descripción tal como la escribió el mayorista.
Por cada producto devuelves:
- marca: la que trae el producto si coincide con la descripción (a veces se dedujo de la descripción y puede estar mal: corrígela si la descripción dice otra); si viene vacía, la que diga la descripción (en mayúsculas, ej. "TP-LINK", "HP", "GENIUS"). Si la descripción dice genérico o no trae marca: "SIN MARCA IDENTIFICADA". Nunca la inventes.
- categoria: exactamente una de: ${CATEGORIAS_PRECIOS.join(", ")}. "ACCESORIOS VARIOS" solo si no cabe en ninguna otra.
- subcategoria: el nombre corto, sin marca ni modelo, armado con la estructura de su categoría:
${ESTRUCTURAS_PRECIOS.map((e) => `  ${e.categoria}: ${e.estructura}. Ejemplo: ${e.ejemplo}`).join("\n")}
  Usa siempre el mismo orden y la misma forma de escribir para que productos equivalentes de distintos mayoristas queden con el mismo nombre corto ("Core i5", "Ryzen 5", "Core Ultra 7", "16GB", "512GB SSD", "24\\"", "FHD", "100Hz", "Láser Mono", "WiFi 6", "Gigabit"). Omite un atributo que no puedas saber; no pongas "N/D".
- confianza: 1.00 si todos los atributos de la estructura están en la descripción; 0.75 a 0.90 si dedujiste un atributo por el modelo o la referencia, o falta uno; 0.65 o menos si faltan dos o más, o si el tipo de producto fue inferido.
- observaciones: lo que hay que verificar o el dato extra que no entra en el nombre corto, separado por "; " (ej. "Falta: Tipo", "Falta: Potencia", "Pantalla 15.6\\"", "Windows Pro", "Estándar WiFi deducido por clase", "Rendimiento nominal por referencia OEM (compatible); Compatible", "Accesorio; validar compatibilidad de modelo"). "" si no hay nada.
Consumibles: indica Original o Compatible en observaciones; si la descripción no trae el rendimiento, usa el rendimiento nominal ISO de la referencia OEM y dilo en observaciones.
Ejemplos ya revisados (descripción | marca → categoría | nombre corto | confianza | observaciones):
${EJEMPLOS_PRECIOS.map(([d, m, c, s, k, o]) => `  ${d} | ${m} → ${c} | ${s} | ${k} | ${o}`).join("\n")}
Devuelve exactamente un elemento por producto recibido, con su mismo id.`;

const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["productos"],
  properties: {
    productos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "marca", "categoria", "subcategoria", "confianza", "observaciones"],
        properties: {
          id: { type: "integer" },
          marca: { type: "string" },
          categoria: { type: "string", enum: CATEGORIAS_PRECIOS },
          subcategoria: { type: "string" },
          confianza: { type: "number" },
          observaciones: { type: "string" },
        },
      },
    },
  },
};

type Clasificado = Clasificacion & { clave: string; descripcion: string };

async function porIA(lote: Pendiente[]): Promise<Clasificado[]> {
  const r = await pedirJSON<{ productos: any[] }>(
    SISTEMA,
    JSON.stringify(lote.map((p, i) => ({ id: i, codigo: p.codigo, marca: p.marca, linea: p.linea, descripcion: p.descripcion }))),
    ESQUEMA,
    130 * lote.length + 600,
  );
  const out: Clasificado[] = [];
  for (const x of r.productos || []) {
    const p = lote[Number(x.id)];
    if (!p || !String(x.subcategoria || "").trim() || !CATEGORIAS_PRECIOS.includes(x.categoria)) continue;
    out.push({
      clave: p.clave,
      descripcion: p.descripcion,
      marca: String(String(x.marca || "").trim() || p.marca || "SIN MARCA IDENTIFICADA").toUpperCase(),
      categoria: x.categoria,
      subcategoria: String(x.subcategoria).trim(),
      confianza: Math.min(1, Math.max(0, Number(x.confianza) || 0)),
      observaciones: String(x.observaciones || "").trim(),
      origen: "ia",
    });
  }
  return out;
}

function porReglas(lote: Pendiente[]): Clasificado[] {
  return lote.map((p) => ({
    clave: p.clave,
    descripcion: p.descripcion,
    marca: p.marca || "SIN MARCA IDENTIFICADA",
    ...clasificarPorReglas(p.descripcion, p.linea),
    origen: "reglas",
  }));
}

// ---------------------------------------------------------------------------
// Trabajo en segundo plano (uno a la vez para todo el panel)
// ---------------------------------------------------------------------------

export interface EstadoClasificacion {
  corriendo: boolean;
  total: number;
  hechos: number;
  porReglas: number;
  mensaje: string;
}

const estado: EstadoClasificacion = { corriendo: false, total: 0, hechos: 0, porReglas: 0, mensaje: "" };
export const estadoClasificacion = (): EstadoClasificacion => ({ ...estado });

const TAM_LOTE = 40;
const EN_PARALELO = 3;

/**
 * Clasifica todo lo pendiente de las cargas que están clasificando. Si ya
 * hay un trabajo corriendo no hace nada (ese trabajo, al terminar, vuelve a
 * mirar si quedó algo). Devuelve false si ya corría.
 */
export function iniciarClasificacion(usuario?: string): boolean {
  if (estado.corriendo) return false;
  Object.assign(estado, { corriendo: true, total: 0, hechos: 0, porReglas: 0, mensaje: "" });
  void (async () => {
    try {
      for (let vuelta = 0; vuelta < 5; vuelta++) {
        const [filas] = await db.query(
          `SELECT m.id, m.codigo, m.marca, m.descripcion, m.linea, m.clave
             FROM precios_mercado m JOIN precios_cargas c ON c.id = m.carga_id
            WHERE m.pendiente = 1 AND c.estado = 'clasificando'
            ORDER BY m.linea, m.descripcion`,
        );
        // Una vez por descripción: la misma en dos cargas se clasifica una sola vez.
        const porClave = new Map<string, Pendiente>();
        for (const f of filas as any[]) {
          if (!porClave.has(f.clave))
            porClave.set(f.clave, { id: f.id, codigo: f.codigo, marca: f.marca, descripcion: f.descripcion || "", linea: f.linea || "", clave: f.clave });
        }
        const pendientes = [...porClave.values()];
        if (!pendientes.length) break;
        estado.total += pendientes.length;
        const lotes: Pendiente[][] = [];
        for (let i = 0; i < pendientes.length; i += TAM_LOTE) lotes.push(pendientes.slice(i, i + TAM_LOTE));
        let siguiente = 0;
        const conIA = hayIA();
        const trabajador = async () => {
          while (siguiente < lotes.length) {
            const lote = lotes[siguiente++];
            let hechos: Clasificado[] = [];
            if (conIA) {
              try {
                hechos = await porIA(lote);
              } catch (e: any) {
                estado.mensaje = e?.message || "Error de la IA";
                console.error("[precios/clasificar]", estado.mensaje);
              }
            }
            // Lo que la IA no devolvió (o todo, sin IA) va por reglas.
            const listos = new Set(hechos.map((h) => h.clave));
            const faltan = porReglas(lote.filter((p) => !listos.has(p.clave)));
            estado.porReglas += faltan.length;
            const todo = [...hechos, ...faltan];
            await guardarMemoria(todo, usuario);
            await aplicarClasificacion(todo);
            estado.hechos += lote.length;
          }
        };
        await Promise.all(Array.from({ length: Math.min(EN_PARALELO, lotes.length) }, trabajador));
      }
      // Cargas que ya no tienen pendientes: listas, con su resumen.
      const [abiertas] = await db.query(
        `SELECT c.id FROM precios_cargas c WHERE c.estado = 'clasificando'
           AND NOT EXISTS (SELECT 1 FROM precios_mercado m WHERE m.carga_id = c.id AND m.pendiente = 1)`,
      );
      for (const a of abiertas as any[]) await cerrarCarga(Number(a.id));
    } catch (e: any) {
      estado.mensaje = e?.message || "Error clasificando";
      console.error("[precios/clasificar]", e);
    } finally {
      estado.corriendo = false;
    }
  })();
  return true;
}

/** Variación de precio a partir de la cual se avisa en el resumen. */
export const UMBRAL_CAMBIO = 0.15;

/**
 * Cierra una carga: cuenta niveles y origen de la clasificación y compara
 * sus precios con el corte anterior del mismo mayorista (alertas de cambios
 * importantes: ±15 % o más).
 */
export async function cerrarCarga(id: number) {
  const carga = await leerCarga(id);
  if (!carga) return;
  const [filas] = await db.query(
    "SELECT codigo, clave, confianza, origen, pvp, descripcion, subcategoria, categoria FROM precios_mercado WHERE carga_id = ?",
    [id],
  );
  const lista = filas as any[];
  const niveles = { Alto: 0, Medio: 0, Bajo: 0 } as Record<string, number>;
  const origen: Record<string, number> = {};
  const categorias: Record<string, number> = {};
  for (const f of lista) {
    niveles[nivelDeConfianza(Number(f.confianza))]++;
    origen[f.origen || "?"] = (origen[f.origen || "?"] || 0) + 1;
    categorias[f.categoria] = (categorias[f.categoria] || 0) + 1;
  }
  // Corte anterior del mismo mayorista
  const [ant] = await db.query(
    "SELECT MAX(fecha) AS f FROM precios_mercado WHERE mayorista = ? AND fecha < ? AND pendiente = 0",
    [carga.mayorista, carga.fecha_corte],
  );
  const fechaAnt = (ant as any[])[0]?.f;
  const cambios: any[] = [];
  let nuevos = 0;
  let comparables = 0;
  if (fechaAnt) {
    const [prev] = await db.query("SELECT codigo, clave, pvp FROM precios_mercado WHERE mayorista = ? AND fecha = ?", [
      carga.mayorista,
      fechaAnt,
    ]);
    const porClave = new Map<string, number>();
    const porCodigo = new Map<string, number>();
    for (const p of prev as any[]) {
      const v = Number(p.pvp);
      if (!porClave.has(p.clave) || v < porClave.get(p.clave)!) porClave.set(p.clave, v);
      const k = String(p.codigo || "").toUpperCase();
      if (k && (!porCodigo.has(k) || v < porCodigo.get(k)!)) porCodigo.set(k, v);
    }
    for (const f of lista) {
      const antes = porCodigo.get(String(f.codigo || "").toUpperCase()) ?? porClave.get(f.clave);
      if (antes == null) {
        nuevos++;
        continue;
      }
      comparables++;
      const ahora = Number(f.pvp);
      const ch = ahora / antes - 1;
      if (Math.abs(ch) >= UMBRAL_CAMBIO)
        cambios.push({ codigo: f.codigo, producto: f.subcategoria, descripcion: String(f.descripcion || "").slice(0, 140), antes, ahora, cambio: Math.round(ch * 1000) / 1000 });
    }
    cambios.sort((a, b) => Math.abs(b.cambio) - Math.abs(a.cambio));
  }
  const fa = fechaAnt instanceof Date ? fechaAnt.toISOString().slice(0, 10) : fechaAnt ? String(fechaAnt).slice(0, 10) : null;
  await actualizarCarga(id, {
    estado: "lista",
    resumen: {
      ...(carga.resumen || {}),
      productos: lista.length,
      niveles,
      origen,
      categorias,
      corteAnterior: fa,
      comparables,
      nuevos: fechaAnt ? nuevos : null,
      subieron: cambios.filter((c) => c.cambio > 0).length,
      bajaron: cambios.filter((c) => c.cambio < 0).length,
      cambios: cambios.slice(0, 25),
    },
  });
}
