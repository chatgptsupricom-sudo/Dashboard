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
 * que se abra una sucursal real, se le agrega su cids ahí (y su nombre y
 * slug acá abajo). Mismo criterio de cids que el resto del panel — 7=Panamá,
 * 9=Valencia, 10=Caracas.
 *
 * La sucursal se decide por la URL (/servicio-tecnico/valencia,
 * /panama, /caracas), no por un selector: cada sucursal reparte su propio
 * enlace, así que no hace falta preguntarle al cliente.
 */
export const NOMBRES_SUCURSAL: Record<number, string> = {
  7: "Panamá",
  9: "Valencia",
  10: "Caracas",
};

/** Slug de la URL — sin tildes ni espacios, en minúsculas. */
export const SLUGS_SUCURSAL: Record<number, string> = {
  7: "panama",
  9: "valencia",
  10: "caracas",
};

export type Sucursal = { cid: number; nombre: string; slug: string };

export function sucursalesPermitidas(): Sucursal[] {
  const crudo = process.env.PORTAL_SUCURSALES_CIDS || "7,9,10";
  return crudo
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0)
    .map((cid) => ({
      cid,
      nombre: NOMBRES_SUCURSAL[cid] || `Sucursal ${cid}`,
      slug: SLUGS_SUCURSAL[cid] || String(cid),
    }));
}

export function esSucursalValida(cid: number): boolean {
  return sucursalesPermitidas().some((s) => s.cid === cid);
}

/** Resuelve el segmento de la URL (ej. "valencia") a su sucursal, o null si no es una sucursal real. */
export function sucursalPorSlug(slug: string): Sucursal | null {
  const normalizado = String(slug || "").trim().toLowerCase();
  return sucursalesPermitidas().find((s) => s.slug === normalizado) ?? null;
}
