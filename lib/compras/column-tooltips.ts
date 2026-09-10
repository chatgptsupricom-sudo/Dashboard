export const COLUMN_TOOLTIPS: Record<string, string> = {
  // Genéricas
  Producto: "Nombre del producto en el catálogo de Odoo",
  Categoría: "Categoría del producto en Odoo",
  Stock: "Unidades disponibles actualmente en el almacén principal",
  Código: "Código SKU del producto",
  Nombre: "Nombre completo del producto",

  // Sugeridos / Mayor rotación
  ABC: "Clasificación ABC por contribution al total de ventas. A=80%, B=95%, C=resto",
  "Días Inv.":
    "Días de inventario restante a la venta actual. Se calcula: (Stock / Demanda diaria promedio 45d)",
  "Pto. Reorden":
    "Punto de reorden = (Demanda diaria × 25 días de reposición) + stock de seguridad",
  MOQ: "Cantidad mínima de compra (Minimum Order Quantity) definida en el proveedor",
  "Cant. Comprar":
    "Cantidad sugerida para recomprar = stock faltante + stock de seguridad + MOQ",
  "Costo Unit.":
    "Costo unitario por producto. Fuente: product.product → product.supplierinfo → product.template",
  "Valor ($)":
    "Valor total de la compra sugerida = Cantidad a comprar × Costo unitario",
  "Ventas (45d)": "Unidades vendidas en los últimos 45 días (para medir rotación)",
  "Nivel Alerta":
    "Rojo = crítico (stock ≤ 0), Naranja = en riesgo (stock < reorden), Verde = OK",

  // Cobertura
  "Ventas 45d": "Unidades vendidas en los últimos 45 días",
  "Dem. diaria": "Demanda diaria promedio = Ventas 45d ÷ 45",
  "Días cobertura":
    "Días que alcanza el stock actual con la demanda diaria. Se calcula: Stock ÷ Dem. diaria",
  "Quiebre estimado":
    "Fecha estimada en que se agotará el stock si se mantiene la demanda actual",

  // Menor rotación
  "Stock Físico": "Unidades físicas disponibles en el almacén",
  "Días Inactivos":
    "Días desde la última venta del producto (si no se ha vendido en el período, se muestra como 'Nunca vendido')",
  "Costo Unid. ($)": "Costo unitario del producto para calcular capital estancado",
  "Capital Estancado ($)":
    "Valor del stock sin movimiento = Stock × Costo unitario. Representa capital inmovilizado",

  // Rotación por categoría
  SKUs: "Número de productos distintos (SKUs) en la categoría",
  "Clasificación ABC":
    "Distribución de ventas de la categoría: %A = % del total que representan los productos clase A",
  "Capital estancado":
    "Valor total del stock de la categoría sin rotación reciente (últimos 45 días)",
  Quiebres:
    "SKUs con stock = 0 pero con ventas en los últimos 45 días (demanda activa sin inventario)",

  // Tendencia
  "#": "Posición en el ranking por ventas",
  Unidades: "Unidades vendidas en el período seleccionado",
  "% del total": "Porcentaje que representa este producto del total de ventas del período",

  // Curva 80/20 (Pareto) de compras — ojo: aquí todo se mide en DINERO
  // comprado (price_subtotal de órdenes de compra confirmadas), no en ventas
  // ni en unidades.
  "Monto comprado":
    "Dinero gastado en este producto en el período: suma del subtotal de las líneas de órdenes de compra confirmadas. Es la base con la que se ordena la tabla y se calculan los dos porcentajes",
  "Unidades compradas":
    "Unidades pedidas al proveedor en el período (product_qty de las órdenes confirmadas). No es lo recibido ni lo vendido",
  "% Individual":
    "Cuánto pesa este producto solo en el gasto total de compra del período: monto del producto ÷ monto total × 100. Ej.: 0,23% = de cada $100 comprados, $0,23 se fueron en este producto",
  "% Acumulado":
    "La tabla va del que más gasto concentra al que menos. Este valor suma el % Individual de este producto MÁS el de todos los que están por encima. Responde: 'comprando del #1 hasta aquí, ¿qué parte del gasto llevo cubierta?'. Importante: se calcula sobre el ranking completo, no sobre lo que quede después de filtrar o buscar",
  Clase:
    "Se deduce del % Acumulado: A = está dentro del primer 80% del gasto (los pocos productos donde está la plata), B = entre 80% y 95%, C = el resto (cola larga que casi no mueve la aguja)",
  "Marca/Cat":
    "Marca = primera palabra del nombre del producto en Odoo. Categoría = categoría del producto en Odoo",
};
