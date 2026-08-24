/**
 * Resumen del reporte que el formulario le pasa a la pantalla de confirmación.
 *
 * Va por sessionStorage y no por la URL a propósito: el teléfono del cliente y
 * el serial del equipo son datos suyos, y esta app carga @vercel/analytics en
 * producción, así que todo lo que esté en el query string termina en analítica
 * y en el historial del navegador.
 */
export const RESUMEN_KEY = "servicio-tecnico:resumen";

export type ResumenReporte = {
  factura?: string;
  producto?: string;
  serial?: string;
  telefono?: string;
};
