// Fechas del filtro de Mapa de Clientes (gerente_venta y gerente_operaciones).

// Rango inicial: del 1 del mes en curso a hoy. El día 1 ese rango es solo
// "hoy" y casi siempre sale vacío, así que entonces se muestra el mes anterior.
export function rangoInicialMapa(hoy: Date = new Date()) {
  if (hoy.getDate() === 1) {
    return {
      from: new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1),
      to: new Date(hoy.getFullYear(), hoy.getMonth(), 0),
    };
  }
  return { from: new Date(hoy.getFullYear(), hoy.getMonth(), 1), to: hoy };
}

// "yyyy-MM-dd" de un <input type="date"> → fecha local. `new Date("2026-09-01")`
// la toma como medianoche UTC, que en Caracas/Panamá (UTC-4/-5) es el día anterior.
export function fechaDeInput(valor: string): Date | undefined {
  const [a, m, d] = valor.split("-").map(Number);
  if (!a || !m || !d) return undefined;
  return new Date(a, m - 1, d);
}
