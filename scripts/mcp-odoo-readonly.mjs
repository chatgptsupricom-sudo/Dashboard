#!/usr/bin/env node
/**
 * Servidor MCP (stdio) de SOLO LECTURA contra el Odoo de producción, para
 * verificar KPIs desde Claude Code (ver skill verificar-kpi-odoo y el agente
 * kpi-auditor). Sin dependencias: habla JSON-RPC por stdin/stdout.
 *
 * Credenciales: las mismas del panel. Se leen de las variables de entorno o,
 * si faltan, del `.env.local` del proyecto (o del repo principal cuando se
 * corre desde un worktree). Nunca se escriben en ningún lado.
 *
 *   NEXT_PUBLIC_ODOO_URL, ODOO_DB, ODOO_API_KEY, ODOO_UID (default 388)
 *
 * Solo se permiten métodos que no escriben (ver METODOS_PERMITIDOS): aunque
 * el usuario de la API tenga permisos de escritura, este servidor no los usa.
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

// ── Credenciales ──────────────────────────────────────────────────────────
function cargarEnvLocal() {
  const base = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const candidatos = [path.join(base, ".env.local")];
  // Worktree en <repo>/.claude/worktrees/<nombre>: probar también el repo.
  const m = base.replace(/\\/g, "/").match(/^(.*)\/\.claude\/worktrees\/[^/]+\/?$/);
  if (m) candidatos.push(path.join(m[1], ".env.local"));
  for (const archivo of candidatos) {
    if (!fs.existsSync(archivo)) continue;
    for (const linea of fs.readFileSync(archivo, "utf8").split(/\r?\n/)) {
      const kv = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!kv || process.env[kv[1]] !== undefined) continue;
      process.env[kv[1]] = kv[2].replace(/^["']|["']$/g, "");
    }
    return archivo;
  }
  return null;
}
const envCargado = cargarEnvLocal();

const ODOO_URL = (process.env.NEXT_PUBLIC_ODOO_URL || "https://supricom2.odoo.com").replace(/\/$/, "");
const ODOO_DB = process.env.ODOO_DB || "";
const ODOO_UID = Number(process.env.ODOO_UID) || 388;
const ODOO_API_KEY = process.env.ODOO_API_KEY || "";

const METODOS_PERMITIDOS = new Set(["search_read", "read", "search_count", "read_group", "fields_get"]);
const MAX_TEXTO = 200_000;

async function odoo(model, method, args, kwargs = {}) {
  if (!METODOS_PERMITIDOS.has(method)) throw new Error(`Método no permitido (solo lectura): ${method}`);
  if (!ODOO_DB || !ODOO_API_KEY) {
    throw new Error(
      `Faltan ODOO_DB / ODOO_API_KEY. Ponlos en .env.local del proyecto${envCargado ? ` (leído: ${envCargado})` : " (no se encontró ninguno)"}.`,
    );
  }
  const res = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { service: "object", method: "execute_kw", args: [ODOO_DB, ODOO_UID, ODOO_API_KEY, model, method, args, kwargs] },
      id: Date.now(),
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.data?.message || data.error.message || JSON.stringify(data.error));
  return data.result;
}

// ── Herramientas ──────────────────────────────────────────────────────────
const dominio = { type: "array", description: 'Dominio Odoo, ej. [["move_type","=","out_invoice"],["company_id","in",[9]]]', default: [] };
const TOOLS = [
  {
    name: "odoo_search_read",
    description: "search_read de solo lectura en Odoo. Devuelve registros como JSON. Usar `limit` (default 80, máx 5000) y `offset` para paginar.",
    inputSchema: {
      type: "object",
      properties: {
        model: { type: "string", description: "Modelo, ej. account.move" },
        domain: dominio,
        fields: { type: "array", items: { type: "string" } },
        limit: { type: "number" },
        offset: { type: "number" },
        order: { type: "string", description: 'ej. "id asc"' },
      },
      required: ["model"],
    },
    run: (a) =>
      odoo(a.model, "search_read", [a.domain || []], {
        fields: a.fields || [],
        limit: Math.min(Number(a.limit) || 80, 5000),
        offset: Number(a.offset) || 0,
        ...(a.order ? { order: a.order } : {}),
      }),
  },
  {
    name: "odoo_read_group",
    description:
      'read_group de solo lectura: agregados en el servidor. fields admite "campo:sum", "campo:min", "campo:max", "campo:count". Ideal para sumar sin traer miles de filas.',
    inputSchema: {
      type: "object",
      properties: {
        model: { type: "string" },
        domain: dominio,
        fields: { type: "array", items: { type: "string" } },
        groupby: { type: "array", items: { type: "string" } },
        lazy: { type: "boolean", default: false },
        limit: { type: "number" },
        orderby: { type: "string" },
      },
      required: ["model", "fields", "groupby"],
    },
    run: (a) =>
      odoo(a.model, "read_group", [a.domain || [], a.fields, a.groupby], {
        lazy: a.lazy ?? false,
        ...(a.limit ? { limit: Number(a.limit) } : {}),
        ...(a.orderby ? { orderby: a.orderby } : {}),
      }),
  },
  {
    name: "odoo_search_count",
    description: "Cuenta registros que cumplen un dominio.",
    inputSchema: { type: "object", properties: { model: { type: "string" }, domain: dominio }, required: ["model"] },
    run: (a) => odoo(a.model, "search_count", [a.domain || []]),
  },
  {
    name: "odoo_fields_get",
    description: "Lista los campos de un modelo (nombre, tipo, etiqueta, si es almacenado).",
    inputSchema: {
      type: "object",
      properties: { model: { type: "string" }, fields: { type: "array", items: { type: "string" } } },
      required: ["model"],
    },
    run: (a) => odoo(a.model, "fields_get", a.fields?.length ? [a.fields] : [], { attributes: ["string", "type", "store", "relation"] }),
  },
];

// ── Protocolo MCP (JSON-RPC por líneas en stdio) ──────────────────────────
const enviar = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");

async function manejar(msg) {
  const { id, method, params } = msg;
  if (id === undefined) return; // notificación
  try {
    if (method === "initialize") {
      return enviar({
        jsonrpc: "2.0", id,
        result: {
          protocolVersion: params?.protocolVersion || "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "odoo-readonly", version: "1.0.0" },
        },
      });
    }
    if (method === "ping") return enviar({ jsonrpc: "2.0", id, result: {} });
    if (method === "tools/list") {
      return enviar({ jsonrpc: "2.0", id, result: { tools: TOOLS.map(({ run, ...t }) => t) } });
    }
    if (method === "tools/call") {
      const tool = TOOLS.find((t) => t.name === params?.name);
      if (!tool) throw Object.assign(new Error(`Herramienta desconocida: ${params?.name}`), { code: -32602 });
      try {
        const out = await tool.run(params.arguments || {});
        let texto = JSON.stringify(out);
        if (texto.length > MAX_TEXTO) texto = texto.slice(0, MAX_TEXTO) + `\n…[truncado: ${texto.length} caracteres; usa limit/offset o read_group]`;
        return enviar({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: texto }] } });
      } catch (e) {
        return enviar({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true } });
      }
    }
    throw Object.assign(new Error(`Método no soportado: ${method}`), { code: -32601 });
  } catch (e) {
    enviar({ jsonrpc: "2.0", id, error: { code: e.code || -32603, message: e.message } });
  }
}

readline.createInterface({ input: process.stdin }).on("line", (linea) => {
  if (!linea.trim()) return;
  let msg;
  try { msg = JSON.parse(linea); } catch { return; }
  manejar(msg);
});
