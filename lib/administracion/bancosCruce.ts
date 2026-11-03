/**
 * Conciliacion bancaria: lo que no toca la base ni Odoo (lo usa bancos.ts y lo
 * prueba scripts/check-bancos.cjs). Leer las filas de un estado de cuenta en
 * Excel y cruzar movimientos del banco, cobros de Odoo y comprobantes.
 */

/** Una fila del estado de cuenta. monto: + entra, - sale. */
export type FilaEstado = {
  fecha: string; // YYYY-MM-DD
  referencia: string;
  descripcion: string;
  monto: number;
  saldo: number | null;
};

export type EstadoLeido = {
  filas: FilaEstado[];
  /** Dias que cubre el archivo (con las filas de saldo inicial y final). */
  desde: string;
  hasta: string;
  /** Filas cuyo saldo no cuadra con la anterior: puede faltar un movimiento. */
  saltos: number;
};

// ---------- Lectura ----------

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const COLUMNAS: Record<string, RegExp> = {
  fecha: /^fecha/,
  referencia: /referencia|^ref\b|^documento|^nro|^numero|comprobante/,
  descripcion: /descripcion|concepto|detalle|transaccion/,
  monto: /^monto|^importe/,
  credito: /credito|abono|haber|deposito/,
  debito: /debito|cargo|debe|retiro/,
  saldo: /saldo|balance/,
};

/** Dia (YYYY-MM-DD) de una celda: fecha de Excel, "2026/10/22", "27/10/2026" (dia/mes). */
export function fechaDeCelda(v: unknown): string | null {
  const iso = (y: number, m: number, d: number) => {
    const f = new Date(Date.UTC(y, m - 1, d));
    return y >= 2000 && f.getUTCMonth() === m - 1 && f.getUTCDate() === d ? f.toISOString().slice(0, 10) : null;
  };
  if (v instanceof Date) return iso(v.getFullYear(), v.getMonth() + 1, v.getDate());
  if (typeof v === "number" && v > 30000 && v < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400_000).toISOString().slice(0, 10);
  }
  const s = String(v ?? "").trim();
  let r = /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})/.exec(s);
  if (r) return iso(+r[1], +r[2], +r[3]);
  r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?!\d)/.exec(s);
  if (r) return iso(r[3].length === 2 ? 2000 + +r[3] : +r[3], +r[2], +r[1]);
  return null;
}

/**
 * Monto de una celda: "+1.394.295,35", "-391,00", "1,155.00", "(50.00)". Con un
 * solo separador seguido de 3 cifras es de miles ("204.000" = 204000).
 */
export function montoDeCelda(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v ?? "").replace(/\s/g, "");
  if (!s) return null;
  const negativo = /^-|^\(.*\)$|-$/.test(s);
  s = s.replace(/[^\d.,]/g, "");
  if (!/\d/.test(s)) return null;
  const ultimoPunto = s.lastIndexOf(".");
  const ultimaComa = s.lastIndexOf(",");
  let decimal = "";
  if (ultimoPunto >= 0 && ultimaComa >= 0) decimal = ultimoPunto > ultimaComa ? "." : ",";
  else if (ultimoPunto >= 0 || ultimaComa >= 0) {
    const sep = ultimoPunto >= 0 ? "." : ",";
    const partes = s.split(sep);
    decimal = partes.length === 2 && partes[1].length !== 3 ? sep : "";
  }
  const entero = decimal ? s.slice(0, s.lastIndexOf(decimal)) : s;
  const fraccion = decimal ? s.slice(s.lastIndexOf(decimal) + 1) : "";
  const n = Number(`${entero.replace(/[.,]/g, "")}.${fraccion || "0"}`);
  return Number.isFinite(n) ? (negativo ? -n : n) : null;
}

/**
 * El signo de cada monto sale del saldo cuando el archivo trae los montos sin
 * signo (la captura de Banesco Panama). Prueba el orden de arriba a abajo y el
 * inverso (lo mas nuevo primero) y usa el que cuadra en mas filas.
 */
export function signosPorSaldo(filas: FilaEstado[]): FilaEstado[] {
  const n = filas.length;
  const signo = (i: number, previa: number) => {
    const a = filas[i].saldo;
    const b = filas[previa]?.saldo;
    if (a === null || b === null || b === undefined) return 0;
    const dif = a - b;
    return Math.abs(Math.abs(dif) - Math.abs(filas[i].monto)) < 0.01 && Math.abs(dif) > 0 ? Math.sign(dif) : 0;
  };
  const subiendo = filas.map((_, i) => (i > 0 ? signo(i, i - 1) : 0));
  const bajando = filas.map((_, i) => (i < n - 1 ? signo(i, i + 1) : 0));
  const cuenta = (s: number[]) => s.filter(Boolean).length;
  const elegido = cuenta(bajando) > cuenta(subiendo) ? bajando : subiendo;
  return filas.map((f, i) => (elegido[i] ? { ...f, monto: elegido[i] * Math.abs(f.monto) } : f));
}

/** Filas cuyo saldo no cuadra con la de al lado (en el orden en que cuadran mas). */
export function saltosDeSaldo(filas: FilaEstado[]): number {
  const conSaldo = filas.filter((f) => f.saldo !== null);
  if (conSaldo.length < 2) return 0;
  const contar = (lista: FilaEstado[]) =>
    lista.slice(1).filter((f, i) => Math.abs(lista[i].saldo! + f.monto - f.saldo!) > 0.01).length;
  return Math.min(contar(conSaldo), contar([...conSaldo].reverse()));
}

/**
 * Filas de un estado de cuenta en Excel (ya pasado a una matriz de celdas):
 * busca el encabezado (Fecha + Monto, o Credito/Debito) y lee hacia abajo. Una
 * fecha vacia es la de la fila de arriba (celdas combinadas). Las filas de
 * saldo inicial/final no son movimientos, pero su fecha cuenta para lo cubierto.
 * null = no se encontro el encabezado.
 */
export function leerFilasExcel(celdas: unknown[][]): EstadoLeido | null {
  for (let h = 0; h < Math.min(celdas.length, 40); h++) {
    const titulos = (celdas[h] || []).map((c) => sinAcentos(String(c ?? "")));
    const col = (clave: string) => titulos.findIndex((t) => t && COLUMNAS[clave].test(t));
    const c = Object.fromEntries(Object.keys(COLUMNAS).map((k) => [k, col(k)]));
    if (c.fecha < 0 || (c.monto < 0 && (c.credito < 0 || c.debito < 0))) continue;
    const filas: FilaEstado[] = [];
    const dias: string[] = [];
    let fecha: string | null = null;
    for (const fila of celdas.slice(h + 1)) {
      const celda = (i: number) => (i >= 0 ? fila?.[i] : undefined);
      fecha = fechaDeCelda(celda(c.fecha)) ?? (String(celda(c.fecha) ?? "").trim() ? null : fecha);
      if (!fecha) continue;
      dias.push(fecha);
      const descripcion = String(celda(c.descripcion) ?? "").replace(/\s+/g, " ").trim();
      if (/^saldo (inicial|final|anterior|actual)/i.test(sinAcentos(descripcion))) continue;
      const monto =
        c.monto >= 0
          ? montoDeCelda(celda(c.monto))
          : (montoDeCelda(celda(c.credito)) ?? 0) - Math.abs(montoDeCelda(celda(c.debito)) ?? 0);
      if (monto === null || monto === 0) continue;
      filas.push({
        fecha,
        referencia: String(celda(c.referencia) ?? "").trim().slice(0, 60),
        descripcion: descripcion.slice(0, 255),
        monto,
        saldo: montoDeCelda(celda(c.saldo)),
      });
    }
    if (!filas.length) return null;
    return armarEstado(filas, dias);
  }
  return null;
}

/** Signos, saltos de saldo y dias cubiertos de unas filas ya leidas. */
export function armarEstado(leidas: FilaEstado[], diasExtra: string[] = []): EstadoLeido {
  const filas = signosPorSaldo(leidas);
  const dias = [...diasExtra, ...filas.map((f) => f.fecha)].sort();
  return { filas, desde: dias[0], hasta: dias[dias.length - 1], saltos: saltosDeSaldo(filas) };
}

// ---------- Cruce ----------

export type Movimiento = FilaEstado & {
  /** Llave del movimiento (huella): la misma fila en dos archivos es una sola. */
  id: string;
};

export type PagoOdoo = {
  id: number;
  nombre: string;
  fecha: string; // YYYY-MM-DD
  monto: number;
  cliente: string;
  ref: string;
};

export type ComprobanteBanco = {
  id: number;
  fecha: string; // YYYY-MM-DD
  referencia: string;
  monto: number;
  moneda: string;
  cuentaOrigen: string;
  banco: string;
  motivo: string;
  cliente: string;
  /** Movimiento amarrado a mano (huella), o null. */
  movimientoId: string | null;
  archivoNombre: string;
  subidoPor: string;
};

/** Como se amarro el movimiento con el cobro de Odoo. */
export type EstadoMovimiento = "referencia" | "manual" | "por_monto" | "sin_registrar";
export type EstadoComprobante = "conciliado" | "por_revisar" | "sin_registrar" | "no_encontrado" | "sin_estado";

export type MovimientoCruzado = Movimiento & {
  estado: EstadoMovimiento;
  pago: PagoOdoo | null;
  comprobante: { id: number; cliente: string; referencia: string } | null;
};

export type ComprobanteCruzado = ComprobanteBanco & {
  estado: EstadoComprobante;
  movimiento: Movimiento | null;
  pago: PagoOdoo | null;
};

const mismoMonto = (a: number, b: number) => Math.abs(a - b) < 0.005;
const dias = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400_000;

/** Referencia sin signos, en mayusculas y sin ceros adelante. */
export const normalRef = (s: string) =>
  String(s || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/^0+/, "");

/**
 * Dos referencias son la misma operacion si terminan igual en 6 caracteres o
 * mas: el banco la muestra con ceros o un prefijo ("00000694003" / "694003",
 * "20467137440" / "67137440", "ACH-10092026I920175" / "I920175").
 */
export function mismaReferencia(a: string, b: string) {
  const x = normalRef(a);
  const y = normalRef(b);
  if (!x || !y) return false;
  if (x === y) return x.length >= 4;
  let comun = 0;
  while (comun < x.length && comun < y.length && x[x.length - 1 - comun] === y[y.length - 1 - comun]) comun++;
  return comun >= 6;
}

// Odoo puede tener el cobro con otra fecha que el banco (lo registran el dia
// del comprobante y el banco lo abona al otro dia, o al reves).
const DIAS_POR_REFERENCIA = 7;
const DIAS_POR_MONTO = 3;

/**
 * Cruza las entradas del estado de cuenta con los cobros de Odoo del mismo
 * diario y con los comprobantes de los clientes. Solo entradas (monto > 0).
 *
 * Movimiento con cobro de Odoo: primero lo amarrado a mano; despues misma
 * referencia + mismo monto; despues mismo monto con la fecha mas cercana (hasta
 * 3 dias): eso queda "por_monto", para revisar. Sin cobro: "sin_registrar".
 *
 * Comprobante con movimiento: a mano; misma referencia (o la referencia dentro
 * de la descripcion) + monto; la referencia del cobro de Odoo que ya se amarro
 * (Banesco Panama guarda en Odoo el nro. del comprobante); los ultimos digitos
 * de la cuenta de origen dentro de la descripcion + monto; o un solo movimiento
 * de ese monto en +-2 dias ("por_revisar"). Sin movimiento: "no_encontrado" si el
 * estado de cuenta cubre su dia (`cubierto`), si no "sin_estado".
 */
export function cruzarBanco(
  movimientos: Movimiento[],
  pagos: PagoOdoo[],
  comprobantes: ComprobanteBanco[],
  manuales: Map<string, number>,
  cubierto: (dia: string) => boolean,
) {
  const entradas = movimientos.filter((m) => m.monto > 0).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const porId = new Map(pagos.map((p) => [p.id, p]));
  const usados = new Set<number>();
  const pagoDe = new Map<string, { pago: PagoOdoo; estado: EstadoMovimiento }>();
  const tomar = (m: Movimiento, pago: PagoOdoo | undefined, estado: EstadoMovimiento) => {
    if (!pago || usados.has(pago.id) || pagoDe.has(m.id)) return;
    usados.add(pago.id);
    pagoDe.set(m.id, { pago, estado });
  };
  for (const m of entradas) tomar(m, porId.get(manuales.get(m.id) ?? -1), "manual");
  const cercano = (m: Movimiento, ok: (p: PagoOdoo) => boolean, max: number) =>
    pagos
      .filter((p) => !usados.has(p.id) && mismoMonto(p.monto, m.monto) && dias(p.fecha, m.fecha) <= max && ok(p))
      .sort((a, b) => dias(a.fecha, m.fecha) - dias(b.fecha, m.fecha))[0];
  for (const m of entradas) tomar(m, cercano(m, (p) => mismaReferencia(p.ref, m.referencia), DIAS_POR_REFERENCIA), "referencia");
  for (const m of entradas) tomar(m, cercano(m, () => true, DIAS_POR_MONTO), "por_monto");

  const movDePago = new Map([...pagoDe].map(([movId, { pago }]) => [pago.id, movId]));
  const porMovId = new Map(entradas.map((m) => [m.id, m]));
  const movsUsados = new Set<string>();
  const salidaComp: ComprobanteCruzado[] = comprobantes.map((c) => {
    const libre = (m: Movimiento) => !movsUsados.has(m.id) && mismoMonto(m.monto, c.monto);
    const digitos = (s: string) => s.replace(/\D/g, "");
    const cuenta = digitos(c.cuentaOrigen).slice(-4);
    const ref = normalRef(c.referencia);
    let mov: Movimiento | undefined;
    let revisar = false;
    const manual = c.movimientoId ? porMovId.get(c.movimientoId) : undefined;
    if (manual && !movsUsados.has(manual.id)) mov = manual;
    mov ??= entradas.find(
      (m) =>
        libre(m) &&
        dias(m.fecha, c.fecha) <= DIAS_POR_REFERENCIA &&
        (mismaReferencia(m.referencia, c.referencia) || (ref.length >= 6 && normalRef(m.descripcion).includes(ref))),
    );
    if (!mov) {
      const pago = pagos.find((p) => mismoMonto(p.monto, c.monto) && mismaReferencia(p.ref, c.referencia));
      const id = pago && movDePago.get(pago.id);
      if (id && !movsUsados.has(id)) mov = porMovId.get(id);
    }
    mov ??= cuenta.length === 4
      ? entradas.find((m) => libre(m) && dias(m.fecha, c.fecha) <= DIAS_POR_MONTO && digitos(m.descripcion).includes(cuenta))
      : undefined;
    if (!mov) {
      const iguales = entradas.filter((m) => libre(m) && dias(m.fecha, c.fecha) <= 2);
      if (iguales.length === 1) {
        mov = iguales[0];
        revisar = true;
      }
    }
    if (!mov) return { ...c, estado: cubierto(c.fecha) ? "no_encontrado" : "sin_estado", movimiento: null, pago: null };
    movsUsados.add(mov.id);
    const pago = pagoDe.get(mov.id)?.pago ?? null;
    const estado: EstadoComprobante = !pago ? "sin_registrar" : revisar ? "por_revisar" : "conciliado";
    return { ...c, estado, movimiento: mov, pago };
  });

  const compDeMov = new Map(salidaComp.filter((c) => c.movimiento).map((c) => [c.movimiento!.id, c]));
  const salidaMovs: MovimientoCruzado[] = entradas.map((m) => {
    const c = compDeMov.get(m.id);
    const p = pagoDe.get(m.id);
    return {
      ...m,
      estado: p?.estado ?? "sin_registrar",
      pago: p?.pago ?? null,
      comprobante: c ? { id: c.id, cliente: c.cliente, referencia: c.referencia } : null,
    };
  });
  return {
    movimientos: salidaMovs,
    comprobantes: salidaComp,
    /** Cobros de Odoo que no estan en el estado de cuenta, en dias que el estado cubre. */
    pagosSinMovimiento: pagos.filter((p) => !usados.has(p.id) && cubierto(p.fecha)),
  };
}
