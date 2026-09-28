/**
 * Reporte de un equipo que NO se compró en Supricom (servicio técnico a
 * terceros). No hay factura contra la que verificar nada, así que todo lo que
 * se sabe del equipo y del cliente es lo que el cliente escribe.
 *
 * Sin dependencias de servidor: lo usan el formulario (para avisar antes de
 * enviar) y POST /api/servicio-tecnico/externo (que es la regla de verdad).
 */

/** Equipos por envío: el mismo tope que el reporte con factura. */
export const MAX_EQUIPOS = 10;

/** Largos máximos: los de las columnas de rma_cases / rma_case_items. */
export const LARGOS = {
  nombre: 200,
  email: 200,
  telefono: 50,
  tipo: 200,
  marca: 100,
  modelo: 500,
  serial: 100,
  falla: 5000,
} as const;

/**
 * Sugerencias del campo "Tipo de equipo". Es texto libre a propósito: un
 * cliente externo trae cualquier cosa, y un select cerrado lo obligaría a
 * elegir "Otro" y explicarlo en la falla. Van en el datalist del formulario.
 */
export const TIPOS_SUGERIDOS = [
  "Impresora",
  "Multifuncional",
  "Laptop",
  "Computadora de escritorio",
  "Monitor",
  "UPS",
  "Router / switch",
  "Cámara de seguridad",
  "Punto de venta",
  "Escáner",
] as const;

/** Estado de garantía que se congela en el caso: no hay garantía de Supricom. */
export const GARANTIA_EXTERNO = "no_aplica";

export function emailValido(email: string): boolean {
  const e = String(email || "").trim();
  return e.length <= LARGOS.email && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}

export function telefonoValido(telefono: string): boolean {
  const t = String(telefono || "").trim();
  return t.length <= LARGOS.telefono && t.replace(/\D/g, "").length >= 7;
}

export function nombreValido(nombre: string): boolean {
  const n = String(nombre || "").trim();
  return n.length >= 3 && n.length <= LARGOS.nombre;
}

export type EquipoExterno = {
  tipo: string;
  marca: string;
  modelo: string;
  serial: string;
  falla: string;
};

export type ErrorEquipo = "tipo" | "marca" | "modelo" | "serial" | "falla";

/** Los campos del equipo que no sirven (vacío = todo bien). */
export function erroresEquipo(e: EquipoExterno): ErrorEquipo[] {
  const errores: ErrorEquipo[] = [];
  const tipo = e.tipo.trim();
  const marca = e.marca.trim();
  const modelo = e.modelo.trim();
  const falla = e.falla.trim();
  if (tipo.length < 2 || tipo.length > LARGOS.tipo) errores.push("tipo");
  if (!marca || marca.length > LARGOS.marca) errores.push("marca");
  if (!modelo || modelo.length > LARGOS.modelo) errores.push("modelo");
  if (e.serial.trim().length > LARGOS.serial) errores.push("serial");
  if (falla.length < 10 || falla.length > LARGOS.falla) errores.push("falla");
  return errores;
}
