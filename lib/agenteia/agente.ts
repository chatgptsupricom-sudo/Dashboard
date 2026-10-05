import Anthropic from "@anthropic-ai/sdk";
import crypto from "crypto";
import { db, query } from "@/lib/db";
import { desdeOdoo, rangoSmartbit, SQL_SIN_INTERCOMPANIA, SQL_SIN_VENDEDOR_LOCAL } from "@/lib/smartbit";
import { cargarDesglose, normalizar } from "@/lib/gerente_venta/reporteVentas";
import { TABLA_OAUTH, tokenMcp } from "@/lib/agenteia/mcpOauth";
import { MODELOS_AGENTE } from "@/lib/agenteia/modelos";
import { callOdooRPCEstricto } from "@/lib/odoo";
import { jwtSecretBytes } from "@/lib/secretos";

/**
 * Agente IA del SuperAdmin (Claude).
 *
 * Lee Odoo por el JSON-RPC del panel (lib/odoo.ts, usuario de integración):
 * read_group, search_read, search_count, fields_get e ir.model — cualquier
 * modelo. Si ODOO_MCP_URL está definida, suma además el MCP de Odoo
 * (rag_odoo_mcp_server) por el conector MCP de la API de Claude, con
 * allowlist de lectura y SQL directo. El token sale de ODOO_MCP_TOKEN (módulo
 * en modo API tokens) o, si no está, de la sesión OAuth del panel
 * (lib/agenteia/mcpOauth.ts, módulo en modo OAuth). Lee además la MySQL del
 * panel.
 *
 * Escritura en Odoo: NUNCA directa. Para cambiar algo, Claude llama
 * `preparar_cambio_odoo`, que
 * no ejecuta nada: devuelve un token firmado que la pantalla muestra con un
 * botón. Solo cuando el usuario confirma, `ejecutarCambio` lo corre por
 * JSON-RPC con el usuario de integración del panel.
 */

// Modelo de "Automático": siempre el mismo, no se elige por la complejidad de
// la pregunta. Configurable por entorno (AGENTE_IA_MODELO), ej.
// claude-sonnet-5-5 para abaratar. En la pantalla se puede elegir otro de
// MODELOS_AGENTE. Opus 5.5 es más nuevo y más barato que Opus 5.
export const MODELO_DEFECTO = process.env.AGENTE_IA_MODELO?.trim() || "claude-opus-5-5";
const MAX_VUELTAS = 20;
const MAX_FILAS_MYSQL = 300;
const VIGENCIA_CAMBIO_MS = 15 * 60_000;
const MAX_REGISTROS_ODOO = 500;
const MAX_CARACTERES_RESULTADO = 120_000;
const SEDES = [9, 10, 7];

const SISTEMA = `Eres el analista de datos de SUPRICOM y respondes al SuperAdmin del panel administrativo. Respondes en español, con cifras verificadas.

## Fuentes
- **Ventas por vendedor, cliente, marca o producto** → \`ventas_detalle\` primero. Usa las mismas líneas de factura que el Reporte de Ventas del panel (netas sin IVA, sin clientes internos), pero aquí las notas de crédito restan; el Reporte de Ventas no las incluye, así que si alguien compara, explica esa diferencia. La marca es \`product.product.x_studio_marca\` (modelo \`spiff.brand\`).
- **Odoo 17** (ERP: ventas, facturas, pagos, inventario, compras, contactos, CRM), por el ORM: \`odoo_agrupar\` (read_group: totales, rankings y agrupaciones, p. ej. por mes con \`invoice_date:month\`; úsalo para cualquier suma en vez de traer registros), \`odoo_buscar\` (search_read: listados y detalle), \`odoo_contar\` (search_count). Antes de usar un modelo o campo que no conoces, revisa \`odoo_campos\` (fields_get) u \`odoo_modelos\`; no adivines nombres de campos. Los dominios admiten campos relacionados con punto (\`move_id.state\`).
- **Ventas antes del 2026-04-01 (corte Smartbit → Odoo)**: hasta esa fecha la empresa facturaba en Smartbit, el sistema anterior. En Odoo, antes del corte, solo están las facturas abiertas que se migraron ("Importación Masiva"), NO la venta real: nunca calcules ventas previas al corte con Odoo. \`ventas_detalle\` ya junta solo el histórico de Smartbit (antes del corte) con Odoo (desde el corte). Para otra pregunta sobre esa época usa \`consultar_panel\` sobre la tabla \`ventas_smartbit\` (un renglón por artículo vendido: company_id, fecha, vendedor, codigo_cliente = RIF, cliente, codigo_articulo, articulo, linea, venta en USD sin IVA, unidades, costo; las devoluciones vienen con venta negativa). Ahí excluye siempre los vendedores que contienen "local" y las ventas entre empresas del grupo (clientes cuyo nombre contiene "supricom", "office solution" u "ofimaster"). Smartbit no guarda la marca: \`ventas_detalle\` la toma de Odoo cruzando el código del artículo (codigo_articulo = default_code de product.product, marca = x_studio_marca) y te devuelve en \`historico_sin_marca_en_odoo\` cuánto vendieron los artículos que ya no existen en Odoo; si es relevante, dilo con su monto. Si consultas \`ventas_smartbit\` directo y necesitas la marca, haz el mismo cruce con \`odoo_buscar\`; no busques la marca en el nombre del artículo. Si un período cruza el corte, dilo en la respuesta.
- **MySQL del panel** (\`consultar_panel\`): leads y su seguimiento, vendedores (\`sellers\`), usuarios y roles del panel (\`users_config\`, \`roles\`), metas y KPIs (\`kpi_targets\`, \`kpi_weekly_data\`), actividades, RMA, compras internas, etc. Usa \`SHOW TABLES\` / \`DESCRIBE tabla\` para ubicarte.

## Empresa
- Sedes = compañías de Odoo (company_id): **9 = Valencia**, **10 = Caracas**, **7 = Panamá**. Si no piden una sede, reporta las tres y el total, separadas.
- Moneda de la compañía: USD. currency_id 1 = USD; los pagos en bolívares traen la tasa en \`tax_today\` y el equivalente en USD en \`amount_company_currency_signed\`.
- Clientes internos: partners cuyo nombre contiene "supricom"; no son venta real.

## Reglas de negocio (úsalas; así calcula el panel)
- **Ventas / facturado**: \`account.move\` con \`move_type\` in (out_invoice, out_refund) y \`state = 'posted'\`, por \`invoice_date\`, sumando \`amount_untaxed\` (sin IVA; las notas de crédito restan). Vendedor = \`invoice_user_id\`.
- **Cobrado**: conciliaciones (\`account.partial.reconcile\`: \`debit_move_id\` = línea de la factura, \`credit_move_id\` = línea del pago) entre una factura de cliente y un pago en diario de tipo bank/cash cuyo nombre NO contiene "retenido", fechadas por \`payment_registration_date\` del pago (fecha de confirmación; si falta, \`create_date\`). No son cobro: retenciones de IVA/ISLR, descuentos, notas de crédito aplicadas, ni los pagos cuya descripción dice "25%" (IVA que retenemos como agentes de retención).
- **Pagos de clientes**: \`account.payment\` con payment_type inbound y partner_type customer. \`ref\` es el Memo / N° de operación bancaria.
- **No son vendedores**: "Asistente de Ventas" y "Dameris" (en todas las sedes). Nunca los pongas en rankings ni tablas por vendedor, ni sumes sus ventas al total por vendedor; \`ventas_detalle\` ya los saca y te devuelve cuánto quedó fuera en \`excluidos_del_total\`. Si consultas por otra vía, exclúyelos tú.
- **Vendedores excluidos** además en reportes (cuentas internas): Valencia "yusne"; Caracas "adriana"; Panamá "hercilio". Menciónalo si los excluyes.
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
- Quien te lee es la directiva de la empresa, no gente de sistemas: conocen el negocio, no Odoo por dentro. Escribe todo en lenguaje de negocio. Los nombres técnicos (campos, modelos, tablas, IDs de compañía, nombres de herramientas, SQL) son para tus consultas, no para la respuesta: en vez de "company_id 9" di "Valencia"; en vez de "marca = spiff_brand_id" di "la marca asignada al producto"; en vez de "facturas en estado posted" di "facturas publicadas"; en vez de "consulté account.move.line" di "revisé las líneas de factura". Tampoco cuentes qué herramienta o base usaste. La única excepción es que el usuario pregunte expresamente por el detalle técnico.
- Formato: respuesta directa primero; tablas markdown para comparaciones, con las columnas de cifras alineadas a la derecha (\`---:\`); cifras en formato venezolano, punto para miles y coma para decimales, siempre con 2 decimales (1.234.567,89); sin relleno.
- Antes de cerrar, revisa que los conteos y totales que escribes en el texto cuadren con las filas de tus tablas.

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
// habilitan cuando hay ODOO_MCP_URL y un token (fijo u OAuth).
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

// Archivos: las skills de Anthropic (xlsx, docx, pdf, pptx) corren en el
// contenedor de ejecución de código de Claude. Cada archivo que escribe vuelve
// como file_id de la Files API; la pantalla lo baja por
// /api/superadmin/agenteia/archivo.
const PIDE_ARCHIVO =
  /\b(excel|xlsx|hoja de c[aá]lculo|word|docx|pdf|power ?point|pptx|presentaci[oó]n|diapositiva|html|p[aá]gina web|c[oó]digo|script|csv|archivo|descargable|documento)\b/i;
const SKILLS = ["xlsx", "docx", "pdf", "pptx"].map((skill_id) => ({ type: "anthropic" as const, skill_id, version: "latest" }));
const SISTEMA_ARCHIVOS = `## Archivos (Excel, Word, PDF, PowerPoint, HTML, código)
Cuando el usuario pida un archivo, créalo con la ejecución de código (las skills xlsx, docx, pdf y pptx te dicen cómo). El contenedor no tiene acceso a Odoo ni al panel: primero consulta los datos con tus herramientas y luego escríbelos en el archivo. Un HTML o un script también es un archivo: escríbelo en disco, no lo pegues entero en la respuesta. Dale al archivo un nombre claro en español (ej. ventas_valencia_sept_2026.xlsx). En la respuesta di en una o dos frases qué contiene; el usuario lo descarga desde el chat. No uses la ejecución de código para otra cosa.`;
// La pantalla convierte [[archivo:<file_id>|<nombre>]] en un botón de descarga.
const ARCHIVO = /\n*\[\[archivo:([A-Za-z0-9_-]+)\|([^\]\n]*)\]\]/g;

const DIMENSIONES = ["vendedor", "cliente", "marca", "producto"] as const;

// No son vendedores (cuentas de asistencia), en ninguna sede: ventas_detalle
// los saca siempre del ranking y del total (comparado con normalizar()).
const NO_VENDEDORES = ["asistente", "dameris"];

const HERRAMIENTAS: Anthropic.Beta.BetaTool[] = [
  {
    name: "ventas_detalle",
    description:
      "Ventas netas (sin IVA) de un período, agregadas por vendedor/cliente/marca/producto, como el Reporte de Ventas del panel. Cualquier rango de fechas: antes del 2026-04-01 lee el histórico de Smartbit y desde ahí Odoo, y dice qué tramo salió de cada fuente. Filtros opcionales por marca, vendedor y cliente (texto parcial). Devuelve total general y los grupos ordenados de mayor a menor.",
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

// Avisos de avance: mientras corre una herramienta se emite una marca
// [[avance:texto]] que la pantalla muestra como estado ("Consultando Odoo por
// SQL…") fuera del mensaje. No es texto de la respuesta ni vuelve al modelo.
const AVANCE = /\[\[avance:[^\]\n]*\]\]/g;
function etiquetaAvance(nombre: string): string {
  if (nombre === "run_readonly_query") return "Consultando Odoo por SQL";
  if (/^(describe_table|list_tables|get_table|get_odoo_models)/.test(nombre)) return "Revisando la estructura de Odoo";
  if (nombre === "ventas_detalle") return "Calculando ventas";
  if (nombre === "consultar_panel") return "Consultando el panel";
  if (nombre === "preparar_cambio_odoo") return "Preparando el cambio";
  if (/code_execution/.test(nombre)) return "Creando el archivo";
  return "Consultando Odoo";
}

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

// Marca de lo vendido en Smartbit que no existe en Odoo.
const SIN_MARCA_ODOO = "SIN MARCA (NO ESTÁ EN ODOO)";

// Código de artículo comparable: mayúsculas, sin espacios, "/" como "-"
// (Smartbit "CRG-051D/CF232A" es "CRG-051D-CF232A" en Odoo).
const normCodigo = (c: string) => String(c).trim().toUpperCase().replace(/\//g, "-");

async function productosOdoo(domain: any[]): Promise<{ codigo: string; marca: string }[]> {
  const prods =
    (await callOdooRPCEstricto<any[]>("product.product", "search_read", [domain], {
      fields: ["default_code", "x_studio_marca"],
      context: { active_test: false, allowed_company_ids: SEDES },
    })) || [];
  return prods
    .filter((p) => p.default_code)
    .map((p) => {
      const m = Array.isArray(p.x_studio_marca) ? p.x_studio_marca[1] : p.x_studio_marca;
      return { codigo: normCodigo(p.default_code), marca: m ? String(m).toUpperCase().trim() : "Sin marca" };
    });
}

/**
 * Marca de Odoo (product.product.x_studio_marca, la de Metas por marca) por
 * código de artículo: en Smartbit codigo_articulo es el default_code de Odoo.
 * Incluye productos archivados. Clave: normCodigo().
 *
 * Si no hay código exacto, se acepta uno que empiece igual en cualquiera de
 * los dos sentidos ("A-CB435A-CE278A" → "A-CB435A-CE278A-CE285A";
 * "5U0G1LT-AC8" → "5U0G1LT"; "I62" → "I62BK"/"I62WH"), pero solo si todos los
 * candidatos son de la misma marca: lo único que se toma es la marca.
 */
async function marcasPorCodigo(codigos: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  const todos = [...new Set(codigos.map(normCodigo))];
  for (let k = 0; k < todos.length; k += 1000) {
    const lote = todos.slice(k, k + 1000);
    // Odoo compara default_code tal cual: se piden las dos grafías.
    const variantes = [...new Set([...lote, ...codigos.filter((c) => lote.includes(normCodigo(c))).map((c) => String(c).trim())])];
    for (const p of await productosOdoo([["default_code", "in", variantes]])) mapa.set(p.codigo, p.marca);
  }

  const faltan = todos.filter((c) => !mapa.has(c) && c.length >= 3);
  for (let k = 0; k < faltan.length; k += 60) {
    const lote = faltan.slice(k, k + 60);
    // Prefijos del código cortando en cada "-" (para "5U0G1LT-AC8" → "5U0G1LT").
    const prefijos = [...new Set(lote.flatMap((c) => [...c.matchAll(/-/g)].map((m) => c.slice(0, m.index)).filter((x) => x.length >= 4)))];
    const terminos: any[] = lote.map((c) => ["default_code", "=ilike", `${c}%`]);
    if (prefijos.length) terminos.push(["default_code", "in", prefijos]);
    const domain = [...Array(terminos.length - 1).fill("|"), ...terminos];
    const candidatos = await productosOdoo(domain);
    for (const c of lote) {
      const marcas = new Set(
        candidatos.filter((p) => p.codigo.startsWith(c) || (p.codigo.length >= 4 && c.startsWith(p.codigo))).map((p) => p.marca),
      );
      if (marcas.size === 1) mapa.set(c, [...marcas][0]);
    }
  }
  return mapa;
}

/**
 * Ventas del histórico de Smartbit (tabla ventas_smartbit) agrupadas en SQL
 * por las mismas dimensiones que ventas_detalle. Sin intercompañía ni
 * vendedores "local", igual que los dashboards (lib/smartbit.ts). Smartbit no
 * guarda la marca: si se agrupa o filtra por marca, sale de Odoo por el código
 * del artículo, y lo que no está en Odoo se informa aparte en `sinMarca`.
 */
async function filasSmartbit(
  companyIds: number[],
  [desde, hasta]: [string, string],
  dims: (typeof DIMENSIONES)[number][],
  i: any,
): Promise<{
  filas: { vendedor: string; cliente: string; marca: string; producto: string; total: number; cantidad: number }[];
  sinMarca: { venta: number; articulos: number } | null;
}> {
  const columna = {
    vendedor: "COALESCE(vendedor, 'Sin vendedor')",
    cliente: "COALESCE(cliente, 'Desconocido')",
    producto: "CONCAT('[', COALESCE(codigo_articulo, ''), '] ', COALESCE(articulo, ''))",
    codigo: "TRIM(codigo_articulo)",
  };
  const conMarca = dims.includes("marca") || !!i.marca;
  // vendedor siempre (exclusiones), cliente si se filtra por él, y el código
  // del artículo cuando hace falta la marca.
  const grupo = [
    ...new Set<keyof typeof columna>([
      "vendedor",
      ...(i.cliente ? ["cliente" as const] : []),
      ...dims.filter((d): d is "vendedor" | "cliente" | "producto" => d !== "marca"),
      ...(conMarca ? ["codigo" as const] : []),
    ]),
  ];
  const { rows } = await query(
    `SELECT ${grupo.map((d) => `${columna[d]} AS ${d}`).join(", ")}, SUM(venta) AS total, SUM(unidades) AS cantidad
       FROM ventas_smartbit
      WHERE company_id IN (${companyIds.map(() => "?").join(",")}) AND fecha BETWEEN ? AND ?
        AND ${SQL_SIN_INTERCOMPANIA} AND ${SQL_SIN_VENDEDOR_LOCAL}
      GROUP BY ${grupo.map((d) => columna[d]).join(", ")}`,
    [...companyIds, desde, hasta],
  );

  const marcas = conMarca ? await marcasPorCodigo([...new Set(rows.map((r: any) => r.codigo).filter(Boolean))] as string[]) : null;
  const sinCodigos = new Set<string>();
  let sinVenta = 0;
  const filas = [];
  for (const r of rows as any[]) {
    let marca = "";
    if (marcas) {
      marca = (r.codigo && marcas.get(normCodigo(r.codigo))) || SIN_MARCA_ODOO;
      if (marca === SIN_MARCA_ODOO) {
        sinCodigos.add(r.codigo || "(sin código)");
        sinVenta += Number(r.total) || 0;
      }
      // Mismo criterio que el filtro de marca de Odoo (ilike sobre el nombre).
      if (i.marca && (marca === SIN_MARCA_ODOO || !normalizar(marca).includes(normalizar(String(i.marca))))) continue;
    }
    filas.push({
      vendedor: r.vendedor ?? "",
      cliente: r.cliente ?? "",
      marca,
      producto: r.producto ?? "",
      total: Number(r.total) || 0,
      cantidad: Number(r.cantidad) || 0,
    });
  }
  return { filas, sinMarca: marcas ? { venta: r2(sinVenta), articulos: sinCodigos.size } : null };
}

async function ventasDetalle(i: any): Promise<string> {
  const fecha = /^\d{4}-\d{2}-\d{2}$/;
  if (!fecha.test(i?.desde) || !fecha.test(i?.hasta)) return "Error: desde/hasta deben ser YYYY-MM-DD";
  const dims = (Array.isArray(i.agrupar_por) ? i.agrupar_por : []).filter((d: any) => DIMENSIONES.includes(d));
  if (dims.length === 0) return `Error: agrupar_por debe incluir alguno de ${DIMENSIONES.join(", ")}`;
  const companyIds = Array.isArray(i.companias) && i.companias.length ? i.companias : SEDES;
  try {
    // Antes del corte la venta real está en el histórico de Smartbit (MySQL);
    // Odoo solo desde el corte (antes tiene únicamente facturas migradas).
    const desdeO = desdeOdoo(i.desde);
    const tramoSb = rangoSmartbit(i.desde, i.hasta);
    const [odoo, smartbit] = await Promise.all([
      desdeO <= i.hasta
        ? cargarDesglose({ companyIds, desde: desdeO, hasta: i.hasta, marca: i.marca || null, conNotasCredito: true }).then((r) => r.filas)
        : [],
      tramoSb ? filasSmartbit(companyIds, tramoSb, dims, i) : { filas: [], sinMarca: null },
    ]);
    const filas = [...odoo, ...smartbit.filas];
    const contiene = (valor: string, q: unknown) => !q || normalizar(valor).includes(normalizar(String(q)));
    const grupos = new Map<string, Record<string, any>>();
    const excluido = new Map<string, number>();
    for (const f of filas) {
      if (!contiene(f.vendedor, i.vendedor) || !contiene(f.cliente, i.cliente)) continue;
      if (NO_VENDEDORES.some((n) => normalizar(f.vendedor).includes(normalizar(n)))) {
        excluido.set(f.vendedor, (excluido.get(f.vendedor) || 0) + f.total);
        continue;
      }
      // Normalizado: Smartbit escribe "GABRIEL SANCHEZ" y Odoo "Gabriel Sánchez".
      const k = dims.map((d: (typeof DIMENSIONES)[number]) => normalizar(f[d])).join("|");
      const g = grupos.get(k) || { ...Object.fromEntries(dims.map((d: (typeof DIMENSIONES)[number]) => [d, f[d]])), total: 0, cantidad: 0 };
      g.total += f.total;
      g.cantidad += f.cantidad;
      grupos.set(k, g);
    }
    const lista = [...grupos.values()].sort((a, b) => b.total - a.total);
    return recortar(
      JSON.stringify({
        periodo: { desde: i.desde, hasta: i.hasta },
        fuentes: {
          historico_smartbit: tramoSb ? { desde: tramoSb[0], hasta: tramoSb[1] } : null,
          odoo: desdeO <= i.hasta ? { desde: desdeO, hasta: i.hasta } : null,
          // Venta del histórico cuyos artículos no existen en Odoo (sin marca);
          // con filtro de marca quedan fuera del total.
          historico_sin_marca_en_odoo: smartbit.sinMarca ?? undefined,
          nota: smartbit.sinMarca
            ? "La marca de lo vendido antes del corte sale de Odoo por el código del artículo (la misma marca que usa el panel): código exacto o, si cambió en la migración, uno que empieza igual y es de la misma marca."
            : undefined,
        },
        filtros: { marca: i.marca || null, vendedor: i.vendedor || null, cliente: i.cliente || null, companias: companyIds },
        total_general: r2(lista.reduce((s, g) => s + g.total, 0)),
        excluidos_del_total: [...excluido].map(([vendedor, total]) => ({ vendedor, total: r2(total) })),
        grupos_totales: lista.length,
        grupos: lista.slice(0, Number(i.limite) || 50).map((g) => ({ ...g, total: r2(g.total), cantidad: r2(g.cantidad) })),
      }),
    );
  } catch (e: any) {
    return `Error al calcular ventas: ${e.message}`;
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
  // Los tokens OAuth del MCP de Odoo no son para el modelo.
  if (s.toLowerCase().includes(TABLA_OAUTH)) return `Error: la tabla ${TABLA_OAUTH} no está disponible para el agente.`;
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
    const texto = (m.content || "")
      .replace(MARCA, "")
      .replace(AVANCE, "")
      .replace(ARCHIVO, (_, _id, nombre) => `\n[Archivo entregado: ${nombre}]`)
      .trim();
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
// Una API key que no pertenece a un workspace exige decir cuál usar.
const WORKSPACE = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
const anthropic = () =>
  (cliente ??= new Anthropic(WORKSPACE ? { defaultHeaders: { "anthropic-workspace-id": WORKSPACE } } : {}));

/** Título corto para una conversación, a partir de su primer mensaje. */
export async function titular(pregunta: string): Promise<string> {
  const r = await anthropic().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 40,
    system:
      "Escribe un título de 3 a 6 palabras, en español, para una conversación que empieza con el mensaje del usuario. Responde solo el título: sin comillas, sin punto final, sin explicación.",
    messages: [{ role: "user", content: pregunta.slice(0, 2000) }],
  });
  const texto = r.content.find((b) => b.type === "text");
  // Sin marcas de markdown ("# Título", "**Título**") ni comillas.
  return (texto?.type === "text" ? texto.text : "")
    .trim()
    .replace(/^#+\s*/, "")
    .replace(/[*_`]/g, "")
    .replace(/^["«']+|["»'.]+$/g, "")
    .slice(0, 60);
}

/**
 * Corre el agente sobre la conversación y va emitiendo el texto de la
 * respuesta. Al final emite una marca `[[confirmar-odoo:<token>]]` por cada
 * cambio preparado, que la pantalla convierte en botón.
 */
export async function responder(
  chat: MensajeChat[],
  uid: string,
  emitir: (t: string) => void,
  modelo?: string,
  signal?: AbortSignal,
): Promise<void> {
  // Haiku 4.5 no tiene thinking adaptativo: corre sin thinking. El respaldo
  // automático ante rechazos (`fallbacks`) solo se pide en los modelos para
  // los que está documentado.
  const MODELO = MODELOS_AGENTE.some((m) => m.id === modelo) ? modelo! : MODELO_DEFECTO;
  const THINKING_ADAPTATIVO = !MODELO.startsWith("claude-haiku-4");
  const CON_FALLBACK = ["claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"].includes(MODELO);
  // Excel/Word/PDF/PowerPoint/HTML: solo si el último mensaje lo pide (el
  // contenedor de código cuesta) y no en Haiku (las skills van con los demás).
  const ultimo = chat[chat.length - 1];
  const conArchivos =
    !MODELO.startsWith("claude-haiku") && ultimo?.role === "user" && PIDE_ARCHIVO.test(ultimo.content || "");
  const hoy = new Intl.DateTimeFormat("es-VE", { timeZone: "America/Caracas", dateStyle: "full" }).format(new Date());
  const messages = aMensajesClaude(chat);
  if (messages.length === 0) throw new Error("Mensaje vacío.");

  // MCP de Odoo opcional: si está configurado, suma sus herramientas de
  // lectura (incluido SQL directo) a las propias.
  const mcpUrl = process.env.ODOO_MCP_URL;
  const mcpToken = process.env.ODOO_MCP_TOKEN || (mcpUrl ? await tokenMcp() : null);
  const conMcp = !!(mcpUrl && mcpToken);
  console.log(`[agenteia] consulta de ${uid} · ${MODELO} · Odoo por ${conMcp ? "MCP + JSON-RPC" : "JSON-RPC (sin MCP)"}`);

  const cambios: string[] = [];
  let hayTexto = false;
  let fallosJson = 0;
  let ultimoAvance = "";
  let contenedor: string | undefined;
  const archivos = new Set<string>();

  let terminado = false;
  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    if (signal?.aborted) return;
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
        ...(conArchivos ? [{ type: "text" as const, text: SISTEMA_ARCHIVOS }] : []),
        { type: "text", text: `Hoy es ${hoy} (hora de Caracas).` },
      ],
      ...(conMcp && { mcp_servers: [{ type: "url" as const, url: mcpUrl!, name: "odoo", authorization_token: mcpToken }] }),
      // El mismo contenedor en todas las vueltas: los archivos de una vuelta
      // siguen ahí en la siguiente.
      ...(conArchivos && { container: { id: contenedor, skills: SKILLS } }),
      tools: [
        ...(conMcp
          ? [
              {
                type: "mcp_toolset" as const,
                mcp_server_name: "odoo",
                // Allowlist: solo lectura. Escrituras, dashboards, CRM, mailing,
                // accesos y SEO del MCP quedan apagados aunque el token lo permita.
                default_config: { enabled: false },
                configs: Object.fromEntries(MCP_LECTURA.map((n) => [n, { enabled: true }])),
              },
            ]
          : []),
        ...(conArchivos ? [{ type: "code_execution_20260521" as const, name: "code_execution" as const }] : []),
        ...HERRAMIENTAS,
      ],
      messages,
    }, { signal });

    stream.on("text", (t) => {
      hayTexto = true;
      ultimoAvance = "";
      emitir(t);
    });
    stream.on("streamEvent", (ev: any) => {
      const b = ev?.type === "content_block_start" ? ev.content_block : null;
      // Cada bloque de texto es un párrafo aparte: con el MCP hay varios en
      // una misma vuelta (texto, consulta, texto…) y salían pegados.
      if (b?.type === "text" && hayTexto) emitir("\n\n");
      if (b?.type !== "tool_use" && b?.type !== "mcp_tool_use" && b?.type !== "server_tool_use") return;
      const etiqueta = etiquetaAvance(String(b.name));
      if (etiqueta === ultimoAvance) return;
      ultimoAvance = etiqueta;
      emitir(`[[avance:${etiqueta}]]`);
    });

    let msg: Anthropic.Beta.BetaMessage;
    try {
      msg = await stream.finalMessage();
      fallosJson = 0;
    } catch (e) {
      // Con eager_input_streaming un input de herramienta puede llegar como
      // JSON roto: se reintenta la vuelta. Los errores de la API (y el corte
      // del usuario) se lanzan.
      if (signal?.aborted || e instanceof Anthropic.APIError || fallosJson++ >= 2) throw e;
      continue;
    }

    messages.push({ role: "assistant", content: msg.content });
    contenedor = msg.container?.id ?? contenedor;

    // Archivos que escribió la ejecución de código en esta vuelta.
    for (const b of msg.content) {
      if (b.type === "bash_code_execution_tool_result" && b.content.type === "bash_code_execution_result")
        for (const o of b.content.content) archivos.add(o.file_id);
    }

    // Traza en los logs del servidor (EasyPanel) de qué herramientas usó.
    for (const b of msg.content) {
      if (b.type === "mcp_tool_use") console.log(`[agenteia] MCP → ${b.name}`);
      else if (b.type === "mcp_tool_result" && b.is_error)
        console.warn(`[agenteia] MCP error:`, JSON.stringify(b.content).slice(0, 500));
      else if (b.type === "tool_use") console.log(`[agenteia] panel → ${b.name}`);
    }

    if (msg.stop_reason === "pause_turn") continue;
    if (msg.stop_reason === "refusal") {
      emitir("\n\n⚠️ Claude no quiso responder esta solicitud por sus reglas de seguridad. Reformula la pregunta o prueba con otro modelo.");
      terminado = true;
      break;
    }
    if (msg.stop_reason === "max_tokens") {
      emitir("\n\n⚠️ La respuesta quedó cortada porque superó el largo máximo. Pide menos detalle o divide la pregunta.");
      terminado = true;
      break;
    }
    if (msg.stop_reason !== "tool_use") {
      terminado = true;
      break;
    }

    const resultados: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const b of msg.content) {
      if (b.type !== "tool_use") continue;
      let contenido: string;
      let esError = false;
      // Un fallo de una herramienta (MySQL caída, Odoo sin respuesta) vuelve al
      // modelo como error para que lo explique o reintente; no tumba la consulta.
      try {
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
      } catch (e: any) {
        console.error(`[agenteia] herramienta ${b.name} falló:`, e?.message);
        contenido = `Error al ejecutar ${b.name}: ${e?.message || e}`;
        esError = true;
      }
      resultados.push({ type: "tool_result", tool_use_id: b.id, content: contenido, is_error: esError });
    }
    messages.push({ role: "user", content: resultados });
  }
  if (!terminado && !signal?.aborted)
    emitir(
      `\n\n⚠️ La consulta necesitó más de ${MAX_VUELTAS} pasos y se detuvo sin terminar. Prueba con una pregunta más acotada (una sede, un período más corto).`,
    );

  for (const id of archivos) {
    // El nombre viaja en la marca para no pedirlo de nuevo al pintar el chat.
    const nombre = await anthropic()
      .files.retrieveMetadata(id)
      .then((m) => m.filename.replace(/[|\]\n]/g, "_"))
      .catch(() => "archivo");
    emitir(`\n\n[[archivo:${id}|${nombre}]]`);
  }
  for (const c of cambios) emitir(`\n\n[[confirmar-odoo:${c}]]`);
}

/** Descarga un archivo creado por el agente (Files API de Anthropic). */
export async function bajarArchivo(id: string) {
  const meta = await anthropic().files.retrieveMetadata(id);
  const res = await anthropic().files.download(id);
  return { nombre: meta.filename, tipo: meta.mime_type || "application/octet-stream", cuerpo: res.body };
}
