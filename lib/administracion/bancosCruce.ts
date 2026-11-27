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
  referenciaCompleta?: string;
};

export type EstadoLeido = {
  saldoInicialDeclarado?: number;
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
  // Solo si no hay Monto/Importe ni Debito + Credito: en algunos bancos "Movimiento" es la descripcion.
  montoOtro: /^movimiento|^valor/,
  credito: /credito|abono|haber|deposito/,
  debito: /debito|cargo|debe|retiro/,
  saldo: /saldo|balance/,
};

/** Dia (YYYY-MM-DD) de una celda: fecha de Excel, "2026/10/22", "27/10/2026" (dia/mes). */
export function fechaDeCelda(v: unknown, orden: "dmy" | "mdy" = "dmy", invertirSerial = false): string | null {
  const iso = (y: number, m: number, d: number) => {
    const f = new Date(Date.UTC(y, m - 1, d));
    return y >= 2000 && f.getUTCMonth() === m - 1 && f.getUTCDate() === d ? f.toISOString().slice(0, 10) : null;
  };
  if (v instanceof Date) return iso(v.getFullYear(), v.getMonth() + 1, v.getDate());
  if (typeof v === "number" && v > 30000 && v < 80000) {
    const f = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400_000).toISOString().slice(0, 10);
    // Excel guardo «01/04/2026» (dia/mes) como 4 de enero: se devuelven mes y dia a su lugar (ver serialesInvertidos).
    return invertirSerial && +f.slice(8) <= 12 ? iso(+f.slice(0, 4), +f.slice(8), +f.slice(5, 7)) : f;
  }
  const s = String(v ?? "").trim();
  let r = /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})/.exec(s);
  if (r) return iso(+r[1], +r[2], +r[3]);
  r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?!\d)/.exec(s);
  if (r) {
    const y = r[3].length === 2 ? 2000 + +r[3] : +r[3];
    return orden === "mdy" ? iso(y, +r[1], +r[2]) : iso(y, +r[2], +r[1]);
  }
  return null;
}

/**
 * Orden de las fechas en texto de una columna: dia/mes (Venezuela) salvo que alguna
 * tenga el segundo numero mayor que 12 y ninguna el primero (mes/dia, como el Excel
 * de Banesco Panama: «04/13/2026»; leido como dia/mes salian del 04/01 al 04/10 y las
 * de dia > 12 se perdian, nov-2026).
 */
/**
 * Fechas guardadas por un Excel en ingles con dia y mes cruzados: los dias 1 al 12
 * quedan como fecha real con el mes y el dia al reves («01/04/2026» = 4 de enero) y
 * los del 13 en adelante como texto «13/04/2026», que Excel no pudo convertir
 * (Banesco Panama «Abril 2026.xlsx», nov-2026: 27 de 72 filas caian en enero, junio,
 * julio...). true si la columna mezcla las dos cosas y, al cruzarlas, las fechas reales
 * caen en los meses del texto.
 */
export function serialesInvertidos(valores: unknown[]): boolean {
  const meses = new Set<number>();
  for (const v of valores) {
    const r = typeof v === "string" ? /^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?!\d)/.exec(v) : null;
    if (r && +r[1] > 12) meses.add(+r[2]);
  }
  const seriales = valores
    .filter((v): v is number => typeof v === "number" && v > 30000 && v < 80000)
    .map((v) => new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400_000));
  if (!meses.size || !seriales.length) return false;
  const tal = seriales.filter((f) => meses.has(f.getUTCMonth() + 1)).length;
  const cruzado = seriales.filter((f) => f.getUTCDate() <= 12 && meses.has(f.getUTCDate())).length;
  return cruzado > tal;
}

export function ordenDeFechas(valores: unknown[]): "dmy" | "mdy" {
  let primero = false;
  let segundo = false;
  for (const v of valores) {
    const r = typeof v === "string" ? /^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?!\d)/.exec(v) : null;
    if (!r) continue;
    if (+r[1] > 12) primero = true;
    if (+r[2] > 12) segundo = true;
  }
  return segundo && !primero ? "mdy" : "dmy";
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
    // «Referencia» antes que «Nro.» (Bancamiga trae las dos y «Nro.» es el numero de fila).
    const ref = titulos.findIndex((t) => t && /referencia|^ref\b/.test(t));
    if (ref >= 0) c.referencia = ref;
    if (c.monto < 0 && (c.credito < 0 || c.debito < 0)) c.monto = c.montoOtro;
    if (c.fecha < 0 || (c.monto < 0 && (c.credito < 0 || c.debito < 0))) continue;
    const filas: FilaEstado[] = [];
    const dias: string[] = [];
    let fecha: string | null = null;
    const valoresFecha = celdas.slice(h + 1).map((f) => f?.[c.fecha]);
    const orden = ordenDeFechas(valoresFecha);
    const invertir = serialesInvertidos(valoresFecha);
    // Lineas de saldo inicial/final y de totales sin fecha (Bancamiga: «Saldo Inicial: 21.076,56» arriba y «Creditos
    // Total: 798000 / Debito Total: 818358,97» abajo; la de totales se leia como un movimiento de 717,59 con la fecha de
    // la fila de arriba). No son movimientos, pero dicen que el estado cubre desde el inicio o hasta el fin del mes.
    let saldoInicialSinFecha = false;
    const aperturas = new Set<number>();
    let totalesSinFecha = false;
    // Lo de arriba del encabezado: «Saldo Inicial: 21076.56» y el periodo «Movimientos del 01/04/2026-30/04/2026».
    for (const fila of celdas.slice(0, h)) {
      const texto = sinAcentos((fila || []).map((x) => String(x ?? "")).join(" "));
      if (/saldo (inicial|anterior)/.test(texto)) saldoInicialSinFecha = true;
      const p = /(?:del|desde)\s*(\d{1,2}[/.-]\d{1,2}[/.-]\d{4})\s*(?:-|al|hasta|a)\s*(\d{1,2}[/.-]\d{1,2}[/.-]\d{4})/.exec(texto);
      const d1 = p && fechaDeCelda(p[1], orden);
      const d2 = p && fechaDeCelda(p[2], orden);
      if (d1 && d2 && d1 <= d2) dias.push(d1, d2);
    }
    for (const fila of celdas.slice(h + 1)) {
      const celda = (i: number) => (i >= 0 ? fila?.[i] : undefined);
      const texto = sinAcentos((fila || []).map((x) => String(x ?? "")).join(" "));
      const fechaFila = fechaDeCelda(celda(c.fecha), orden, invertir);
      if (/saldo (inicial|anterior)/.test(texto) || /(creditos?|debitos?) total|total (de )?(creditos?|debitos?)|saldo final/.test(texto)) {
        if (!fechaFila && fila.some((v) => /^saldo (inicial|anterior)[:.]?$/.test(sinAcentos(String(v ?? ""))))) {
          const importe = montoDeCelda(celda(c.saldo)) ?? montoDeCelda(celda(c.monto));
          if (importe !== null) aperturas.add(importe);
        }
        if (fechaFila) dias.push(fechaFila);
        else if (/saldo (inicial|anterior)/.test(texto)) saldoInicialSinFecha = true;
        else totalesSinFecha = true;
        continue;
      }
      fecha = fechaFila ?? (String(celda(c.fecha) ?? "").trim() ? null : fecha);
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
        referenciaCompleta: String(celda(c.referencia) ?? "").trim().replace(/^'+/, ""),
        referencia: String(celda(c.referencia) ?? "").trim().replace(/^'+/, "").slice(0, 60),
        descripcion: descripcion.slice(0, 255),
        monto,
        saldo: montoDeCelda(celda(c.saldo)),
      });
    }
    if (!filas.length) return null;
    const fechas = filas.map((f) => f.fecha).sort();
    if (saldoInicialSinFecha) dias.push(`${fechas[0].slice(0, 7)}-01`);
    if (totalesSinFecha) {
      const ult = fechas[fechas.length - 1];
      dias.push(new Date(Date.UTC(+ult.slice(0, 4), +ult.slice(5, 7), 0)).toISOString().slice(0, 10));
    }
    const estado = armarEstado(filas, dias);
    if (aperturas.size === 1) estado.saldoInicialDeclarado = [...aperturas][0];
    return estado;
  }
  return null;
}

/** Signos, saltos de saldo y dias cubiertos de unas filas ya leidas. */
export function armarEstado(leidas: FilaEstado[], diasExtra: string[] = []): EstadoLeido {
  const filas = signosPorSaldo(leidas);
  const dias = [...diasExtra, ...filas.map((f) => f.fecha)].sort();
  return { filas, desde: dias[0], hasta: dias[dias.length - 1], saltos: saltosDeSaldo(filas) };
}

// ---------- Saldos del estado de cuenta ----------

/**
 * Saldo inicial y final de unos movimientos (los de un mes) segun el saldo que
 * trae cada fila. Los archivos vienen en cualquier orden (Banesco va del mas nuevo
 * al mas viejo): el final es el del ultimo dia con saldo cuyo saldo no es el saldo
 * previo (saldo - monto) de otro movimiento de ese dia, mas lo que haya despues sin
 * saldo; el inicial = final - suma de los montos. `cuadra` = algun movimiento
 * arranca justo en ese inicial y el final no es ambiguo (si no, falta una fila).
 * null si ninguno trae saldo.
 */
export function saldosDelMes(movs: { fecha: string; monto: number; saldo: number | null }[]) {
  const c = (n: number) => Math.round(n * 100);
  const con = movs.filter((m) => m.saldo !== null);
  if (!con.length) return null;
  const ultimoDia = con.reduce((d, m) => (m.fecha > d ? m.fecha : d), "");
  const delDia = con.filter((m) => m.fecha === ultimoDia);
  const previos = delDia.map((m) => c(m.saldo! - m.monto));
  const finales = delDia.filter((m, i) => !previos.some((p, j) => j !== i && p === c(m.saldo!)));
  const despues = movs.filter((m) => m.fecha > ultimoDia).reduce((s, m) => s + c(m.monto), 0);
  const final = c((finales.length === 1 ? finales[0] : delDia[delDia.length - 1]).saldo!) + despues;
  const inicial = final - movs.reduce((s, m) => s + c(m.monto), 0);
  const cuadra = finales.length === 1 && con.some((m) => c(m.saldo! - m.monto) === inicial);
  return { inicial: inicial / 100, final: final / 100, cuadra };
}

// ---------- Periodo ----------

/** Lo mas largo que se puede pedir de una vez (un trimestre): cada vista lee Odoo entero del periodo. */
export const MAX_DIAS_PERIODO = 93;

/** null si desde..hasta es un periodo valido (YYYY-MM-DD, en orden, hasta MAX_DIAS_PERIODO dias); si no, el error. */
export function errorPeriodo(desde: string, hasta: string): string | null {
  const ok = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && fechaDeCelda(d) === d;
  if (!ok(desde) || !ok(hasta)) return "Las fechas deben ser YYYY-MM-DD";
  if (desde > hasta) return "La fecha inicial es posterior a la final";
  if ((Date.parse(hasta) - Date.parse(desde)) / 86400_000 + 1 > MAX_DIAS_PERIODO) {
    return `El período no puede pasar de ${MAX_DIAS_PERIODO} días`;
  }
  return null;
}

// ---------- Cruce ----------

export type Movimiento = FilaEstado & {
  /** Llave del movimiento (huella): la misma fila en dos archivos es una sola. */
  id: string;
};

/** Cobro (monto +) o pago a proveedor (monto -) de Odoo. ref = el Memo del pago. */
export type PagoOdoo = {
  id: number;
  nombre: string;
  fecha: string; // YYYY-MM-DD
  monto: number;
  cliente: string;
  ref: string;
  /** Ya conciliado en Odoo con una linea de extracto (`is_matched`). */
  conciliado?: boolean;
  /** Solo los apuntes de asientos (id negativo): el asiento, para el enlace a Odoo. */
  asientoId?: number;
  admiteCruceExtendido?: boolean;
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
  /** Lo que respondio la API del banco (Busqueda de Transferencias de Mercantil), o null si no se consulto. */
  api?: VerificacionApi | null;
  /** Cobro de Odoo que se registro desde el panel con este comprobante. */
  odooPagoId?: number | null;
};

export type EstadoApi = "confirmado" | "no_encontrado" | "duplicado" | "no_aplica" | "sin_telefono" | "error";
export type VerificacionApi = {
  estado: EstadoApi;
  /** Como lo encontro el banco. */
  tipo?: "transferencia" | "pago_movil";
  /** Pago Movil: codigo de autorizacion y celular de quien pago (58 + 10 digitos). */
  autorizacion?: string;
  telefono?: string;
  /** Cuando se consulto (ISO). */
  el: string;
  /** Texto para la pantalla: por que no se encontro, el error del banco... */
  mensaje?: string;
  fecha?: string;
  hora?: string;
  /** A aprobada, L pendiente por liquidar, P pendiente, R rechazada. */
  estatus?: string;
  pagador?: string;
  pagadorId?: string;
  bancoId?: number;
  canal?: string;
  /** El banco dice que esa transferencia ya se habia consultado antes (por el panel o por Odoo). */
  yaConsultada?: boolean;
};

/**
 * Como se amarro el movimiento con el cobro/pago de Odoo: referencia = coinciden
 * fecha, referencia y monto; parcial = coinciden dos de las tres, o solo la
 * referencia (para revisar, `coincide` dice cuales); comision = salida sin pago
 * que dice "comision".
 */
export type EstadoMovimiento = "referencia" | "parcial" | "manual" | "sin_registrar" | "comision";

/** Que coincide entre el movimiento del banco y el cobro/pago de Odoo. */
export type Coincide = { referencia: boolean; monto: boolean; fecha: boolean };

/** Comision del banco: se concilia contra la cuenta de gastos bancarios, sin pago de Odoo. */
export const esComision = (m: { monto: number; descripcion: string; referencia?: string }) =>
  m.monto < 0 && /comisi|\bcomis\b/i.test(`${m.descripcion} ${m.referencia || ""}`);

/** Cuenta que se propone para un movimiento sin cobro/pago (la elige o cambia quien aprueba). */
export function cuentaSugerida(m: { monto: number; descripcion: string; referencia?: string }): "igtf" | "comision" | null {
  if (m.monto < 0 && /igtf|grandes transacciones/i.test(`${m.descripcion} ${m.referencia || ""}`)) return "igtf";
  return esComision(m) ? "comision" : null;
}

/**
 * Si los cobros/pagos elegidos cubren el movimiento (lo que les falta conciliar,
 * en la moneda del diario): uno solo puede ser mayor (un cobro que el banco
 * abono en varias partes); varios tienen que sumar justo el movimiento. null = ok.
 */
export function errorPagos(monto: number, pendientes: number[]): string | null {
  const objetivo = Math.abs(monto);
  if (!pendientes.length) return "Elige al menos un cobro o pago";
  if (pendientes.some((p) => p < 0.005)) return "Uno de ellos ya está conciliado en Odoo";
  const total = pendientes.reduce((s, p) => s + p, 0);
  if (pendientes.length === 1) return total + 0.005 >= objetivo ? null : `Le quedan ${total.toFixed(2)} por conciliar y el movimiento es por ${objetivo.toFixed(2)}`;
  return Math.abs(total - objetivo) < 0.01 ? null : `Suman ${total.toFixed(2)} y el movimiento es por ${objetivo.toFixed(2)}`;
}
/** Hasta que diferencia se deja corregir en Odoo el monto de un cobro/pago para que sea el del banco (un error al escribirlo). */
export const MAX_AJUSTE = 0.01;

/** El registro de Odoo es del mismo signo que el movimiento y difiere en mas de un centimo y hasta MAX_AJUSTE (1 %). */
export function ajustePermitido(movimiento: number, registro: number): boolean {
  const a = Math.abs(movimiento);
  const d = Math.abs(a - Math.abs(registro));
  return movimiento !== 0 && Math.sign(movimiento) === Math.sign(registro) && d >= 0.005 && d <= a * MAX_AJUSTE;
}

export type EstadoComprobante = "conciliado" | "por_revisar" | "sin_registrar" | "no_encontrado" | "sin_estado";

export type MovimientoCruzado = Movimiento & {
  estado: EstadoMovimiento;
  pago: PagoOdoo | null;
  /** Cobro dividido: los demas cobros del grupo (el primero es `pago`). */
  otrosPagos: PagoOdoo[];
  coincide: Coincide | null;
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

/** La referencia entera y cada numero de 4+ cifras que trae (el Memo puede decir "REF 56789 FACT 5039"), sin ceros adelante. */
function tokensRef(s: string) {
  const t = new Set<string>();
  const todo = normalRef(s);
  if (todo) t.add(todo);
  for (const d of String(s || "").match(/\d{4,}/g) || []) {
    const n = d.replace(/^0+/, "");
    if (n.length >= 4) t.add(n);
  }
  return [...t];
}

/**
 * Dos referencias son la misma operacion si son iguales sin los ceros de
 * adelante ("000056789" / "56789") o si una termina con la otra (al menos 5
 * caracteres; con 6 basta aunque la corta sea mas larga): el banco la muestra con
 * un prefijo ("00000694003" / "694003", "20467137440" / "67137440",
 * "ACH-10092026I920175" / "I920175"). Si el Memo trae texto, cuenta cualquiera de
 * sus numeros.
 */
export function mismaReferencia(a: string, b: string) {
  for (const x of tokensRef(a)) {
    for (const y of tokensRef(b)) {
      if (x === y && x.length >= 4) return true;
      const corto = Math.min(x.length, y.length);
      let comun = 0;
      while (comun < corto && x[x.length - 1 - comun] === y[y.length - 1 - comun]) comun++;
      if (corto >= 5 && comun >= Math.min(6, corto)) return true;
    }
  }
  return false;
}

// Odoo puede tener el cobro con otra fecha que el banco (lo registran el dia
// del comprobante y el banco lo abona al otro dia, o al reves): hasta 3 dias es
// "misma fecha". Sin la fecha, la referencia se busca hasta 15 dias.
const DIAS_FECHA = 3;
const DIAS_VENTANA = 15;
// La referencia del banco con un registro mas viejo o mas nuevo: hasta ~mes y medio.
const DIAS_REF_LEJOS = 45;
export const DIAS_CRUCE_EXACTO = 60;

function referenciaOperacion(texto: string) {
  const claves = texto.toUpperCase().match(/\b(?:FT\d{5}[A-Z0-9]{6}|ACH[- ]?\d{8,}[A-Z0-9]*)\b/g);
  if (claves?.length === 1) return claves[0].replace(/[- ]/g, "");
  return /^\d{6,}$/.test(texto.trim()) ? texto.trim() : "";
}

function referenciaDelMovimiento(m: Movimiento) {
  return referenciaOperacion(m.referenciaCompleta || m.referencia) || referenciaOperacion(m.descripcion);
}
// Los dos cobros de un pago dividido y el movimiento del banco.
const DIAS_DIVIDIDO = 5;
// Los comprobantes siguen con sus margenes.
const DIAS_POR_REFERENCIA = 7;
const DIAS_POR_MONTO = 3;

/** Que coincide entre un movimiento y uno o varios cobros/pagos (el monto, sumados). */
export function coincidencia(m: Movimiento, p: PagoOdoo | PagoOdoo[]): Coincide {
  const ps = Array.isArray(p) ? p : [p];
  return {
    referencia: ps.every((x) => {
      const banco = referenciaDelMovimiento(m);
      const odoo = referenciaOperacion(x.ref);
      if (banco && banco === odoo) return true;
      if (banco.startsWith("FT") && odoo.startsWith("FT")) return false;
      return mismaReferencia(x.ref, m.referencia);
    }),
    monto: mismoMonto(ps.reduce((s, x) => s + x.monto, 0), m.monto),
    fecha: ps.every((x) => dias(x.fecha, m.fecha) <= DIAS_FECHA),
  };
}

/** "3626455533-1" -> "3626455533": CxC registra una transferencia en varios cobros con el mismo Memo y -1, -2... */
const SUFIJO_DIVIDIDO = /-\d{1,2}$/;
export const memoBase = (ref: string) => String(ref || "").trim().replace(SUFIJO_DIVIDIDO, "");
/**
 * El Memo es la referencia del banco con 1 o 2 cifras de mas al final, sin guion: la otra parte de un cobro dividido
 * (Valencia: banco 03600573202 = Memo 3600573202 + Memo 36005732021, el 4 % aparte).
 */
export function refExtendida(memo: string, ref: string) {
  const d = String(memo || "").replace(/\D/g, "").replace(/^0+/, "");
  const r = String(ref || "").replace(/\D/g, "").replace(/^0+/, "");
  return r.length >= 6 && d.length > r.length && d.length <= r.length + 2 && d.startsWith(r);
}

/**
 * Cruza el estado de cuenta con los cobros y pagos de Odoo del mismo diario
 * (entradas con cobros, salidas con pagos: el signo del monto los separa) y las
 * entradas con los comprobantes de los clientes. Una salida sin pago que dice
 * "comision" queda "comision".
 *
 * Movimiento con cobro/pago de Odoo (del mismo signo), por fecha, referencia y
 * monto: primero lo amarrado a mano; despues las tres ("referencia"); despues
 * referencia + monto; despues un **cobro dividido** (varios cobros con el mismo
 * Memo, uno o mas con -1, -2... al final, que suman justo el movimiento:
 * `otrosPagos`; "referencia" si todos son de la misma fecha, si no "parcial");
 * despues referencia + fecha, monto + fecha y por ultimo solo la referencia: esas
 * quedan "parcial", para revisar. En cada paso, el de fecha mas cercana. Sin
 * cobro: "sin_registrar".
 *
 * Comprobante con movimiento: a mano; misma referencia (o la referencia dentro
 * de la descripcion) + monto; la referencia del cobro de Odoo que ya se amarro
 * (Banesco Panama guarda en Odoo el nro. del comprobante); los ultimos digitos
 * de la cuenta de origen dentro de la descripcion + monto; o un solo movimiento
 * de ese monto en +-2 dias ("por_revisar"). Sin movimiento: si el banco lo
 * confirmo por la API, se busca su cobro en Odoo (el registrado desde el panel,
 * o misma referencia + monto en +-7 dias): "conciliado" o "sin_registrar"; si la
 * API no lo encontro, "no_encontrado"; si no, "no_encontrado" si el estado de
 * cuenta cubre su dia (`cubierto`), si no "sin_estado".
 */
export function cruzarBanco(
  movimientos: Movimiento[],
  pagos: PagoOdoo[],
  comprobantes: ComprobanteBanco[],
  manuales: Map<string, number>,
  cubierto: (dia: string) => boolean,
  yaConciliados: ReadonlySet<string> = new Set(),
  pagosParaCruceExacto: PagoOdoo[] = [],
) {
  const todos = [...movimientos].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const pendientes = todos.filter((m) => !yaConciliados.has(m.id));
  const entradas = todos.filter((m) => m.monto > 0);
  const porId = new Map(pagos.map((p) => [p.id, p]));
  const usados = new Set<number>();
  const pagoDe = new Map<string, { pago: PagoOdoo; estado: EstadoMovimiento; otros?: PagoOdoo[] }>();
  const tomar = (m: Movimiento, pago: PagoOdoo | undefined, estado: EstadoMovimiento) => {
    if (!pago || usados.has(pago.id) || pagoDe.has(m.id)) return;
    usados.add(pago.id);
    pagoDe.set(m.id, { pago, estado });
  };
  for (const m of todos) {
    const id = manuales.get(m.id);
    const pago = id === undefined ? undefined : porId.get(id);
    if (!yaConciliados.has(m.id) || pago?.conciliado) tomar(m, pago, "manual");
  }
  const cercano = (m: Movimiento, ok: (c: Coincide) => boolean) =>
    pagos
      .filter((p) => !yaConciliados.has(m.id) || p.conciliado)
      .filter((p) => !usados.has(p.id) && p.monto > 0 === m.monto > 0 && dias(p.fecha, m.fecha) <= DIAS_VENTANA && ok(coincidencia(m, p)))
      .sort((a, b) => dias(a.fecha, m.fecha) - dias(b.fecha, m.fecha))[0];
  const pasos: [(c: Coincide) => boolean, EstadoMovimiento][] = [
    [(c) => c.referencia && c.monto && c.fecha, "referencia"],
    [(c) => c.referencia && c.monto, "parcial"],
    [(c) => c.referencia && c.fecha, "parcial"],
    [(c) => c.monto && c.fecha, "parcial"],
    [(c) => c.referencia, "parcial"],
  ];
  const correr = ([ok, estado]: (typeof pasos)[number]) => {
    for (const m of todos) tomar(m, cercano(m, ok), estado);
  };
  // Una referencia bancaria completa tiene prioridad sobre las coincidencias por sufijo o importe.
  const asignadosManualmente = new Set(manuales.values());
  const porReferencia = new Map<string, PagoOdoo[]>();
  for (const p of pagosParaCruceExacto) {
    const ref = referenciaOperacion(p.ref);
    if (!ref || !p.admiteCruceExtendido || p.conciliado || asignadosManualmente.has(p.id)) continue;
    const grupo = porReferencia.get(ref) ?? [];
    grupo.push(p);
    porReferencia.set(ref, grupo);
  }
  const refsBanco = new Map<string, number>();
  for (const m of todos) {
    const clave = referenciaDelMovimiento(m);
    refsBanco.set(clave, (refsBanco.get(clave) ?? 0) + 1);
  }
  for (const m of pendientes) {
    const ref = referenciaDelMovimiento(m);
    if (!ref || refsBanco.get(ref) !== 1) continue;
    const candidatos = porReferencia.get(ref)?.filter((p) =>
      mismoMonto(m.monto, p.monto) && dias(m.fecha, p.fecha) <= DIAS_CRUCE_EXACTO);
    if (candidatos?.length === 1 && dias(m.fecha, candidatos[0].fecha) > DIAS_FECHA) {
      tomar(m, candidatos[0], "parcial");
    }
  }
  pasos.slice(0, 2).forEach(correr);
  for (const m of pendientes) {
    if (pagoDe.has(m.id) || !normalRef(m.referencia)) continue;
    const grupo = pagos
      .filter(
        (p) =>
          !usados.has(p.id) &&
          p.monto > 0 === m.monto > 0 &&
          dias(p.fecha, m.fecha) <= DIAS_VENTANA &&
          (mismaReferencia(memoBase(p.ref), m.referencia) || refExtendida(p.ref, m.referencia)),
      )
      .sort((a, b) => a.ref.localeCompare(b.ref));
    if (grupo.length < 2 || !grupo.some((p) => SUFIJO_DIVIDIDO.test(p.ref.trim()) || refExtendida(p.ref, m.referencia))) continue;
    const c = coincidencia(m, grupo);
    if (!c.monto) continue;
    for (const p of grupo) usados.add(p.id);
    pagoDe.set(m.id, { pago: grupo[0], otros: grupo.slice(1), estado: c.fecha ? "referencia" : "parcial" });
  }
  pasos.slice(2).forEach(correr);
  // La referencia del banco con un registro de hace mas de DIAS_VENTANA (hasta DIAS_REF_LEJOS): CxC lo registro un mes
  // despues (Valencia, P00171: banco 15/04 160.000 ref 3596376793, Odoo 15/05). Mismo monto o casi (0,1 %), un solo candidato.
  for (const m of pendientes) {
    if (pagoDe.has(m.id) || !normalRef(m.referencia) || esComision(m)) continue;
    const candidatos = pagos.filter(
      (p) =>
        !usados.has(p.id) &&
        p.monto > 0 === m.monto > 0 &&
        dias(p.fecha, m.fecha) <= DIAS_REF_LEJOS &&
        !(referenciaDelMovimiento(m).startsWith("FT") && referenciaOperacion(p.ref).startsWith("FT")) &&
        mismaReferencia(memoBase(p.ref), m.referencia) &&
        Math.abs(Math.abs(p.monto) - Math.abs(m.monto)) <= Math.max(0.01, Math.abs(m.monto) * 0.001),
    );
    if (candidatos.length === 1) tomar(m, candidatos[0], "parcial");
  }
  // Un pago del cliente que CxC registro en dos cobros (el principal y un 4 % aparte) con un Memo que no es la referencia
  // del banco (Valencia, P00951 767.831,61 + P00952 30.713,26 = banco 798.544,87 del 26/08): dos cobros libres del mismo
  // cliente que suman justo el movimiento en +-DIAS_DIVIDIDO dias. Solo si hay un unico par y ningun otro movimiento del
  // mismo monto lo puede querer.
  const libresDividido = (m: Movimiento) =>
    pagos.filter(
      (p) => !usados.has(p.id) && p.monto > 0 === m.monto > 0 && p.cliente && Math.abs(p.monto) < Math.abs(m.monto) && dias(p.fecha, m.fecha) <= DIAS_DIVIDIDO,
    );
  const sinPagoDividido = pendientes.filter((m) => !pagoDe.has(m.id) && !esComision(m));
  for (const m of sinPagoDividido) {
    if (pagoDe.has(m.id)) continue;
    const libres = libresDividido(m);
    const pares: [PagoOdoo, PagoOdoo][] = [];
    for (let i = 0; i < libres.length && pares.length < 2; i++) {
      for (let j = i + 1; j < libres.length; j++) {
        if (libres[i].cliente === libres[j].cliente && mismoMonto(libres[i].monto + libres[j].monto, m.monto)) pares.push([libres[i], libres[j]]);
      }
    }
    if (pares.length !== 1) continue;
    const rivales = sinPagoDividido.filter((o) => o.id !== m.id && !pagoDe.has(o.id) && mismoMonto(o.monto, m.monto) && dias(o.fecha, m.fecha) <= DIAS_DIVIDIDO * 2);
    if (rivales.length) continue;
    const [a, b] = Math.abs(pares[0][0].monto) >= Math.abs(pares[0][1].monto) ? pares[0] : [pares[0][1], pares[0][0]];
    usados.add(a.id);
    usados.add(b.id);
    pagoDe.set(m.id, { pago: a, otros: [b], estado: "parcial" });
  }
  // Solo el monto: domiciliaciones y servicios que el banco cobra solo y Odoo registra dias despues con otra
  // referencia (CEPRO ALARM: banco 04/05 ref 89, Odoo PBANES/2026/00105 12/05 Memo 877). Se propone para revisar
  // solo si no hay duda: un unico cobro/pago libre de ese monto exacto en ±15 dias y ningun otro movimiento sin
  // amarrar del mismo monto que lo pueda querer. Las comisiones no (montos chicos que se repiten).
  const sinPago = pendientes.filter((m) => !pagoDe.has(m.id) && !esComision(m));
  for (const m of sinPago) {
    const candidatos = pagos.filter((p) => !usados.has(p.id) && mismoMonto(p.monto, m.monto) && dias(p.fecha, m.fecha) <= DIAS_VENTANA);
    if (candidatos.length !== 1) continue;
    const rivales = sinPago.filter(
      (o) => o.id !== m.id && !pagoDe.has(o.id) && mismoMonto(o.monto, m.monto) && dias(o.fecha, candidatos[0].fecha) <= DIAS_VENTANA,
    );
    if (!rivales.length) tomar(m, candidatos[0], "parcial");
  }
  // Misma fecha y monto casi igual: Odoo lo registro con unos centimos o bolivares de diferencia y otra referencia
  // (al empezar no dejaba cambiar la tasa; Valencia 06/04: banco 861.300,00 y BANES/2026/00003 TRANSF/00002 - Send
  // 861.300,29). Se propone para revisar (alli se ofrece corregir el monto en Odoo) solo si no hay duda: un unico
  // cobro/pago libre en +-DIAS_FECHA dias a menos de MAX(2, 0,01 %) y ningun otro movimiento sin amarrar que lo quiera
  // (o varios identicos, ver abajo).
  const cerca = (a: number, b: number) => a > 0 === b > 0 && Math.abs(Math.abs(a) - Math.abs(b)) <= Math.max(2, Math.abs(b) * 0.0001);
  const aunSinPago = pendientes.filter((m) => !pagoDe.has(m.id) && !esComision(m));
  // Varios candidatos identicos (mismo monto y dia: TRANSF/00047 y 00048, 2.497.740,43 el 23/04) son intercambiables:
  // se toman en orden mientras alcancen para este movimiento y los otros que los quieren.
  for (const m of aunSinPago) {
    if (pagoDe.has(m.id)) continue;
    const candidatos = pagos
      .filter((p) => !usados.has(p.id) && cerca(p.monto, m.monto) && dias(p.fecha, m.fecha) <= DIAS_FECHA)
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
    if (!candidatos.length) continue;
    const identicos = candidatos.every((p) => mismoMonto(p.monto, candidatos[0].monto) && p.fecha === candidatos[0].fecha);
    if (!identicos) continue;
    const rivales = aunSinPago.filter(
      (o) => o.id !== m.id && !pagoDe.has(o.id) && cerca(candidatos[0].monto, o.monto) && dias(o.fecha, candidatos[0].fecha) <= DIAS_FECHA,
    );
    if (rivales.length + 1 <= candidatos.length) tomar(m, candidatos[0], "parcial");
  }

  const movDePago = new Map([...pagoDe].map(([movId, { pago }]) => [pago.id, movId]));
  const porMovId = new Map(entradas.map((m) => [m.id, m] as const));
  const movsUsados = new Set<string>();
  // Cobros de Odoo que tomo un comprobante confirmado por la API del banco: la plata esta en el banco.
  const usadosApi = new Set<number>();
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
    if (!mov && c.api?.estado === "confirmado") {
      const libreApi = (p: PagoOdoo | undefined) => p && !usados.has(p.id) && !usadosApi.has(p.id);
      const registrado = porId.get(c.odooPagoId ?? -1);
      const pago = libreApi(registrado)
        ? registrado!
        : pagos
            .filter((p) => libreApi(p) && mismoMonto(p.monto, c.monto) && mismaReferencia(p.ref, c.referencia))
            .sort((a, b) => dias(a.fecha, c.fecha) - dias(b.fecha, c.fecha))
            .find((p) => dias(p.fecha, c.fecha) <= DIAS_POR_REFERENCIA);
      if (pago) usadosApi.add(pago.id);
      return { ...c, estado: pago ? "conciliado" : "sin_registrar", movimiento: null, pago: pago ?? null };
    }
    if (!mov) {
      const noEsta = c.api?.estado === "no_encontrado" || cubierto(c.fecha);
      return { ...c, estado: noEsta ? "no_encontrado" : "sin_estado", movimiento: null, pago: null };
    }
    movsUsados.add(mov.id);
    const pago = pagoDe.get(mov.id)?.pago ?? null;
    const estado: EstadoComprobante = !pago && !yaConciliados.has(mov.id) ? "sin_registrar" : revisar ? "por_revisar" : "conciliado";
    return { ...c, estado, movimiento: mov, pago };
  });

  const compDeMov = new Map(salidaComp.filter((c) => c.movimiento).map((c) => [c.movimiento!.id, c]));
  const salidaMovs: MovimientoCruzado[] = todos.map((m) => {
    const c = compDeMov.get(m.id);
    const p = pagoDe.get(m.id);
    return {
      ...m,
      estado: p?.estado ?? (esComision(m) ? "comision" : "sin_registrar"),
      pago: p?.pago ?? null,
      otrosPagos: p?.otros ?? [],
      coincide: p ? coincidencia(m, [p.pago, ...(p.otros ?? [])]) : null,
      comprobante: c ? { id: c.id, cliente: c.cliente, referencia: c.referencia } : null,
    };
  });
  return {
    movimientos: salidaMovs,
    comprobantes: salidaComp,
    /** Cobros y pagos de Odoo que no estan en el estado de cuenta, en dias que el estado cubre. */
    pagosSinMovimiento: pagos.filter((p) => !usados.has(p.id) && !usadosApi.has(p.id) && cubierto(p.fecha)),
    /** Cobros de Odoo cuyo comprobante confirmo el banco por la API (no estan en el estado de cuenta). */
    pagosConfirmadosApi: usadosApi,
  };
}

// ---------- Bancos de Venezuela (codigo SUDEBAN, para la API de Mercantil) ----------

/** Codigos en el orden en que se prueban cuando el comprobante no dice el banco (los mas usados primero). */
export const BANCOS_VE: { codigo: number; nombre: string; patron: RegExp }[] = [
  { codigo: 134, nombre: "Banesco", patron: /banesco/ },
  { codigo: 104, nombre: "Venezolano de Crédito", patron: /venezolano/ },
  { codigo: 102, nombre: "Banco de Venezuela", patron: /\bbdv\b|venezuela/ },
  { codigo: 105, nombre: "Mercantil", patron: /mercantil/ },
  { codigo: 108, nombre: "Provincial", patron: /provincial|bbva/ },
  { codigo: 191, nombre: "BNC", patron: /\bbnc\b|nacional de credito/ },
  { codigo: 172, nombre: "Bancamiga", patron: /bancamiga/ },
  { codigo: 114, nombre: "Bancaribe", patron: /caribe/ },
  { codigo: 174, nombre: "Banplus", patron: /banplus/ },
  { codigo: 151, nombre: "BFC Fondo Común", patron: /\bbfc\b|fondo comun/ },
  { codigo: 175, nombre: "Banco Digital de los Trabajadores", patron: /bicentenario|trabajadores|\bbdt\b/ },
  { codigo: 115, nombre: "Exterior", patron: /exterior/ },
  { codigo: 171, nombre: "Activo", patron: /activo/ },
  { codigo: 163, nombre: "Tesoro", patron: /tesoro/ },
  { codigo: 128, nombre: "Caroní", patron: /caroni/ },
  { codigo: 138, nombre: "Plaza", patron: /plaza/ },
  { codigo: 156, nombre: "100% Banco", patron: /100\s*%|100 banco|cien por ciento/ },
  { codigo: 168, nombre: "Bancrecer", patron: /bancrecer/ },
  { codigo: 169, nombre: "R4", patron: /\br4\b|mi ?banco/ },
  { codigo: 177, nombre: "Banfanb", patron: /banfanb|fuerza armada/ },
  { codigo: 137, nombre: "Sofitasa", patron: /sofitasa/ },
  { codigo: 157, nombre: "DelSur", patron: /del ?sur/ },
  { codigo: 178, nombre: "N58", patron: /\bn58\b/ },
  { codigo: 166, nombre: "Agrícola", patron: /agricola/ },
  { codigo: 146, nombre: "Bangente", patron: /bangente/ },
  { codigo: 173, nombre: "Internacional de Desarrollo", patron: /internacional de desarrollo/ },
];

/**
 * Codigo del banco desde el texto del comprobante ("Banesco", "BANCO DE
 * VENEZUELA", "0134"...). null si no se reconoce: se prueban todos.
 */
export function codigoBanco(texto: string): number | null {
  const t = String(texto || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  const num = /\b0?(1\d\d)\b/.exec(t);
  if (num && BANCOS_VE.some((b) => b.codigo === Number(num[1]))) return Number(num[1]);
  return BANCOS_VE.find((b) => b.patron.test(t))?.codigo ?? null;
}

/** Los ultimos 8 digitos de la referencia, como los pide Mercantil ("99912345678" -> "12345678"). */
export const referenciaMercantil = (ref: string) => String(ref || "").replace(/\D/g, "").slice(-8);

/** Moneda del comprobante que se puede buscar en una cuenta en bolivares ('' = no se leyo: se asume Bs). */
export const esBolivares = (moneda: string) => /^(|VES|VEF|BS|BSS|BSD|BS\.?)$/i.test(String(moneda || "").trim());

/** Celular venezolano como lo pide Tpago: 58 + area + numero (12 digitos), o null. */
export function celular58(texto: string): string | null {
  const d = String(texto || "").replace(/\D/g, "");
  if (/^58\d{10}$/.test(d)) return d;
  if (/^0\d{10}$/.test(d)) return "58" + d.slice(1);
  if (/^\d{10}$/.test(d)) return "58" + d;
  return null;
}

// ---------- Lineas viejas de Odoo contra el estado de cuenta del panel ----------

export type MovPanel = { fecha: string; monto: number; referencia: string };
export type LineaOdooVieja = { id: number; fecha: string; monto: number; ref: string };

const diasEntreFechas = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;

/**
 * Que tan lejos esta el monto de Odoo del del banco (0 = igual), o null si no
 * es el mismo movimiento. Hubo lineas cargadas a mano en Odoo con los decimales
 * mal: redondeadas o cortadas (hasta 1 unidad o 0,1 %) o con la coma corrida
 * (x10, x100). Siempre el mismo signo.
 */
export function distanciaMonto(odoo: number, banco: number): number | null {
  if (!odoo || !banco || odoo > 0 !== banco > 0) return null;
  const a = Math.abs(odoo);
  const b = Math.abs(banco);
  if (Math.abs(a - b) < 0.005) return 0;
  if (Math.abs(a - b) <= Math.max(1, b * 0.001)) return Math.abs(a - b) / b;
  for (const escala of [10, 100, 0.1, 0.01]) {
    if (Math.abs(a * escala - b) <= Math.max(0.05, b * 0.0001)) return 0.5; // coma corrida
  }
  return null;
}

/**
 * Empareja cada linea vieja de Odoo con un movimiento del estado de cuenta del
 * panel (cada movimiento con una sola linea): mismo dia y mismo monto; o, con el
 * monto mal cargado (`distanciaMonto`), mismo dia o la misma referencia hasta 3
 * dias. Primero los pares mas parecidos.
 */
export function emparejarViejas<M extends MovPanel>(lineas: LineaOdooVieja[], movs: M[]): Map<number, M> {
  const pares: { linea: number; mov: number; puntos: number }[] = [];
  lineas.forEach((l, i) => {
    movs.forEach((m, j) => {
      const dist = distanciaMonto(l.monto, m.monto);
      if (dist === null) return;
      const dias = diasEntreFechas(l.fecha, m.fecha);
      const ref = !!l.ref && !!m.referencia && mismaReferencia(l.ref, m.referencia);
      if (dias > (ref ? DIAS_FECHA : 0)) return;
      pares.push({ linea: i, mov: j, puntos: dist + dias / 10 - (ref ? 0.01 : 0) });
    });
  });
  pares.sort((a, b) => a.puntos - b.puntos);
  const usadas = new Set<number>();
  const tomados = new Set<number>();
  const res = new Map<number, M>();
  for (const p of pares) {
    if (usadas.has(p.linea) || tomados.has(p.mov)) continue;
    usadas.add(p.linea);
    tomados.add(p.mov);
    res.set(lineas[p.linea].id, movs[p.mov]);
  }
  return res;
}
