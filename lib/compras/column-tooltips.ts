export const COLUMN_TOOLTIPS: Record<string, string> = {
  // Genéricas
  Producto: "Nombre del producto en el catálogo de Odoo",
  Categoría: "Categoría del producto en Odoo",
  Stock: "Unidades disponibles en el almacén principal (físico, incluida la zona de Entrada, menos lo reservado para pedidos)",
  Código: "Código SKU del producto",
  Nombre: "Nombre completo del producto",

  // Sugeridos / Mayor rotación
  ABC: "Por valor vendido en el año (unidades 365 días × costo): A ≥ $15.000, B ≥ $5.000, C el resto. La misma clase en todas las pantallas de Compras",
  "Días Inv.":
    "Días de inventario restante a la venta actual. Se calcula: (Stock / Demanda diaria promedio 45d)",
  "Pto. Reorden":
    "Punto de reorden (como Sugeridos) = demanda diaria × (ETA + 7 días) + stock de seguridad. El ETA es el que cargó Compras en Sugeridos (15 días si no hay)",
  MOQ: "Cantidad mínima de compra (Minimum Order Quantity) definida en el proveedor",
  "Cant. Comprar":
    "Lo que recomienda Sugeridos: hasta el stock objetivo, redondeado al MOQ (o la compra manual que cargó Compras)",
  "Costo Unit.":
    "Costo del producto en Odoo para la sede (standard_price); si no tiene, el precio del proveedor de esa sede",
  "Valor ($)":
    "Valor total de la compra sugerida = Cantidad a comprar × Costo unitario",
  "Ventas (45d)": "Unidades vendidas a clientes en los últimos 45 días: facturas menos notas de crédito, sin intercompañía",
  "Nivel Alerta":
    "Solo productos vendidos en los últimos 45 días. Quiebre = sin stock disponible ni en tránsito. Riesgo = en el punto de reorden o por debajo",
  "Stock disponible":
    "Unidades en el almacén principal de la sede (Existencias y zona de Entrada) menos lo reservado para pedidos",
  "En tránsito":
    "Unidades de órdenes de compra confirmadas cuya recepción todavía no se validó en Odoo",

  // Cobertura
  "Ventas 45d": "Unidades vendidas a clientes en los últimos 45 días: facturas menos notas de crédito, sin intercompañía",
  "Dem. diaria": "Demanda diaria promedio = Ventas 45d ÷ 45",
  "Días cobertura":
    "Días que alcanza el stock disponible con la demanda diaria. Se calcula: Stock ÷ Dem. diaria",
  "Quiebre estimado":
    "Fecha estimada en que se agotará el stock si se mantiene la demanda actual",

  // Menor rotación
  "Stock Físico": "Unidades físicas disponibles en el almacén",
  "Días Inactivos":
    "Días desde la última venta del producto en la sede: la factura o recibo a cliente más reciente (una nota de crédito no es venta), en Odoo o en Smartbit antes de abril 2026. Las facturas a otras empresas del grupo no son venta: se muestran aparte como 'traspaso intercompañía'. 'Sin ventas a clientes' si no tiene ninguna (solo sale si lleva 30 días o más en el almacén)",
  "Costo Unid. ($)": "Costo del producto en Odoo para la sede (standard_price); si no tiene, el precio del proveedor",
  "Capital Estancado ($)":
    "Valor del stock sin venta = Stock disponible × Costo unitario. Representa capital inmovilizado",

  // Quiebres históricos (stock de cada día reconstruido desde los movimientos de Odoo)
  "Stock actual": "Unidades disponibles hoy en el almacén principal",
  "Salidas 180d": "Unidades vendidas a clientes en los últimos 180 días (facturas menos notas de crédito, sin intercompañía)",
  "Sem. con venta": "Semanas (de las últimas 26) con al menos una venta",
  "Sem. en quiebre": "Semanas (de las últimas 26) con al menos un día sin stock mientras el producto tenía demanda (venta en los 90 días previos)",
  Frecuencia: "Semanas en quiebre ÷ 26 semanas analizadas",

  // Rotación por categoría
  SKUs: "Número de productos distintos (SKUs) en la categoría",
  "Clasificación ABC":
    "% de los SKUs de la categoría en cada clase (ABC por valor vendido en el año, la misma de Sugeridos)",
  "Capital estancado":
    "Stock × costo de los productos de la categoría que no se venden hace más de 45 días (los que nunca se vendieron, si llevan más de 45 días en el almacén)",
  Quiebres:
    "SKUs sin stock disponible pero con ventas en los últimos 45 días (demanda activa sin inventario)",

  // Tendencia
  "#": "Posición en el ranking por ventas",
  Unidades: "Unidades vendidas en el período seleccionado (facturas menos notas de crédito, sin intercompañía)",
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
    "Marca = la marca del producto en Odoo (la misma de Metas por marca; SIN MARCA si no tiene). Categoría = categoría del producto en Odoo",
};
