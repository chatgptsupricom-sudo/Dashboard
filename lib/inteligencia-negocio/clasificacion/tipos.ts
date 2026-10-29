/**
 * Clasificación de Inteligencia de Negocio (desplegable "Clasificación"):
 * productos, clientes y marcas. Sin dependencias de servidor: lo importan
 * también las pantallas.
 *
 * Productos: el formato del Excel "Ejemplo de Categorizacion" (oct-2026):
 * categoría + un nombre corto armado con la estructura de su categoría,
 * con grado de confianza y observaciones para verificar.
 */

/** Estructuras del nombre corto por categoría, tal cual el Excel de ejemplo. */
export const ESTRUCTURAS: { categoria: string; estructura: string; ejemplo: string }[] = [
  { categoria: "LAPTOP", estructura: "Laptop + Procesador (familia) + RAM + Almacenamiento (+ GPU si es Gamer)", ejemplo: "Laptop Ryzen 7 16GB 512GB SSD" },
  { categoria: "AIO", estructura: "AIO + Pulgadas + Procesador + RAM + Almacenamiento", ejemplo: 'AIO 27" Ryzen 5 16GB 512GB SSD' },
  { categoria: "PC CORPORATIVA", estructura: "PC Corporativa + Procesador + RAM + Almacenamiento", ejemplo: "PC Corporativa Core i7 16GB 512GB SSD" },
  {
    categoria: "IMPRESORA",
    estructura: "Impresora + Función (Multifuncional / Solo Impresión) + Tipo (Tinta Continua, Láser Mono, Láser Color, Inyección, Sublimación, Matriz de Punto)",
    ejemplo: "Impresora Multifuncional Tinta Continua",
  },
  { categoria: "MONITORES", estructura: "Monitor + Pulgadas + Resolución + Frecuencia + Panel", ejemplo: 'Monitor 27" QHD 180Hz IPS' },
  { categoria: "ALMACENAMIENTO", estructura: "Tipo + Formato/Interfaz + Capacidad + Velocidad", ejemplo: "SSD M.2 NVMe 1TB 6000MB/s" },
  { categoria: "ROUTERING", estructura: "Router + Estándar WiFi + Velocidad + Puertos", ejemplo: "Router WiFi 6 AX1800 Gigabit" },
  { categoria: "UPS Y REGULADORES", estructura: "UPS: VA + W + salidas / Estación de energía: W + Wh", ejemplo: "UPS Interactivo 1000VA 500W 6 Salidas" },
  { categoria: "CONSUMIBLES", estructura: "Tipo + Color + Rendimiento en impresiones", ejemplo: "Tóner Negro Rendimiento de 1500 impresiones" },
  { categoria: "PAPELERIA", estructura: "Papel + Tamaño + Presentación + Gramaje/Base", ejemplo: "Papel Carta Resma 500 hojas Base 20" },
];

/** Las categorías sin estructura en el Excel usan esta. */
export const ESTRUCTURA_GENERAL = "Tipo de producto + 1 a 3 características que lo distinguen (sin marca ni modelo)";

export type Nivel = "Alto" | "Medio" | "Bajo";

/**
 * Nivel del Excel: Alto 100 % = datos completos en el nombre; Medio 75-90 %
 * = completado por el modelo; Bajo < 70 % = inferido o asumido.
 */
export function nivelDeConfianza(confianza: number): Nivel {
  if (confianza >= 0.95) return "Alto";
  if (confianza >= 0.7) return "Medio";
  return "Bajo";
}

export type Origen = "ia" | "manual";

export interface ProductoClasificado {
  id: number;
  codigo: string;
  producto: string;
  marca: string;
  /** Categoría de Odoo (`categ_id`). */
  categoriaOdoo: string;
  /** null = todavía sin clasificar. */
  categoria: string | null;
  subcategoria: string | null;
  confianza: number | null;
  nivel: Nivel | null;
  observaciones: string;
  origen: Origen | null;
}

/**
 * Actividad comercial de un cliente con su criterio, tal cual el prompt de
 * Compras ("PROMT.docx", oct-2026). Lo usan la IA y la pantalla.
 */
export const CRITERIOS_ACTIVIDAD = {
  Distribuidor: "Revende al mayor o le suple a empresas y al gobierno, sin tienda al público.",
  "Tienda de computación y tecnología": "Venta al detal de equipos, laptops, impresoras, UPS y accesorios (incluye gamer y cyber).",
  "Celulares y electrónica de consumo": "Tiendas de celulares, accesorios móviles y electrónica.",
  "Energía y respaldo":
    "Venta e instalación de sistemas de alimentación ininterrumpida (UPS), inversores, baterías, reguladores de voltaje, plantas eléctricas y soluciones de protección eléctrica.",
  "Consumibles, impresión y copiado": "Tintas, tóner, recarga de cartuchos, centros de copiado, imprentas y publicidad.",
  Corporativo: "Empresa de otro rubro que compra para su propio uso.",
  "Papelería y librería": "Papelerías, librerías y tiendas de suministros de oficina al detal.",
  "Integrador / servicios de IT": "Soluciones, redes, seguridad electrónica, soporte y proyectos para empresas.",
  "Seguridad electrónica / cámaras":
    "Venta, instalación y mantenimiento de sistemas de videovigilancia (CCTV), cámaras IP, controles de acceso, alarmas, cercos eléctricos y automatización.",
  "Hogar, electrodomésticos y multitienda": "Electrodomésticos, variedades, bazares y multitiendas.",
  "Persona natural sin RIF": "Empleados de Supricom (correo @supricom.com.ve en Odoo); no son clientes de la calle.",
  "Registro interno (no es cliente)": "Fichas de Odoo que no son un cliente real (ej. donativos).",
  "Personal de Supricom (compra interna)": "Fila sin RIF que no se encontró en Odoo como cliente.",
  "Telecomunicaciones / ISP": "Proveedores de internet, cable y telecomunicaciones.",
  "Ferretería y materiales de construcción":
    "Venta al detal o al mayor de herramientas, materiales eléctricos, plomería, pintura, cerrajería y artículos de ferretería en general.",
} as const;
export type Actividad = keyof typeof CRITERIOS_ACTIVIDAD;
export const ACTIVIDADES = Object.keys(CRITERIOS_ACTIVIDAD) as Actividad[];

/**
 * Confianza de la clasificación de un cliente según el prompt de Compras.
 * Se guarda como número para que `nivelDeConfianza` dé Alto / Medio / Bajo.
 */
export const CONFIANZA_CLIENTE = { Alta: 1, Media: 0.8, Baja: 0.5 } as const;

export interface ParticipacionCompra {
  nombre: string;
  /** % de lo que el cliente compró en el período. */
  pct: number;
}

export interface ClienteClasificado {
  id: number;
  rif: string;
  cliente: string;
  zona: string;
  ventas: number;
  /** Mezcla de lo comprado en el período, por categoría (las principales). */
  categorias: ParticipacionCompra[];
  /** Mezcla por nombre corto de producto (las principales); vacío si sus productos no están clasificados. */
  subcategorias: ParticipacionCompra[];
  instagram: string;
  actividad: Actividad | null;
  detalle: string;
  /** Resumen de lo que vende en Instagram (según su perfil y sus últimas publicaciones). */
  vendeEnRedes: string;
  confianza: number | null;
  nivel: Nivel | null;
  origen: Origen | null;
}

export interface FilaMarca {
  marca: string;
  categoria: string;
  subcategoria: string;
  productos: number;
  venta: number;
  unidades: number;
  /** Costo de lo vendido (para el margen del grupo). */
  costoVendido: number;
  margen: number | null;
  inventario: number;
  /** % de la venta de la marca en el mes. */
  pctMarca: number;
}

/** Avance de una clasificación con IA que corre en segundo plano. */
export interface EstadoTrabajo {
  corriendo: boolean;
  total: number;
  hechos: number;
  errores: number;
  inicio: string | null;
  fin: string | null;
  mensaje: string;
}

export const normalizarInstagram = (v: unknown): string =>
  String(v ?? "")
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .replace(/[/?#].*$/, "")
    .toLowerCase()
    .slice(0, 60);

export const instagramValido = (u: string) => /^[a-z0-9._]{1,30}$/.test(u);
