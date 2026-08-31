/**
 * Sucursales que ofrece el portal público para buscar una factura.
 *
 * No se detectan solas desde Odoo: `res.company` tiene compañías legacy sin
 * actividad (verificado contra Odoo real: 3 de 7 companies sin ninguna
 * factura de venta posteada) y al menos una con actividad residual (1
 * factura suelta) que no es una sucursal real de atención al cliente — no
 * hay ningún campo en Odoo que distinga "esto es una sucursal real" de
 * "esto es una compañía legacy o de prueba".
 *
 * Por eso la lista se mantiene a mano en `PORTAL_SUCURSALES_CIDS`: el día
 * que se abra una sucursal real, se le agrega su cids ahí (y su nombre acá
 * abajo). Mismo criterio de cids que el resto del panel — 7=Panamá,
 * 9=Valencia, 10=Caracas.
 */
export const NOMBRES_SUCURSAL: Record<number, string> = {
  7: "Panamá",
  9: "Valencia",
  10: "Caracas",
};

export type Sucursal = { cid: number; nombre: string };

export function sucursalesPermitidas(): Sucursal[] {
  const crudo = process.env.PORTAL_SUCURSALES_CIDS || "7,9,10";
  return crudo
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0)
    .map((cid) => ({ cid, nombre: NOMBRES_SUCURSAL[cid] || `Sucursal ${cid}` }));
}

export function esSucursalValida(cid: number): boolean {
  return sucursalesPermitidas().some((s) => s.cid === cid);
}
