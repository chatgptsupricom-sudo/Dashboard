import axios from "axios";

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
const ODOO_API_KEY =
  process.env.ODOO_API_KEY || "47d01399e318452857e554e82184aaf4745b47a1";

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
          388,
          ODOO_API_KEY,
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
  } catch (error) {
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
