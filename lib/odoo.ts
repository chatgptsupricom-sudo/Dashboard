import axios from "axios";
import { odooApiKey } from "@/lib/secretos";

/**
 * Se lanza cuando Odoo no respondió en absoluto (caído, sin red, timeout,
 * DNS) — a diferencia de un error de aplicación (dominio inválido, permiso
 * denegado), donde Odoo SÍ contestó y `callOdooRPC` sigue devolviendo null
 * como antes, para no romper el resto de fetchers en un `Promise.all`.
 *
 * Antes, cualquier error (incluida Odoo caído) devolvía null en silencio, y
 * eso se interpretaba igual que "no hay fuente de datos" — un panel entero
 * podía salir en "sin datos" sin ningún aviso de que Odoo no está
 * respondiendo. Las rutas que quieran distinguirlo deben capturar este tipo
 * de error específicamente.
 */
export class OdooUnreachableError extends Error {
  constructor(cause: unknown) {
    super("No se pudo conectar con Odoo");
    this.name = "OdooUnreachableError";
    this.cause = cause;
  }
}

export interface OdooUser {
  id: number;
  name: string;
  login: string;
  email: string;
  active: boolean;
}

const RAW_URL =
  process.env.NEXT_PUBLIC_ODOO_URL || "https://supricom2.odoo.com";
const ODOO_URL = RAW_URL.replace(/\/$/, "");
const ODOO_DB = process.env.ODOO_DB || "";
// uid del usuario de la API. Fijo a 388 en producción; se puede overridear
// con ODOO_UID para apuntar a otra instancia (ej. un Odoo local de pruebas,
// donde el usuario admin de fabrica es el id 2).
const ODOO_UID = Number(process.env.ODOO_UID) || 388;

/**
 * Función base para llamadas RPC a Odoo (JSON-RPC 2.0)
 * Corregido para Odoo SH / Ecosistema Cloud de Supricom
 */
// export async function callOdooRPC<T>(
//   model: string,
//   method: string,
//   args: any[] = [],
//   kwargs: Record<string, any> = {},
// ): Promise<T | null> {
//   try {
//     const payload = {
//       jsonrpc: "2.0",
//       method: "call",
//       params: {
//         service: "object",
//         method: "execute_kw",
//         args: [
//           ODOO_DB,
//           388, // Tu UID verificado
//           ODOO_API_KEY,
//           model,
//           method,
//           args,
//           kwargs,
//         ],
//       },
//       id: Date.now(),
//     };
// En lib/odoo.ts
export async function callOdooRPC<T>(
  model: string,
  method: string,
  args: any[] = [], // Aquí llega [[...]]
  kwargs: Record<string, any> = {}, // Aquí llegan { fields, limit, context }
): Promise<T | null> {
  try {
    const payload = {
      jsonrpc: "2.0",
      method: "call",
      params: {
        service: "object",
        method: "execute_kw",
        args: [
          ODOO_DB,
          ODOO_UID,
          odooApiKey(),
          model,
          method,
          args, // Esto debe ser una lista: [[filtro, op, valor]]
          kwargs, // Esto debe ser un objeto: { context: {...} }
        ],
      },
      id: Date.now(),
    };

    const response = await axios.post(
      `${ODOO_URL}/jsonrpc`,
      {
        jsonrpc: "2.0",
        method: "call",
        params: payload.params,
        id: Date.now(),
      },
      { headers: { "Content-Type": "application/json" } },
    );

    return response.data.result as T;
  } catch (error: any) {
    console.error("❌ Error RPC:", error.message);
    // axios solo pone `error.response` cuando el servidor SÍ contestó (con un
    // error HTTP). Si no hay `response`, la solicitud nunca llegó a destino
    // ni volvió — Odoo caído, timeout, DNS, sin red — eso es un problema de
    // conexión real, no "esta consulta puntual no aplica".
    if (!error.response) {
      throw new OdooUnreachableError(error);
    }
    return null;
  }
}

/**
 * Autenticación: Compara email y password directamente con Odoo
 */
export async function authenticateWithOdoo(
  email: string,
  password: string,
): Promise<number | null> {
  try {
    const payload = {
      jsonrpc: "2.0",
      method: "call",
      params: {
        service: "common",
        method: "authenticate",
        args: [ODOO_DB, email, password, {}],
      },
      id: Date.now(),
    };
    const response = await axios.post(`${ODOO_URL}/jsonrpc`, payload, {
      headers: { "Content-Type": "application/json" },
    });
    return response.data.result || null;
  } catch (error: any) {
    console.error("❌ Error autenticando con Odoo:", error.message);
    // Mismo problema que en callOdooRPC: sin este chequeo, un Odoo caído o
    // apuntado a la instancia equivocada se confunde con "contraseña
    // incorrecta" (login/route.ts devolvía "Credenciales inválidas" en
    // ambos casos por igual).
    if (!error.response) {
      throw new OdooUnreachableError(error);
    }
    return null;
  }
}

/**
 * Obtiene usuarios con perfiles de venta y localización
 */
export async function getOdooUsers(): Promise<any[]> {
  const model = "res.users";
  const method = "search_read";
  const domain = [["active", "=", true]];

  const fields = [
    "id",
    "name",
    "login",
    "email",
    "phone",
    "mobile",
    "state_id",
    "country_id",
    "function",
    "partner_id",
  ];

  const users = await callOdooRPC<any[]>(model, method, [domain], { fields });
  return users || [];
}
