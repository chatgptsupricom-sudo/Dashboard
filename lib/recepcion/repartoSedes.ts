/**
 * Reparto de la mercancía de un packing list entre Valencia (9) y Caracas (10).
 *
 * Es un concepto APARTE de:
 *  - el "reparto" por contenedor (cuánto trae cada contenedor de un renglón,
 *    `recepcion_packing_conteo.cantidad_esperada`), y
 *  - la Factura Especial de Caracas (`factura_aparte`, `esFacturaEspecial`):
 *    una compra directa de Caracas, otra compra. Sus renglones NUNCA entran
 *    al reparto (`agruparRenglones` los deja fuera).
 *
 * El reparto no cambia la recepción ni la carga en Odoo: todo entra a la sede
 * donde llega el contenedor y la parte de la otra sede viaja después con el
 * flujo de siempre (factura entre sedes). Dice cuánto de cada producto le
 * toca a cada sede y por qué.
 *
 * Automático, por producto:
 *   % cuota Caracas  = cuota Caracas ÷ (cuota Valencia + cuota Caracas)
 *   % rotación       = unidades vendidas en Caracas ÷ vendidas en las dos
 *                      (ventana de `ventanaDias`, sin intercompañía)
 *   % objetivo       = peso × % rotación + (1 − peso) × % cuota
 *                      (sin ventas en ninguna sede: el % de cuota)
 * y se redondea a cajas completas cuando el renglón trae cajas exactas, si no
 * a unidades enteras. El % del contenedor sale de sumar lo asignado: si viene
 * más de lo que vende Caracas, sube por encima de su cuota.
 *
 * Puro (sin base ni Odoo): lo chequea `node scripts/check-reparto-sedes.cjs`.
 */

export const VALENCIA = 9;
export const CARACAS = 10;
/** Sedes entre las que se reparte. Panamá queda fuera. */
export const SEDES_REPARTO = [VALENCIA, CARACAS] as const;

export const PESO_ROTACION_DEFECTO = 0.5;
export const VENTANA_DIAS_DEFECTO = 90;
export const VENTANAS_DIAS = [45, 90, 180, 365] as const;

/** % de cuota de Caracas cuando ninguna sede tiene cuota cargada. */
export const PCT_SIN_CUOTA = 0.5;

export const puedeRepartirse = (cids: unknown, origen?: unknown) =>
  (Number(cids) === VALENCIA || Number(cids) === CARACAS) && (origen == null || origen === "packing_list");

export interface ParametrosReparto {
  /** 0 = solo cuota, 1 = solo rotación. */
  pesoRotacion: number;
  ventanaDias: number;
}

export function normalizarParametros(p: Partial<ParametrosReparto> | null | undefined): ParametrosReparto {
  const peso = Number(p?.pesoRotacion);
  const ventana = Number(p?.ventanaDias);
  return {
    pesoRotacion: Number.isFinite(peso) ? Math.min(1, Math.max(0, Math.round(peso * 100) / 100)) : PESO_ROTACION_DEFECTO,
    ventanaDias: (VENTANAS_DIAS as readonly number[]).includes(ventana) ? ventana : VENTANA_DIAS_DEFECTO,
  };
}

/** % (0..1) de Caracas por cuota; null si ninguna de las dos tiene cuota. */
export function pctCuotaCaracas(cuotaValencia: number, cuotaCaracas: number): number | null {
  const v = Math.max(0, Number(cuotaValencia) || 0);
  const c = Math.max(0, Number(cuotaCaracas) || 0);
  return v + c > 0 ? c / (v + c) : null;
}

// ---------------------------------------------------------------------------
// Renglones → productos

/** Misma normalización que la recepción (`lib/escaneo/codigos.ts`). */
const normalizarCodigo = (v: unknown) => String(v ?? "").trim().toUpperCase().replace(/\s+/g, "");

/** Llave del producto en el reparto: el código, o el nombre si no trae código. */
export function claveProducto(codigo: unknown, producto: unknown): string {
  const c = normalizarCodigo(codigo);
  if (c) return c.slice(0, 300);
  return `N:${String(producto ?? "").trim().toUpperCase().replace(/\s+/g, " ")}`.slice(0, 300);
}

export interface RenglonPacking {
  id?: number;
  codigo?: string | null;
  producto?: string | null;
  cantidad_esperada?: number | string | null;
  cantidad_recibida?: number | string | null;
  cajas_esperadas?: number | string | null;
  factura_aparte?: string | null;
  odoo_product_id?: number | string | null;
}

export type BaseCantidad = "esperada" | "recibida";

export interface ProductoAgrupado {
  clave: string;
  codigo: string | null;
  producto: string;
  cantidad: number;
  /** Cajas del producto; null si algún renglón no las trae. */
  cajas: number | null;
  /** ids de los renglones que lo forman. */
  renglones: number[];
  odooProductId: number | null;
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const redondear3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Junta los renglones del mismo producto. Deja FUERA los de la Factura
 * Especial de Caracas (otra compra) y los que quedan en 0.
 */
export function agruparRenglones(items: RenglonPacking[], base: BaseCantidad): ProductoAgrupado[] {
  const mapa = new Map<string, ProductoAgrupado>();
  // Unidades por caja de cada producto: solo vale si todos sus renglones
  // traen cajas exactas del mismo tamaño (null = no se reparte por cajas).
  const porCaja = new Map<string, number | null>();
  for (const i of items) {
    if (i.factura_aparte) continue; // Factura Especial de Caracas: nunca se reparte
    const esperada = num(i.cantidad_esperada);
    const cantidad = base === "recibida" ? num(i.cantidad_recibida) : esperada;
    const clave = claveProducto(i.codigo, i.producto);
    const cajasRaw = i.cajas_esperadas;
    let cajas = cajasRaw == null || cajasRaw === "" ? null : Math.max(0, Math.round(num(cajasRaw)));
    // Las cajas son las del packing list: con lo contado solo sirven si se
    // contó exactamente lo esperado.
    if (base === "recibida" && Math.abs(cantidad - esperada) > 1e-9) cajas = null;
    const pc = cajas ? unidadesPorCaja(cantidad, cajas) : null;
    let p = mapa.get(clave);
    if (!p) {
      p = {
        clave,
        codigo: i.codigo ? String(i.codigo).trim() : null,
        producto: String(i.producto ?? "").trim(),
        cantidad: 0,
        cajas: 0,
        renglones: [],
        odooProductId: null,
      };
      mapa.set(clave, p);
      porCaja.set(clave, pc);
    } else if (porCaja.get(clave) !== pc) {
      porCaja.set(clave, null);
    }
    p.cantidad = redondear3(p.cantidad + cantidad);
    p.cajas = p.cajas == null || cajas == null || cajas <= 0 || porCaja.get(clave) == null ? null : p.cajas + cajas;
    if (i.id != null) p.renglones.push(Number(i.id));
    if (!p.odooProductId && Number(i.odoo_product_id) > 0) p.odooProductId = Number(i.odoo_product_id);
  }
  return [...mapa.values()].filter((p) => p.cantidad > 0);
}

/**
 * Fracción que va a Caracas de un renglón, buscando su producto en el
 * reparto por código y, si no está, por nombre (al renglón le pudieron poner
 * el código después del cálculo, en el cruce con Odoo). undefined = no está.
 */
export function fraccionDeRenglon(
  fracciones: Map<string, number> | undefined,
  codigo: unknown,
  producto: unknown,
): number | undefined {
  if (!fracciones) return undefined;
  return fracciones.get(claveProducto(codigo, producto)) ?? fracciones.get(claveProducto(null, producto));
}

// ---------------------------------------------------------------------------
// Cálculo

export interface DatosProducto {
  /** Unidades vendidas en la ventana (sin intercompañía; NC restan). */
  ventasValencia: number;
  ventasCaracas: number;
  /** Disponible hoy en el almacén principal (informativo). */
  stockValencia: number | null;
  stockCaracas: number | null;
  /** Costo unitario en la sede donde llega (para el % por valor). */
  costo: number | null;
}

export type BaseReparto = "rotacion" | "cuota";
export type OrigenLinea = "auto" | "manual";

export interface LineaReparto extends DatosProducto {
  clave: string;
  codigo: string | null;
  producto: string;
  odooProductId: number | null;
  cantidad: number;
  cajas: number | null;
  /** Lo que da el cálculo automático para Caracas (se guarda aunque sea manual). */
  autoCaracas: number;
  cantidadCaracas: number;
  cantidadValencia: number;
  origen: OrigenLinea;
  base: BaseReparto;
  pctCuotaCaracas: number;
  /** null sin ventas en ninguna sede. */
  pctRotacionCaracas: number | null;
  pctObjetivoCaracas: number;
  /** Unidades por caja si se repartió por cajas completas. */
  porCaja: number | null;
  motivoManual?: string | null;
}

/** % objetivo de Caracas (0..1) para un producto y de dónde sale. */
export function objetivoCaracas(
  ventasValencia: number,
  ventasCaracas: number,
  pctCuota: number,
  pesoRotacion: number,
): { pct: number; base: BaseReparto; pctRotacion: number | null } {
  const v = Math.max(0, num(ventasValencia));
  const c = Math.max(0, num(ventasCaracas));
  if (v + c <= 0) return { pct: pctCuota, base: "cuota", pctRotacion: null };
  const r = c / (v + c);
  const peso = Math.min(1, Math.max(0, pesoRotacion));
  return { pct: peso * r + (1 - peso) * pctCuota, base: "rotacion", pctRotacion: r };
}

/** Unidades por caja si el renglón trae cajas y caben exactas; si no, null. */
export function unidadesPorCaja(cantidad: number, cajas: number | null): number | null {
  if (!cajas || cajas <= 0 || cantidad <= 0) return null;
  const porCaja = cantidad / cajas;
  return Math.abs(porCaja - Math.round(porCaja)) < 1e-9 && Math.round(porCaja) >= 1 ? Math.round(porCaja) : null;
}

/**
 * Unidades para Caracas de un producto con un % dado: cajas completas si
 * se puede, si no unidades enteras. Siempre entre 0 y la cantidad.
 */
export function cantidadParaCaracas(cantidad: number, cajas: number | null, pct: number): { caracas: number; porCaja: number | null } {
  const q = Math.max(0, num(cantidad));
  const p = Math.min(1, Math.max(0, num(pct)));
  const porCaja = unidadesPorCaja(q, cajas);
  if (porCaja && cajas) {
    const cajasC = Math.round(cajas * p);
    return { caracas: Math.min(q, cajasC * porCaja), porCaja };
  }
  const entero = Math.floor(q + 1e-9);
  return { caracas: Math.min(entero, Math.max(0, Math.round(q * p))), porCaja: null };
}

export function lineaAutomatica(
  p: Pick<ProductoAgrupado, "clave" | "codigo" | "producto" | "odooProductId" | "cantidad" | "cajas">,
  datos: DatosProducto,
  pctCuota: number,
  params: ParametrosReparto,
): LineaReparto {
  const obj = objetivoCaracas(datos.ventasValencia, datos.ventasCaracas, pctCuota, params.pesoRotacion);
  const { caracas, porCaja } = cantidadParaCaracas(p.cantidad, p.cajas, obj.pct);
  return {
    ...datos,
    clave: p.clave,
    codigo: p.codigo,
    producto: p.producto,
    odooProductId: p.odooProductId,
    cantidad: p.cantidad,
    cajas: p.cajas,
    autoCaracas: caracas,
    cantidadCaracas: caracas,
    cantidadValencia: redondear3(p.cantidad - caracas),
    origen: "auto",
    base: obj.base,
    pctCuotaCaracas: pctCuota,
    pctRotacionCaracas: obj.pctRotacion,
    pctObjetivoCaracas: obj.pct,
    porCaja,
    motivoManual: null,
  };
}

/** Error de validación de una cantidad manual, o null si está bien. */
export function errorCantidadManual(cantidadCaracas: unknown, cantidad: number): string | null {
  const n = Number(cantidadCaracas);
  if (cantidadCaracas === "" || cantidadCaracas == null || !Number.isFinite(n)) return "La cantidad para Caracas no es un número";
  if (n < 0) return "La cantidad para Caracas no puede ser negativa";
  if (n > cantidad + 1e-9) return `La cantidad para Caracas no puede pasar de ${cantidad}`;
  if (Math.abs(n * 1000 - Math.round(n * 1000)) > 1e-6) return "Máximo tres decimales";
  return null;
}

export function conCantidadManual(l: LineaReparto, cantidadCaracas: number, motivo: string | null): LineaReparto {
  const c = redondear3(cantidadCaracas);
  return { ...l, cantidadCaracas: c, cantidadValencia: redondear3(l.cantidad - c), origen: "manual", motivoManual: motivo };
}

export function conAutomatico(l: LineaReparto): LineaReparto {
  return { ...l, cantidadCaracas: l.autoCaracas, cantidadValencia: redondear3(l.cantidad - l.autoCaracas), origen: "auto", motivoManual: null };
}

// ---------------------------------------------------------------------------
// Resumen del contenedor

export interface ResumenReparto {
  productos: number;
  unidades: number;
  unidadesValencia: number;
  unidadesCaracas: number;
  /** % de las unidades que va a Caracas (0..1); null sin unidades. */
  pctUnidadesCaracas: number | null;
  /** Valor al costo (solo productos con costo). */
  valorValencia: number;
  valorCaracas: number;
  pctValorCaracas: number | null;
  /** Productos sin costo: no entran al % por valor. */
  sinCosto: number;
  manuales: number;
  sinVentas: number;
}

export function resumirReparto(lineas: LineaReparto[]): ResumenReparto {
  const r: ResumenReparto = {
    productos: lineas.length,
    unidades: 0,
    unidadesValencia: 0,
    unidadesCaracas: 0,
    pctUnidadesCaracas: null,
    valorValencia: 0,
    valorCaracas: 0,
    pctValorCaracas: null,
    sinCosto: 0,
    manuales: 0,
    sinVentas: 0,
  };
  for (const l of lineas) {
    r.unidades += l.cantidad;
    r.unidadesValencia += l.cantidadValencia;
    r.unidadesCaracas += l.cantidadCaracas;
    if (l.costo != null && l.costo > 0) {
      r.valorValencia += l.cantidadValencia * l.costo;
      r.valorCaracas += l.cantidadCaracas * l.costo;
    } else r.sinCosto++;
    if (l.origen === "manual") r.manuales++;
    if (l.base === "cuota") r.sinVentas++;
  }
  r.unidades = redondear3(r.unidades);
  r.unidadesValencia = redondear3(r.unidadesValencia);
  r.unidadesCaracas = redondear3(r.unidadesCaracas);
  r.valorValencia = Math.round(r.valorValencia * 100) / 100;
  r.valorCaracas = Math.round(r.valorCaracas * 100) / 100;
  r.pctUnidadesCaracas = r.unidades > 0 ? r.unidadesCaracas / r.unidades : null;
  const valor = r.valorValencia + r.valorCaracas;
  r.pctValorCaracas = valor > 0 ? r.valorCaracas / valor : null;
  return r;
}

/**
 * Productos cuya cantidad en el reparto ya no coincide con la del packing
 * list (se editó, o se cerró con otra cantidad contada), más los que entraron
 * o salieron. Si hay alguno, el reparto está desactualizado.
 */
export function diferenciasConPacking(
  lineas: Pick<LineaReparto, "clave" | "cantidad">[],
  productos: Pick<ProductoAgrupado, "clave" | "cantidad">[],
): { clave: string; enReparto: number; enPacking: number }[] {
  const enPacking = new Map(productos.map((p) => [p.clave, p.cantidad]));
  const enReparto = new Map(lineas.map((l) => [l.clave, l.cantidad]));
  const out: { clave: string; enReparto: number; enPacking: number }[] = [];
  for (const [clave, q] of enReparto) {
    const p = enPacking.get(clave) ?? 0;
    if (Math.abs(p - q) > 1e-6) out.push({ clave, enReparto: q, enPacking: p });
  }
  for (const [clave, p] of enPacking) if (!enReparto.has(clave)) out.push({ clave, enReparto: 0, enPacking: p });
  return out;
}
