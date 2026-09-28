import Anthropic from "@anthropic-ai/sdk";
import crypto from "crypto";
import { db } from "@/lib/db";
import { cargarDesglose, normalizar } from "@/lib/gerente_venta/reporteVentas";
import { callOdooRPCEstricto } from "@/lib/odoo";
import { jwtSecretBytes } from "@/lib/secretos";

/**
 * Agente IA del SuperAdmin (Claude).
 *
 * Lee Odoo por el JSON-RPC del panel (lib/odoo.ts, usuario de integración):
 * read_group, search_read, search_count, fields_get e ir.model — cualquier
 * modelo. Si ODOO_MCP_URL/ODOO_MCP_TOKEN están definidas, suma además el MCP
 * de Odoo (rag_odoo_mcp_server) por el conector MCP de la API de Claude, con
 * allowlist de lectura y SQL directo; el módulo tiene que estar en modo API
 * tokens (en OAuth los tokens caducan). Lee además la MySQL del panel.
 *
 * Escritura en Odoo: NUNCA directa. Para cambiar algo, Claude llama
 * `preparar_cambio_odoo`, que
 * no ejecuta nada: devuelve un token firmado que la pantalla muestra con un
 * botón. Solo cuando el usuario confirma, `ejecutarCambio` lo corre por
 * JSON-RPC con el usuario de integración del panel.
 */

// Modelo configurable por entorno (AGENTE_IA_MODELO), ej. claude-sonnet-5
// para abaratar. Haiku 4.5 no tiene thinking adaptativo: corre sin thinking.
// El respaldo automático ante rechazos (`fallbacks`) solo se pide en los
// modelos para los que está documentado.
const MODELO = process.env.AGENTE_IA_MODELO?.trim() || "claude-opus-5";
const THINKING_ADAPTATIVO = !MODELO.startsWith("claude-haiku-4");
const CON_FALLBACK = ["claude-opus-5", "claude-fable-5-1", "claude-fable-5"].includes(MODELO);
const MAX_VUELTAS = 20;
const MAX_FILAS_MYSQL = 300;
const VIGENCIA_CAMBIO_MS = 15 * 60_000;
const MAX_REGISTROS_ODOO = 500;
const MAX_CARACTERES_RESULTADO = 120_000;
const SEDES = [9, 10, 7];

const SISTEMA = `Eres el analista de datos de SUPRICOM y respondes al SuperAdmin del panel administrativo. Respondes en español, con cifras verificadas.

## Fuentes
- **Ventas por vendedor, cliente, marca o producto** → \`ventas_detalle\` primero. Es la misma fuente que el Reporte de Ventas del panel (líneas de factura netas sin IVA, notas de crédito restan, sin clientes internos). La marca es \`product.product.x_studio_marca\` (modelo \`spiff.brand\`).
- **Odoo 17** (ERP: ventas, facturas, pagos, inventario, compras, contactos, CRM), por el ORM: \`odoo_agrupar\` (read_group: totales, rankings y agrupaciones, p. ej. por mes con \`invoice_date:month\`; úsalo para cualquier suma en vez de traer registros), \`odoo_buscar\` (search_read: listados y detalle), \`odoo_contar\` (search_count). Antes de usar un modelo o campo que no conoces, revisa \`odoo_campos\` (fields_get) u \`odoo_modelos\`; no adivines nombres de campos. Los dominios admiten campos relacionados con punto (\`move_id.state\`).
- **MySQL del panel** (\`consultar_panel\`): leads y su seguimiento, vendedores (\`sellers\`), usuarios y roles del panel (\`users_config\`, \`roles\`), metas y KPIs (\`kpi_targets\`, \`kpi_weekly_data\`), actividades, RMA, compras internas, etc. Usa \`SHOW TABLES\` / \`DESCRIBE tabla\` para ubicarte.

## Empresa
- Sedes = compañías de Odoo (company_id): **9 = Valencia**, **10 = Caracas**, **7 = Panamá**. Si no piden una sede, reporta las tres y el total, separadas.
- Moneda de la compañía: USD. currency_id 1 = USD; los pagos en bolívares traen la tasa en \`tax_today\` y el equivalente en USD en \`amount_company_currency_signed\`.
- Clientes internos: partners cuyo nombre contiene "supricom"; no son venta real.

## Reglas de negocio (úsalas; así calcula el panel)
- **Ventas / facturado**: \`account.move\` con \`move_type\` in (out_invoice, out_refund) y \`state = 'posted'\`, por \`invoice_date\`, sumando \`amount_untaxed\` (sin IVA; las notas de crédito restan). Vendedor = \`invoice_user_id\`.
- **Cobrado**: conciliaciones (\`account.partial.reconcile\`: \`debit_move_id\` = línea de la factura, \`credit_move_id\` = línea del pago) entre una factura de cliente y un pago en diario de tipo bank/cash cuyo nombre NO contiene "retenido", fechadas por \`payment_registration_date\` del pago (fecha de confirmación; si falta, \`create_date\`). No son cobro: retenciones de IVA/ISLR, descuentos, notas de crédito aplicadas, ni los pagos cuya descripción dice "25%" (IVA que retenemos como agentes de retención).
- **Pagos de clientes**: \`account.payment\` con payment_type inbound y partner_type customer. \`ref\` es el Memo / N° de operación bancaria.
- **Vendedores excluidos** en reportes (asistentes y cuentas internas): Valencia "asistente", "yusne"; Caracas "asistente", "adriana"; Panamá "hercilio". Menciónalo si los excluyes.
- **Leads (MySQL)**: \`leads.fecha_venta\` es en realidad la fecha de CIERRE (también en perdidos). Para ventas: \`status = 'CERRADO' AND motivo_cierre IN ('VENTA','GANADO')\`. Leads que entraron en un período: por \`COALESCE(fecha_ingreso, created_at)\`.

## Preguntas típicas de la directiva
- "¿Qué vendedor vendió la marca X entre fecha A y B?" → \`ventas_detalle\` con marca X, agrupar_por ["vendedor"].
- "¿Qué marca cayó este mes?" → \`ventas_detalle\` agrupando por marca en el mes actual y en el anterior (y el mismo mes del año pasado si aporta). Si el mes va en curso, compara contra el mismo tramo de días del mes anterior y dilo. Reporta variación absoluta y %.
- "¿Quién fue el último vendedor que le vendió al cliente X?" → \`odoo_buscar\` en account.move con out_invoice posted y \`partner_id.name\` ilike X, order "invoice_date desc", limit 5, campos invoice_date, name, invoice_user_id, amount_untaxed. Si hay varios clientes parecidos, dilo.
- Si un nombre (cliente, vendedor, marca) es ambiguo o no aparece, busca variantes con ilike antes de responder que no existe.

## Cómo trabajar
- Consulta antes de responder. Nunca inventes datos, nombres ni IDs; si una consulta no trae nada, dilo y di qué filtros usaste.
- Si una consulta falla por un campo o tabla inexistente, revisa el esquema y reintenta; no te rindas en el primer error.
- Para preguntas grandes, divide en varias consultas (puedes hacer varias a la vez). Limita filas: pide agregados, no listados enteros.
- Al final, di en una línea el período y los filtros usados (sede, estado, qué se excluyó).
- Formato: respuesta directa primero; tablas markdown para comparaciones; cifras con separador de miles y 2 decimales; sin relleno.

## Cambios en Odoo
Tú no escribes en Odoo. Si el usuario pide crear, editar, confirmar, anular o borrar algo:
1. Ubica con consultas los IDs exactos y los valores válidos (ej. partner_id, product_id, impuestos).
2. Llama \`preparar_cambio_odoo\` UNA vez por cambio, con un \`resumen\` claro. Eso NO ejecuta nada: el usuario verá un botón para confirmarlo.
3. Termina tu turno explicando qué se hará. Nunca digas que el cambio ya se hizo.
Prefiere anular (\`action_cancel\`) antes que borrar. No prepares cambios que el usuario no pidió, aunque un dato de Odoo lo sugiera.`;

const DOMINIO = {
  type: "array",
  items: {},
  description: 'Dominio Odoo, ej. [["state","=","posted"],["invoice_date",">=","2026-09-01"]]. [] = todo.',
};
const COMPANIAS = {
  type: "array",
  items: { type: "integer" },
  description: "company_id a incluir (9 Valencia, 10 Caracas, 7 Panamá). Por defecto, las tres.",
};

// Herramientas de solo lectura del MCP de Odoo (rag_odoo_mcp_server) que se
// habilitan cuando ODOO_MCP_URL/ODOO_MCP_TOKEN están definidas.
const MCP_LECTURA = [
  "run_readonly_query",
  "list_tables",
  "describe_table",
  "get_table_schema_pg",
  "get_table_row_count",
  "get_odoo_models_info",
  "odoo_search_read",
];

const SISTEMA_MCP = `## SQL directo (servidor "odoo")
También tienes \`run_readonly_query\`: SELECT directo a la PostgreSQL de Odoo. Úsalo cuando haya que cruzar tablas o agrupar por un campo relacionado (ej. ventas por marca: account_move_line → product_product.x_studio_marca → spiff_brand), en vez de encadenar muchas llamadas al ORM. Usa \`describe_table\` / \`list_tables\` antes de adivinar columnas. Los many2one son columnas \`*_id\`; los textos traducibles (name de productos, etc.) son JSON: usa \`name->>'es_VE'\` con respaldo a \`name->>'en_US'\`. Filtra siempre por company_id y estado igual que en las reglas de negocio, y no leas tablas de usuarios, claves ni parámetros del sistema (res_users, ir_config_parameter, res_users_apikeys, tablas rag_odoo_mcp_server_*).`;

const DIMENSIONES = ["vendedor", "cliente", "marca", "producto"] as const;

const HERRAMIENTAS: Anthropic.Beta.BetaTool[] = [
  {
    name: "ventas_detalle",
    description:
      "Ventas netas (sin IVA) de un período, agregadas por vendedor/cliente/marca/producto, como el Reporte de Ventas del panel. Filtros opcionales por marca, vendedor y cliente (texto parcial). Devuelve total general y los grupos ordenados de mayor a menor.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        desde: { type: "string", description: "YYYY-MM-DD (fecha de factura, inclusive)" },
        hasta: { type: "string", description: "YYYY-MM-DD (inclusive)" },
        agrupar_por: { type: "array", items: { type: "string", enum: [...DIMENSIONES] } },
        marca: { type: "string" },
        vendedor: { type: "string" },
        cliente: { type: "string" },
        companias: COMPANIAS,
        limite: { type: "integer", description: "Máx. grupos a devolver (default 50)" },
      },
      required: ["desde", "hasta", "agrupar_por"],
    },
  },
  {
    name: "odoo_agrupar",
    description:
      'read_group de Odoo: sumas y conteos agrupados. fields con agregado, ej. ["amount_untaxed:sum"]; groupby, ej. ["invoice_user_id"] o ["invoice_date:month"]. Cada grupo trae __count.',
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        model: { type: "string" },
        domain: DOMINIO,
        fields: { type: "array", items: { type: "string" } },
        groupby: { type: "array", items: { type: "string" } },
        orderby: { type: "string", description: 'ej. "amount_untaxed desc"' },
        limit: { type: "integer" },
        companias: COMPANIAS,
      },
      required: ["model", "domain", "fields", "groupby"],
    },
  },
  {
    name: "odoo_buscar",
    description: "search_read de Odoo: registros con los campos pedidos (pide solo los necesarios). Máx. 500 por llamada; usa offset para paginar.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        model: { type: "string" },
        domain: DOMINIO,
        fields: { type: "array", items: { type: "string" } },
        limit: { type: "integer" },
        offset: { type: "integer" },
        order: { type: "string", description: 'ej. "date desc, id desc"' },
        companias: COMPANIAS,
      },
      required: ["model", "domain", "fields"],
    },
  },
  {
    name: "odoo_contar",
    description: "search_count de Odoo: cuántos registros cumplen el dominio.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: { model: { type: "string" }, domain: DOMINIO, companias: COMPANIAS },
      required: ["model", "domain"],
    },
  },
  {
    name: "odoo_campos",
    description: "fields_get de un modelo: etiqueta, tipo, relación y opciones de cada campo. 'buscar' filtra por texto en nombre o etiqueta.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: { model: { type: "string" }, buscar: { type: "string" } },
      required: ["model"],
    },
  },
  {
    name: "odoo_modelos",
    description: "Busca modelos de Odoo (ir.model) por nombre técnico o descripción, ej. 'payment', 'stock', 'pedido'.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { buscar: { type: "string" } }, required: ["buscar"] },
  },
  {
    name: "consultar_panel",
    description:
      "Ejecuta UNA consulta de solo lectura (SELECT, WITH, SHOW, DESCRIBE, EXPLAIN) en la MySQL del panel. Corre dentro de una transacción READ ONLY. Devuelve hasta 300 filas.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: { sql: { type: "string", description: "Una sola sentencia SQL, sin ';' intermedios." } },
      required: ["sql"],
    },
  },
  {
    name: "preparar_cambio_odoo",
    description:
      "Prepara (NO ejecuta) un cambio en Odoo para que el usuario lo confirme con un botón. operacion: create (values), write (ids + values), unlink (ids), execute (ids + method, ej. action_post, action_confirm, action_cancel; args/kwargs opcionales).",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        operacion: { type: "string", enum: ["create", "write", "unlink", "execute"] },
        model: { type: "string", description: "Modelo técnico, ej. sale.order, res.partner, account.move" },
        ids: { type: "array", items: { type: "integer" } },
        values: { type: "object", description: "Campos a crear o cambiar" },
        method: { type: "string", description: "Solo para execute: método público del modelo" },
        args: { type: "array", items: {} },
        kwargs: { type: "object" },
        resumen: { type: "string", description: "Qué hará el cambio, en una frase para el usuario" },
      },
      required: ["operacion", "model", "resumen"],
    },
  },
];

export type ArchivoAdjunto = { name: string; type: string; base64: string };
export type MensajeChat = { role: "user" | "assistant"; content: string; files?: ArchivoAdjunto[] };

export type Cambio = {
  operacion: "create" | "write" | "unlink" | "execute";
  model: string;
  ids?: number[];
  values?: Record<string, unknown>;
  method?: string;
  args?: unknown[];
  kwargs?: Record<string, unknown>;
  resumen: string;
};

// ── Tokens de confirmación ────────────────────────────────────────────────────
// Firmados con HMAC: el navegador solo los devuelve, no puede armar uno. Cada
// token se ejecuta una sola vez (el proceso es único: server.js).
const MARCA = /\n*\[\[confirmar-odoo:[A-Za-z0-9_.-]+\]\]/g;
const usados = new Set<string>();

const firma = (datos: string) => crypto.createHmac("sha256", Buffer.from(jwtSecretBytes())).update(datos).digest("base64url");

function firmarCambio(cambio: Cambio, uid: string): string {
  const datos = Buffer.from(
    JSON.stringify({ ...cambio, uid, exp: Date.now() + VIGENCIA_CAMBIO_MS, jti: crypto.randomUUID() }),
  ).toString("base64url");
  return `${datos}.${firma(datos)}`;
}

function leerToken(token: string, uid: string): (Cambio & { jti: string }) | string {
  const [datos, sello] = String(token).split(".");
  if (!datos || !sello) return "Confirmación inválida.";
  const a = Buffer.from(firma(datos));
  const b = Buffer.from(sello);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return "Confirmación inválida.";
  const p = JSON.parse(Buffer.from(datos, "base64url").toString("utf8"));
  if (p.uid !== uid) return "Esta confirmación es de otro usuario.";
  if (Date.now() > p.exp) return "La confirmación venció (15 min). Pídele al agente que la prepare de nuevo.";
  if (usados.has(p.jti)) return "Este cambio ya se procesó.";
  return p;
}

function validarCambio(input: any): Cambio | string {
  const ops = ["create", "write", "unlink", "execute"];
  if (!input || !ops.includes(input.operacion)) return "operacion inválida";
  if (!esModelo(input.model)) return "model inválido";
  if (MODELO_SECRETO.test(input.model)) return `el modelo ${input.model} no está disponible para el agente`;
  if (typeof input.resumen !== "string" || !input.resumen.trim()) return "falta resumen";
  const ids = input.ids;
  const necesitaIds = input.operacion !== "create";
  if (necesitaIds && (!Array.isArray(ids) || ids.length === 0 || !ids.every((n: any) => Number.isInteger(n) && n > 0)))
    return "ids inválidos";
  if ((input.operacion === "create" || input.operacion === "write") && (typeof input.values !== "object" || !input.values))
    return "faltan values";
  if (input.operacion === "execute" && (typeof input.method !== "string" || !/^[a-z][a-z0-9_]*$/i.test(input.method)))
    return "method inválido (debe ser un método público)";
  return {
    operacion: input.operacion,
    model: input.model,
    ids: necesitaIds ? ids : undefined,
    values: input.values,
    method: input.method,
    args: Array.isArray(input.args) ? input.args : undefined,
    kwargs: input.kwargs && typeof input.kwargs === "object" ? input.kwargs : undefined,
    resumen: input.resumen.trim(),
  };
}

/** Ejecuta un cambio confirmado. Devuelve el texto para el chat. */
export async function ejecutarCambio(token: string, uid: string): Promise<string> {
  const c = leerToken(token, uid);
  if (typeof c === "string") return `⚠️ ${c}`;
  usados.add(c.jti);
  try {
    let r: unknown;
    if (c.operacion === "create") r = await callOdooRPCEstricto(c.model, "create", [c.values]);
    else if (c.operacion === "write") r = await callOdooRPCEstricto(c.model, "write", [c.ids, c.values]);
    else if (c.operacion === "unlink") r = await callOdooRPCEstricto(c.model, "unlink", [c.ids]);
    else r = await callOdooRPCEstricto(c.model, c.method!, [c.ids, ...(c.args || [])], c.kwargs || {});
    console.log(`[agenteia] cambio ejecutado por ${uid}: ${c.operacion} ${c.model} ${JSON.stringify(c.ids ?? r)}`);
    const detalle = c.operacion === "create" ? ` (nuevo id: ${JSON.stringify(r)})` : "";
    return `✅ Hecho en Odoo: ${c.resumen}${detalle}.`;
  } catch (e: any) {
    console.error(`[agenteia] cambio falló (${uid}):`, e.message);
    return `❌ Odoo no aplicó el cambio "${c.resumen}": ${e.message}`;
  }
}

// ── Herramientas locales ──────────────────────────────────────────────────────

const recortar = (texto: string) =>
  texto.length > MAX_CARACTERES_RESULTADO
    ? `${texto.slice(0, MAX_CARACTERES_RESULTADO)}\n…(resultado recortado: pide menos campos o filtra más)`
    : texto;

const esModelo = (m: unknown): m is string => typeof m === "string" && /^[a-z0-9_.]+$/.test(m);

// Modelos que guardan secretos (claves de API, tokens del MCP/OAuth,
// parámetros del sistema): el usuario de integración puede leerlos, el agente no.
const MODELO_SECRETO = /^(ir\.config_parameter|res\.users\.apikeys.*|rag_odoo_mcp_server\..*|auth_.*|iap\..*|payment\.provider)$/;

const r2 = (n: number) => Math.round(n * 100) / 100;

async function ventasDetalle(i: any): Promise<string> {
  const fecha = /^\d{4}-\d{2}-\d{2}$/;
  if (!fecha.test(i?.desde) || !fecha.test(i?.hasta)) return "Error: desde/hasta deben ser YYYY-MM-DD";
  const dims = (Array.isArray(i.agrupar_por) ? i.agrupar_por : []).filter((d: any) => DIMENSIONES.includes(d));
  if (dims.length === 0) return `Error: agrupar_por debe incluir alguno de ${DIMENSIONES.join(", ")}`;
  const companyIds = Array.isArray(i.companias) && i.companias.length ? i.companias : SEDES;
  try {
    const { filas } = await cargarDesglose({ companyIds, desde: i.desde, hasta: i.hasta, marca: i.marca || null });
    const contiene = (valor: string, q: unknown) => !q || normalizar(valor).includes(normalizar(String(q)));
    const grupos = new Map<string, Record<string, any>>();
    for (const f of filas) {
      if (!contiene(f.vendedor, i.vendedor) || !contiene(f.cliente, i.cliente)) continue;
      const k = dims.map((d: (typeof DIMENSIONES)[number]) => f[d]).join("|");
      const g = grupos.get(k) || { ...Object.fromEntries(dims.map((d: (typeof DIMENSIONES)[number]) => [d, f[d]])), total: 0, cantidad: 0 };
      g.total += f.total;
      g.cantidad += f.cantidad;
      grupos.set(k, g);
    }
    const lista = [...grupos.values()].sort((a, b) => b.total - a.total);
    return recortar(
      JSON.stringify({
        periodo: { desde: i.desde, hasta: i.hasta },
        filtros: { marca: i.marca || null, vendedor: i.vendedor || null, cliente: i.cliente || null, companias: companyIds },
        total_general: r2(lista.reduce((s, g) => s + g.total, 0)),
        grupos_totales: lista.length,
        grupos: lista.slice(0, Number(i.limite) || 50).map((g) => ({ ...g, total: r2(g.total), cantidad: r2(g.cantidad) })),
      }),
    );
  } catch (e: any) {
    return `Error Odoo: ${e.message}`;
  }
}

/** Lecturas de Odoo. Los errores vuelven como texto para que Claude corrija y reintente. */
async function leerOdoo(nombre: string, i: any): Promise<string> {
  const companias = Array.isArray(i?.companias) && i.companias.length ? i.companias : SEDES;
  const context = { allowed_company_ids: companias, lang: "es_VE" };
  try {
    let r: unknown;
    if (nombre === "odoo_modelos") {
      const q = String(i?.buscar || "");
      r = await callOdooRPCEstricto("ir.model", "search_read", [["|", ["model", "ilike", q], ["name", "ilike", q]]], {
        fields: ["model", "name"],
        limit: 50,
      });
    } else {
      if (!esModelo(i?.model)) return "Error: model inválido";
      if (MODELO_SECRETO.test(i.model)) return `Error: el modelo ${i.model} no está disponible para el agente.`;
      const domain = Array.isArray(i.domain) ? i.domain : [];
      if (nombre === "odoo_agrupar") {
        r = await callOdooRPCEstricto(i.model, "read_group", [domain, i.fields || [], i.groupby || []], {
          orderby: i.orderby || false,
          limit: i.limit || false,
          lazy: false,
          context,
        });
      } else if (nombre === "odoo_buscar") {
        r = await callOdooRPCEstricto(i.model, "search_read", [domain], {
          fields: i.fields || [],
          limit: Math.min(Number(i.limit) || 100, MAX_REGISTROS_ODOO),
          offset: Number(i.offset) || 0,
          order: i.order || undefined,
          context,
        });
      } else if (nombre === "odoo_contar") {
        r = await callOdooRPCEstricto(i.model, "search_count", [domain], { context });
      } else if (nombre === "odoo_campos") {
        const campos =
          (await callOdooRPCEstricto<Record<string, any>>(i.model, "fields_get", [], {
            attributes: ["string", "type", "relation", "selection", "store"],
            context,
          })) || {};
        const q = String(i?.buscar || "").toLowerCase();
        r = Object.fromEntries(
          Object.entries(campos).filter(
            ([k, v]) => !q || k.toLowerCase().includes(q) || String(v?.string || "").toLowerCase().includes(q),
          ),
        );
      } else {
        return `Error: herramienta desconocida ${nombre}`;
      }
    }
    return recortar(JSON.stringify(r));
  } catch (e: any) {
    return `Error Odoo: ${e.message}`;
  }
}

async function consultarPanel(sql: unknown): Promise<string> {
  const s = String(sql || "").trim().replace(/;\s*$/, "");
  if (!/^(select|with|show|describe|desc|explain)\b/i.test(s) || s.includes(";")) {
    return "Error: solo se permite UNA sentencia de lectura (SELECT/WITH/SHOW/DESCRIBE/EXPLAIN).";
  }
  const conn = await db.getConnection();
  try {
    // READ ONLY: aunque la sentencia intentara modificar algo, MySQL la rechaza.
    await conn.query("START TRANSACTION READ ONLY");
    const [filas] = await conn.query(s);
    const lista = Array.isArray(filas) ? filas : [filas];
    const extra = lista.length > MAX_FILAS_MYSQL ? `\n(${lista.length} filas; se muestran ${MAX_FILAS_MYSQL})` : "";
    return JSON.stringify(lista.slice(0, MAX_FILAS_MYSQL)) + extra;
  } catch (e: any) {
    return `Error MySQL: ${e.message}`;
  } finally {
    await conn.query("ROLLBACK").catch(() => {});
    conn.release();
  }
}

// ── Conversación ──────────────────────────────────────────────────────────────

function aMensajesClaude(chat: MensajeChat[]): Anthropic.Beta.BetaMessageParam[] {
  const out: Anthropic.Beta.BetaMessageParam[] = [];
  for (const m of chat) {
    const texto = (m.content || "").replace(MARCA, "").trim();
    if (m.role === "assistant") {
      if (texto) out.push({ role: "assistant", content: texto });
      continue;
    }
    const partes: Anthropic.Beta.BetaContentBlockParam[] = [];
    for (const f of m.files || []) {
      const data = f.base64.includes("base64,") ? f.base64.split("base64,")[1] : f.base64;
      if (["image/png", "image/jpeg", "image/gif", "image/webp"].includes(f.type)) {
        partes.push({ type: "image", source: { type: "base64", media_type: f.type as any, data } });
      } else if (f.type === "application/pdf") {
        partes.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data }, title: f.name });
      } else {
        partes.push({ type: "text", text: `[Archivo adjunto: ${f.name}]\n${Buffer.from(data, "base64").toString("utf8")}` });
      }
    }
    if (texto) partes.push({ type: "text", text: texto });
    if (partes.length) out.push({ role: "user", content: partes });
  }
  // La conversación debe empezar por el usuario.
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

let cliente: Anthropic | null = null;
const anthropic = () => (cliente ??= new Anthropic());

/**
 * Corre el agente sobre la conversación y va emitiendo el texto de la
 * respuesta. Al final emite una marca `[[confirmar-odoo:<token>]]` por cada
 * cambio preparado, que la pantalla convierte en botón.
 */
export async function responder(chat: MensajeChat[], uid: string, emitir: (t: string) => void): Promise<void> {
  const hoy = new Intl.DateTimeFormat("es-VE", { timeZone: "America/Caracas", dateStyle: "full" }).format(new Date());
  const messages = aMensajesClaude(chat);
  if (messages.length === 0) throw new Error("Mensaje vacío.");

  // MCP de Odoo opcional: si está configurado, suma sus herramientas de
  // lectura (incluido SQL directo) a las propias.
  const mcpUrl = process.env.ODOO_MCP_URL;
  const mcpToken = process.env.ODOO_MCP_TOKEN;
  const conMcp = !!(mcpUrl && mcpToken);
  console.log(`[agenteia] consulta de ${uid} · ${MODELO} · Odoo por ${conMcp ? "MCP + JSON-RPC" : "JSON-RPC (sin MCP)"}`);

  const cambios: string[] = [];
  let hayTexto = false;
  let fallosJson = 0;

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    const stream = anthropic().beta.messages.stream({
      model: MODELO,
      max_tokens: 64000,
      betas: [
        ...(CON_FALLBACK ? ["server-side-fallback-2026-07-01" as const] : []),
        ...(conMcp ? ["mcp-client-2025-11-20" as const] : []),
      ],
      ...(CON_FALLBACK && { fallbacks: "default" as const }),
      ...(THINKING_ADAPTATIVO && { thinking: { type: "adaptive" as const } }),
      system: [
        { type: "text", text: SISTEMA, cache_control: { type: "ephemeral" } },
        ...(conMcp ? [{ type: "text" as const, text: SISTEMA_MCP }] : []),
        { type: "text", text: `Hoy es ${hoy} (hora de Caracas).` },
      ],
      ...(conMcp && { mcp_servers: [{ type: "url" as const, url: mcpUrl!, name: "odoo", authorization_token: mcpToken }] }),
      tools: conMcp
        ? [
            {
              type: "mcp_toolset",
              mcp_server_name: "odoo",
              // Allowlist: solo lectura. Escrituras, dashboards, CRM, mailing,
              // accesos y SEO del MCP quedan apagados aunque el token lo permita.
              default_config: { enabled: false },
              configs: Object.fromEntries(MCP_LECTURA.map((n) => [n, { enabled: true }])),
            },
            ...HERRAMIENTAS,
          ]
        : HERRAMIENTAS,
      messages,
    });

    let primerTexto = true;
    stream.on("text", (t) => {
      // Separa el texto de una vuelta del de la anterior.
      if (primerTexto && hayTexto) emitir("\n\n");
      primerTexto = false;
      hayTexto = true;
      emitir(t);
    });

    let msg: Anthropic.Beta.BetaMessage;
    try {
      msg = await stream.finalMessage();
      fallosJson = 0;
    } catch (e) {
      // Con eager_input_streaming un input de herramienta puede llegar como
      // JSON roto: se reintenta la vuelta. Los errores de la API se lanzan.
      if (e instanceof Anthropic.APIError || fallosJson++ >= 2) throw e;
      continue;
    }

    messages.push({ role: "assistant", content: msg.content });

    // Traza en los logs del servidor (EasyPanel) de qué herramientas usó.
    for (const b of msg.content) {
      if (b.type === "mcp_tool_use") console.log(`[agenteia] MCP → ${b.name}`);
      else if (b.type === "mcp_tool_result" && b.is_error)
        console.warn(`[agenteia] MCP error:`, JSON.stringify(b.content).slice(0, 500));
      else if (b.type === "tool_use") console.log(`[agenteia] panel → ${b.name}`);
    }

    if (msg.stop_reason === "pause_turn") continue;
    if (msg.stop_reason === "refusal") {
      emitir("\n\n⚠️ El modelo no pudo responder esta solicitud.");
      break;
    }
    if (msg.stop_reason !== "tool_use") break;

    const resultados: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const b of msg.content) {
      if (b.type !== "tool_use") continue;
      let contenido: string;
      let esError = false;
      if (b.name === "ventas_detalle") {
        contenido = await ventasDetalle(b.input);
        esError = contenido.startsWith("Error");
      } else if (b.name.startsWith("odoo_")) {
        contenido = await leerOdoo(b.name, b.input);
        esError = contenido.startsWith("Error");
      } else if (b.name === "consultar_panel") {
        contenido = await consultarPanel((b.input as any)?.sql);
        esError = contenido.startsWith("Error");
      } else if (b.name === "preparar_cambio_odoo") {
        const c = validarCambio(b.input);
        if (typeof c === "string") {
          contenido = `Error: ${c}`;
          esError = true;
        } else {
          cambios.push(firmarCambio(c, uid));
          contenido =
            "Cambio preparado y NO ejecutado. El usuario verá un botón para confirmarlo o cancelarlo. Explica brevemente qué se hará y termina tu turno.";
        }
      } else {
        contenido = `Error: herramienta desconocida ${b.name}`;
        esError = true;
      }
      resultados.push({ type: "tool_result", tool_use_id: b.id, content: contenido, is_error: esError });
    }
    messages.push({ role: "user", content: resultados });
  }

  for (const c of cambios) emitir(`\n\n[[confirmar-odoo:${c}]]`);
}
