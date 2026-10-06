import { db } from "@/lib/db";
import { esSuperadmin, normRol } from "@/lib/agenteia/acceso";
import { callOdooRPCEstricto } from "@/lib/odoo";

/**
 * Qué información ve el Agente IA según el rol de quien pregunta. El
 * SuperAdmin lo ve todo; para los demás roles el SuperAdmin define en la
 * Configuración (pestaña Roles) tres cosas, y el servidor las hace cumplir en
 * cada herramienta (no es solo una instrucción al modelo):
 *
 *   - sede: "todas" o "propia" (la de `cids` del usuario; sin cids = todas).
 *     En Odoo va como allowed_company_ids (reglas multiempresa de Odoo) y,
 *     en los modelos de movimientos, además como company_id en el dominio.
 *   - propio: solo sus datos (vendedor). Cada modelo se filtra por el usuario
 *     de Odoo de la sesión; un modelo sin filtro definido queda bloqueado.
 *   - areas: qué modelos de Odoo y qué tablas del panel puede leer.
 *
 * Además, ningún rol limitado tiene el SQL libre de Odoo (MCP), y la consulta
 * libre a la MySQL del panel solo existe con sede "todas", sin "propio" y
 * sobre las tablas de sus áreas (las tablas no tienen filtro por sede).
 * Tabla agenteia_roles (un rol por fila, config en JSON); se crea sola.
 */

export type Area =
  | "ventas"
  | "cobranza"
  | "inventario"
  | "compras"
  | "costos"
  | "contabilidad"
  | "rrhh"
  | "leads"
  | "rma"
  | "seguridad";

type DefArea = { etiqueta: string; descripcion: string; modelos: RegExp[]; tablas?: RegExp };

export const AREAS: Record<Area, DefArea> = {
  ventas: {
    etiqueta: "Ventas",
    descripcion: "Facturas, notas de crédito, pedidos, cotizaciones, clientes y metas",
    modelos: [/^sale\.(order|order\.line|report)$/, /^account\.(move|move\.line|invoice\.report)$/, /^crm\.team$/, /^res\.partner$/],
    tablas: /^(ventas_smartbit|ventas_metodo_retiro|metas_venta_marca|kpi_metas_marca|kpi_targets|kpi_weekly_data|sellers|visit_plans|visit_plan_items|weekly_visits|forecast_checklist)$/,
  },
  cobranza: {
    etiqueta: "Cobranza",
    descripcion: "Cuentas por cobrar, pagos, vencimientos y plazos de pago",
    modelos: [/^account\.(payment|move|move\.line|payment\.term|partial\.reconcile)$/, /^res\.partner$/],
    tablas: /^epp_clientes$/,
  },
  inventario: {
    etiqueta: "Inventario",
    descripcion: "Productos, marcas, existencias, almacenes, movimientos y listas de precio",
    modelos: [
      /^product\.(product|template|category|pricelist|pricelist\.item)$/,
      /^spiff\.brand$/,
      /^stock\.(quant|move|move\.line|picking|picking\.type|warehouse|location|lot)$/,
    ],
    tablas: /^product_images$/,
  },
  compras: {
    etiqueta: "Compras",
    descripcion: "Órdenes de compra, proveedores, recepciones y facturas de proveedor",
    modelos: [/^purchase\.(order|order\.line|report)$/, /^product\.supplierinfo$/, /^account\.(move|move\.line)$/, /^res\.partner$/],
    tablas: /^(purchase_order.*|recepcion_.*|compras_.*)$/,
  },
  costos: {
    etiqueta: "Costos y márgenes",
    descripcion: "Costo de los productos, margen y valoración del inventario",
    modelos: [/^stock\.valuation\.layer$/],
  },
  contabilidad: {
    etiqueta: "Contabilidad",
    descripcion: "Plan de cuentas, diarios, bancos, impuestos, analítica y gastos",
    modelos: [
      /^account\.(account|journal|tax|analytic\.account|analytic\.line|bank\.statement|bank\.statement\.line|move|move\.line|payment)$/,
      /^res\.partner(\.bank)?$/,
    ],
    tablas: /^(presupuesto_gastos|admin_kpi_metas|alertas_admin_seguimiento)$/,
  },
  rrhh: {
    etiqueta: "Recursos humanos",
    descripcion: "Empleados, departamentos, cargos, contratos, ausencias y asistencia",
    modelos: [/^hr\./],
  },
  leads: {
    etiqueta: "Leads y CRM",
    descripcion: "Leads del panel y oportunidades del CRM de Odoo",
    modelos: [/^crm\.(lead|stage|tag)$/, /^utm\./],
    tablas: /^(leads|lead_.*|campaign_overrides|sellers)$/,
  },
  rma: {
    etiqueta: "RMA y garantías",
    descripcion: "Casos de servicio técnico, garantías y notas de crédito de RMA",
    modelos: [],
    tablas: /^rma_.*$/,
  },
  seguridad: {
    etiqueta: "Seguridad y almacén",
    descripcion: "Ingresos y despachos de mercancía controlados por Seguridad",
    modelos: [/^stock\.picking$/],
    tablas: /^seguridad_.*$/,
  },
};
export const AREAS_LISTA = Object.keys(AREAS) as Area[];

// Lo que cualquiera puede leer: catálogos sin datos del negocio.
const MODELOS_COMUNES = [/^res\.(company|currency|currency\.rate|country|country\.state)$/, /^uom\.uom$/];

// Campos de costo y margen: sin el área "costos" no se piden, no se filtra ni
// se agrupa por ellos, y se quitan de los resultados.
export const CAMPO_COSTO = /standard_price|cost|margin|purchase_price|valuation|value_svl/i;

export type ConfigRol = { sede: "todas" | "propia"; propio: boolean; areas: Area[] };

/** Valores por defecto de cada rol, hasta que el SuperAdmin los cambie. */
export function configPorDefecto(rol: string): ConfigRol {
  const r = normRol(rol);
  if (/seller|vendedor/.test(r)) return { sede: "propia", propio: true, areas: ["ventas", "cobranza", "inventario"] };
  if (/gerencia de ventas|gerente.*venta/.test(r))
    return { sede: "propia", propio: false, areas: ["ventas", "cobranza", "inventario", "leads"] };
  if (/compras/.test(r)) return { sede: "todas", propio: false, areas: ["compras", "inventario", "costos", "ventas"] };
  if (/cuentas por cobrar|cxc/.test(r)) return { sede: "propia", propio: false, areas: ["cobranza", "ventas"] };
  if (/recursos humanos/.test(r)) return { sede: "todas", propio: false, areas: ["rrhh"] };
  if (/adminleads/.test(r)) return { sede: "propia", propio: false, areas: ["leads", "ventas"] };
  if (/administraci/.test(r))
    return { sede: "todas", propio: false, areas: ["ventas", "cobranza", "compras", "contabilidad", "costos", "inventario"] };
  if (/operaciones/.test(r)) return { sede: "todas", propio: false, areas: ["inventario", "compras", "ventas", "rma", "seguridad"] };
  if (/^rma$/.test(r)) return { sede: "propia", propio: false, areas: ["rma", "inventario"] };
  if (/seguridad|almacen/.test(r)) return { sede: "propia", propio: false, areas: ["seguridad", "inventario"] };
  return { sede: "propia", propio: false, areas: ["inventario"] };
}

function limpiarConfig(c: any, rol: string): ConfigRol {
  const base = configPorDefecto(rol);
  if (!c || typeof c !== "object") return base;
  return {
    sede: c.sede === "todas" ? "todas" : "propia",
    propio: !!c.propio,
    areas: Array.isArray(c.areas) ? c.areas.filter((a: any) => AREAS_LISTA.includes(a)) : base.areas,
  };
}

let tablaLista = false;
async function ensureTabla() {
  if (tablaLista) return;
  await db.execute(`
    CREATE TABLE IF NOT EXISTS agenteia_roles (
      rol VARCHAR(80) NOT NULL PRIMARY KEY,
      config TEXT NOT NULL,
      updated_by VARCHAR(190) NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  tablaLista = true;
}

// ponytail: caché de 30 s por proceso, igual que los permisos por correo.
let cache: { roles: Map<string, ConfigRol>; hasta: number } | null = null;

export async function configsGuardadas(): Promise<Map<string, ConfigRol>> {
  if (cache && cache.hasta > Date.now()) return cache.roles;
  await ensureTabla();
  const [filas] = await db.execute("SELECT rol, config FROM agenteia_roles");
  const roles = new Map<string, ConfigRol>();
  for (const f of filas as any[]) {
    try {
      roles.set(normRol(f.rol), limpiarConfig(JSON.parse(f.config), f.rol));
    } catch {}
  }
  cache = { roles, hasta: Date.now() + 30_000 };
  return roles;
}

export async function guardarConfigRol(rol: string, c: unknown, por: string): Promise<ConfigRol> {
  await ensureTabla();
  const limpia = limpiarConfig(c, rol);
  await db.execute(
    `INSERT INTO agenteia_roles (rol, config, updated_by) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE config = VALUES(config), updated_by = VALUES(updated_by)`,
    [normRol(rol), JSON.stringify(limpia), por],
  );
  cache = null;
  return limpia;
}

// ── Alcance de una sesión ─────────────────────────────────────────────────────

export type Alcance = {
  rol: string;
  areas: Set<Area>;
  companias: number[];
  /** Usuario de Odoo cuyo trabajo puede ver (solo con "propio"). */
  propio: { uid: number; nombre: string } | null;
  costos: boolean;
  /** Consulta libre a la MySQL del panel, sobre las tablas de sus áreas. */
  panel: boolean;
};

const SEDES = [9, 10, 7];

/** null = sin límites (SuperAdmin). */
export async function alcanceDe(payload: any): Promise<Alcance | null> {
  if (esSuperadmin(payload?.role)) return null;
  const rol = normRol(payload?.role);
  let c: ConfigRol;
  try {
    c = (await configsGuardadas()).get(rol) ?? configPorDefecto(rol);
  } catch (e: any) {
    console.error("[agenteia] no se pudo leer la configuración de roles:", e?.message);
    c = configPorDefecto(rol);
  }
  const cid = parseInt(String(payload?.cids ?? ""), 10);
  // Mismo criterio que el resto del panel: sin cids, el usuario no está limitado a una sede.
  const companias = c.sede === "propia" && SEDES.includes(cid) ? [cid] : SEDES;
  let propio: Alcance["propio"] = null;
  if (c.propio) {
    const uid = Number(payload?.uid);
    let nombre = String(payload?.name || "");
    try {
      const u = await callOdooRPCEstricto<any[]>("res.users", "read", [[uid]], { fields: ["name"] });
      nombre = u?.[0]?.name || nombre;
    } catch {}
    // Sin usuario de Odoo no hay con qué filtrar: no ve nada propio.
    propio = { uid: uid > 0 ? uid : -1, nombre };
  }
  const areas = new Set(c.areas);
  return {
    rol,
    areas,
    companias,
    propio,
    costos: areas.has("costos"),
    panel: !propio && c.sede === "todas" && c.areas.some((a) => AREAS[a].tablas),
  };
}

/**
 * "Ver como": la sesión de un usuario del panel armada desde su correo (rol y
 * sede de users_config, usuario de Odoo por login), para que el SuperAdmin
 * pruebe el alcance de un rol sin su contraseña. null si no existe.
 */
export async function sesionDeCorreo(email: string): Promise<Record<string, unknown> | null> {
  const [filas] = await db.execute(
    `SELECT uc.email, uc.name, uc.cids, r.name AS rol
     FROM users_config uc JOIN roles r ON r.id = uc.role_id WHERE uc.email = ? LIMIT 1`,
    [email],
  );
  const u = (filas as any[])[0];
  if (!u) return null;
  let uid = 0;
  try {
    const ids = await callOdooRPCEstricto<number[]>("res.users", "search", [[["login", "=", u.email]]], { limit: 1 });
    uid = ids?.[0] ?? 0;
  } catch {}
  return { email: u.email, name: u.name, cids: u.cids, role: u.rol, uid };
}

// ── Reglas que aplican las herramientas ──────────────────────────────────────

export function modeloPermitido(a: Alcance, model: string): boolean {
  if (MODELOS_COMUNES.some((r) => r.test(model))) return true;
  return [...a.areas].some((ar) => AREAS[ar].modelos.some((r) => r.test(model)));
}

// Modelos de movimientos: además de la regla multiempresa de Odoo, la sede va
// explícita en el dominio.
const CON_COMPANIA =
  /^(sale\.(order|order\.line|report)|account\.(move|move\.line|invoice\.report|payment|bank\.statement\.line|analytic\.line)|purchase\.(order|order\.line|report)|stock\.(quant|move|move\.line|picking|valuation\.layer)|crm\.lead|hr\.employee)$/;

// Catálogo que un vendedor puede ver entero aunque solo vea "lo suyo".
const COMPARTIDOS_PROPIO = /^(product\.(product|template|category|pricelist|pricelist\.item)|spiff\.brand|stock\.(quant|warehouse|location)|uom\.uom|res\.(company|currency|currency\.rate|country|country\.state)|crm\.(stage|tag)|account\.payment\.term)$/;

/** Filtro de "solo lo suyo" por modelo; null = el modelo no se puede leer con "propio". */
function filtroPropio(model: string, uid: number): any[] | null {
  if (COMPARTIDOS_PROPIO.test(model)) return [];
  switch (model) {
    case "sale.order":
    case "sale.report":
    case "crm.lead":
    case "res.partner":
      return [["user_id", "=", uid]];
    case "sale.order.line":
      return [["order_id.user_id", "=", uid]];
    case "account.move":
    case "account.invoice.report":
      return [["invoice_user_id", "=", uid]];
    case "account.move.line":
      return [["move_id.invoice_user_id", "=", uid]];
    case "account.payment":
      return [["partner_id.user_id", "=", uid]];
    default:
      return null;
  }
}

/**
 * Dominio con los límites del alcance, o un texto de error si el modelo no se
 * puede leer. Los dominios de Odoo están en notación prefija: concatenar dos
 * dominios válidos es su AND.
 */
export function dominioConAlcance(a: Alcance, model: string, domain: any[]): any[] | string {
  if (!modeloPermitido(a, model))
    return `Error: el rol de este usuario no tiene acceso a ${model}. Dile qué información no puede ver con su acceso, sin intentar obtenerla por otro camino.`;
  if (!a.costos && CAMPO_COSTO.test(JSON.stringify(domain)))
    return "Error: este usuario no tiene acceso a costos ni márgenes.";
  const extra: any[] = [];
  if (CON_COMPANIA.test(model)) extra.push(["company_id", "in", a.companias]);
  if (a.propio) {
    const f = filtroPropio(model, a.propio.uid);
    if (!f) return `Error: este usuario solo ve su propia información y ${model} no se filtra por vendedor.`;
    extra.push(...f);
  }
  return [...extra, ...domain];
}

/** Quita campos de costo de un resultado (registros o grupos). */
export function sinCostos<T>(r: T): T {
  if (Array.isArray(r)) return r.map(sinCostos) as T;
  if (r && typeof r === "object")
    return Object.fromEntries(Object.entries(r).filter(([k]) => !CAMPO_COSTO.test(k)).map(([k, v]) => [k, sinCostos(v)])) as T;
  return r;
}

/** ¿Hay una coma en la lista de tablas de algún FROM (al mismo nivel de paréntesis)? */
function comaEnFrom(s: string): boolean {
  const FIN = /^(where|group|order|limit|having|union|window|for|lock|into|on|using|join|inner|left|right|cross|straight_join|natural)\b/;
  for (const m of s.matchAll(/\bfrom\b/g)) {
    let prof = 0;
    for (let i = m.index! + 4; i < s.length; i++) {
      const ch = s[i];
      if (ch === "(") prof++;
      else if (ch === ")") {
        if (prof === 0) break;
        prof--;
      } else if (prof === 0) {
        if (ch === ",") return true;
        if (/[a-z]/.test(ch) && !/[a-z0-9_]/.test(s[i - 1]) && FIN.test(s.slice(i))) break;
      }
    }
  }
  return false;
}

/** Tablas del panel que nombra una consulta (FROM / JOIN); null si no se puede leer con seguridad. */
export function tablasDeSql(sql: string): string[] | null {
  const s = sql
    .toLowerCase()
    .replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, "''")
    .replace(/`/g, "");
  // No se aceptan: otras bases (otra_base.tabla, information_schema…), la
  // sentencia TABLE, pistas de índice, ni uniones con coma (FROM a, b): así
  // toda tabla leída aparece justo después de un FROM o un JOIN.
  if (/\b(information_schema|mysql|performance_schema|sys)\b/.test(s)) return null;
  if (/\btable\b|\b(use|force|ignore)\s+(index|key)\b/.test(s)) return null;
  if (/\b(from|join)\s+[a-z0-9_]+\s*\./.test(s)) return null;
  if (comaEnFrom(s)) return null;
  if (/^\s*(show|describe|desc|explain)\b/.test(s)) {
    const m = s.match(/^\s*(?:describe|desc|show\s+(?:full\s+)?columns\s+from)\s+([a-z0-9_]+)\s*$/);
    return m ? [m[1]] : null;
  }
  const tablas = [...s.matchAll(/\b(?:from|join)\s+([a-z0-9_]+|\()/g)].map((m) => m[1]).filter((t) => t !== "(");
  return tablas;
}

export function sqlPanelPermitido(a: Alcance, sql: string): string | null {
  if (!a.panel) return "Error: el acceso de este usuario no incluye consultas libres a la base del panel.";
  const tablas = tablasDeSql(sql);
  if (!tablas) return "Error: consulta no permitida para este usuario (usa FROM/JOIN con tablas simples, sin comas ni otras bases).";
  const fuera = tablas.filter((t) => ![...a.areas].some((ar) => AREAS[ar].tablas?.test(t)));
  if (fuera.length) return `Error: el rol de este usuario no tiene acceso a: ${[...new Set(fuera)].join(", ")}.`;
  if (!a.costos && /\b(costo|cost|margen|margin)\w*/i.test(sql)) return "Error: este usuario no tiene acceso a costos ni márgenes.";
  return null;
}

type CambioOdoo = {
  operacion: "create" | "write" | "unlink" | "execute";
  model: string;
  ids?: number[];
  values?: Record<string, unknown>;
  args?: unknown[];
  kwargs?: Record<string, unknown>;
};

/**
 * Un editor con rol limitado solo cambia lo que puede ver: modelos de sus
 * áreas, registros de su sede (y suyos, con "propio"). Lo creado queda en su
 * sede y, con "propio", a su nombre. Devuelve el cambio ajustado o un error.
 */
export async function revisarCambio<C extends CambioOdoo>(a: Alcance, c: C): Promise<C | string> {
  if (!modeloPermitido(a, c.model)) return `el rol de este usuario no tiene acceso a ${c.model}`;
  if (!a.costos && CAMPO_COSTO.test(JSON.stringify([c.values, c.args, c.kwargs]))) return "este usuario no tiene acceso a costos ni márgenes";
  const values = { ...(c.values || {}) };
  if (c.operacion === "create" || c.operacion === "write") {
    if ("company_id" in values && values.company_id !== false && !a.companias.includes(Number(values.company_id)))
      return "esa sede no está en el alcance de este usuario";
    if (c.operacion === "create" && CON_COMPANIA.test(c.model) && !("company_id" in values) && a.companias.length === 1)
      values.company_id = a.companias[0];
    if (a.propio) {
      const f = filtroPropio(c.model, a.propio.uid);
      if (!f || (f.length && String(f[0][0]).includes(".")))
        return `con su acceso (solo lo suyo) no puede ${c.operacion === "create" ? "crear" : "cambiar"} registros de ${c.model}`;
      if (f.length) {
        const campo = String(f[0][0]);
        if (campo in values && Number(values[campo]) !== a.propio.uid) return "solo puede asignarse registros a sí mismo";
        if (c.operacion === "create") values[campo] = a.propio.uid;
      }
    }
  }
  if (c.operacion !== "create") {
    const dominio = dominioConAlcance(a, c.model, [["id", "in", c.ids || []]]);
    if (typeof dominio === "string") return dominio.replace(/^Error: /, "");
    const n = await callOdooRPCEstricto<number>(c.model, "search_count", [dominio], {
      context: { allowed_company_ids: a.companias },
    });
    if (n !== (c.ids || []).length) return "alguno de esos registros está fuera del alcance de este usuario (otra sede u otro vendedor)";
  }
  return { ...c, values: c.operacion === "create" || c.operacion === "write" ? values : c.values };
}

/** Texto para el modelo: qué puede ver este usuario. */
export function describirAlcance(a: Alcance): string {
  const nombres = { 9: "Valencia", 10: "Caracas", 7: "Panamá" } as Record<number, string>;
  const areas = [...a.areas].map((x) => AREAS[x].etiqueta).join(", ") || "ninguna";
  return `## Alcance de este usuario (rol ${a.rol})
Solo puede ver: ${areas}${a.costos ? "" : " (sin costos ni márgenes)"}. Sedes: ${a.companias.map((c) => nombres[c]).join(", ")}.${
    a.propio ? ` Solo su propia información como vendedor (${a.propio.nombre}): sus ventas, clientes, cotizaciones y cobranza.` : ""
  }
${
    a.panel
      ? `Tablas del panel que puede consultar (consultar_panel, solo con FROM/JOIN de tablas simples, sin CTE ni uniones con coma): ${[...a.areas]
          .map((x) => AREAS[x].tablas?.source.replace(/^\^\(?|\)?\$$/g, "").replace(/\|/g, ", "))
          .filter(Boolean)
          .join(", ")}.`
      : "No tiene consultas libres a la base del panel."
  }
Las herramientas ya aplican estos límites y devuelven error fuera de ellos. Si pide algo fuera de su alcance, dile con claridad que su acceso no lo incluye (el SuperAdmin puede ampliarlo) y no intentes conseguirlo por otro camino ni lo estimes. No tiene SQL directo a Odoo.`;
}
