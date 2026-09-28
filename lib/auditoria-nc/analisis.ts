import type { Cambio, Documento, Evento } from "./odoo";
import { CATEGORIA_LABEL, type CategoriaMotivo } from "./motivos";

/**
 * Análisis (puro) de notas de crédito, anuladas y reabiertas: cada documento
 * con sus alertas, y los resúmenes por motivo, usuario, vendedor y cliente.
 *
 * Umbrales: monto alto desde $5.000 (media) y $20.000 (alta); NC tardía a
 * más de 90 días de la factura; NC en borrador con más de 7 días.
 */

export type Severidad = "alta" | "media" | "baja";
export interface Alerta { codigo: string; severidad: Severidad; texto: string }

export const MONTO_MEDIO = 5000;
export const MONTO_ALTO = 20000;
const DIAS_TARDIA = 90;
const DIAS_BORRADOR = 7;

export const ALERTAS: Record<string, { titulo: string; severidad: Severidad; explicacion: string }> = {
  NC_CLIENTE_DISTINTO: { titulo: "NC a otro cliente", severidad: "alta", explicacion: "La nota de crédito está a nombre de un cliente distinto al de la factura que revierte." },
  NC_EXCEDE_FACTURA: { titulo: "Acredita más que la factura", severidad: "alta", explicacion: "La suma de notas de crédito sobre la factura supera su monto." },
  NC_ANTES_FACTURA: { titulo: "Fecha anterior a la factura", severidad: "alta", explicacion: "La nota de crédito tiene fecha anterior a la factura que revierte." },
  NC_MONTO_ALTO: { titulo: "Monto alto", severidad: "media", explicacion: `Nota de crédito de ${MONTO_MEDIO.toLocaleString("en-US")} $ o más (alta desde ${MONTO_ALTO.toLocaleString("en-US")} $).` },
  NC_SIN_ORIGEN: { titulo: "Sin factura de origen", severidad: "media", explicacion: "No está vinculada a ninguna factura (no se hizo con \"Revertir\"): no se puede verificar qué acredita." },
  NC_SIN_MOTIVO: { titulo: "Sin motivo", severidad: "media", explicacion: "No tiene motivo escrito en la referencia." },
  NC_TARDIA: { titulo: "Tardía", severidad: "media", explicacion: `Se emitió más de ${DIAS_TARDIA} días después de la factura.` },
  NC_MISMO_VENDEDOR: { titulo: "Creada por el vendedor", severidad: "media", explicacion: "La creó el mismo usuario que es vendedor de la factura: falta separación de funciones." },
  NC_VARIAS: { titulo: "Varias NC en la factura", severidad: "baja", explicacion: "La factura tiene dos o más notas de crédito." },
  NC_BORRADOR: { titulo: "En borrador", severidad: "baja", explicacion: `Nota de crédito sin publicar con más de ${DIAS_BORRADOR} días.` },
  NC_SIN_APLICAR: { titulo: "Sin aplicar", severidad: "baja", explicacion: "Publicada pero con saldo pendiente: el cliente tiene un crédito a favor sin usar." },
  AN_PUBLICADA: { titulo: "Anulada después de emitida", severidad: "alta", explicacion: "Se anuló una factura que ya estaba publicada: el número ya se había usado." },
  AN_OTRO_MES: { titulo: "Anulada en otro mes", severidad: "alta", explicacion: "Se anuló en un mes posterior al de la factura: afecta libros de venta ya cerrados." },
  AN_CAMBIOS: { titulo: "Modificada antes de anular", severidad: "media", explicacion: "Antes de anularla le cambiaron monto, impuestos, cliente o fecha." },
  AN_SIN_REEMPLAZO: { titulo: "Sin factura de reemplazo", severidad: "media", explicacion: "No hay otra factura al mismo cliente por un monto parecido cerca de la anulación." },
  AN_MONTO_ALTO: { titulo: "Monto alto", severidad: "media", explicacion: `Documento anulado de ${MONTO_MEDIO.toLocaleString("en-US")} $ o más.` },
  AN_OTRO_USUARIO: { titulo: "La anuló otra persona", severidad: "baja", explicacion: "La anuló un usuario distinto al que la creó." },
  RE_BAJO_MONTO: { titulo: "Bajó el monto", severidad: "alta", explicacion: "Después de emitida la reabrieron y le bajaron el monto sin IVA." },
  RE_CAMBIO_CLIENTE: { titulo: "Cambió el cliente", severidad: "alta", explicacion: "Después de emitida la reabrieron y le cambiaron el cliente." },
  RE_OTRO_MES: { titulo: "Reabierta en otro mes", severidad: "media", explicacion: "Se reabrió en un mes posterior al de la factura." },
  RE_CAMBIO_FECHA: { titulo: "Cambió la fecha", severidad: "media", explicacion: "Le cambiaron la fecha de factura o la contable." },
  RE_CAMBIO_IMPUESTOS: { titulo: "Cambió impuestos", severidad: "media", explicacion: "Le cambiaron los impuestos de las líneas." },
  RE_CAMBIO_VENDEDOR: { titulo: "Cambió el vendedor", severidad: "media", explicacion: "Le cambiaron el vendedor." },
  RE_SIGUE_BORRADOR: { titulo: "Sigue en borrador", severidad: "media", explicacion: "Se reabrió y no se volvió a publicar." },
  RE_SUBIO_MONTO: { titulo: "Subió el monto", severidad: "baja", explicacion: "Después de emitida le subieron el monto sin IVA." },
  RE_TERMINO_ANULADA: { titulo: "Terminó anulada", severidad: "baja", explicacion: "Se reabrió y después se anuló (ver pestaña Anuladas)." },
  RE_VARIAS: { titulo: "Reabierta varias veces", severidad: "baja", explicacion: "Se reabrió dos o más veces." },
};

const alerta = (codigo: string, texto?: string, severidad?: Severidad): Alerta => ({
  codigo, severidad: severidad ?? ALERTAS[codigo].severidad, texto: texto ?? ALERTAS[codigo].titulo,
});

const r2 = (n: number) => Math.round(n * 100) / 100;
const dias = (a: string | null, b: string | null) =>
  a && b ? Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86400000) : null;
const mesDe = (s: string | null) => (s ? s.slice(0, 7) : "");
const usd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const ordenSev: Record<Severidad, number> = { alta: 0, media: 1, baja: 2 };
const ordenarAlertas = (xs: Alerta[]) => xs.sort((a, b) => ordenSev[a.severidad] - ordenSev[b.severidad]);

/** Cambios que importan: sin renumeraciones al publicar ni diferencias de redondeo. */
export function cambiosRelevantes(cambios: Cambio[]): Cambio[] {
  return cambios.filter((c) => {
    if (c.campo === "name") return !!c.antes && c.antes !== "/" && !!c.despues && c.despues !== "/" && c.antes !== c.despues;
    if (c.antesNum != null && c.despuesNum != null) return Math.abs(c.antesNum - c.despuesNum) >= 0.01;
    return c.antes !== c.despues;
  });
}

/**
 * Cambio neto de impuestos a partir del historial de líneas. Odoo registra
 * "16% IVA → 0" al borrar una línea y "0 → 16% IVA" al agregarla: reemplazar
 * líneas no es un cambio de impuesto. Se compara lo que se quitó con lo que
 * se agregó (multiconjunto) más los cambios directos en una misma línea.
 */
export interface CambioImpuestos { hay: boolean; aExento: boolean; soloIgtf: boolean; idaYVuelta: boolean; detalle: string }

const vacio = (s: string) => !s || s === "0" || s === "False";
const esExento = (s: string) => /EXEMPT|EXENT/i.test(s);
const tieneIva = (s: string) => /IVA/i.test(s) && !esExento(s);

export function cambioImpuestos(cambios: Cambio[]): CambioImpuestos {
  const tx = cambios.filter((c) => c.campo === "tax_ids");
  // Multiconjunto de lo quitado y lo puesto en todo el período: un cambio
  // directo A → B cuenta como quitar A y poner B; ida y vuelta se anula.
  const quitados = new Map<string, number>();
  const puestos = new Map<string, number>();
  const suma = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) || 0) + 1);
  let directos = 0;
  for (const c of tx) {
    if (!vacio(c.antes)) suma(quitados, c.antes);
    if (!vacio(c.despues)) suma(puestos, c.despues);
    if (!vacio(c.antes) && !vacio(c.despues) && c.antes !== c.despues) directos++;
  }
  const netoPuesto = [...puestos.entries()].filter(([k, n]) => n > (quitados.get(k) || 0)).map(([k]) => k);
  const netoQuitado = [...quitados.entries()].filter(([k, n]) => n > (puestos.get(k) || 0)).map(([k]) => k);
  // Solo es cambio si se reemplazó un impuesto por otro (quitar y poner líneas
  // del mismo impuesto, o solo agregar/quitar líneas, no lo es).
  const hay = netoQuitado.length > 0 && netoPuesto.length > 0;
  const antes = netoQuitado.join(", ");
  const despues = netoPuesto.join(", ");
  const aExento = hay && netoQuitado.some(tieneIva) && !netoPuesto.some(tieneIva);
  const soloIgtf = hay && netoPuesto.every((d) => /IGTF/i.test(d) && netoQuitado.some((a) => d.includes(a)));
  return { hay, aExento, soloIgtf, idaYVuelta: !hay && directos > 0, detalle: hay ? `${antes} → ${despues}` : "" };
}

/**
 * ¿Dos nombres de cliente son el mismo con otra ficha? Palabras significativas
 * en común (sin "C.A", "COMPAÑÍA", "INVERSIONES"…): "T.KLAS, COMPAÑIA ANONIMA
 * (T.KLAS,C.A)" y "T.KLAS, COMPAÑIA ANONIMA" sí; "EMPRENDIMIENTO IDELFONZO
 * HERNANDEZ" y "EMPRENDIMIENTO ARNOLDO OLIVEROS" no.
 */
const GENERICAS = new Set(["CA", "SA", "SRL", "C", "A", "S", "COMPANIA", "ANONIMA", "SOCIEDAD", "EMPRENDIMIENTO", "INVERSIONES",
  "CORPORACION", "SERVICIOS", "DISTRIBUIDORA", "GRUPO", "COMERCIAL", "COMERCIALIZADORA", "DE", "DEL", "LA", "LAS", "LOS", "EL", "Y", "CORP", "INC", "LLC", "PANAMA", "VENEZUELA"]);
function palabras(n: string): Set<string> {
  const t = n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, "").split(/\s+/);
  return new Set(t.filter((w) => w.length >= 2 && !GENERICAS.has(w)));
}
export function mismoCliente(a: string, b: string): boolean {
  const x = palabras(a), y = palabras(b);
  if (!x.size || !y.size) return false;
  const comunes = [...x].filter((w) => y.has(w)).length;
  return comunes / Math.min(x.size, y.size) >= 0.6;
}

// ---------------------------------------------------------------------------
// Notas de crédito

export interface FilaNC extends Documento {
  origen: { numero: string; fecha: string | null; base: number; cliente: string; clienteId: number; vendedor: string; vendedorId: number | null; estadoPago: string } | null;
  acreditadoFactura: number | null;
  pctFactura: number | null;
  diasDesdeFactura: number | null;
  ncEnFactura: number;
  alertas: Alerta[];
}

export function analizarNotas(
  notas: Documento[],
  origenes: Map<number, Documento>,
  ncPorFactura: Map<number, { id: number; base: number }[]>,
  hoy: string,
): FilaNC[] {
  return notas.map((nc) => {
    const o = nc.origenId ? origenes.get(nc.origenId) : undefined;
    const todas = nc.origenId ? ncPorFactura.get(nc.origenId) || [] : [];
    // Si esta NC no está publicada no figura en ncPorFactura: se suma aparte.
    const acreditado = o ? todas.reduce((s, x) => s + x.base, 0) + (nc.estado === "posted" ? 0 : nc.base) : null;
    const alertas: Alerta[] = [];
    const importada = nc.categoria === "importacion";
    // La importación masiva (carga inicial) se ve aparte y no genera alertas.
    if (importada) {
      return {
        ...nc, origen: null, acreditadoFactura: null, pctFactura: null, diasDesdeFactura: null, ncEnFactura: 0, alertas,
      };
    }

    if (o && o.clienteId && nc.clienteId && o.clienteId !== nc.clienteId) {
      alertas.push(alerta("NC_CLIENTE_DISTINTO", `A ${nc.cliente}; la factura es de ${o.cliente}`));
    }
    if (o && acreditado != null && acreditado > o.base + 1) {
      alertas.push(alerta("NC_EXCEDE_FACTURA", `Acreditado ${usd(acreditado)} de una factura de ${usd(o.base)}`));
    }
    const d = o ? dias(o.fecha, nc.fecha) : null;
    if (d != null && d < 0) alertas.push(alerta("NC_ANTES_FACTURA", `${-d} días antes de la factura`));
    if (d != null && d > DIAS_TARDIA) alertas.push(alerta("NC_TARDIA", `${d} días después de la factura`));
    if (nc.base >= MONTO_MEDIO) alertas.push(alerta("NC_MONTO_ALTO", `${usd(nc.base)} sin IVA`, nc.base >= MONTO_ALTO ? "alta" : "media"));
    if (!importada && !nc.origenId) alertas.push(alerta("NC_SIN_ORIGEN"));
    if (!importada && nc.categoria === "sin_motivo") alertas.push(alerta("NC_SIN_MOTIVO"));
    if (o && o.vendedorId && nc.creadoPorId === o.vendedorId) alertas.push(alerta("NC_MISMO_VENDEDOR", `${nc.creadoPor} es el vendedor de la factura`));
    if (todas.length + (nc.estado === "posted" ? 0 : 1) >= 2) alertas.push(alerta("NC_VARIAS", `${todas.length + (nc.estado === "posted" ? 0 : 1)} NC sobre la factura ${o?.numero || nc.origenNumero}`));
    const diasCreada = dias(nc.creado, hoy);
    if (nc.estado === "draft" && diasCreada != null && diasCreada > DIAS_BORRADOR) alertas.push(alerta("NC_BORRADOR", `Sin publicar hace ${diasCreada} días`));
    if (nc.estado === "posted" && nc.residual > 0.01 && (nc.estadoPago === "not_paid" || nc.estadoPago === "partial")) {
      alertas.push(alerta("NC_SIN_APLICAR", `${usd(nc.residual)} a favor del cliente`));
    }

    return {
      ...nc,
      origen: o ? { numero: o.numero, fecha: o.fecha, base: o.base, cliente: o.cliente, clienteId: o.clienteId, vendedor: o.vendedor, vendedorId: o.vendedorId, estadoPago: o.estadoPago } : null,
      acreditadoFactura: acreditado != null ? r2(acreditado) : null,
      pctFactura: o && o.base > 0 ? Math.round((nc.base / o.base) * 1000) / 10 : null,
      diasDesdeFactura: d,
      ncEnFactura: todas.length + (nc.estado === "posted" ? 0 : 1),
      alertas: ordenarAlertas(alertas),
    };
  });
}

// ---------------------------------------------------------------------------
// Anuladas

export interface FilaAnulada extends Documento {
  anuladaEl: string | null;
  anuladaPor: string;
  fuePublicada: boolean;
  cambiosAntes: Cambio[];
  montoOriginal: number | null;
  reemplazo: { id: number; numero: string; fecha: string | null; base: number } | null;
  alertas: Alerta[];
}

export function analizarAnuladas(
  anuladas: Documento[],
  eventos: Evento[],
  cambios: Cambio[],
  candidatas: Documento[],
  desde: string,
  hasta: string,
): FilaAnulada[] {
  const filas: FilaAnulada[] = [];
  for (const a of anuladas) {
    const ev = eventos.filter((e) => e.moveId === a.id);
    const cancel = [...ev].reverse().find((e) => e.a === "cancel");
    const anuladaEl = cancel?.fecha ?? null;
    const diaAnulacion = anuladaEl ? anuladaEl.slice(0, 10) : null;
    // Entra si el documento es del período o se anuló en el período.
    const enRango = (s: string | null) => !!s && s >= desde && s <= hasta;
    if (!enRango(a.fecha) && !enRango(diaAnulacion) && !(a.fecha == null && enRango(a.creado?.slice(0, 10) ?? null))) continue;

    const fuePublicada = a.publicadaAntes || ev.some((e) => e.a === "posted");
    // Cambios después de emitida (desde la primera publicación) hasta la
    // anulación. Lo que se editó mientras era borrador no cuenta: la factura
    // intercompañía 5037584 bajó de $488k a $146k antes de publicarse.
    const primeraPublicacion = ev.find((e) => e.a === "posted");
    const cambiosAntes = fuePublicada && primeraPublicacion
      ? cambiosRelevantes(cambios.filter((c) => c.moveId === a.id && c.fecha > primeraPublicacion.fecha
        && (!anuladaEl || c.fecha <= anuladaEl) && c.campo !== "name"))
      : [];
    const cambioMonto = cambiosAntes.filter((c) => c.campo === "amount_untaxed");
    const montoOriginal = fuePublicada && cambioMonto.length ? cambioMonto[0].antesNum : null;

    let reemplazo: FilaAnulada["reemplazo"] = null;
    if (diaAnulacion) {
      const base = montoOriginal ?? a.base;
      const ini = new Date(Date.parse(diaAnulacion) - 3 * 86400000).toISOString().slice(0, 10);
      const fin = new Date(Date.parse(diaAnulacion) + 15 * 86400000).toISOString().slice(0, 10);
      const c = candidatas
        .filter((x) => x.clienteId === a.clienteId && x.id !== a.id && x.fecha && x.fecha >= ini && x.fecha <= fin)
        .sort((x, y) => Math.abs(x.base - base) - Math.abs(y.base - base))[0];
      if (c && (base <= 0 || Math.abs(c.base - base) / base <= 0.05)) reemplazo = { id: c.id, numero: c.numero, fecha: c.fecha, base: c.base };
    }

    const alertas: Alerta[] = [];
    if (fuePublicada) alertas.push(alerta("AN_PUBLICADA", a.fecha ? `Emitida el ${a.fecha}` : undefined));
    if (fuePublicada && a.fecha && diaAnulacion && mesDe(diaAnulacion) > mesDe(a.fecha)) {
      alertas.push(alerta("AN_OTRO_MES", `Factura de ${mesDe(a.fecha)}, anulada el ${diaAnulacion}`));
    }
    const impAn = cambioImpuestos(cambiosAntes);
    const camposAn = cambiosAntes.filter((c) => ["amount_untaxed", "partner_id", "invoice_date", "date", "currency_id"].includes(c.campo)).map((c) => c.etiqueta);
    if (impAn.hay && !impAn.soloIgtf) camposAn.push(`Impuestos (${impAn.detalle})`);
    if (camposAn.length) {
      alertas.push(alerta("AN_CAMBIOS", `Cambió: ${[...new Set(camposAn)].join(", ")}`, impAn.aExento ? "alta" : undefined));
    }
    if (fuePublicada && !reemplazo && a.tipo === "out_invoice") alertas.push(alerta("AN_SIN_REEMPLAZO"));
    const monto = Math.max(a.base, montoOriginal ?? 0);
    if (monto >= MONTO_MEDIO) alertas.push(alerta("AN_MONTO_ALTO", `${usd(monto)} sin IVA`, monto >= MONTO_ALTO ? "alta" : "media"));
    if (cancel && cancel.usuarioId && a.creadoPorId && cancel.usuarioId !== a.creadoPorId) {
      alertas.push(alerta("AN_OTRO_USUARIO", `La creó ${a.creadoPor}, la anuló ${cancel.usuario}`));
    }

    filas.push({
      ...a, anuladaEl, anuladaPor: cancel?.usuario ?? "", fuePublicada, cambiosAntes,
      montoOriginal: montoOriginal != null ? r2(montoOriginal) : null, reemplazo, alertas: ordenarAlertas(alertas),
    });
  }
  return filas.sort((x, y) => (y.anuladaEl || y.fecha || "").localeCompare(x.anuladaEl || x.fecha || ""));
}

// ---------------------------------------------------------------------------
// Reabiertas

export interface FilaReabierta extends Documento {
  reaperturas: { fecha: string; usuario: string }[];
  republicadaEl: string | null;
  republicadaPor: string;
  cambios: Cambio[];
  montoAntes: number | null;
  montoDespues: number | null;
  lineasImpuesto: number;
  diasDesdeFactura: number | null;
  alertas: Alerta[];
}

export function analizarReabiertas(docs: Documento[], eventos: Evento[], cambios: Cambio[], desde: string, hasta: string): FilaReabierta[] {
  const filas: FilaReabierta[] = [];
  for (const d of docs) {
    const ev = eventos.filter((e) => e.moveId === d.id);
    const reaperturas = ev.filter((e) => e.de === "posted" && e.a === "draft" && e.fecha.slice(0, 10) >= desde && e.fecha.slice(0, 10) <= hasta);
    if (!reaperturas.length) continue;
    const primera = reaperturas[0].fecha;
    const republicada = ev.find((e) => e.a === "posted" && e.fecha > reaperturas[reaperturas.length - 1].fecha);
    const cs = cambiosRelevantes(cambios.filter((c) => c.moveId === d.id && c.fecha >= primera));
    const montos = cs.filter((c) => c.campo === "amount_untaxed");
    const montoAntes = montos.length ? montos[0].antesNum : null;
    const montoDespues = montos.length ? montos[montos.length - 1].despuesNum : null;
    const imp = cambioImpuestos(cs);
    const lineasImpuesto = imp.hay ? cs.filter((c) => c.campo === "tax_ids").length : 0;
    const diasDesde = dias(d.fecha, primera);

    const alertas: Alerta[] = [];
    if (montoAntes != null && montoDespues != null) {
      const dif = montoDespues - montoAntes;
      if (dif < -0.01) alertas.push(alerta("RE_BAJO_MONTO", `De ${usd(montoAntes)} a ${usd(montoDespues)} (${usd(dif)})`, Math.abs(dif) >= MONTO_MEDIO || (montoAntes > 0 && -dif / montoAntes >= 0.1) ? "alta" : "media"));
      else if (dif > 0.01) alertas.push(alerta("RE_SUBIO_MONTO", `De ${usd(montoAntes)} a ${usd(montoDespues)}`));
    }
    const cambioCliente = cs.find((c) => c.campo === "partner_id");
    if (cambioCliente) {
      const parecido = mismoCliente(cambioCliente.antes, cambioCliente.despues);
      alertas.push(alerta("RE_CAMBIO_CLIENTE",
        `De ${cambioCliente.antes || "–"} a ${cambioCliente.despues || "–"}${parecido ? " (parece el mismo cliente: ficha duplicada)" : ""}`,
        parecido ? "media" : "alta"));
    }
    if (d.fecha && mesDe(primera) > mesDe(d.fecha)) alertas.push(alerta("RE_OTRO_MES", `Factura de ${mesDe(d.fecha)}, reabierta el ${primera.slice(0, 10)}`));
    const cambioFecha = cs.find((c) => c.campo === "invoice_date" || c.campo === "date");
    if (cambioFecha) alertas.push(alerta("RE_CAMBIO_FECHA", `${cambioFecha.etiqueta}: ${cambioFecha.antes || "–"} → ${cambioFecha.despues || "–"}`));
    if (imp.hay) {
      alertas.push(alerta("RE_CAMBIO_IMPUESTOS", imp.aExento ? `De IVA a exento: ${imp.detalle}` : imp.detalle, imp.aExento ? "alta" : imp.soloIgtf ? "baja" : "media"));
    } else if (imp.idaYVuelta) {
      alertas.push(alerta("RE_CAMBIO_IMPUESTOS", "Cambió impuestos y los volvió a dejar como estaban", "baja"));
    }
    const cambioVend = cs.find((c) => c.campo === "invoice_user_id");
    if (cambioVend) alertas.push(alerta("RE_CAMBIO_VENDEDOR", `De ${cambioVend.antes || "–"} a ${cambioVend.despues || "–"}`));
    if (d.estado === "draft") alertas.push(alerta("RE_SIGUE_BORRADOR"));
    if (d.estado === "cancel") alertas.push(alerta("RE_TERMINO_ANULADA"));
    if (reaperturas.length >= 2) alertas.push(alerta("RE_VARIAS", `${reaperturas.length} veces en el período`));

    filas.push({
      ...d,
      reaperturas: reaperturas.map((e) => ({ fecha: e.fecha, usuario: e.usuario })),
      republicadaEl: republicada?.fecha ?? null,
      republicadaPor: republicada?.usuario ?? "",
      cambios: cs,
      montoAntes: montoAntes != null ? r2(montoAntes) : null,
      montoDespues: montoDespues != null ? r2(montoDespues) : null,
      lineasImpuesto,
      diasDesdeFactura: diasDesde,
      alertas: ordenarAlertas(alertas),
    });
  }
  return filas.sort((x, y) => y.reaperturas[0].fecha.localeCompare(x.reaperturas[0].fecha));
}

// ---------------------------------------------------------------------------
// Resúmenes

export interface Agrupado { clave: string; nombre: string; cantidad: number; monto: number; alertas: number; altas: number }

function agrupar<T>(xs: T[], clave: (x: T) => string, nombre: (x: T) => string, monto: (x: T) => number, alertas: (x: T) => Alerta[]): Agrupado[] {
  const m = new Map<string, Agrupado>();
  for (const x of xs) {
    const k = clave(x);
    const g = m.get(k) ?? { clave: k, nombre: nombre(x), cantidad: 0, monto: 0, alertas: 0, altas: 0 };
    g.cantidad++;
    g.monto += monto(x);
    const al = alertas(x);
    g.alertas += al.length;
    g.altas += al.filter((a) => a.severidad === "alta").length;
    m.set(k, g);
  }
  return [...m.values()].map((g) => ({ ...g, monto: r2(g.monto) })).sort((a, b) => b.monto - a.monto);
}

export interface ActividadUsuario { usuario: string; ncCreadas: number; ncMonto: number; anuladas: number; anuladoMonto: number; reabiertas: number; alertasAltas: number }

export function resumir(
  notas: FilaNC[], anuladas: FilaAnulada[], reabiertas: FilaReabierta[],
  totales: { ventas: number; facturas: number },
  ventasPorVendedor: Map<string, number>,
) {
  const operativas = notas.filter((n) => n.categoria !== "importacion" && n.estado === "posted");
  const sinIC = operativas.filter((n) => !n.intercompania);
  const importadas = notas.filter((n) => n.categoria === "importacion");
  const montoOp = sinIC.reduce((s, n) => s + n.base, 0);

  const porCategoria = agrupar(operativas, (n) => n.categoria, (n) => CATEGORIA_LABEL[n.categoria as CategoriaMotivo], (n) => n.base, (n) => n.alertas);
  const porCliente = agrupar(operativas, (n) => String(n.clienteId), (n) => n.cliente, (n) => n.base, (n) => n.alertas).slice(0, 15);
  const vendedores = agrupar(operativas, (n) => n.origen?.vendedor || n.vendedor || "(sin vendedor)", (n) => n.origen?.vendedor || n.vendedor || "(sin vendedor)", (n) => n.base, (n) => n.alertas)
    .map((g) => ({ ...g, ventas: r2(ventasPorVendedor.get(g.clave) || 0), tasa: ventasPorVendedor.get(g.clave) ? Math.round((g.monto / ventasPorVendedor.get(g.clave)!) * 10000) / 100 : null }));

  const usuarios = new Map<string, ActividadUsuario>();
  const u = (nombre: string) => {
    const k = nombre || "(desconocido)";
    const x = usuarios.get(k) ?? { usuario: k, ncCreadas: 0, ncMonto: 0, anuladas: 0, anuladoMonto: 0, reabiertas: 0, alertasAltas: 0 };
    usuarios.set(k, x);
    return x;
  };
  for (const n of operativas) { const x = u(n.creadoPor); x.ncCreadas++; x.ncMonto += n.base; x.alertasAltas += n.alertas.filter((a) => a.severidad === "alta").length; }
  for (const a of anuladas) { const x = u(a.anuladaPor || a.creadoPor); x.anuladas++; x.anuladoMonto += Math.max(a.base, a.montoOriginal ?? 0); x.alertasAltas += a.alertas.filter((al) => al.severidad === "alta").length; }
  for (const r of reabiertas) { const x = u(r.reaperturas[0]?.usuario || ""); x.reabiertas++; x.alertasAltas += r.alertas.filter((a) => a.severidad === "alta").length; }

  const todas = [...notas.flatMap((n) => n.alertas), ...anuladas.flatMap((a) => a.alertas), ...reabiertas.flatMap((r) => r.alertas)];
  const porCodigo = new Map<string, number>();
  for (const a of todas) porCodigo.set(a.codigo, (porCodigo.get(a.codigo) || 0) + 1);

  return {
    ventas: r2(totales.ventas),
    facturas: totales.facturas,
    nc: {
      cantidad: sinIC.length,
      monto: r2(montoOp),
      pctVentas: totales.ventas > 0 ? Math.round((montoOp / totales.ventas) * 10000) / 100 : null,
      intercompania: r2(operativas.filter((n) => n.intercompania).reduce((s, n) => s + n.base, 0)),
      importadas: importadas.length,
      importadasMonto: r2(importadas.reduce((s, n) => s + n.base, 0)),
      borradores: notas.filter((n) => n.estado === "draft").length,
      conAlertaAlta: notas.filter((n) => n.alertas.some((a) => a.severidad === "alta")).length,
    },
    anuladas: {
      cantidad: anuladas.length,
      publicadas: anuladas.filter((a) => a.fuePublicada).length,
      monto: r2(anuladas.filter((a) => a.fuePublicada).reduce((s, a) => s + Math.max(a.base, a.montoOriginal ?? 0), 0)),
      sinReemplazo: anuladas.filter((a) => a.alertas.some((x) => x.codigo === "AN_SIN_REEMPLAZO")).length,
    },
    reabiertas: {
      cantidad: reabiertas.length,
      conCambios: reabiertas.filter((r) => r.alertas.length > 0).length,
      bajaronMonto: reabiertas.filter((r) => r.alertas.some((a) => a.codigo === "RE_BAJO_MONTO")).length,
      reduccion: r2(reabiertas.reduce((s, r) => s + (r.montoAntes != null && r.montoDespues != null && r.montoDespues < r.montoAntes ? r.montoAntes - r.montoDespues : 0), 0)),
      sinCambios: reabiertas.filter((r) => r.alertas.length === 0).length,
    },
    alertas: {
      alta: todas.filter((a) => a.severidad === "alta").length,
      media: todas.filter((a) => a.severidad === "media").length,
      baja: todas.filter((a) => a.severidad === "baja").length,
      porCodigo: [...porCodigo.entries()].map(([codigo, cantidad]) => ({ codigo, cantidad, ...ALERTAS[codigo] })).sort((a, b) => ordenSev[a.severidad] - ordenSev[b.severidad] || b.cantidad - a.cantidad),
    },
    porCategoria,
    porCliente,
    porVendedor: vendedores,
    porUsuario: [...usuarios.values()].map((x) => ({ ...x, ncMonto: r2(x.ncMonto), anuladoMonto: r2(x.anuladoMonto) }))
      .sort((a, b) => b.alertasAltas - a.alertasAltas || b.ncMonto - a.ncMonto),
  };
}
