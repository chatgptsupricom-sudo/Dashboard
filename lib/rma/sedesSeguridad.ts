/**
 * Sedes sin departamento de Seguridad.
 *
 * En Valencia el equipo de servicio técnico entra y sale por Seguridad: el
 * acta de ingreso (la firman Seguridad y RMA) lo pasa a diagnóstico y el acta
 * de despacho (cliente, RMA y Seguridad) lo da por entregado. En estas sedes
 * no hay Seguridad: RMA registra las mismas actas desde el caso, firmadas por
 * el cliente y por RMA (`/api/seguridad/ingreso` y `/api/seguridad/despacho`
 * las aceptan del rol RMA solo para estas sedes). Todo lo demás —plazos,
 * alertas, correos, consulta pública, vista del vendedor, acta impresa— sigue
 * igual, porque sale de las mismas tablas.
 *
 * Panamá (7) queda con el flujo de Seguridad hasta que se decida cómo trabaja.
 *
 * Sin dependencias del servidor: lo usan las APIs y las pantallas.
 */
export const SEDES_SIN_SEGURIDAD: readonly number[] = [10];

export function sedeSinSeguridad(companyId: unknown): boolean {
  return SEDES_SIN_SEGURIDAD.includes(Number(companyId));
}
