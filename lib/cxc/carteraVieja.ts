/**
 * Cartera vieja: facturas con vencimiento anterior a 2025.
 *
 * No cuentan en Cartera Vencida, Recuperación de Vencidos ni DSO (tarjetas y
 * modales). Es deuda de la época Smartbit que se migró abierta a Odoo y ya no
 * se gestiona: en sep-2026 eran ~42 k en Valencia, ~1 k en Caracas y ~2,6 k en
 * Panamá, pero cada factura de 2022 le sumaba más de 1.000 días al DSO de su
 * cliente. Se excluye la factura, no el cliente: si el cliente tiene deuda
 * reciente, esa sí cuenta.
 *
 * El CEI (lib/cxc/efectividad.ts) y el resto de la pantalla (aging, top
 * deudores, por sede, estado de cuenta) sí las siguen mostrando.
 */
export const VENCIMIENTO_DESDE = "2025-01-01";

export const esCarteraVieja = (vencimiento: string | false | null | undefined) =>
  !!vencimiento && String(vencimiento).slice(0, 10) < VENCIMIENTO_DESDE;
