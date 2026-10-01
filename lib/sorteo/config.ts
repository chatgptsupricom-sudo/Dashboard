/**
 * Configuración del sorteo de clientes que se puede importar desde el cliente
 * (sin arrastrar Odoo ni MySQL). El sorteo activo (sede, mes, monto por
 * ticket, título) se guarda en la tabla `sorteo_config` y se edita en
 * SuperAdmin › Ventas › Sorteo de clientes (lib/sorteo/configuracion.ts).
 */

export const SEDES_SORTEO = [
  { id: 9, nombre: "Valencia" },
  { id: 10, nombre: "Caracas" },
  { id: 7, nombre: "Panamá" },
] as const;

export const esSedeSorteo = (id: number) => SEDES_SORTEO.some((s) => s.id === id);
export const nombreSedeSorteo = (id: number) => SEDES_SORTEO.find((s) => s.id === id)?.nombre ?? `Empresa ${id}`;

export interface ConfigSorteo {
  companyId: number;
  sede: string;
  /** Mes de las compras que dan tickets, 'YYYY-MM'. */
  mes: string;
  montoPorTicket: number;
  /** Título de la landing; null = "Gran Sorteo <Mes> de <Año>". */
  titulo: string | null;
  actualizadoPor: string | null;
  actualizado: string | null;
}

/** El primer sorteo (Caracas, septiembre 2026). Se usa si la tabla todavía no existe o está vacía. */
export const CONFIG_INICIAL: ConfigSorteo = {
  companyId: 10,
  sede: "Caracas",
  mes: "2026-09",
  montoPorTicket: 5000,
  titulo: null,
  actualizadoPor: null,
  actualizado: null,
};

/** Identifica el sorteo: si cambia, las pantallas recargan los participantes. */
export const claveSorteo = (c: Pick<ConfigSorteo, "companyId" | "mes" | "montoPorTicket">) => `${c.companyId}:${c.mes}:${c.montoPorTicket}`;

export const MES_VALIDO = /^\d{4}-(0[1-9]|1[0-2])$/;
export const TITULO_MAX = 100;

export const SORTEO = {
  /** Landing pública del sorteo: otra aplicación (repo sorteo-landing). */
  urlPublica: process.env.NEXT_PUBLIC_SORTEO_URL || "https://sorteo.supricom.com.ve",
} as const;
