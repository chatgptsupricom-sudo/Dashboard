import { callOdooRPC } from "@/lib/odoo";
import { query } from "@/lib/db";
import { desdeOdoo } from "@/lib/smartbit";

/**
 * `presupuesto_gastos` la crea el endpoint de carga (`/api/administracion/
 * presupuesto`) al usarse por primera vez. `gastos/route.ts` la consulta
 * pero nunca la crea — en una base nueva, si alguien mira el índice de
 * Gastos antes de que Administración haya cargado un presupuesto ni una
 * sola vez, la tabla no existe todavía y el SELECT fallaría (silenciado por
 * el catch de esa ruta, así que ni se nota). Se comparte esta función para
 * que ambas rutas dejen de depender del orden en que alguien las visita.
 */
export async function ensurePresupuestoTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS presupuesto_gastos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      company_id INT NOT NULL,
      mes VARCHAR(7) NOT NULL,
      cuenta_codigo VARCHAR(50) NOT NULL,
      monto DECIMAL(15,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_presupuesto (company_id, mes, cuenta_codigo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

/**
 * Fuente del "gasto real": todo lo contabilizado en cuentas de tipo `expense`
 * (el grupo 6.x del plan de cuentas: personal, alquiler, fletes, servicios
 * profesionales, gastos bancarios, etc.), venga de una factura de proveedor o
 * de un asiento.
 *
 * Antes solo se leian las facturas de proveedor, y buena parte del gasto entra
 * por asiento (nomina, bonos, comisiones, comisiones bancarias, honorarios):
 * de abr a sep-2026 eso era el 27% del gasto 6.x en Panama, el 30% en
 * Valencia y el 87% en Caracas, que quedaba fuera del indice.
 *
 * Se excluye `expense_direct_cost` (5.x, Costo de Venta) a proposito: es costo
 * de mercancia, no gasto operativo, y su magnitud (~$4.4MM vs ~$400K de gasto
 * operativo en 2026) ahogaria por completo los KPIs de presupuesto. Por lo
 * mismo se excluyen las cuentas de `CODIGO_NO_OPERATIVO`.
 */
const TIPO_CUENTA_GASTO = "expense";

/**
 * Cuentas de tipo `expense` que no son gasto operativo: el grupo 8 ("Otros
 * ingresos y egresos": diferencial cambiario y su cuenta transitoria, que en
 * Valencia mueve millones en asientos de cambio que se compensan entre si) y
 * la perdida por diferencia de efectivo (999...). Dejarlas inflaria el gasto y
 * el presupuesto no se arma sobre ellas.
 */
const CODIGO_NO_OPERATIVO = /^(8|999)/;

export interface CuentaGasto {
  id: number;
  codigo: string;
  nombre: string;
  /** Prefijo de dos segmentos del codigo (ej. "6.06") para agrupar. */
  grupo: string;
}

export interface GastoPorCuenta {
  cuentaCodigo: string;
  cuentaNombre: string;
  grupo: string;
  monto: number;
}

export interface GastoDetalle {
  cuentaCodigo: string;
  proveedor: string;
  factura: string;
  fecha: string;
  monto: number;
  /** Que fue el gasto: la etiqueta de la linea ("PAGO DE PEAJE", el producto de la factura...). */
  concepto: string;
  /** Referencia del asiento (nro. de factura del proveedor, de la transferencia...). */
  referencia: string;
  diario: string;
  /** Monto en la moneda del documento cuando no es USD (Bs.). */
  montoMoneda: number | null;
  moneda: string;
}

function grupoDeCodigo(codigo: string): string {
  const partes = String(codigo || "").split(".");
  return partes.length >= 2 ? `${partes[0]}.${partes[1]}` : codigo || "sin-grupo";
}

async function fetchPaginado(
  model: string,
  domain: any[],
  fields: string[],
  context?: Record<string, any>,
): Promise<any[]> {
  let result: any[] = [];
  let offset = 0;
  while (true) {
    const page = await callOdooRPC<any[]>(model, "search_read", [domain], {
      fields,
      order: "id asc",
      limit: 5000,
      offset,
      ...(context ? { context } : {}),
    });
    if (!page || page.length === 0) break;
    result = result.concat(page);
    if (page.length < 5000) break;
    offset += 5000;
  }
  return result;
}

export async function fetchCuentasGasto(
  companyIds: number[],
): Promise<CuentaGasto[]> {
  const cuentas = await fetchPaginado(
    "account.account",
    // Tambien el grupo 6 aunque la cuenta tenga otro tipo: en Valencia
    // 6.06.01.035 "Gastos de Eventos Empresarial" esta creada como activo
    // corriente, y en Panama la depreciacion (6.06.01.020, 6.08.01.010) es
    // `expense_depreciation`; por tipo solo, ese gasto no salia.
    ["|", ["account_type", "=", TIPO_CUENTA_GASTO], ["code", "=like", "6%"]],
    ["id", "code", "name"],
    { allowed_company_ids: companyIds },
  );
  // Se devuelven TODAS las cuentas, sin deduplicar: con varias sedes el mismo
  // codigo contable puede existir como un registro por empresa, y filtrar el
  // gasto real necesita todos esos ids. Para listas de cuentas (plantilla de
  // presupuesto) usar dedupPorCodigo().
  return (cuentas || [])
    .filter((c: any) => c.code && !CODIGO_NO_OPERATIVO.test(String(c.code).trim()))
    .map((c: any) => ({
      id: c.id,
      codigo: String(c.code).trim(),
      nombre: typeof c.name === "string" ? c.name : String(c.name ?? ""),
      grupo: grupoDeCodigo(String(c.code).trim()),
    }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
}

/** Una fila por codigo contable, para listados y plantillas. */
export function dedupPorCodigo(cuentas: CuentaGasto[]): CuentaGasto[] {
  const vistos = new Set<string>();
  return cuentas.filter((c) => {
    if (vistos.has(c.codigo)) return false;
    vistos.add(c.codigo);
    return true;
  });
}

/**
 * Gasto real por cuenta en un rango, por fecha contable de la linea. Entra
 * cualquier asiento publicado (facturas, notas de credito de proveedor,
 * asientos manuales): el balance negativo de una NC o de una reversion
 * descuenta solo. `balance` ya esta en la moneda de la empresa.
 *
 * Nada antes del corte a Odoo (`CORTE_ODOO`): en mar-2026 estan los asientos
 * de migracion con el gasto acumulado de la epoca de Smartbit (1,77 M en
 * Valencia, 1,09 M en Panama), que no son gasto de ese mes.
 */
export async function fetchGastoReal(
  companyIds: number[],
  desde: string,
  hasta: string,
  cuentas: CuentaGasto[],
): Promise<{ porCuenta: Record<string, number>; detalles: GastoDetalle[] }> {
  const porCuenta: Record<string, number> = {};
  const detalles: GastoDetalle[] = [];
  desde = desdeOdoo(desde);
  if (cuentas.length === 0 || desde > hasta) return { porCuenta, detalles };

  const idACodigo: Record<number, CuentaGasto> = {};
  cuentas.forEach((c) => {
    idACodigo[c.id] = c;
  });

  const lineas = await fetchPaginado(
    "account.move.line",
    [
      ["parent_state", "=", "posted"],
      ["date", ">=", desde],
      ["date", "<=", hasta],
      ["company_id", "in", companyIds],
      ["account_id", "in", cuentas.map((c) => c.id)],
    ],
    ["account_id", "balance", "move_id", "move_name", "partner_id", "date", "name", "ref", "journal_id", "amount_currency", "currency_id"],
    { allowed_company_ids: companyIds },
  );

  (lineas || []).forEach((l: any) => {
    const cuenta = idACodigo[l.account_id?.[0]];
    if (!cuenta) return;
    const monto = Number(l.balance) || 0;
    porCuenta[cuenta.codigo] = (porCuenta[cuenta.codigo] || 0) + monto;
    const concepto = typeof l.name === "string" ? l.name.trim() : "";
    const moneda = l.currency_id?.[1] || "USD";
    detalles.push({
      cuentaCodigo: cuenta.codigo,
      // Un asiento de nomina o de banco no suele tener contacto: se muestra
      // la etiqueta de la linea para que el detalle diga que es.
      proveedor: l.partner_id?.[1] || concepto || "Sin contacto",
      factura: l.move_name || l.move_id?.[1] || "",
      fecha: l.date || "",
      monto,
      concepto,
      referencia: typeof l.ref === "string" ? l.ref.trim() : "",
      diario: l.journal_id?.[1] || "",
      montoMoneda: moneda !== "USD" ? Number(l.amount_currency) || 0 : null,
      moneda,
    });
  });

  Object.keys(porCuenta).forEach((k) => {
    porCuenta[k] = Math.round(porCuenta[k] * 100) / 100;
  });

  return { porCuenta, detalles };
}

export function rangoDelMes(mes: string): { desde: string; hasta: string } {
  const [anio, m] = mes.split("-").map(Number);
  const ultimoDia = new Date(anio, m, 0).getDate();
  return {
    desde: `${anio}-${String(m).padStart(2, "0")}-01`,
    hasta: `${anio}-${String(m).padStart(2, "0")}-${ultimoDia}`,
  };
}

export function mesAnterior(mes: string, meses = 1): string {
  const [anio, m] = mes.split("-").map(Number);
  const d = new Date(anio, m - 1 - meses, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
