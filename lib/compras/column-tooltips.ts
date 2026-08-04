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

  // Quiebres históricos
  "Stock actual": "Unidades disponibles actualmente en el almacén",
  "Salidas 180d": "Total de unidades salidas (vendidas) en los últimos 180 días",
  "Sem. con venta": "Semanas en las que hubo al menos 1 venta en los últimos 6 meses",
  Quiebres:
    "Número de brechas detectadas: desde que se agotó el stock hasta que volvieron a comprar",
  "Sem. en quiebre":
    "Total de semanas que el producto estuvo sin stock durante las brechas detectadas",
  Frecuencia:
    "Porcentaje de semanas en quiebre del total de semanas analizadas (6 meses). Indica la frecuencia del problema",

  // Rotación por categoría
  SKUs: "Número de productos distintos (SKUs) en la categoría",
  "Clasificación ABC":
    "Distribución de ventas de la categoría: %A = % del total que representan los productos clase A",
  "Capital estancado":
    "Valor total del stock de la categoría sin rotación reciente (últimos 45 días)",

  // Tendencia
  "#": "Posición en el ranking por ventas",
  Unidades: "Unidades vendidas en el período seleccionado",
  "% del total": "Porcentaje que representa este producto del total de ventas del período",

  // Sin costo
  "Sin costo en": "Sedes donde el producto no tiene costo registrado en Odoo",
  "Stock por sede": "Distribución del stock por cada sede (Valencia, Caracas, Panamá)",
  "Stock total": "Suma del stock en todas las sedes",
};
