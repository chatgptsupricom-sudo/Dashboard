import { query } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { CORTE_VALIDADAS_ODOO, facturasDeVentas, sqlEgresoOcupaOrden, type FacturaVenta } from "@/lib/seguridad/mercancia";
import { listarRutasConSede } from "@/lib/rma/rutasEnvio";
import { enAlmacen, esTipoEntrega, type Etapa } from "@/lib/seguridad/egresoFlujo";
import {
  describirMetodo,
  esDeLaSede,
  esMetodoRetiro,
  evaluarRutaGratis,
  montoRutaGratis,
  nombreImpuesto,
  tipoEntregaDeMetodo,
  type FilaMetodo,
} from "@/lib/ventas/metodoRetiroTipos";

// Lo que no toca la base (tipos, etiquetas) vive en metodoRetiroTipos para
// que lo puedan usar las pantallas; se reexporta para el servidor.
export * from "@/lib/ventas/metodoRetiroTipos";

/**
 * Método de retiro de la mercancía de un pedido (sql/ventas_metodo_retiro.sql).
 *
 * El cliente le dice al vendedor cómo recibe su pedido y el vendedor lo
 * carga en el panel (sección "Método de retiro"); el Asistente de Ventas
 * puede cargarlo por cualquier vendedor. Almacén no puede registrar el egreso
 * de un pedido sin método, y el tipo de entrega del egreso sale de aquí.
 *
 *  - sucursal:   el cliente retira en la sucursal (egreso "puerta").
 *  - ruta:       por una de las rutas de la empresa (rma_rutas_despacho).
 *  - encomienda: por agencia, para despachos pequeños.
 *  - transporte: transporte externo del cliente; la empresa va en `agencia`
 *    y la descripción (opcional) en `nota`. Para Almacén es "puerta".
 *
 * Es por pedido (sale.order): todas sus órdenes de despacho salen igual. Una
 * vez que Almacén registró el egreso de alguna, ya no se cambia.
 */

let tabla: Promise<void> | null = null;

/** Crea la tabla si falta (mismo patrón que el resto del panel). */
export function asegurarTablaMetodoRetiro(): Promise<void> {
  if (!tabla) {
    tabla = query(
      `CREATE TABLE IF NOT EXISTS ventas_metodo_retiro (
         id INT AUTO_INCREMENT PRIMARY KEY,
         odoo_sale_id INT NOT NULL,
         pedido VARCHAR(64) DEFAULT NULL,
         company_id INT DEFAULT NULL,
         cliente VARCHAR(255) DEFAULT NULL,
         vendedor_uid INT DEFAULT NULL,
         vendedor_nombre VARCHAR(200) DEFAULT NULL,
         metodo VARCHAR(20) NOT NULL,
         ruta_id INT DEFAULT NULL,
         ruta_nombre VARCHAR(120) DEFAULT NULL,
         agencia VARCHAR(100) DEFAULT NULL,
         nota VARCHAR(500) DEFAULT NULL,
         registrado_por VARCHAR(200) DEFAULT NULL,
         registrado_rol VARCHAR(50) DEFAULT NULL,
         ruta_gratis TINYINT(1) DEFAULT NULL,
         monto_base DECIMAL(14,2) DEFAULT NULL,
         monto_facturado DECIMAL(14,2) DEFAULT NULL,
         ruta_gratis_final TINYINT(1) DEFAULT NULL,
         alerta VARCHAR(400) DEFAULT NULL,
         recalculado_at DATETIME DEFAULT NULL,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
         UNIQUE KEY uq_vmr_sale (odoo_sale_id),
         INDEX idx_vmr_vendedor (vendedor_uid)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    )
      // Columnas de la ruta gratis (sql/ventas_metodo_retiro.sql), para la
      // tabla que se creó antes de tenerlas.
      .then(async () => {
        for (const sql of [
          "ALTER TABLE ventas_metodo_retiro ADD COLUMN ruta_gratis TINYINT(1) DEFAULT NULL",
          "ALTER TABLE ventas_metodo_retiro ADD COLUMN monto_base DECIMAL(14,2) DEFAULT NULL",
          // Recálculo con lo facturado al registrar el egreso.
          "ALTER TABLE ventas_metodo_retiro ADD COLUMN monto_facturado DECIMAL(14,2) DEFAULT NULL",
          "ALTER TABLE ventas_metodo_retiro ADD COLUMN ruta_gratis_final TINYINT(1) DEFAULT NULL",
          "ALTER TABLE ventas_metodo_retiro ADD COLUMN alerta VARCHAR(400) DEFAULT NULL",
          "ALTER TABLE ventas_metodo_retiro ADD COLUMN recalculado_at DATETIME DEFAULT NULL",
        ]) {
          await query(sql).catch((e: any) => {
            if (!/Duplicate column/i.test(e?.message || "")) throw e;
          });
        }
      })
      .catch((e) => {
        tabla = null;
        throw e;
      });
  }
  return tabla;
}

/** El método cargado de cada pedido (por id de sale.order). */
export async function metodosDePedidos(saleIds: number[]): Promise<Map<number, FilaMetodo>> {
  const porVenta = new Map<number, FilaMetodo>();
  const ids = [...new Set(saleIds.filter((x) => Number.isInteger(x) && x > 0))];
  if (!ids.length) return porVenta;
  await asegurarTablaMetodoRetiro();
  const r = await query(
    `SELECT odoo_sale_id, metodo, ruta_id, ruta_nombre, agencia, nota, registrado_por, updated_at,
            ruta_gratis, monto_base, monto_facturado, ruta_gratis_final, alerta, recalculado_at
       FROM ventas_metodo_retiro WHERE odoo_sale_id IN (${ids.map(() => "?").join(",")})`,
    ids,
  );
  for (const f of r.rows as any[]) porVenta.set(Number(f.odoo_sale_id), { ...f, odoo_sale_id: Number(f.odoo_sale_id) });
  return porVenta;
}

/** Lo que hace falta de Odoo para decidir la ruta gratis de un pedido. */
export type DatosPedido = {
  company_id: number | null;
  moneda: string;
  /** Total del pedido sin IVA. */
  base_pedido: number;
  /** Facturado sin IVA: facturas publicadas menos notas de crédito. null = sin factura. */
  facturado: number | null;
  /** A la orden de venta le queda algo por facturar (`invoice_status = 'to invoice'`). */
  por_facturar: boolean;
  /** Tiene alguna nota de crédito publicada. */
  con_nota_credito: boolean;
  /** Estado de la dirección de entrega (ej. "Carabobo (VE)"). */
  estado_cliente: string | null;
};

export async function datosDePedidos(saleIds: number[]): Promise<Map<number, DatosPedido>> {
  const ids = [...new Set(saleIds.filter((x) => Number.isInteger(x) && x > 0))];
  const porVenta = new Map<number, DatosPedido>();
  if (!ids.length) return porVenta;
  const ventas =
    (await callOdooRPC<any[]>("sale.order", "read", [
      ids,
      ["company_id", "currency_id", "amount_untaxed", "invoice_ids", "invoice_status", "partner_shipping_id", "partner_id"],
    ])) || [];
  const facturaIds = [...new Set(ventas.flatMap((v) => v.invoice_ids || []))];
  const direcciones = [...new Set(ventas.map((v) => (v.partner_shipping_id || v.partner_id)?.[0]).filter(Boolean))];
  const [facturas, partners] = await Promise.all([
    facturaIds.length
      ? callOdooRPC<any[]>("account.move", "read", [facturaIds, ["move_type", "state", "amount_untaxed_signed"]])
      : Promise.resolve([] as any[]),
    direcciones.length ? callOdooRPC<any[]>("res.partner", "read", [direcciones, ["state_id"]]) : Promise.resolve([] as any[]),
  ]);
  const factura = new Map((facturas || []).map((f: any) => [f.id, f]));
  const estado = new Map((partners || []).map((x: any) => [x.id, x.state_id?.[1] || null]));
  for (const v of ventas) {
    // Con signo: la nota de crédito resta, y una factura revertida se anula
    // con su propia nota. Solo lo publicado.
    const publicadas = (v.invoice_ids || [])
      .map((id: number) => factura.get(id))
      .filter((f: any) => f && f.state === "posted" && (f.move_type === "out_invoice" || f.move_type === "out_refund"));
    const facturado = publicadas.length
      ? Math.round(publicadas.reduce((t: number, f: any) => t + Number(f.amount_untaxed_signed || 0), 0) * 100) / 100
      : null;
    porVenta.set(v.id, {
      company_id: v.company_id?.[0] ?? null,
      moneda: v.currency_id?.[1] || "",
      base_pedido: Number(v.amount_untaxed) || 0,
      facturado,
      por_facturar: v.invoice_status === "to invoice",
      con_nota_credito: publicadas.some((f: any) => f.move_type === "out_refund"),
      estado_cliente: estado.get((v.partner_shipping_id || v.partner_id)?.[0]) ?? null,
    });
  }
  return porVenta;
}

const usd = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * La ruta gratis que vale ahora: con el monto de `montoRutaGratis` (lo
 * facturado, o el pedido mientras se factura por partes) y con el estado del
 * cliente. Devuelve el método con `ruta_gratis` actualizado, lo que marcó el
 * vendedor en `ruta_gratis_vendedor` y un aviso si cambió o si la ruta no es
 * la del cliente. Métodos que no son por ruta, tal cual.
 *
 * Una vez que Almacén registró el egreso (`recalculado_at`), vale lo que se
 * fijó ahí: una NC posterior no cambia "gratis / flete" de un pedido que ya
 * salió.
 */
export function aplicarEvaluacion(m: FilaMetodo, d: DatosPedido | undefined): FilaMetodo {
  if (m.metodo !== "ruta") return m;
  const vendedor = m.ruta_gratis === null || m.ruta_gratis === undefined ? null : Number(m.ruta_gratis);
  if (m.recalculado_at) {
    return {
      ...m,
      ruta_gratis_vendedor: vendedor,
      ruta_gratis: m.ruta_gratis_final === null || m.ruta_gratis_final === undefined ? null : Number(m.ruta_gratis_final),
    };
  }
  if (!d) return m;
  const { monto, fuente } = montoRutaGratis(d);
  const ev = evaluarRutaGratis({
    companyId: d.company_id,
    rutaNombre: m.ruta_nombre,
    monto,
    // Lo facturado viene en la moneda de la compañía (USD), aunque el pedido
    // sea en otra: ahí sí se puede comparar con el mínimo.
    moneda: fuente === "facturado" ? "USD" : d.moneda,
    estadoCliente: d.estado_cliente,
  });
  const alertas: string[] = [];
  if (vendedor === 1 && ev.gratis === 0) {
    alertas.push(
      `Ya no es gratis: se marcó gratis con ${usd(Number(m.monto_base) || 0)} $, pero ${fuente === "facturado" ? "lo facturado" : "el pedido"} sin ${nombreImpuesto(d.company_id)} es ${usd(monto)} $ (mínimo ${usd(ev.minimo || 0)} $). Flete a cargo del cliente`,
    );
  }
  if (ev.alerta) alertas.push(ev.alerta);
  return {
    ...m,
    ruta_gratis_vendedor: vendedor,
    ruta_gratis: ev.gratis,
    monto_facturado: d.facturado,
    alerta: alertas.join(". ") || null,
  };
}

/** metodosDePedidos + aplicarEvaluacion con los datos actuales de Odoo. */
export async function metodosEvaluados(saleIds: number[]): Promise<Map<number, FilaMetodo>> {
  const metodos = await metodosDePedidos(saleIds);
  const conRuta = [...metodos.values()].filter((m) => m.metodo === "ruta").map((m) => m.odoo_sale_id);
  if (!conRuta.length) return metodos;
  const datos = await datosDePedidos(conRuta);
  for (const id of conRuta) metodos.set(id, aplicarEvaluacion(metodos.get(id)!, datos.get(id)));
  return metodos;
}

/**
 * Al registrar el egreso: guarda la decisión final en el método del pedido,
 * para que quede de dónde salió y deje de recalcularse (aplicarEvaluacion).
 * Solo la primera vez: con un pedido de varias órdenes, cada egreso pisaba
 * la decisión del anterior. Se vuelve a abrir si el vendedor cambia el
 * método (guardarMetodoRetiro limpia `recalculado_at`).
 */
export async function fijarRutaGratisFinal(m: FilaMetodo): Promise<void> {
  if (m.metodo !== "ruta" || m.recalculado_at) return;
  await query(
    `UPDATE ventas_metodo_retiro
        SET monto_facturado = ?, ruta_gratis_final = ?, alerta = ?, recalculado_at = NOW()
      WHERE odoo_sale_id = ? AND recalculado_at IS NULL`,
    [m.monto_facturado ?? null, m.ruta_gratis ?? null, m.alerta ? String(m.alerta).slice(0, 400) : null, m.odoo_sale_id],
  );
}

export type PedidoPendiente = {
  sale_id: number;
  pedido: string;
  cliente: string;
  vendedor_uid: number | null;
  vendedor: string;
  fecha: string | null;
  total: number;
  /** Total sin IVA. */
  base: number;
  company_id: number | null;
  moneda: string;
  /** Facturado sin IVA (facturas menos notas de crédito); null = sin factura. */
  facturado: number | null;
  /** Con lo que se decide la ruta gratis (montoRutaGratis). */
  monto_ruta: number;
  /** Moneda de `monto_ruta`: USD si sale de lo facturado (moneda de la compañía). */
  moneda_ruta: string;
  /** Estado de la dirección de entrega del cliente. */
  estado_cliente: string | null;
  ordenes: { id: number; nombre: string; estado: string }[];
  facturas: FacturaVenta[];
  /** Almacén ya registró el egreso de alguna orden: el método ya no se cambia. */
  en_despacho: boolean;
  metodo: FilaMetodo | null;
};

/**
 * Pedidos con órdenes de despacho por salir: los de un vendedor
 * (`vendedorUid`), o todos los de la sucursal (`cids`; null = todas) para el
 * Asistente de Ventas.
 *
 * "Por salir" es no cancelada y sin despachar por Seguridad en el panel.
 * Almacén valida el picking en Odoo (Hecho) al armarlo, antes de que salga:
 * una orden Hecha desde el corte (CORTE_VALIDADAS_ODOO) sigue en la lista
 * hasta que su egreso se despacha; las Hechas antes del corte ya salieron.
 */
const LIMITE_PEDIDOS = 2000;

export async function listarPedidosPendientes(opciones: {
  cids: number | null;
  vendedorUid: number | null;
}): Promise<PedidoPendiente[]> {
  const domain: any[] = [
    ["picking_type_id.code", "=", "outgoing"],
    ["state", "!=", "cancel"],
    "|",
    ["state", "!=", "done"],
    ["date_done", ">=", CORTE_VALIDADAS_ODOO],
    ["sale_id", "!=", false],
  ];
  if (opciones.cids !== null) domain.push(["company_id", "=", opciones.cids]);
  if (opciones.vendedorUid !== null) domain.push(["sale_id.user_id", "=", opciones.vendedorUid]);

  const pickings =
    (await callOdooRPC<any[]>("stock.picking", "search_read", [domain], {
      fields: ["name", "state", "sale_id", "scheduled_date"],
      order: "scheduled_date asc",
      // Las mas viejas primero: con el tope, las que quedan afuera son las
      // recien llegadas. 400 se quedaba corto para el Asistente de Ventas
      // (toda la sucursal) y los pedidos nuevos no aparecian, con Almacen
      // frenado por "sin método".
      limit: LIMITE_PEDIDOS,
    })) || [];
  if (pickings.length >= LIMITE_PEDIDOS) {
    console.warn(`[metodo-retiro] ${LIMITE_PEDIDOS}+ órdenes abiertas: las más nuevas no se listan`);
  }
  // Egresos del panel de estas órdenes: el que ya salió (Seguridad lo
  // despachó) saca la orden de la lista; el que está en curso la bloquea.
  const egresos = pickings.length
    ? await query(
        `SELECT odoo_picking_id,
                (COALESCE(despachado, 1) = 1 AND COALESCE(etapa, '') IN ('por_calificar', 'cerrado')) AS salio
           FROM seguridad_mercancia
          WHERE tipo = 'egreso' AND ${sqlEgresoOcupaOrden()}
            AND odoo_picking_id IN (${pickings.map(() => "?").join(",")})`,
        pickings.map((p) => p.id),
      ).catch(() => ({ rows: [] as any[] }))
    : { rows: [] as any[] };
  const salidas = new Set((egresos.rows as any[]).filter((r) => Number(r.salio) === 1).map((r) => Number(r.odoo_picking_id)));
  const egresados = new Set((egresos.rows as any[]).map((r) => Number(r.odoo_picking_id)));
  const porSalir = pickings.filter((p) => !salidas.has(p.id));

  const saleIds = [...new Set(porSalir.map((p) => p.sale_id?.[0]).filter(Boolean))] as number[];
  if (!saleIds.length) return [];

  const [ventas, facturas, metodos, datos] = await Promise.all([
    callOdooRPC<any[]>("sale.order", "read", [saleIds, ["name", "partner_id", "user_id", "date_order", "amount_total", "amount_untaxed", "currency_id", "company_id"]]),
    facturasDeVentas(saleIds),
    metodosDePedidos(saleIds),
    datosDePedidos(saleIds),
  ]);

  const porVenta = new Map<number, PedidoPendiente>();
  for (const v of ventas || []) {
    porVenta.set(v.id, {
      sale_id: v.id,
      pedido: v.name,
      cliente: v.partner_id?.[1] || "",
      vendedor_uid: v.user_id?.[0] ?? null,
      vendedor: v.user_id?.[1] || "",
      fecha: v.date_order || null,
      total: Number(v.amount_total) || 0,
      // Sin IVA: con esto se decide si la ruta es gratis (metodoRetiroTipos).
      base: Number(v.amount_untaxed) || 0,
      company_id: v.company_id?.[0] ?? null,
      moneda: v.currency_id?.[1] || "",
      facturado: datos.get(v.id)?.facturado ?? null,
      monto_ruta: datos.has(v.id) ? montoRutaGratis(datos.get(v.id)!).monto : Number(v.amount_untaxed) || 0,
      moneda_ruta:
        datos.has(v.id) && montoRutaGratis(datos.get(v.id)!).fuente === "facturado" ? "USD" : v.currency_id?.[1] || "",
      estado_cliente: datos.get(v.id)?.estado_cliente ?? null,
      ordenes: [],
      facturas: facturas.get(v.id) || [],
      en_despacho: false,
      // La ruta gratis que vale hoy (con lo facturado si ya hay factura).
      metodo: metodos.has(v.id) ? aplicarEvaluacion(metodos.get(v.id)!, datos.get(v.id)) : null,
    });
  }
  for (const p of porSalir) {
    const pedido = porVenta.get(p.sale_id?.[0]);
    if (!pedido) continue;
    pedido.ordenes.push({ id: p.id, nombre: p.name, estado: p.state });
    if (egresados.has(p.id)) pedido.en_despacho = true;
  }
  // Primero los que no tienen método: son los que frenan a Almacén.
  return [...porVenta.values()].sort(
    (a, b) => Number(!!a.metodo) - Number(!!b.metodo) || String(a.fecha).localeCompare(String(b.fecha)),
  );
}

export class ErrorMetodo extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/** Egreso del panel que Almacén movió al cambiar el método. */
export type EgresoCambiado = { id: number; etapa: Etapa };

/**
 * Guarda el método de un pedido. `vendedorUid`: si viene, el pedido tiene
 * que ser de ese vendedor (sesión de vendedor). `cids`: la sucursal de la
 * sesión (null = superadmin).
 *
 * `porAlmacen`: el cliente cambió cómo recibe el pedido y Almacén lo cambia
 * desde su panel. Solo cambia uno que ya cargó el vendedor, y también con el
 * egreso registrado mientras siga en manos de Almacén (hasta asignar el
 * despacho): el egreso toma el nuevo tipo de entrega (ver cambiarEgresos).
 * Cuando ya pasó a Seguridad, no.
 */
export async function guardarMetodoRetiro(datos: {
  saleId: number;
  metodo: unknown;
  rutaId: number | null;
  agencia: string | null;
  nota: string | null;
  cids: number | null;
  vendedorUid: number | null;
  autor: string;
  rol: string;
  porAlmacen?: boolean;
}): Promise<{ metodo: FilaMetodo; egresos: EgresoCambiado[] }> {
  if (!esMetodoRetiro(datos.metodo)) throw new ErrorMetodo("Elige retiro en sucursal, ruta, encomienda o transporte externo.");
  const metodo = datos.metodo;
  const anterior = datos.porAlmacen ? (await metodosDePedidos([datos.saleId])).get(datos.saleId) ?? null : null;
  if (datos.porAlmacen && !anterior) {
    throw new ErrorMetodo("El vendedor todavía no indicó el método de retiro: Almacén solo puede cambiarlo.", 409);
  }

  const [venta] =
    (await callOdooRPC<any[]>("sale.order", "read", [
      [datos.saleId],
      ["name", "partner_id", "user_id", "company_id", "amount_untaxed", "currency_id"],
    ])) || [];
  // 404 y no 403 para un pedido ajeno: no confirmar que existe.
  if (
    !venta ||
    (datos.cids !== null && venta.company_id?.[0] !== datos.cids) ||
    (datos.vendedorUid !== null && venta.user_id?.[0] !== datos.vendedorUid)
  ) {
    throw new ErrorMetodo("Pedido no encontrado", 404);
  }

  // Ya en manos de Almacén: el egreso salió con el método que tenía. Solo
  // Almacén lo cambia, y mientras el egreso siga siendo suyo.
  const pickings =
    (await callOdooRPC<any[]>("stock.picking", "search_read", [[["sale_id", "=", datos.saleId]]], { fields: ["id"], limit: 50 })) || [];
  let egresos: { id: number; etapa: Etapa; empaquetado_at: string | null }[] = [];
  if (pickings.length) {
    const r = await query(
      `SELECT id, etapa, empaquetado_at,
              (COALESCE(despachado, 1) = 1 AND COALESCE(etapa, '') IN ('por_calificar', 'cerrado')) AS salio
         FROM seguridad_mercancia
        WHERE tipo = 'egreso' AND ${sqlEgresoOcupaOrden()}
          AND odoo_picking_id IN (${pickings.map(() => "?").join(",")})`,
      pickings.map((p) => p.id),
    );
    // Sin .catch: si la consulta falla, no se deja cambiar el método a ciegas
    // (antes fallaba abierto y se podía cambiar con el egreso ya en curso).
    const filas = r.rows as any[];
    if (filas.length && !datos.porAlmacen) {
      throw new ErrorMetodo("Almacén ya está despachando este pedido: el método ya no se puede cambiar.", 409);
    }
    // Almacén: una orden del pedido que ya salió no se toca; el cambio es
    // para las que faltan.
    egresos = filas.filter((e) => Number(e.salio) !== 1);
    // Un egreso de antes del flujo por etapas (sin etapa) tampoco se toca.
    if (egresos.some((e) => !e.etapa || !enAlmacen(e.etapa))) {
      throw new ErrorMetodo("Seguridad ya tiene este despacho: el método ya no se puede cambiar.", 409);
    }
  }

  let rutaId: number | null = null;
  let rutaNombre: string | null = null;
  let agencia: string | null = null;
  if (metodo === "ruta") {
    // La ruta tiene que ser de la sede del pedido: una de Venezuela en un
    // pedido de Panamá (o al revés) no existe para Almacén de esa sede.
    const ruta = (await listarRutasConSede()).find(
      (r) => r.id === datos.rutaId && esDeLaSede(r.cids, venta.company_id?.[0]),
    );
    if (!ruta) throw new ErrorMetodo("Elige la ruta.");
    rutaId = ruta.id;
    rutaNombre = ruta.nombre;
  } else if (metodo === "encomienda") {
    // De la lista de agencias o escrita ("otra"), como en el portal de RMA.
    agencia = (datos.agencia || "").trim().slice(0, 100) || null;
    if (!agencia) throw new ErrorMetodo("Elige la agencia de la encomienda.");
  } else if (metodo === "transporte") {
    // La empresa de transporte, escrita por el vendedor (misma columna).
    agencia = (datos.agencia || "").trim().slice(0, 100) || null;
    if (!agencia) throw new ErrorMetodo("Indica la compañía de transporte.");
  }

  // Ruta gratis o con flete (Valencia y Panamá): con montoRutaGratis y con el
  // estado del cliente. Hasta que Almacén registre el egreso se sigue
  // recalculando con lo que diga Odoo (aplicarEvaluacion).
  const d = (await datosDePedidos([datos.saleId])).get(datos.saleId);
  const monto = d ? montoRutaGratis(d) : { monto: Number(venta.amount_untaxed) || 0, fuente: "pedido" as const };
  const montoBase = monto.monto;
  const rutaGratis =
    metodo === "ruta"
      ? evaluarRutaGratis({
          companyId: venta.company_id?.[0],
          rutaNombre,
          monto: montoBase,
          moneda: monto.fuente === "facturado" ? "USD" : venta.currency_id?.[1],
          estadoCliente: d?.estado_cliente,
        }).gratis
      : null;

  await asegurarTablaMetodoRetiro();
  await query(
    `INSERT INTO ventas_metodo_retiro
       (odoo_sale_id, pedido, company_id, cliente, vendedor_uid, vendedor_nombre, metodo, ruta_id, ruta_nombre,
        agencia, nota, registrado_por, registrado_rol, ruta_gratis, monto_base)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE metodo = VALUES(metodo), ruta_id = VALUES(ruta_id), ruta_nombre = VALUES(ruta_nombre),
       ruta_gratis = VALUES(ruta_gratis), monto_base = VALUES(monto_base),
       monto_facturado = NULL, ruta_gratis_final = NULL, alerta = NULL, recalculado_at = NULL,
       agencia = VALUES(agencia), nota = VALUES(nota), registrado_por = VALUES(registrado_por),
       registrado_rol = VALUES(registrado_rol), cliente = VALUES(cliente), pedido = VALUES(pedido)`,
    [
      datos.saleId,
      String(venta.name || "").slice(0, 64),
      venta.company_id?.[0] ?? null,
      String(venta.partner_id?.[1] || "").slice(0, 255),
      venta.user_id?.[0] ?? null,
      String(venta.user_id?.[1] || "").slice(0, 200),
      metodo,
      rutaId,
      rutaNombre,
      agencia,
      (datos.nota || "").trim().slice(0, 500) || null,
      datos.autor.slice(0, 200),
      datos.rol.slice(0, 50),
      rutaGratis,
      montoBase,
    ],
  );
  const fila = aplicarEvaluacion((await metodosDePedidos([datos.saleId])).get(datos.saleId)!, d);
  if (!egresos.length) return { metodo: fila, egresos: [] };

  // Con el egreso ya registrado, la ruta gratis se fija ahora (como al
  // registrarlo) y el egreso toma el nuevo tipo de entrega.
  await fijarRutaGratisFinal(fila);
  const cambiados = await cambiarEgresos(egresos, fila, anterior, datos.autor);
  return { metodo: (await metodosEvaluados([datos.saleId])).get(datos.saleId) || fila, egresos: cambiados };
}

/**
 * El egreso toma el tipo de entrega del nuevo método y la etapa se ajusta al
 * recorrido nuevo: solo la encomienda pasa por empaquetado. Queda anotado en
 * las observaciones, que es lo que ven Almacén y Seguridad.
 */
async function cambiarEgresos(
  egresos: { id: number; etapa: Etapa; empaquetado_at: string | null }[],
  fila: FilaMetodo,
  anterior: FilaMetodo | null,
  autor: string,
): Promise<EgresoCambiado[]> {
  const tipo = tipoEntregaDeMetodo(fila.metodo);
  if (!esTipoEntrega(tipo)) return [];
  const nota = `Método cambiado por Almacén (${autor}): ${describirMetodo(fila)}${fila.nota ? ` — ${fila.nota}` : ""}${
    anterior ? ` (antes: ${describirMetodo(anterior)})` : ""
  }`;
  const cambiados: EgresoCambiado[] = [];
  for (const e of egresos) {
    let etapa: Etapa = e.etapa;
    if (tipo !== "encomienda" && etapa === "por_empaquetar") etapa = "por_asignar_despacho";
    else if (tipo === "encomienda" && etapa === "por_asignar_despacho" && !e.empaquetado_at) etapa = "por_empaquetar";
    // `etapa = ?` en el WHERE: si otro lo movió mientras tanto, no se pisa.
    const r = await query(
      `UPDATE seguridad_mercancia
          SET tipo_entrega = ?, etapa = ?,
              observaciones = LEFT(CONCAT_WS(' · ', NULLIF(observaciones, ''), ?), 5000)
        WHERE id = ? AND etapa = ?`,
      [tipo, etapa, nota, e.id, e.etapa],
    );
    if (Number((r.rows as any)?.affectedRows || 0) > 0) cambiados.push({ id: e.id, etapa });
  }
  return cambiados;
}
