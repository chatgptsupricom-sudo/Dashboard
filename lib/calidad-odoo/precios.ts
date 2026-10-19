import type { Chequeo, Columna, Fila } from "./tipos";
import type { ListaPrecios, Producto } from "./odoo";
import { nombreSede } from "./odoo";

/**
 * Precios y costos por sede: el precio real de venta está en la lista de
 * precios principal de cada sede (el «Precio de venta» de la ficha es 1 en
 * casi todos los productos) y el costo es por empresa.
 */

export interface DatosSedePrecios {
  companyId: number;
  costoStock: Map<number, { costo: number; stock: number }>;
  lista: ListaPrecios | undefined;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

const COL: Columna[] = [
  { clave: "codigo", titulo: "Código" },
  { clave: "producto", titulo: "Producto" },
  { clave: "marca", titulo: "Marca" },
  { clave: "stock", titulo: "Stock", tipo: "numero" },
];

export function chequeosPrecios(productos: Producto[], sedes: DatosSedePrecios[]): Chequeo[] {
  const vendibles = productos.filter((p) => p.tipo === "product" && p.vendible);
  const sinPrecio: Fila[] = [];
  const bajoCosto: Fila[] = [];
  const simbolico: Fila[] = [];
  const reglas: Fila[] = [];
  const costoCero: Fila[] = [];

  for (const s of sedes) {
    const lista = s.lista?.nombre ?? "(sin lista)";
    for (const p of vendibles) {
      const cs = s.costoStock.get(p.id);
      if (!cs || cs.stock <= 0) continue;
      const base = {
        id: p.id, modelo: "product.template", companyId: s.companyId,
        codigo: p.codigo, producto: p.nombre, marca: p.marca?.[1]?.trim() ?? "", stock: cs.stock, lista,
      };
      const precios = s.lista?.precios.get(p.id) ?? [];
      const costo = cs.costo;

      if (!(costo > 0)) costoCero.push({ ...base, costo: r2(costo) });
      if (!precios.length) { if (s.lista) sinPrecio.push(base); continue; }

      const distintos = [...new Set(precios.map(r2))];
      if (distintos.length > 1) reglas.push({ ...base, precios: distintos.join(" / ") });

      const precio = Math.min(...precios);
      if (precio <= 0.05) simbolico.push({ ...base, precio: r2(precio), costo: r2(costo) });
      else if (costo > 0 && precio < costo)
        bajoCosto.push({ ...base, precio: r2(precio), costo: r2(costo), margen: Math.round(((precio - costo) / precio) * 1000) / 10 });
    }
  }

  const listas = sedes.filter((s) => s.lista).map((s) => `${nombreSede(s.companyId)}: «${s.lista!.nombre}»`).join(", ");
  const COL_LISTA: Columna = { clave: "lista", titulo: "Lista de precios" };

  return [
    {
      id: "precios-sin-precio",
      area: "precios",
      severidad: "error",
      titulo: "Productos con stock sin precio en la lista",
      descripcion: `Productos con existencia que no están en la lista de precios principal de su sede.`,
      porQue: "Al cotizarlos, Odoo pone el «Precio de venta» de la ficha, que es 1 en casi todos los productos: el vendedor tiene que escribirlo a mano o se vende a 1.",
      pasos: [
        `Abrir la lista de precios de la sede (Ventas → Productos → Listas de precios). Listas principales: ${listas || "—"}.`,
        "Agregar una regla con el producto y su precio fijo.",
      ],
      columnas: [...COL, COL_LISTA],
      filas: sinPrecio,
    },
    {
      id: "precios-bajo-costo",
      area: "precios",
      severidad: "error",
      titulo: "Precio de lista por debajo del costo",
      descripcion: `Productos con existencia cuyo precio en la lista de la sede es menor que su costo en Odoo.`,
      porQue: "Cada venta a ese precio es con pérdida. O el precio está desactualizado, o el costo está mal cargado (ver también «costo en cero»).",
      pasos: [
        "Confirmar con Compras el costo real del producto (última factura del proveedor).",
        "Si el costo está bien: subir el precio en la lista de precios de la sede.",
        "Si el costo está mal: lo corrige Contabilidad (una revalorización del inventario), no se edita a mano en la ficha.",
      ],
      columnas: [...COL, { clave: "precio", titulo: "Precio lista (USD)", tipo: "dinero" }, { clave: "costo", titulo: "Costo (USD)", tipo: "dinero" }, { clave: "margen", titulo: "Margen %", tipo: "numero" }, COL_LISTA],
      filas: bajoCosto.sort((a, b) => (a.margen as number) - (b.margen as number)),
    },
    {
      id: "precios-simbolico",
      area: "precios",
      severidad: "error",
      titulo: "Precio de lista en 0 o simbólico",
      descripcion: `Productos con existencia cuyo precio en la lista es 0 o casi 0 (0,01).`,
      porQue: "Se pueden facturar regalados sin que nadie lo note; si es para bloquear la venta, Odoo tiene formas correctas de hacerlo.",
      pasos: [
        "Cargar el precio real en la regla de la lista de precios de la sede.",
        "Si el producto no se debe vender (exhibición, uso interno), desmarcar «Puede ser vendido» en la ficha en vez de ponerle precio 0.",
      ],
      columnas: [...COL, { clave: "precio", titulo: "Precio lista (USD)", tipo: "dinero" }, { clave: "costo", titulo: "Costo (USD)", tipo: "dinero" }, COL_LISTA],
      filas: simbolico,
    },
    {
      id: "precios-reglas-repetidas",
      area: "precios",
      severidad: "atencion",
      titulo: "Producto con varios precios en la misma lista",
      descripcion: `Productos con existencia que tienen dos o más reglas de precio fijo distintas en la lista de su sede.`,
      porQue: "Odoo usa la primera regla que encuentra: el precio que sale depende del orden de las reglas y puede no ser el que se cree.",
      pasos: ["Abrir la lista de precios, buscar el producto y dejar una sola regla con el precio vigente."],
      columnas: [...COL, { clave: "precios", titulo: "Precios cargados (USD)" }, COL_LISTA],
      filas: reglas,
    },
    {
      id: "costos-cero",
      area: "precios",
      severidad: "error",
      titulo: "Productos con stock y costo en cero",
      descripcion: `Productos con existencia cuyo costo en la sede es 0.`,
      porQue: "Ese inventario vale $0 en la contabilidad, el costo de venta sale en 0 y el margen de cada venta aparece como 100%.",
      pasos: [
        "Ver de dónde vino el stock (Inventario → Reportes → Historial de movimientos, filtrando el producto): normalmente un ajuste o una transferencia entre sedes sin costo.",
        "Pasarle a Contabilidad el costo real para que lo revalorice; no se recomienda editar el costo a mano en la ficha.",
      ],
      columnas: [...COL, { clave: "costo", titulo: "Costo (USD)", tipo: "dinero" }],
      filas: costoCero,
    },
  ];
}
