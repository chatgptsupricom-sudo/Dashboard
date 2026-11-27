/**
 * Rotación de inventario (pedido de Gabriel Camacho, nov-2026): cada producto
 * con stock de cada sede en verde/amarillo/rojo según los días sin venta, un
 * plan para salir de él en 90 días y las solicitudes de apoyo a la marca de lo
 * que pasa a rojo. Lo puro (sin Odoo ni MySQL): lo usan el servidor, las
 * pantallas y `scripts/check-rotacion-inventario.cjs`.
 *
 * Reglas:
 * - Días sin venta = desde la última factura o recibo de cliente del producto
 *   en la sede (sin notas de crédito ni intercompañía, `ultimaVenta` de
 *   Compras). Nunca antes del inicio del seguimiento (1-abr-2026, el corte
 *   Smartbit → Odoo) ni antes de que entrara la unidad más vieja que queda:
 *   lo que llegó hace 10 días y no se ha vendido lleva 10 días, no 200.
 * - Semáforo: verde 0-45 días, amarillo 46-90, rojo más de 90.
 * - Plan de 90 días: arranca el día que el producto aparece con stock (o se
 *   reinicia a mano) con las unidades disponibles de ese día. Meta diaria =
 *   esas unidades ÷ 90; semanal = ×7; mensual = ×30. La venta diaria
 *   necesaria es lo disponible hoy ÷ los días que le quedan al plan (sube si
 *   llega más mercancía o si se va atrasado).
 */

export const INICIO_SEGUIMIENTO = "2026-04-01";
export const HORIZONTE_DIAS = 90;
/** Último día verde y último amarillo. */
export const LIMITE_VERDE = 45;
export const LIMITE_AMARILLO = 90;

export const SEDES_ROTACION = [
  { id: 9, nombre: "Valencia" },
  { id: 10, nombre: "Caracas" },
  { id: 7, nombre: "Panamá" },
] as const;

export const nombreSede = (id: number) => SEDES_ROTACION.find((s) => s.id === id)?.nombre ?? `Sede ${id}`;

export type Color = "verde" | "amarillo" | "rojo";
export const COLORES: Color[] = ["verde", "amarillo", "rojo"];

export const COLOR: Record<Color, { label: string; rango: string; hex: string; fondo: string; texto: string }> = {
  verde: { label: "Verde", rango: `0 a ${LIMITE_VERDE} días`, hex: "#16a34a", fondo: "bg-emerald-50 border-emerald-200", texto: "text-emerald-700" },
  amarillo: { label: "Amarillo", rango: `${LIMITE_VERDE + 1} a ${LIMITE_AMARILLO} días`, hex: "#d97706", fondo: "bg-amber-50 border-amber-200", texto: "text-amber-700" },
  rojo: { label: "Rojo", rango: `más de ${LIMITE_AMARILLO} días`, hex: "#dc2626", fondo: "bg-red-50 border-red-200", texto: "text-red-700" },
};

export function colorDe(diasSinVenta: number): Color {
  if (diasSinVenta <= LIMITE_VERDE) return "verde";
  if (diasSinVenta <= LIMITE_AMARILLO) return "amarillo";
  return "rojo";
}

// ---------------------------------------------------------------------------
// Fechas "YYYY-MM-DD" (calendario de Caracas; las da el servidor).
// ---------------------------------------------------------------------------

const MS_DIA = 86_400_000;

export function sumarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / MS_DIA);
}

/** Lunes de la semana del día. */
export function inicioSemana(dia: string): string {
  const d = new Date(`${dia}T00:00:00Z`).getUTCDay(); // 0 = domingo
  return sumarDias(dia, -((d + 6) % 7));
}

/** Meses "YYYY-MM" desde el inicio del seguimiento hasta el de `hoy`. */
export function mesesSeguimiento(hoy: string): string[] {
  const out: string[] = [];
  let [y, m] = INICIO_SEGUIMIENTO.slice(0, 7).split("-").map(Number);
  const fin = hoy.slice(0, 7);
  for (;;) {
    const mes = `${y}-${String(m).padStart(2, "0")}`;
    out.push(mes);
    if (mes >= fin) return out;
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
}

const NOMBRES_MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const etiquetaMes = (mes: string) => `${NOMBRES_MES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(2, 4)}`;

// ---------------------------------------------------------------------------
// Días sin venta
// ---------------------------------------------------------------------------

/**
 * Día desde el que se cuentan los días sin venta: el mayor entre la última
 * venta, la entrada de la unidad más vieja que queda y el inicio del
 * seguimiento.
 */
export function referenciaSinVenta(ultimaVenta: string | null, enStockDesde: string | null, hoy: string): string {
  let ref = INICIO_SEGUIMIENTO;
  if (ultimaVenta && ultimaVenta > ref) ref = ultimaVenta;
  if (enStockDesde && enStockDesde > ref) ref = enStockDesde;
  return ref > hoy ? hoy : ref;
}

/** Día en que el producto entró a su color actual (sale de la referencia, no se guarda). */
export function colorDesde(referencia: string, color: Color): string {
  if (color === "rojo") return sumarDias(referencia, LIMITE_AMARILLO + 1);
  if (color === "amarillo") return sumarDias(referencia, LIMITE_VERDE + 1);
  return referencia;
}

// ---------------------------------------------------------------------------
// Plan de 90 días
// ---------------------------------------------------------------------------

export type EstadoPlan = "activo" | "cumplido" | "vencido" | "reiniciado";

export interface PlanBase {
  id: number | null;
  inicio: string;
  unidadesInicio: number;
  /** null = lo creó el panel solo. */
  creadoPor: string | null;
  motivo: string | null;
}

export interface Plan extends PlanBase {
  fin: string;
  metaDiaria: number;
  metaSemanal: number;
  metaMensual: number;
  diasTranscurridos: number;
  diasRestantes: number;
  vendidasPlan: number;
  /** Lo que se debería llevar vendido a hoy. */
  esperadoAHoy: number;
  /** vendidasPlan ÷ esperadoAHoy × 100 (null si todavía no se esperaba nada). */
  avancePlan: number | null;
  /** Disponible hoy ÷ días que le quedan al plan. */
  necesariaDiaria: number;
  vendidasSemana: number;
  avanceSemana: number | null;
  vendidasMes: number;
  avanceMes: number | null;
  /** Vendidas en los últimos 30 días ÷ 30. */
  ritmoActual: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;
const pct = (a: number, b: number) => (b > 0 ? r1((a / b) * 100) : null);

/** Unidades vendidas por día ("YYYY-MM-DD" → unidades netas). */
export type VentasDia = Map<string, number> | Record<string, number>;

export function vendidasEntre(ventas: VentasDia | undefined, desde: string, hasta: string): number {
  if (!ventas) return 0;
  let s = 0;
  const entradas = ventas instanceof Map ? ventas.entries() : Object.entries(ventas);
  for (const [dia, q] of entradas) if (dia >= desde && dia <= hasta) s += Number(q) || 0;
  return r2(s);
}

/** Último día del plan (el día de inicio cuenta como el 1). */
export const finDePlan = (inicio: string) => sumarDias(inicio, HORIZONTE_DIAS - 1);

export function calcularPlan(base: PlanBase, ventas: VentasDia | undefined, disponible: number, hoy: string): Plan {
  const fin = finDePlan(base.inicio);
  const metaDiaria = base.unidadesInicio / HORIZONTE_DIAS;
  const diasTranscurridos = Math.min(HORIZONTE_DIAS, Math.max(1, diasEntre(base.inicio, hoy) + 1));
  const diasRestantes = hoy > fin ? 0 : diasEntre(hoy, fin) + 1;
  const vendidasPlan = vendidasEntre(ventas, base.inicio, hoy);
  const esperadoAHoy = Math.min(base.unidadesInicio, metaDiaria * diasTranscurridos);
  const semana = inicioSemana(hoy);
  const mes = `${hoy.slice(0, 7)}-01`;
  const vendidasSemana = vendidasEntre(ventas, semana, hoy);
  const vendidasMes = vendidasEntre(ventas, mes, hoy);
  const metaSemanal = metaDiaria * 7;
  const metaMensual = metaDiaria * 30;
  return {
    ...base,
    fin,
    metaDiaria: r2(metaDiaria),
    metaSemanal: r1(metaSemanal),
    metaMensual: r1(metaMensual),
    diasTranscurridos,
    diasRestantes,
    vendidasPlan,
    esperadoAHoy: r1(esperadoAHoy),
    avancePlan: pct(vendidasPlan, esperadoAHoy),
    // Vencido: lo que queda, en un plan nuevo de 90 días.
    necesariaDiaria: r2(disponible / (diasRestantes || HORIZONTE_DIAS)),
    vendidasSemana,
    avanceSemana: pct(vendidasSemana, metaSemanal),
    vendidasMes,
    avanceMes: pct(vendidasMes, metaMensual),
    ritmoActual: r2(vendidasEntre(ventas, sumarDias(hoy, -29), hoy) / 30),
  };
}

/** Estado de un plan guardado como activo, visto hoy. */
export function estadoPlanHoy(base: PlanBase, vendidasPlan: number, disponible: number, hoy: string): EstadoPlan {
  if (disponible <= 0 || vendidasPlan >= base.unidadesInicio) return "cumplido";
  if (hoy > finDePlan(base.inicio)) return "vencido";
  return "activo";
}

// ---------------------------------------------------------------------------
// Ficha por producto y sede
// ---------------------------------------------------------------------------

export interface FichaProducto {
  companyId: number;
  productoId: number;
  codigo: string;
  nombre: string;
  /** Nombre de la marca en Odoo (`spiff_brand_id`). */
  marca: string;
  /** Marca normalizada (`claveMarca`): agrupa y enlaza con las solicitudes. */
  claveMarca: string;
  categoria: string;
  fisico: number;
  /** Unidades físicas en el almacén principal (= `fisico`). */
  existencia: number;
  /** Reservado para pedidos en el almacén principal. */
  reservado: number;
  /** existencia − reservado: sobre esto se calculan el plan y la cuota. */
  disponible: number;
  costo: number;
  /** disponible × costo. */
  valorCosto: number;
  ultimaVenta: string | null;
  enStockDesde: string | null;
  referencia: string;
  diasSinVenta: number;
  color: Color;
  colorDesde: string;
  vendidasSeguimiento: number;
  /** Unidades vendidas por mes desde abril (en el orden de `meses` de la respuesta). */
  vendidasPorMes: number[];
  plan: Plan;
  /** Solicitud abierta a la marca que lo incluye. */
  solicitud: { id: number; estado: EstadoSolicitud } | null;
}

export interface RespuestaRotacion {
  hoy: string;
  sedes: number[];
  meses: string[];
  fichas: FichaProducto[];
  puedeEditar: boolean;
  puedeGestionarSolicitudes: boolean;
  eligeSede: boolean;
  sedesPermitidas: number[];
  avisos: string[];
}

// ---------------------------------------------------------------------------
// Resúmenes (sede, marca, categoría) con el valor a costo de cada color
// ---------------------------------------------------------------------------

export interface Celda {
  referencias: number;
  unidades: number;
  valor: number;
}

export interface GrupoSemaforo {
  clave: string;
  porColor: Record<Color, Celda>;
  total: Celda;
}

const celdaVacia = (): Celda => ({ referencias: 0, unidades: 0, valor: 0 });

export function resumir(fichas: FichaProducto[], claveDe: (f: FichaProducto) => string): GrupoSemaforo[] {
  const grupos = new Map<string, GrupoSemaforo>();
  for (const f of fichas) {
    const clave = claveDe(f);
    let g = grupos.get(clave);
    if (!g) {
      g = { clave, porColor: { verde: celdaVacia(), amarillo: celdaVacia(), rojo: celdaVacia() }, total: celdaVacia() };
      grupos.set(clave, g);
    }
    for (const c of [g.porColor[f.color], g.total]) {
      c.referencias++;
      c.unidades += f.disponible;
      c.valor += f.valorCosto;
    }
  }
  const lista = [...grupos.values()];
  for (const g of lista) for (const c of [...Object.values(g.porColor), g.total]) c.valor = r2(c.valor);
  return lista.sort((a, b) => b.porColor.rojo.valor - a.porColor.rojo.valor || b.total.valor - a.total.valor);
}

// ---------------------------------------------------------------------------
// Solicitudes de apoyo a las marcas
// ---------------------------------------------------------------------------

export type EstadoSolicitud =
  | "por_enviar"
  | "enviada"
  | "respondida"
  | "acordada"
  | "liquidando"
  | "cerrada"
  | "rechazada"
  | "anulada";

export const ESTADOS_SOLICITUD: { value: EstadoSolicitud; label: string; color: string }[] = [
  { value: "por_enviar", label: "Por enviar", color: "bg-slate-100 text-slate-700" },
  { value: "enviada", label: "Enviada, esperando respuesta", color: "bg-blue-100 text-blue-700" },
  { value: "respondida", label: "Respondió la marca", color: "bg-indigo-100 text-indigo-700" },
  { value: "acordada", label: "Acción acordada", color: "bg-violet-100 text-violet-700" },
  { value: "liquidando", label: "Liquidando", color: "bg-amber-100 text-amber-800" },
  { value: "cerrada", label: "Cerrada", color: "bg-emerald-100 text-emerald-700" },
  { value: "rechazada", label: "La marca no apoya", color: "bg-red-100 text-red-700" },
  { value: "anulada", label: "Anulada", color: "bg-gray-100 text-gray-500" },
];

export const etiquetaEstado = (e: string) => ESTADOS_SOLICITUD.find((x) => x.value === e)?.label ?? e;

/** Las que todavía se trabajan (cuentan en "Solicitud abierta" de la ficha). */
export const ESTADOS_ABIERTOS: EstadoSolicitud[] = ["por_enviar", "enviada", "respondida", "acordada", "liquidando"];

export type TipoApoyo = "proteccion_precio" | "nota_credito" | "fondos_promocion" | "devolucion";

export const TIPOS_APOYO: { value: TipoApoyo; label: string }[] = [
  { value: "proteccion_precio", label: "Protección de precio" },
  { value: "nota_credito", label: "Nota de crédito" },
  { value: "fondos_promocion", label: "Fondos de promoción" },
  { value: "devolucion", label: "Devolución" },
];

export type AccionLinea = "liquidar" | "devolver" | "mantener";

export const ACCIONES_LINEA: { value: AccionLinea; label: string }[] = [
  { value: "liquidar", label: "Liquidar a precio de remate" },
  { value: "devolver", label: "Devolver a la marca" },
  { value: "mantener", label: "Mantener a precio normal" },
];

export interface LineaSolicitud {
  id: number;
  companyId: number;
  productoId: number;
  codigo: string;
  nombre: string;
  categoria: string;
  unidades: number;
  costoUnitario: number;
  valorCosto: number;
  diasSinVenta: number;
  ultimaVenta: string | null;
  fechaRojo: string | null;
  excluida: boolean;
  /** auto = salió solo de rojo; usuario = lo quitaron a mano. */
  exclusion: "auto" | "usuario" | null;
  apoyoUnitario: number | null;
  precioRemate: number | null;
  accion: AccionLinea | null;
  /** Solo en el detalle: lo de hoy en Odoo. */
  disponibleHoy?: number | null;
  vendidasDesdeAcuerdo?: number | null;
}

export interface Solicitud {
  id: number;
  companyId: number;
  marca: string;
  marcaNombre: string;
  estado: EstadoSolicitud;
  creadaAuto: boolean;
  createdAt: string;
  creadoPor: string | null;
  enviadaEl: string | null;
  enviadaPor: string | null;
  enviadaA: string | null;
  canal: "n8n" | "manual" | null;
  respuestaEl: string | null;
  respuesta: string | null;
  tiposApoyo: TipoApoyo[];
  montoApoyo: number | null;
  accionAcordada: string | null;
  acordadaEl: string | null;
  notas: string | null;
  cerradaEl: string | null;
  updatedAt: string | null;
  /** Resumen (en la lista): líneas que no están excluidas. */
  productos: number;
  unidades: number;
  valorCosto: number;
}

export interface EventoSolicitud {
  id: number;
  createdAt: string;
  usuario: string | null;
  accion: string;
  detalle: string | null;
}

/** Folio que se le muestra a la marca. */
export const folio = (id: number) => `SM-${String(id).padStart(4, "0")}`;

/** Costo después del apoyo de la marca y margen de un precio de remate. */
export function margenRemate(costo: number, apoyoUnitario: number | null, precioRemate: number | null) {
  const costoNeto = r2(costo - (apoyoUnitario ?? 0));
  if (!precioRemate || precioRemate <= 0) return { costoNeto, margen: null as number | null };
  return { costoNeto, margen: r1(((precioRemate - costoNeto) / precioRemate) * 100) };
}

export interface ContactoMarca {
  id: number;
  marca: string;
  /** 0 = todas las sedes. */
  companyId: number;
  nombre: string | null;
  correos: string;
  cc: string | null;
  notas: string | null;
}

/** Texto del correo que se le propone a quien envía (lo puede cambiar). */
export function mensajeSugerido(s: Pick<Solicitud, "id" | "companyId" | "marcaNombre" | "productos" | "unidades" | "valorCosto">, contacto?: string | null) {
  const valor = s.valorCosto.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  return [
    `${contacto ? `Estimado(a) ${contacto}` : "Buen día"},`,
    "",
    `Le escribimos de Supricom (${nombreSede(s.companyId)}). Le adjuntamos el reporte de ${s.productos} producto(s) ${s.marcaNombre} que tienen más de ${LIMITE_AMARILLO} días sin venta en nuestro inventario: ${s.unidades.toLocaleString("en-US")} unidades por ${valor} a costo.`,
    "",
    "Queremos rotarlos y le solicitamos su apoyo con alguna de estas opciones: protección de precio, notas de crédito, fondos de promoción o devolución de la mercancía. Con ese apoyo definiremos un precio de remate para liquidarlos.",
    "",
    `Quedamos atentos a su respuesta. Referencia: ${folio(s.id)}.`,
    "",
    "Saludos,",
    "Supricom",
  ].join("\n");
}
