/**
 * Cédula de quien recibe el equipo en el acta de despacho de RMA
 * (`seguridad_despachos.cedula_retira`): junto con el nombre y la firma es
 * la constancia de a quién se le entregó.
 *
 * Se acepta como la escriban (V-12.345.678, 12345678, 8-123-4567 en Panamá,
 * un pasaporte): solo se pasa a mayúsculas, se quitan los espacios de más y
 * se exige que traiga al menos 4 dígitos.
 *
 * Sin dependencias de servidor: lo usan la API y los formularios.
 */
export const MAX_CEDULA = 20;

export function normalizarCedula(valor: unknown): string {
  return String(valor ?? "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_CEDULA);
}

export function cedulaValida(valor: unknown): boolean {
  const c = normalizarCedula(valor);
  return /^[A-Z0-9][A-Z0-9.\- ]*$/.test(c) && (c.match(/\d/g)?.length ?? 0) >= 4;
}
