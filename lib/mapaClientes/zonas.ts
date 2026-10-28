/**
 * Zonas del Mapa de clientes del Diseñador: qué país ve cada sede y cómo se
 * cruzan los estados de Odoo con los del geojson (`public/geojson/*`).
 *
 * Sin dependencias del servidor: lo usan la API (lib/mapaClientes/conteoClientes)
 * y la pantalla (para pintar el geojson con la misma clave).
 */

export type PaisMapa = "VE" | "PA";

export const PAISES_MAPA: Record<PaisMapa, { nombre: string; companias: number[]; geojson: string }> = {
  // Valencia y Caracas ven Venezuela entera: las dos sedes juntas.
  VE: { nombre: "Venezuela", companias: [9, 10], geojson: "/geojson/venezuela.geojson" },
  PA: { nombre: "Panamá", companias: [7], geojson: "/geojson/panama.geojson" },
};

/** País que ve una sede (`cids` del token). null = sede desconocida. */
export function paisDeSede(cids: unknown): PaisMapa | null {
  const id = Number(cids);
  for (const [pais, datos] of Object.entries(PAISES_MAPA) as [PaisMapa, (typeof PAISES_MAPA)[PaisMapa]][]) {
    if (datos.companias.includes(id)) return pais;
  }
  return null;
}

/**
 * Las zonas que se dibujan, por clave, con el nombre que se muestra. La clave
 * sale de `claveZona()` sobre el nombre del geojson (Natural Earth): "Vargas"
 * es La Guaira y "Panama" incluye Panamá Oeste, que el geojson no separa.
 */
export const ZONAS_MAPA: Record<PaisMapa, Record<string, string>> = {
  VE: {
    AMAZONAS: "Amazonas",
    ANZOATEGUI: "Anzoátegui",
    APURE: "Apure",
    ARAGUA: "Aragua",
    BARINAS: "Barinas",
    BOLIVAR: "Bolívar",
    CARABOBO: "Carabobo",
    COJEDES: "Cojedes",
    "DELTA AMACURO": "Delta Amacuro",
    "DISTRITO CAPITAL": "Distrito Capital",
    FALCON: "Falcón",
    GUARICO: "Guárico",
    VARGAS: "La Guaira",
    LARA: "Lara",
    MERIDA: "Mérida",
    MIRANDA: "Miranda",
    MONAGAS: "Monagas",
    "NUEVA ESPARTA": "Nueva Esparta",
    PORTUGUESA: "Portuguesa",
    SUCRE: "Sucre",
    TACHIRA: "Táchira",
    TRUJILLO: "Trujillo",
    YARACUY: "Yaracuy",
    ZULIA: "Zulia",
    "DEPENDENCIAS FEDERALES": "Dependencias Federales",
  },
  PA: {
    "BOCAS DEL TORO": "Bocas del Toro",
    CHIRIQUI: "Chiriquí",
    COCLE: "Coclé",
    COLON: "Colón",
    DARIEN: "Darién",
    HERRERA: "Herrera",
    "LOS SANTOS": "Los Santos",
    PANAMA: "Panamá y Panamá Oeste",
    VERAGUAS: "Veraguas",
    "KUNA YALA": "Guna Yala",
    EMBERA: "Emberá-Wounaan",
    "NGOBE BUGLE": "Ngäbe-Buglé",
  },
};

/** Nombres que en Odoo (o en el geojson) se escriben distinto. */
const ALIAS: Record<string, string> = {
  "DTTO CAPITAL": "DISTRITO CAPITAL",
  "DISTRITO FEDERAL": "DISTRITO CAPITAL",
  "LA GUAIRA": "VARGAS",
  "CIUDAD DE PANAMA": "PANAMA",
  "PANAMA OESTE": "PANAMA",
  "GUNA YALA": "KUNA YALA",
  "NGABE BUGLE": "NGOBE BUGLE",
  "EMBERA WOUNAAN": "EMBERA",
};

/** Mayúsculas, sin acentos ni signos y con un solo espacio. */
export function normalizarTexto(texto: unknown): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/**
 * Clave de un estado: "Bolívar (VE)", "BOLIVAR" y "Bolivar (EC)" (en Odoo hay
 * clientes de Venezuela con el estado de otro país) dan "BOLIVAR".
 */
export function claveZona(nombre: unknown): string {
  const limpio = normalizarTexto(String(nombre ?? "").replace(/\(.*?\)/g, " "))
    .replace(/^(ESTADO|PROVINCIA DE|PROVINCIA|COMARCA)\s+/, "");
  return ALIAS[limpio] ?? limpio;
}

export type CiudadConteo = { nombre: string; clientes: number };

export type ZonaConteo = {
  clave: string;
  nombre: string;
  clientes: number;
  /** Las ciudades con más clientes de la zona (solo cantidades). */
  ciudades: CiudadConteo[];
  /** Clientes de ciudades que no entraron en `ciudades`. */
  otras_ciudades: number;
  /** Clientes sin ciudad en Odoo (o con el nombre del estado como ciudad). */
  sin_ciudad: number;
};

/** Lo único que devuelve la API: cantidades, nunca clientes. */
export type MapaClientesRespuesta = {
  pais: PaisMapa;
  nombre_pais: string;
  total: number;
  /** Clientes sin estado en Odoo o con uno que no es del país. */
  sin_ubicar: number;
  zonas: ZonaConteo[];
  /** Solo el SuperAdmin cambia de país; los demás ven el de su sede. */
  puede_elegir_pais: boolean;
  actualizado: string;
};
