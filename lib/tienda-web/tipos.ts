/**
 * Tienda web pública (odoo/landing): reglas puras para pasar lo de Odoo a lo que muestra la página.
 * Sin Odoo ni base de datos; chequeo: `node scripts/check-tienda-web.cjs`.
 *
 * Nada de aquí lleva precios, costos ni cantidades: la página es pública y solo dice
 * «Disponible» o «Agotado» (decisión de nov-2026).
 */

/** Sede de la página → compañía de Odoo (la del almacén principal que da la existencia). */
export const SEDES_TIENDA: Record<string, number> = { valencia: 9, caracas: 10, panama: 7 };

/** Categoría de Odoo (`categ_id`) → categoría de la página (las de `odoo/landing/datos.js`). */
const CATEGORIA_ODOO: Record<string, string> = {
  IMPRESORA: "impresion",
  CONSUMIBLES: "consumibles",
  PAPELERIA: "consumibles",
  LAPTOP: "computo",
  "LAPTOP CORPORATIVA": "computo",
  "PC CORPORATIVA": "computo",
  "MINI PC": "computo",
  MONITORES: "computo",
  TABLET: "computo",
  PROYECTORES: "computo",
  "COMPONENTES / COMPUTACION": "computo",
  "OPCIONES CORPORATIVAS": "computo",
  "PERIFERICOS DE COMPUTACION": "perifericos",
  ALMACENAMIENTO: "perifericos",
  "BOLSOS Y MOCHILAS": "perifericos",
  "VIDEO JUEGOS Y ACCESORIOS": "perifericos",
  ROUTERING: "redes",
  SONIDO: "audio",
  AUDIFONO: "audio",
  CAMARAS: "seguridad",
  DOMOTICA: "seguridad",
  "UPS Y REGULADORES": "energia",
};
/** Lo que no está en el mapa (GENERAL, MOBILIARIO, JUGUETES…). */
export const CATEGORIA_OTROS = "otros";

export function categoriaDe(categOdoo: string | null | undefined): string {
  const clave = String(categOdoo || "").trim().toUpperCase().replace(/\s+/g, " ");
  // «All / Saleable / X» → X
  const ultima = clave.split(" / ").length > 1 && !CATEGORIA_ODOO[clave] ? clave.split(" / ").pop()! : clave;
  return CATEGORIA_ODOO[clave] || CATEGORIA_ODOO[ultima] || CATEGORIA_OTROS;
}

/* ------------------------------------------------------------------ Marca */
// Como se escriben en la página (los logos y los productos de datos.js); en Odoo vienen en mayúsculas.
const MARCAS: Record<string, string> = {
  HP: "HP", HAVIT: "Havit", CANON: "Canon", "TP-LINK": "TP-Link", TPLINK: "TP-Link", LOGITECH: "Logitech", EPSON: "Epson",
  KINGSTON: "Kingston", NEXXT: "Nexxt", "NEXXT HOME": "Nexxt", "NEXXT SOLUTIONS": "Nexxt", TARGUS: "Targus", EZVIZ: "EZVIZ",
  ASUS: "ASUS", ACER: "Acer", AOC: "AOC", HIKVISION: "Hikvision", LINKSYS: "Linksys", FORZA: "Forza", BLUETTI: "Bluetti",
  BROTHER: "Brother", XEROX: "Xerox", APC: "APC", LENOVO: "Lenovo", ADATA: "ADATA", XTECH: "Xtech", MERCUSYS: "Mercusys",
  "KLIP XTREME": "Klip Xtreme", DELL: "Dell", SAMSUNG: "Samsung", LG: "LG", JBL: "JBL", SONY: "Sony", XIAOMI: "Xiaomi",
  MSI: "MSI", GIGABYTE: "Gigabyte", "WESTERN DIGITAL": "Western Digital", WD: "WD", SEAGATE: "Seagate", SANDISK: "SanDisk",
  CRUCIAL: "Crucial", BENQ: "BenQ", VIEWSONIC: "ViewSonic", DAHUA: "Dahua", UBIQUITI: "Ubiquiti", MIKROTIK: "MikroTik",
  "D-LINK": "D-Link", CISCO: "Cisco", RICOH: "Ricoh", KYOCERA: "Kyocera", LEXMARK: "Lexmark", PANTUM: "Pantum",
};
export function marcaBonita(nombre: string | null | undefined): string {
  const limpio = String(nombre || "").replace(/\s+/g, " ").trim();
  if (!limpio || /^sin marca$/i.test(limpio)) return "";
  const clave = limpio.toUpperCase();
  if (MARCAS[clave]) return MARCAS[clave];
  if (limpio !== clave) return limpio; // ya viene con mayúsculas y minúsculas
  return clave.split(" ").map((p) => (p.length <= 3 ? p : p.charAt(0) + p.slice(1).toLowerCase())).join(" ");
}

/* ------------------------------------------------------------------ Nombre */
// Siglas y unidades que van en mayúsculas.
const SIGLAS = new Set([
  "USB", "HDMI", "LED", "RGB", "SSD", "HDD", "UPS", "PTZ", "POE", "NVR", "DVR", "IP", "HD", "FHD", "UHD", "QHD", "LCD",
  "IPS", "VA", "AC", "AX", "DC", "GB", "TB", "MB", "MP", "AAA", "AA", "PC", "CPU", "GPU", "RAM", "NVME", "SATA", "LAN",
  "WAN", "SFP", "VGA", "DP", "OEM", "XL", "NFC", "GPS", "TV", "CCTV", "ID", "II", "III", "IV", "XP", "MM", "CM", "OLED",
  "PIXMA", "VIGI", "OMADA", "ATX", "ITX", "PCIE", "LTE", "SIM", "SD", "UV", "BT", "ANC", "ENC", "TWS", "DPI",
  "W", "V", "MAH", "WH", "KVA", "VAC", "AIO", "A4", "A3", "PDF", "ISO", "IP65", "IP66", "IP67", "NEMA",
]);
// Palabras que en Odoo vienen sin tilde.
const TILDES: Record<string, string> = {
  AUDIFONO: "Audífono", AUDIFONOS: "Audífonos", CAMARA: "Cámara", CAMARAS: "Cámaras", BATERIA: "Batería",
  BATERIAS: "Baterías", INALAMBRICO: "Inalámbrico", INALAMBRICOS: "Inalámbricos", INALAMBRICA: "Inalámbrica",
  INALAMBRICAS: "Inalámbricas", LAMPARA: "Lámpara", TELEFONO: "Teléfono", ESTACION: "Estación", ENERGIA: "Energía",
  PORTATIL: "Portátil", PORTATILES: "Portátiles", TONER: "Tóner", PROTECCION: "Protección", CONEXION: "Conexión",
  MULTIFUNCION: "Multifunción", MICROFONO: "Micrófono", RATON: "Ratón", ELECTRICA: "Eléctrica", ELECTRICO: "Eléctrico",
  OPTICO: "Óptico", OPTICA: "Óptica", ERGONOMICO: "Ergonómico", MECANICO: "Mecánico", AUTOMATICO: "Automático",
  CATEGORIA: "Categoría", VIDEOCAMARA: "Videocámara", MAQUINA: "Máquina", DIGITAL: "Digital", ALAMBRICO: "Alámbrico",
  ACCESORIOS: "Accesorios", TECNOLOGIA: "Tecnología", PAGINAS: "Páginas", ESTEREO: "Estéreo", MOVIL: "Móvil",
};
const ESPECIALES: Record<string, string> = {
  WIFI: "WiFi", "WI-FI": "Wi-Fi", BLUETOOTH: "Bluetooth", "TP-LINK": "TP-Link", GAMER: "Gamer", "USB-C": "USB-C",
  "TYPE-C": "Tipo C", MICROSD: "microSD", ECOTANK: "EcoTank", "SMART TANK": "Smart Tank", ETHERNET: "Ethernet", ANDROID: "Android", WINDOWS: "Windows", IPHONE: "iPhone",
};
const MINUSCULAS = new Set(["DE", "DEL", "CON", "Y", "O", "PARA", "EL", "LA", "LOS", "LAS", "EN", "SIN", "POR", "AL", "A", "E", "U"]);

function palabraBonita(palabra: string, primera: boolean): string {
  if (/[a-záéíóúñ]/.test(palabra)) return palabra; // ya tiene minúsculas: se deja como está
  const m = palabra.match(/^([^A-ZÁÉÍÓÚÑ0-9]*)(.*?)([^A-ZÁÉÍÓÚÑ0-9]*)$/);
  if (!m || !m[2]) return palabra;
  const [, antes, nucleo, despues] = m;
  let nuevo: string;
  if (ESPECIALES[nucleo]) nuevo = ESPECIALES[nucleo];
  else if (/\d/.test(nucleo)) nuevo = nucleo; // modelos y medidas: G4170, AX1800, 16GB
  else if (SIGLAS.has(nucleo)) nuevo = nucleo;
  else if (TILDES[nucleo]) nuevo = TILDES[nucleo];
  else if (!primera && MINUSCULAS.has(nucleo)) nuevo = nucleo.toLowerCase();
  else if (nucleo.length <= 2) nuevo = nucleo;
  else nuevo = nucleo.charAt(0) + nucleo.slice(1).toLowerCase();
  if (primera && nuevo === nuevo.toLowerCase()) nuevo = nuevo.charAt(0).toUpperCase() + nuevo.slice(1);
  return antes + nuevo + despues;
}

/**
 * Nombre de Odoo legible: sin la marca al principio (la página la muestra aparte), sin espacios de
 * más y sin todo en mayúsculas. «CANON IMPRESORA PIXMA G4170 -  MULTIFUNCIONAL, T. TINTA, WIFI»
 * → «Impresora PIXMA G4170 - Multifuncional, T. Tinta, WiFi».
 */
export function nombreBonito(nombre: string | null | undefined, marca = ""): string {
  let n = String(nombre || "").replace(/\s+/g, " ").trim();
  const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  if (marca) {
    const m = sinAcentos(marca);
    for (const prefijo of [m, m.replace(/-/g, " "), m.replace(/\s+/g, "")]) {
      if (sinAcentos(n).startsWith(`${prefijo} `)) { n = n.slice(prefijo.length + 1).trim(); break; }
    }
  }
  n = n.replace(/^[-–:,\s]+/, "").replace(/\s*[-–]\s*$/, "").replace(/\s+([,.;])/g, "$1");
  const palabras = n.split(" ");
  const bonito = palabras.map((p, i) => palabraBonita(p, i === 0)).join(" ");
  return bonito || String(nombre || "").trim();
}

/* ------------------------------------------------------------------ Descripción */
const ENTIDADES: Record<string, string> = { "&nbsp;": " ", "&amp;": "&", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&lt;": "<", "&gt;": ">" };
/** HTML → texto plano en una línea. */
export function textoPlano(html: string | null | undefined): string {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(nbsp|amp|quot|#39|apos|lt|gt);/g, (e) => ENTIDADES[e] ?? " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

/** Corta un texto largo en el último fin de oración (o palabra) antes del tope. */
export function recortar(texto: string, tope: number): string {
  if (texto.length <= tope) return texto;
  const corte = texto.slice(0, tope);
  const punto = corte.lastIndexOf(". ");
  if (punto > tope * 0.5) return corte.slice(0, punto + 1);
  return `${corte.slice(0, corte.lastIndexOf(" ")).replace(/[,;:]$/, "")}…`;
}

const elementos = (html: string, etiqueta: string) =>
  html.split(new RegExp(`<${etiqueta}(?:\\s[^>]*)?>`, "i")).slice(1).map((t) => t.split(new RegExp(`</${etiqueta}>`, "i"))[0]);

export interface DescripcionTienda {
  resumen: string;
  puntos: string[];
}

/**
 * Lo que dice Odoo del producto: `description_ecommerce` (resumen corto) y `website_description`
 * (la descripción larga de la ficha). Viñetas: las <li> de la larga; si no tiene, sus párrafos
 * «Clave: valor»; si no, las <li> del resumen. Hasta 10, sin repetidas.
 */
export function limpiarDescripcion(ecommerce: string | null | undefined, sitio: string | null | undefined, tope = 10): DescripcionTienda {
  const e = String(ecommerce || "");
  const w = String(sitio || "");
  const fuentes = [
    elementos(w, "li"),
    elementos(w, "p").filter((p) => /^[^<:]{2,40}:[^<]{1,160}$/.test(textoPlano(p))),
    elementos(e, "li"),
  ];
  const vistos = new Set<string>();
  const puntos: string[] = [];
  for (const lista of fuentes) {
    const limpios = lista.map(textoPlano).filter((t) => t.length > 1);
    if (!limpios.length) continue;
    for (const t of limpios) {
      const clave = t.toLowerCase().replace(/[^a-z0-9áéíóúñ]/g, "");
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      puntos.push(recortar(t, 220));
      if (puntos.length >= tope) break;
    }
    break; // una sola fuente: mezclarlas repite lo mismo dicho de otra forma
  }
  const resumen = recortar(textoPlano(e.replace(/<ul[\s\S]*?<\/ul>/gi, " ")), 420);
  // Un resumen que es solo el nombre del producto (pasa) no aporta.
  return { resumen: resumen.length >= 40 ? resumen : "", puntos };
}
