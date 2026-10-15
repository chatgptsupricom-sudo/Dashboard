import { NextRequest, NextResponse } from "next/server";
import { callOdooRPCEstricto, OdooUnreachableError } from "@/lib/odoo";
import { requireRoles } from "@/lib/auth/roles";
import { ROLES_ADMINISTRACION } from "@/lib/administracion/auth";
import { companyIdsDeEmpresa, empresaDeCompanyId } from "@/lib/administracion/empresas";
import { limitarSedesPorRol } from "@/lib/auth/sedeRol";
import { rangoDelMes } from "@/lib/administracion/gastos";

/**
 * Piezas comunes de los modulos de lectura del rol Administracion (Cuentas por
 * Pagar, Tesoreria, Fiscal, Contabilidad). Todo es solo lectura: lo que se
 * registra se sigue registrando en Odoo.
 *
 * Se lee con `callOdooRPCEstricto` y no con `callOdooRPC`: el segundo devuelve
 * null ante un error de Odoo (un campo que no existe, un AccessError) y la
 * pantalla mostraria "0" o "sin datos" como si fuera cierto. Aqui un error se
 * ve como error.
 */

/** Lee todas las filas de un search_read, de 2000 en 2000, en las sedes dadas. */
export async function leerTodo(
  model: string,
  domain: any[],
  fields: string[],
  companyIds: number[],
  order = "id asc",
): Promise<any[]> {
  let out: any[] = [];
  let offset = 0;
  while (true) {
    const page =
      (await callOdooRPCEstricto<any[]>(model, "search_read", [domain], {
        fields,
        order,
        limit: 2000,
        offset,
        // Sin allowed_company_ids las reglas multiempresa de Odoo pueden dejar
        // fuera registros de una sede que no sea la activa del usuario de la API.
        context: { allowed_company_ids: companyIds },
      })) || [];
    out = out.concat(page);
    if (page.length < 2000) break;
    offset += 2000;
  }
  return out;
}

/** read_group sin lazy: una fila por combinacion de `groupby`. */
export async function agrupar(
  model: string,
  domain: any[],
  fields: string[],
  groupby: string[],
  companyIds: number[],
): Promise<any[]> {
  return (
    (await callOdooRPCEstricto<any[]>(model, "read_group", [domain, fields, groupby], {
      lazy: false,
      context: { allowed_company_ids: companyIds },
    })) || []
  );
}

export async function contar(model: string, domain: any[], companyIds: number[]): Promise<number> {
  return (
    (await callOdooRPCEstricto<number>(model, "search_count", [domain], {
      context: { allowed_company_ids: companyIds },
    })) || 0
  );
}

/**
 * Clientes/proveedores que son otra empresa del grupo (Valencia le vende a
 * Caracas, etc.). Mismo criterio que `SQL_SIN_INTERCOMPANIA` de lib/smartbit.ts.
 */
export const RE_INTERCOMPANIA = /supricom|office solutions? center|ofimaster/i;

/** Fecha de hoy (YYYY-MM-DD) en hora de Caracas, no la del servidor (UTC). */
export function hoyCaracas(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date());
}

export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(fecha + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Dias de `desde` a `hasta` (positivo si `hasta` es posterior). */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round(
    (new Date(hasta + "T12:00:00Z").getTime() - new Date(desde + "T12:00:00Z").getTime()) / 86400000,
  );
}

export const redondear = (n: number) => Math.round(n * 100) / 100;

/** Odoo devuelve los campos many2one como [id, nombre] o false. */
export const nombreM2o = (v: any, porDefecto = "") => (Array.isArray(v) ? String(v[1] ?? "") : porDefecto);
export const idM2o = (v: any): number | null => (Array.isArray(v) ? Number(v[0]) : null);

export interface FiltroAdmin {
  /** "" = todas las sedes; si no, valencia | caracas | panama. */
  empresa: string;
  companyIds: number[];
  mes: string;
  desde: string;
  hasta: string;
  hoy: string;
}

/**
 * Lee `?empresa=` y `?mes=YYYY-MM` (por defecto, el mes en curso). La sede se
 * recorta a la del token del usuario (Administracion solo ve su `cids`):
 * null = le pidio una sede que no es la suya o no tiene sede asignada.
 */
export function leerFiltro(request: NextRequest, payload: any): FiltroAdmin | null {
  const url = new URL(request.url);
  const pedida = (url.searchParams.get("empresa") || "").toLowerCase().trim();
  const companyIds = limitarSedesPorRol(payload, companyIdsDeEmpresa(pedida));
  if (companyIds.length === 0) return null;
  // Si quedo una sola sede, `empresa` la nombra aunque se hayan pedido "todas".
  const empresa = companyIds.length === 1 ? empresaDeCompanyId(companyIds[0]) : pedida;
  const hoy = hoyCaracas();
  const mesParam = url.searchParams.get("mes") || "";
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(mesParam) ? mesParam : hoy.slice(0, 7);
  const { desde, hasta } = rangoDelMes(mes);
  return { empresa, companyIds, mes, desde, hasta, hoy };
}

/** Guard de las APIs del rol: Administracion o SuperAdmin. */
export function guardAdministracion(request: NextRequest) {
  return requireRoles(request, ROLES_ADMINISTRACION);
}

/** Odoo caido (503, `odooUnreachable`) se distingue de un error nuestro (500). */
export function respuestaDeError(error: any, contexto: string) {
  console.error(`Error ${contexto}:`, error?.message || error);
  if (error instanceof OdooUnreachableError) {
    return NextResponse.json(
      { success: false, error: "No se pudo conectar con Odoo", odooUnreachable: true },
      { status: 503 },
    );
  }
  return NextResponse.json(
    { success: false, error: error?.message ? `Error leyendo Odoo: ${error.message}` : "Error interno" },
    { status: 500 },
  );
}
