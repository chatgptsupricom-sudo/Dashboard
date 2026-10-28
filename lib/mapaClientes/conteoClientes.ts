import { callOdooRPCEstricto } from "@/lib/odoo";
import { partnersIntercompania } from "@/lib/intercompania";
import {
  PAISES_MAPA,
  ZONAS_MAPA,
  claveZona,
  normalizarTexto,
  type MapaClientesRespuesta,
  type PaisMapa,
  type ZonaConteo,
} from "@/lib/mapaClientes/zonas";

/**
 * Cantidad de clientes por estado y ciudad para el Mapa de clientes del
 * Diseñador. Lee de Odoo los datos mínimos para ubicar a cada cliente (RIF
 * solo para no contarlo dos veces, estado y ciudad) y devuelve únicamente los
 * conteos: ni nombres, ni RIF, ni montos salen de aquí.
 *
 * Cliente = empresa (`is_company`) con `customer_rank > 0` de las sedes del
 * país, sin intercompañía. A diferencia del mapa de Gerencia de Ventas no
 * cuenta a los proveedores. En Venezuela un cliente que está en Valencia y
 * en Caracas (mismo RIF) cuenta una vez.
 */

/** Ciudades que se devuelven por zona; el resto va en `otras_ciudades`. */
const MAX_CIUDADES = 12;
const VIGENCIA_MS = 10 * 60 * 1000;

const cache = new Map<PaisMapa, { vence: number; valor: Promise<MapaClientesRespuesta> }>();

/** `puede_elegir_pais` va en false: lo pone la ruta según la sesión. */
export function contarClientesPorZona(pais: PaisMapa): Promise<MapaClientesRespuesta> {
  const guardado = cache.get(pais);
  if (guardado && guardado.vence > Date.now()) return guardado.valor;
  const valor = leer(pais);
  const entrada = { vence: Date.now() + VIGENCIA_MS, valor };
  cache.set(pais, entrada);
  valor.catch(() => {
    if (cache.get(pais) === entrada) cache.delete(pais);
  });
  return valor;
}

async function leer(pais: PaisMapa): Promise<MapaClientesRespuesta> {
  const { nombre, companias } = PAISES_MAPA[pais];
  const intercompania = await partnersIntercompania();
  const partners =
    (await callOdooRPCEstricto<any[]>("res.partner", "search_read", [
      [
        ["is_company", "=", true],
        ["customer_rank", ">", 0],
        ["company_id", "in", companias],
        ["country_id.code", "=", pais],
        ["id", "not in", [...intercompania.keys()]],
      ],
    ], { fields: ["vat", "state_id", "city"], limit: 0 })) || [];

  const zonasDelPais = ZONAS_MAPA[pais];
  const vistos = new Set<string>();
  const porZona = new Map<string, { clientes: number; sinCiudad: number; ciudades: Map<string, Map<string, number>> }>();
  let total = 0;
  let sinUbicar = 0;

  for (const p of partners) {
    const rif = normalizarTexto(p.vat).replace(/ /g, "");
    const llave = rif.length >= 5 ? `rif:${rif}` : `id:${p.id}`;
    if (vistos.has(llave)) continue;
    vistos.add(llave);
    total += 1;

    const clave = p.state_id ? claveZona(p.state_id[1]) : "";
    if (!clave || !zonasDelPais[clave]) {
      sinUbicar += 1;
      continue;
    }
    let zona = porZona.get(clave);
    if (!zona) {
      zona = { clientes: 0, sinCiudad: 0, ciudades: new Map() };
      porZona.set(clave, zona);
    }
    zona.clientes += 1;

    // La ciudad es texto libre: se agrupa sin mayúsculas ni acentos y se
    // muestra como la escribió la mayoría. "Carabobo" en Carabobo no es ciudad.
    const original = String(p.city || "").replace(/\s+/g, " ").trim();
    const claveCiudad = normalizarTexto(original);
    if (!claveCiudad || claveZona(original) === clave || claveCiudad === normalizarTexto(nombre)) {
      zona.sinCiudad += 1;
      continue;
    }
    const escrituras = zona.ciudades.get(claveCiudad) ?? new Map<string, number>();
    escrituras.set(original, (escrituras.get(original) ?? 0) + 1);
    zona.ciudades.set(claveCiudad, escrituras);
  }

  const zonas: ZonaConteo[] = Object.entries(zonasDelPais).map(([clave, nombreZona]) => {
    const zona = porZona.get(clave);
    const ciudades = [...(zona?.ciudades.values() ?? [])]
      .map((escrituras) => {
        let clientes = 0;
        let comun = "";
        let maximo = 0;
        for (const [texto, n] of escrituras) {
          clientes += n;
          if (n > maximo) [comun, maximo] = [texto, n];
        }
        return { nombre: capitalizar(comun), clientes };
      })
      .sort((a, b) => b.clientes - a.clientes || a.nombre.localeCompare(b.nombre, "es"));
    const visibles = ciudades.slice(0, MAX_CIUDADES);
    return {
      clave,
      nombre: nombreZona,
      clientes: zona?.clientes ?? 0,
      ciudades: visibles,
      otras_ciudades: ciudades.slice(MAX_CIUDADES).reduce((s, c) => s + c.clientes, 0),
      sin_ciudad: zona?.sinCiudad ?? 0,
    };
  });
  zonas.sort((a, b) => b.clientes - a.clientes || a.nombre.localeCompare(b.nombre, "es"));

  return {
    pais,
    nombre_pais: nombre,
    total,
    sin_ubicar: sinUbicar,
    zonas,
    puede_elegir_pais: false,
    actualizado: new Date().toISOString(),
  };
}

/** "VALENCIA" / "valencia" → "Valencia"; respeta "de", "del", "la"… */
function capitalizar(texto: string): string {
  return texto
    .toLocaleLowerCase("es")
    .split(" ")
    .map((p, i) => (i > 0 && /^(de|del|la|las|los|el|y)$/.test(p) ? p : p.charAt(0).toLocaleUpperCase("es") + p.slice(1)))
    .join(" ");
}
