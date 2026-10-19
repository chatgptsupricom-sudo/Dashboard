import type { Chequeo, Columna, Fila } from "./tipos";
import type { Categoria, Marca, Producto } from "./odoo";
import { claveMarca, esMarcaGenerica, parecenLaMisma } from "@/lib/metas-marca/marcas";
import { compacto, ejemplos, espaciosDeMas, marcarEspacios, palabras, repetidos } from "./texto";

/** Chequeos de la ficha de producto, las marcas (spiff.brand) y las categorías. */

const TIPO: Record<string, string> = { product: "Almacenable", consu: "Consumible", service: "Servicio" };

const fila = (p: Producto, extra: Record<string, unknown> = {}, grupo?: string): Fila => ({
  id: p.id,
  modelo: "product.template",
  companyId: p.companyId,
  ...(grupo ? { grupo } : {}),
  codigo: p.codigo,
  producto: p.nombre,
  marca: p.marca?.[1]?.trim() ?? "",
  categoria: p.categoria?.[1] ?? "",
  creadoPor: p.creadoPor,
  ...extra,
});

const COL: Columna[] = [
  { clave: "codigo", titulo: "Código" },
  { clave: "producto", titulo: "Producto" },
  { clave: "marca", titulo: "Marca" },
  { clave: "categoria", titulo: "Categoría" },
];
const COL_FIN: Columna[] = [{ clave: "creadoPor", titulo: "Creado por" }];

/** Errores de tipeo conocidos en nombres de categoría. */
const CATEGORIA_CORRECTA: Record<string, string> = {
  PEREFERICOS: "PERIFERICOS",
};

const esCategoriaRaiz = (ruta: string) => /^All(\s*\/|$)/i.test(ruta.trim());

/**
 * Marcas que aparecen como palabra en el nombre del producto. Se ignoran las
 * genéricas ("CARTUCHO", "TONER"…) y las de 1 letra.
 */
function marcasEnNombre(nombre: string, marcas: string[]): string[] {
  const n = ` ${palabras(nombre)} `;
  return marcas.filter((m) => n.includes(` ${m} `));
}

export function chequeosProductos(productos: Producto[], marcas: Marca[], categorias: Categoria[]): Chequeo[] {
  const salida: Chequeo[] = [];
  const fisicos = productos.filter((p) => p.tipo === "product");

  // ── Sin marca ──
  const sinMarca = fisicos.filter((p) => !p.marca);
  salida.push({
    id: "productos-sin-marca",
    area: "productos",
    severidad: "error",
    titulo: "Productos sin marca",
    descripcion: `Productos almacenables sin marca (campo Marca SPIFF).`,
    porQue: "La venta de estos productos no entra en Metas por Marca, Stock por Marca, el Stoplight de Compras ni en el cálculo de SPIFF: queda en «sin marca».",
    pasos: ["Abrir el producto y elegir la Marca en la ficha (campo de marca SPIFF).", "Si el producto es basura (nombre numérico, prueba), archivarlo en vez de completarlo."],
    columnas: [...COL, ...COL_FIN],
    filas: sinMarca.map((p) => fila(p)),
  });

  // ── Marca distinta a la del nombre ──
  const clavesMarca = [...new Set(marcas.map((m) => claveMarca(m.nombre)))]
    .filter((k) => !esMarcaGenerica(k) && k.length >= 2)
    .map((k) => palabras(k));
  const marcaDistinta = fisicos
    .filter((p) => p.marca && !/COMPATIBLE|\bPARA\b/.test(palabras(p.nombre)))
    .map((p) => {
      const propia = palabras(claveMarca(p.marca![1]));
      const encontradas = marcasEnNombre(p.nombre, clavesMarca);
      if (!encontradas.length || encontradas.includes(propia)) return null;
      if (esMarcaGenerica(claveMarca(p.marca![1]))) return { p, en: encontradas };
      // "SAT" en un producto de "SAT PCS", "KLIP" en uno de "KLIPXTREME": es la misma marca.
      if (encontradas.some((e) => parecenLaMisma(e, propia) || ` ${propia} `.includes(` ${e} `) || ` ${e} `.includes(` ${propia} `))) return null;
      return { p, en: encontradas };
    })
    .filter((x): x is { p: Producto; en: string[] } => !!x);
  salida.push({
    id: "productos-marca-distinta",
    area: "productos",
    severidad: "atencion",
    titulo: "Marca asignada distinta a la del nombre",
    descripcion: `Productos cuyo nombre dice una marca y en Odoo tienen otra${ejemplos(marcaDistinta.map(({ p, en }) => `${en[0]} con marca ${p.marca![1].trim()}`))}.`,
    porQue: "La venta se le suma a la marca equivocada: distorsiona Metas por Marca, el pago de SPIFF a los vendedores y las compras por marca.",
    pasos: [
      "Abrir el producto y cambiar la Marca por la que dice el nombre.",
      "Si el que está mal es el nombre, corregir el nombre.",
      "Si es una submarca (ej. OMADA de TP-LINK, XTECH de KLIPXTREME), decidir con Compras con cuál marca se trabaja y usar la misma en todos los productos de esa familia: hoy hay productos de la familia en las dos.",
    ],
    columnas: [...COL, { clave: "enNombre", titulo: "Marca en el nombre" }, ...COL_FIN],
    filas: marcaDistinta.map(({ p, en }) => fila(p, { enNombre: en.join(", ") })),
  });

  // ── Sin código / código repetido / código con espacios ──
  const sinCodigo = fisicos.filter((p) => !p.codigo.trim());
  salida.push({
    id: "productos-sin-codigo",
    area: "productos",
    severidad: "error",
    titulo: "Productos sin código interno",
    descripcion: `Productos almacenables sin referencia interna.`,
    porQue: "El código es lo que usan almacén, compras y el panel para identificar el producto; sin él no se puede escanear, buscar ni cruzar con el proveedor.",
    pasos: ["Abrir el producto y cargar la Referencia interna (el código del fabricante, sin espacios).", "Si es un registro de prueba o basura, archivarlo."],
    columnas: [...COL, { clave: "tipo", titulo: "Tipo" }, ...COL_FIN],
    filas: sinCodigo.map((p) => fila(p, { tipo: TIPO[p.tipo] ?? p.tipo })),
  });

  const codigoRep = repetidos(productos, (p) => (p.codigo.trim() ? compacto(p.codigo) : null));
  salida.push({
    id: "productos-codigo-duplicado",
    area: "productos",
    severidad: "error",
    titulo: "Código interno repetido o casi igual",
    descripcion: `Códigos que se repiten en más de un producto, o que solo cambian en guiones, puntos o espacios${ejemplos(codigoRep.map((g) => g.map((p) => `«${p.codigo}»`).join(" y ")), 2)}.`,
    porQue: "Al buscar o escanear el código sale el producto equivocado; el stock y la venta se reparten entre dos fichas.",
    pasos: ["Comparar las fichas del grupo.", "Si es el mismo producto: dejar una, pasar el stock a esa y archivar la otra.", "Si son distintos: corregir el código del que está mal."],
    columnas: [...COL, ...COL_FIN],
    filas: codigoRep.flatMap((g) => g.map((p) => fila(p, {}, compacto(p.codigo)))),
  });

  const codigoEspacios = productos.filter((p) => p.codigo && /\s/.test(p.codigo));
  salida.push({
    id: "productos-codigo-espacios",
    area: "productos",
    severidad: "mejora",
    titulo: "Códigos con espacios",
    descripcion: `Códigos internos con espacios${ejemplos(codigoEspacios.map((p) => `«${p.codigo}»`), 2)}.`,
    porQue: "El lector de código de barras y la búsqueda no los encuentran si se escriben sin el espacio.",
    pasos: ["Abrir el producto y quitar los espacios de la Referencia interna."],
    columnas: [{ clave: "visible", titulo: "Código (· = espacio)" }, ...COL.slice(1), ...COL_FIN],
    filas: codigoEspacios.map((p) => fila(p, { visible: p.codigo.replace(/\s/g, "·") })),
  });

  // ── Categoría ──
  const sinCategoria = fisicos.filter((p) => !p.categoria || esCategoriaRaiz(p.categoria[1]));
  salida.push({
    id: "productos-sin-categoria",
    area: "productos",
    severidad: "error",
    titulo: "Productos sin categoría (en «All»)",
    descripcion: `Productos almacenables en la categoría por defecto de Odoo («All»).`,
    porQue: "No aparecen en los reportes por línea de producto y toman las cuentas contables y la valoración por defecto, no las de su línea.",
    pasos: ["Abrir el producto y elegir la categoría correcta (Inventario → Configuración → Categorías de productos para ver la lista)."],
    columnas: [...COL, ...COL_FIN],
    filas: sinCategoria.map((p) => fila(p)),
  });

  const general = fisicos.filter((p) => palabras(p.categoria?.[1] ?? "") === "GENERAL");
  salida.push({
    id: "productos-categoria-general",
    area: "productos",
    severidad: "mejora",
    titulo: "Productos en la categoría «GENERAL»",
    descripcion: `Productos almacenables en una categoría comodín.`,
    porQue: "«GENERAL» no dice qué es el producto: esa venta no se puede analizar por línea de producto.",
    pasos: ["Pasar cada producto a su categoría real; si no existe una que le sirva, crearla en Inventario → Configuración → Categorías de productos."],
    columnas: [...COL, ...COL_FIN],
    filas: general.map((p) => fila(p)),
  });

  // ── Nombres ──
  const nombreEsp = productos.filter((p) => espaciosDeMas(p.nombre));
  salida.push({
    id: "productos-nombre-espacios",
    area: "productos",
    severidad: "mejora",
    titulo: "Nombres de producto con espacios de más",
    descripcion: `Productos con espacios al inicio, al final o dobles (en la tabla se ven como «·»).`,
    porQue: "Los que empiezan con espacio quedan primeros en todas las listas y no aparecen al buscar por el comienzo del nombre.",
    pasos: ["Abrir el producto y reescribir el nombre sin espacios sobrantes."],
    columnas: [COL[0], { clave: "visible", titulo: "Nombre (· = espacio de más)" }, COL[2], COL[3], ...COL_FIN],
    filas: nombreEsp.map((p) => fila(p, { visible: marcarEspacios(p.nombre) })),
  });

  const basura = productos.filter((p) => {
    const n = p.nombre.trim();
    return !/[A-Za-zÁÉÍÓÚÑáéíóúñ]{3}/.test(n) || /^\d[\dA-Za-z]{8,}$/.test(n) || /^(prueba|test)\b/i.test(n);
  });
  salida.push({
    id: "productos-nombre-invalido",
    area: "productos",
    severidad: "error",
    titulo: "Productos con nombre inválido",
    descripcion: `Productos activos cuyo nombre es un número, un código o una prueba${ejemplos(basura.map((p) => `«${p.nombre.trim()}»`), 4)}.`,
    porQue: "Suelen ser fichas creadas por error al escanear o importar. Ensucian las búsquedas y, si tienen stock o ventas, nadie sabe qué producto son.",
    pasos: ["Abrir el producto y revisar si tiene stock o movimientos (botones arriba de la ficha).", "Si no tiene: archivarlo (Acción → Archivar).", "Si tiene: identificar el producto real y corregir el nombre, o pasar el stock al producto correcto antes de archivar."],
    columnas: [...COL, { clave: "tipo", titulo: "Tipo" }, ...COL_FIN],
    filas: basura.map((p) => fila(p, { tipo: TIPO[p.tipo] ?? p.tipo })),
  });

  // ── Consumibles que son mercancía ──
  const consumibles = productos.filter((p) => p.tipo === "consu" && (p.marca || (p.categoria && !esCategoriaRaiz(p.categoria[1]))));
  salida.push({
    id: "productos-consumible",
    area: "productos",
    severidad: "atencion",
    titulo: "Mercancía cargada como «Consumible»",
    descripcion: `Productos tipo Consumible que tienen marca o categoría de mercancía (UPS, botellas de tinta, fuentes de poder…).`,
    porQue: "Odoo no lleva existencia de los consumibles: no tienen stock, no se valorizan en el inventario y no aparecen en Stock por Marca ni en Compras. Si se venden como mercancía, deberían ser Almacenables.",
    pasos: [
      "Confirmar con Almacén si el producto se compra y se vende como mercancía.",
      "Si sí: abrir el producto → Tipo de producto → «Producto almacenable», y luego hacer un ajuste de inventario con la existencia real.",
      "Si es de uso interno (gastos), dejarlo como Consumible y quitarle la marca.",
    ],
    columnas: [...COL, ...COL_FIN],
    filas: consumibles.map((p) => fila(p)),
  });

  // ── Mismo nombre, distinta ficha ──
  const nombreRep = repetidos(fisicos, (p) => {
    const n = palabras(p.nombre);
    return n.length >= 8 ? n : null;
  }).filter((g) => new Set(g.map((p) => compacto(p.codigo).replace(/EX$/, ""))).size > 1);
  salida.push({
    id: "productos-nombre-duplicado",
    area: "productos",
    severidad: "atencion",
    titulo: "Productos con el mismo nombre",
    descripcion: `Grupos de productos almacenables con el mismo nombre y códigos distintos (no se cuentan los pares XXXX / XXXX-EX).`,
    porQue: "Puede ser el mismo producto creado dos veces (el stock y la venta se parten) o dos productos distintos con el mismo nombre (el vendedor puede elegir el equivocado).",
    pasos: ["Comparar los códigos con el fabricante.", "Si es el mismo producto: unificar el stock en una ficha y archivar la otra.", "Si son distintos: diferenciar el nombre (modelo, color, capacidad)."],
    columnas: [...COL, ...COL_FIN],
    filas: nombreRep.flatMap((g) => g.map((p) => fila(p, {}, palabras(p.nombre)))),
  });

  // ── Marcas (spiff.brand) ──
  const filaMarca = (m: Marca, extra: Record<string, unknown>, grupo?: string): Fila => ({
    id: m.id, modelo: "spiff.brand", companyId: null, ...(grupo ? { grupo } : {}),
    marca: marcarEspacios(m.nombre), productos: m.productos, ...extra,
  });
  const COL_MARCA: Columna[] = [{ clave: "marca", titulo: "Marca (· = espacio de más)" }, { clave: "productos", titulo: "Productos", tipo: "numero" }];

  // Grupos de marcas que parecen la misma (uniendo transitivamente).
  const grupos: Marca[][] = [];
  for (const m of marcas) {
    const k = claveMarca(m.nombre);
    if (esMarcaGenerica(k)) continue;
    const g = grupos.find((gr) => gr.some((x) => parecenLaMisma(claveMarca(x.nombre), k)));
    if (g) g.push(m);
    else grupos.push([m]);
  }
  const dupMarcas = grupos.filter((g) => g.length > 1).map((g) => g.sort((a, b) => b.productos - a.productos));
  salida.push({
    id: "marcas-duplicadas",
    area: "productos",
    severidad: "error",
    titulo: "Marcas repetidas o mal escritas",
    descripcion: `Marcas cargadas más de una vez con otra escritura${ejemplos(dupMarcas.map((g) => g.map((m) => `«${m.nombre}»`).join(" / ")), 4)}.`,
    porQue: "Los productos de una misma marca quedan repartidos y los reportes por marca, las metas y los SPIFF salen partidos.",
    pasos: [
      "En Ventas → Comisiones & SPIFF → Marcas SPIFF, decidir cuál nombre queda (normalmente la que tiene más productos, en MAYÚSCULAS y sin espacios).",
      "Pasar los productos de las otras a esa marca (Ventas → Productos, filtrar por la marca, seleccionar todo y editar la marca).",
      "Revisar si las reglas SPIFF usan la marca vieja y, ya sin productos, archivarla.",
    ],
    columnas: [...COL_MARCA, { clave: "sugerida", titulo: "Unificar en" }],
    filas: dupMarcas.flatMap((g) => g.map((m) => filaMarca(m, { sugerida: claveMarca(g[0].nombre) }, claveMarca(g[0].nombre)))),
  });

  const genericas = marcas.filter((m) => esMarcaGenerica(claveMarca(m.nombre)));
  salida.push({
    id: "marcas-genericas",
    area: "productos",
    severidad: "atencion",
    titulo: "«Marcas» que no son marcas",
    descripcion: `Registros de marca que son un tipo de producto, un servicio o un código${ejemplos(genericas.map((m) => `«${m.nombre.trim()}»`), 5)}.`,
    porQue: "Los productos con estas «marcas» no suman a su fabricante real en reportes, metas ni SPIFF.",
    pasos: ["Ver qué productos tiene cada una (filtrar productos por la marca) y asignarles la marca real del fabricante.", "Cuando quede sin productos, archivar el registro de marca."],
    columnas: COL_MARCA,
    filas: genericas.map((m) => filaMarca(m, {})),
  });

  const yaListadas = new Set([...dupMarcas.flat(), ...genericas].map((m) => m.id));
  const vacias = marcas.filter((m) => m.productos === 0 && !yaListadas.has(m.id));
  salida.push({
    id: "marcas-sin-productos",
    area: "productos",
    severidad: "mejora",
    titulo: "Marcas sin ningún producto",
    descripcion: `Marcas que no tiene ningún producto activo.`,
    porQue: "Aparecen en la lista al elegir marca y llevan a cargar productos en la marca equivocada.",
    pasos: ["Si la marca ya no se trabaja, archivarla en Ventas → Comisiones & SPIFF → Marcas SPIFF."],
    columnas: COL_MARCA,
    filas: vacias.map((m) => filaMarca(m, {})),
  });

  // ── Categorías ──
  const nombresMarca = new Set(marcas.map((m) => compacto(m.nombre)).filter((k) => k.length >= 4));
  const porNombre = new Map<string, number>();
  for (const c of categorias) porNombre.set(compacto(c.ruta), (porNombre.get(compacto(c.ruta)) || 0) + 1);
  const catMal = categorias
    .map((c) => {
      const motivos: string[] = [];
      const correcta = Object.entries(CATEGORIA_CORRECTA).find(([malo]) => palabras(c.nombre).split(" ").includes(malo));
      if (correcta) motivos.push(`Mal escrita: debería decir «${correcta[1]}»`);
      if (/[a-z]/.test(c.nombre) && !esCategoriaRaiz(c.ruta)) motivos.push("En minúsculas (las demás están en MAYÚSCULAS)");
      if (nombresMarca.has(compacto(c.nombre))) motivos.push("Es el nombre de una marca, no de una línea de producto");
      if ((porNombre.get(compacto(c.ruta)) || 0) > 1) motivos.push("Hay otra categoría con el mismo nombre");
      if (c.productos === 0 && !esCategoriaRaiz(c.ruta)) motivos.push("Sin productos");
      return { c, motivo: motivos.join(" · ") };
    })
    .filter((x) => x.motivo);
  salida.push({
    id: "categorias-mal",
    area: "segmentacion",
    severidad: "mejora",
    titulo: "Categorías de producto mal armadas",
    descripcion: `Categorías mal escritas, repetidas, vacías o con nombre de marca${ejemplos(catMal.map(({ c }) => `«${c.ruta}»`), 4)}.`,
    porQue: "La categoría es la línea de producto en los reportes de venta, margen e inventario. Una categoría con nombre de marca mezcla los dos criterios y una repetida parte la línea en dos.",
    pasos: [
      "En Inventario → Configuración → Categorías de productos, corregir el nombre de las mal escritas.",
      "Las repetidas: pasar los productos a una sola y archivar la otra.",
      "Las que son marcas o están vacías: mover sus productos a la categoría de línea que corresponde y archivarlas (la marca va en el campo Marca, no en la categoría).",
    ],
    columnas: [{ clave: "categoria", titulo: "Categoría" }, { clave: "productos", titulo: "Productos", tipo: "numero" }, { clave: "motivo", titulo: "Problema" }],
    filas: catMal.map(({ c, motivo }) => ({ id: c.id, modelo: "product.category", companyId: null, categoria: c.ruta, productos: c.productos, motivo })),
  });

  return salida;
}
