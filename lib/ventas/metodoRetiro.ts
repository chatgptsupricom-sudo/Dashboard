import { query } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { CORTE_VALIDADAS_ODOO, facturasDeVentas, sqlEgresoOcupaOrden, type FacturaVenta } from "@/lib/seguridad/mercancia";
import { listarRutasConSede } from "@/lib/rma/rutasEnvio";
import { autorizacionUsable } from "@/lib/ventas/autorizacionTransporte";
import { randomUUID } from "crypto";
import { enAlmacen, esTipoEntrega, type Etapa } from "@/lib/seguridad/egresoFlujo";
import {
  describirMetodo,
  esDeLaSede,
  esMetodoRetiro,
  evaluarRutaGratis,
  MAX_PEDIDOS_GRUPO,
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
 *
 * El vendedor lo carga por cliente: elige varios pedidos y les pone el mismo
 * método de una vez. Esos pedidos quedan en un `grupo`: muchas veces se
 * factura por separado lo que sale en un solo viaje, y la ruta gratis se
 * decide con la suma de los del grupo que siguen por la misma ruta
 * (evaluarConGrupos). El transporte externo pide además la foto de la
 * autorización del cliente (lib/ventas/autorizacionTransporte.ts).
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
          // Pedidos guardados juntos y autorización del transporte externo
          // (sql/ventas_metodo_retiro_grupo.sql).
          "ALTER TABLE ventas_metodo_retiro ADD COLUMN grupo VARCHAR(40) DEFAULT NULL",
          "ALTER TABLE ventas_metodo_retiro ADD COLUMN autorizacion_id INT DEFAULT NULL",
          "ALTER TABLE ventas_metodo_retiro ADD INDEX idx_vmr_grupo (grupo)",
        ]) {
          await query(sql).catch((e: any) => {
            if (!/Duplicate (column|key)/i.test(e?.message || "")) throw e;
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
    `SELECT odoo_sale_id, pedido, metodo, ruta_id, ruta_nombre, agencia, nota, registrado_por, updated_at,
            ruta_gratis, monto_base, monto_facturado, ruta_gratis_final, alerta, recalculado_at,
            grupo, autorizacion_id
       FROM ventas_metodo_retiro WHERE odoo_sale_id IN (${ids.map(() => "?").join(",")})`,
    ids,
  );
  for (const f of r.rows as any[]) {
    porVenta.set(Number(f.odoo_sale_id), {
      ...f,
      odoo_sale_id: Number(f.odoo_sale_id),
      autorizacion_id: f.autorizacion_id == null ? null : Number(f.autorizacion_id),
    });
  }
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
 * El monto de la ruta gratis de varios pedidos que viajan juntos: la suma de
 * `montoRutaGratis` de cada uno. Con uno solo es lo de siempre. `moneda` es
 * USD si todo sale de lo facturado (moneda de la compañía); si alguno se
 * cuenta por el pedido y está en otra moneda, esa, para que
 * evaluarRutaGratis avise en vez de comparar peras con manzanas.
 */
export function montoDelGrupo(ds: DatosPedido[]): { monto: number; fuente: "pedido" | "facturado"; moneda: string } {
  let monto = 0;
  let todoFacturado = true;
  let moneda = "USD";
  for (const d of ds) {
    const x = montoRutaGratis(d);
    monto += x.monto;
    if (x.fuente === "pedido") {
      todoFacturado = false;
      if (d.moneda && !["USD", "PAB"].includes(d.moneda.toUpperCase())) moneda = d.moneda;
    }
  }
  return { monto: Math.round(monto * 100) / 100, fuente: todoFacturado ? "facturado" : "pedido", moneda };
}

/** Los pedidos que viajan con uno: su grupo, por la misma ruta. */
export type GrupoRuta = { datos: DatosPedido[]; pedidos: string[] };

/**
 * La ruta gratis que vale ahora: con el monto de `montoRutaGratis` (lo
 * facturado, o el pedido mientras se factura por partes) y con el estado del
 * cliente. Devuelve el método con `ruta_gratis` actualizado, lo que marcó el
 * vendedor en `ruta_gratis_vendedor` y un aviso si cambió o si la ruta no es
 * la del cliente. Métodos que no son por ruta, tal cual.
 *
 * `grupo`: los otros pedidos del cliente que se guardaron junto con este y
 * siguen por la misma ruta. Se facturan aparte pero salen en el mismo viaje,
 * así que el mínimo se cumple con la suma de todos (montoDelGrupo).
 *
 * Una vez que Almacén registró el egreso (`recalculado_at`), vale lo que se
 * fijó ahí: una NC posterior no cambia "gratis / flete" de un pedido que ya
 * salió.
 */
export function aplicarEvaluacion(m: FilaMetodo, d: DatosPedido | undefined, grupo?: GrupoRuta): FilaMetodo {
  if (m.metodo !== "ruta") return m;
  const vendedor = m.ruta_gratis === null || m.ruta_gratis === undefined ? null : Number(m.ruta_gratis);
  const juntos = grupo && grupo.pedidos.length ? { grupo_pedidos: grupo.pedidos } : {};
  if (m.recalculado_at) {
    return {
      ...m,
      ...juntos,
      ruta_gratis_vendedor: vendedor,
      ruta_gratis: m.ruta_gratis_final === null || m.ruta_gratis_final === undefined ? null : Number(m.ruta_gratis_final),
    };
  }
  if (!d) return m;
  const ds = [d, ...(grupo?.datos || [])];
  // Lo facturado viene en la moneda de la compañía (USD), aunque el pedido
  // sea en otra: ahí sí se puede comparar con el mínimo (montoDelGrupo).
  const { monto, fuente, moneda } = montoDelGrupo(ds);
  const ev = evaluarRutaGratis({
    companyId: d.company_id,
    rutaNombre: m.ruta_nombre,
    monto,
    moneda,
    estadoCliente: d.estado_cliente ?? ds.find((x) => x.estado_cliente)?.estado_cliente,
  });
  const alertas: string[] = [];
  if (vendedor === 1 && ev.gratis === 0) {
    const que = ds.length > 1 ? "los pedidos juntos" : fuente === "facturado" ? "lo facturado" : "el pedido";
    alertas.push(
      `Ya no es gratis: se marcó gratis con ${usd(Number(m.monto_base) || 0)} $, pero ${que} sin ${nombreImpuesto(d.company_id)} ${ds.length > 1 ? "suman" : "es"} ${usd(monto)} $ (mínimo ${usd(ev.minimo || 0)} $). Flete a cargo del cliente`,
    );
  }
  if (ev.alerta) alertas.push(ev.alerta);
  return {
    ...m,
    ...juntos,
    ruta_gratis_vendedor: vendedor,
    ruta_gratis: ev.gratis,
    monto_facturado: d.facturado,
    monto_grupo: ds.length > 1 ? monto : null,
    alerta: alertas.join(". ") || null,
  };
}

/**
 * aplicarEvaluacion a cada método por ruta, con su grupo: busca los otros
 * pedidos del grupo (aunque ya no estén en la lista, p. ej. uno que ya salió)
 * y sus datos de Odoo. `datosConocidos` evita volver a pedir a Odoo lo que el
 * que llama ya tiene.
 */
export async function evaluarConGrupos(
  metodos: Map<number, FilaMetodo>,
  datosConocidos: Map<number, DatosPedido> = new Map(),
): Promise<Map<number, FilaMetodo>> {
  const conRuta = [...metodos.values()].filter((m) => m.metodo === "ruta");
  if (!conRuta.length) return metodos;

  // Del grupo cuentan los que siguen por ruta, y por la misma: uno que el
  // cliente pasó a retirar en sucursal ya no viaja con los demás.
  const grupos = [...new Set(conRuta.map((m) => m.grupo).filter(Boolean))] as string[];
  const miembros = new Map<string, { odoo_sale_id: number; pedido: string; ruta_id: number | null }[]>();
  if (grupos.length) {
    const r = await query(
      `SELECT odoo_sale_id, pedido, ruta_id, grupo FROM ventas_metodo_retiro
        WHERE metodo = 'ruta' AND grupo IN (${grupos.map(() => "?").join(",")})`,
      grupos,
    );
    for (const f of r.rows as any[]) {
      const lista = miembros.get(f.grupo) || [];
      lista.push({ odoo_sale_id: Number(f.odoo_sale_id), pedido: String(f.pedido || ""), ruta_id: f.ruta_id == null ? null : Number(f.ruta_id) });
      miembros.set(f.grupo, lista);
    }
  }
  const companeros = (m: FilaMetodo) =>
    m.grupo
      ? (miembros.get(m.grupo) || []).filter((x) => x.odoo_sale_id !== m.odoo_sale_id && x.ruta_id === (m.ruta_id ?? null))
      : [];

  const faltan = [
    ...new Set([...conRuta.map((m) => m.odoo_sale_id), ...conRuta.flatMap((m) => companeros(m).map((x) => x.odoo_sale_id))]),
  ].filter((id) => !datosConocidos.has(id));
  const datos = new Map(datosConocidos);
  if (faltan.length) for (const [id, d] of await datosDePedidos(faltan)) datos.set(id, d);

  const salida = new Map(metodos);
  for (const m of conRuta) {
    const otros = companeros(m);
    const grupo: GrupoRuta = {
      datos: otros.map((x) => datos.get(x.odoo_sale_id)).filter(Boolean) as DatosPedido[],
      pedidos: otros.map((x) => x.pedido).filter(Boolean),
    };
    salida.set(m.odoo_sale_id, aplicarEvaluacion(m, datos.get(m.odoo_sale_id), grupo));
  }
  return salida;
}

/** metodosDePedidos + aplicarEvaluacion (con su grupo) con los datos actuales de Odoo. */
export async function metodosEvaluados(saleIds: number[]): Promise<Map<number, FilaMetodo>> {
  return evaluarConGrupos(await metodosDePedidos(saleIds));
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
  /** Empresa del cliente (commercial_partner_id): agrupa los pedidos de un mismo cliente. */
  cliente_id: number | null;
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

  const [ventas, facturas, metodosGuardados, datos] = await Promise.all([
    callOdooRPC<any[]>("sale.order", "read", [saleIds, ["name", "partner_id", "user_id", "date_order", "amount_total", "amount_untaxed", "currency_id", "company_id"]]),
    facturasDeVentas(saleIds),
    metodosDePedidos(saleIds),
    datosDePedidos(saleIds),
  ]);
  // La ruta gratis que vale hoy, con los pedidos que viajan juntos.
  const metodos = await evaluarConGrupos(metodosGuardados, datos);
  // Empresa de cada cliente: los pedidos de sus contactos van con ella.
  const partnerIds = [...new Set((ventas || []).map((v) => v.partner_id?.[0]).filter(Boolean))] as number[];
  const empresas = new Map<number, number>(
    ((partnerIds.length ? await callOdooRPC<any[]>("res.partner", "read", [partnerIds, ["commercial_partner_id"]]) : []) || []).map(
      (x: any) => [x.id, x.commercial_partner_id?.[0] ?? x.id],
    ),
  );

  const porVenta = new Map<number, PedidoPendiente>();
  for (const v of ventas || []) {
    porVenta.set(v.id, {
      sale_id: v.id,
      pedido: v.name,
      cliente: v.partner_id?.[1] || "",
      cliente_id: v.partner_id?.[0] ? empresas.get(v.partner_id[0]) ?? v.partner_id[0] : null,
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
      // La ruta gratis que vale hoy (con lo facturado y su grupo).
      metodo: metodos.get(v.id) ?? null,
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
 * Guarda el método de uno o varios pedidos. `vendedorUid`: si viene, los
 * pedidos tienen que ser de ese vendedor (sesión de vendedor). `cids`: la
 * sucursal de la sesión (null = superadmin).
 *
 * Varios pedidos: tienen que ser del mismo cliente (la misma empresa,
 * `commercial_partner_id`) y de la misma sede. Quedan en un mismo `grupo`:
 * se facturan aparte pero salen en el mismo viaje, y la ruta gratis se decide
 * con la suma de todos (montoDelGrupo). Guardar un pedido solo lo saca del
 * grupo en que estaba.
 *
 * Transporte externo: hace falta la foto de la autorización del cliente
 * (`autorizacionId`, subida antes con lib/ventas/autorizacionTransporte). Un
 * pedido que ya la tenía la conserva si no se manda otra.
 *
 * `porAlmacen`: el cliente cambió cómo recibe el pedido y Almacén lo cambia
 * desde su panel (un pedido por vez, y no toca su grupo). Solo cambia uno que
 * ya cargó el vendedor, y también con el egreso registrado mientras siga en
 * manos de Almacén (hasta asignar el despacho): el egreso toma el nuevo tipo
 * de entrega (ver cambiarEgresos). Cuando ya pasó a Seguridad, no.
 */
export async function guardarMetodoRetiro(datos: {
  saleIds: number[];
  metodo: unknown;
  rutaId: number | null;
  agencia: string | null;
  nota: string | null;
  autorizacionId?: number | null;
  cids: number | null;
  vendedorUid: number | null;
  autor: string;
  /** Correo de la sesión: la autorización tiene que haberla subido quien guarda. */
  email: string;
  rol: string;
  porAlmacen?: boolean;
}): Promise<{ metodo: FilaMetodo; metodos: FilaMetodo[]; egresos: EgresoCambiado[] }> {
  if (!esMetodoRetiro(datos.metodo)) throw new ErrorMetodo("Elige retiro en sucursal, ruta, encomienda o transporte externo.");
  const metodo = datos.metodo;
  const ids = [...new Set(datos.saleIds.filter((x) => Number.isInteger(x) && x > 0))];
  if (!ids.length) throw new ErrorMetodo("Elige al menos un pedido.");
  if (ids.length > MAX_PEDIDOS_GRUPO) throw new ErrorMetodo(`Se pueden juntar hasta ${MAX_PEDIDOS_GRUPO} pedidos.`);
  if (datos.porAlmacen && ids.length !== 1) throw new ErrorMetodo("Almacén cambia el método de un pedido por vez.");

  const guardados = await metodosDePedidos(ids);
  const anterior = datos.porAlmacen ? guardados.get(ids[0]) ?? null : null;
  if (datos.porAlmacen && !anterior) {
    throw new ErrorMetodo("El vendedor todavía no indicó el método de retiro: Almacén solo puede cambiarlo.", 409);
  }

  const ventas =
    (await callOdooRPC<any[]>("sale.order", "read", [
      ids,
      ["name", "partner_id", "user_id", "company_id", "amount_untaxed", "currency_id"],
    ])) || [];
  const venta = new Map(ventas.map((v) => [v.id, v]));
  // 404 y no 403 para un pedido ajeno: no confirmar que existe.
  for (const id of ids) {
    const v = venta.get(id);
    if (
      !v ||
      (datos.cids !== null && v.company_id?.[0] !== datos.cids) ||
      (datos.vendedorUid !== null && v.user_id?.[0] !== datos.vendedorUid)
    ) {
      throw new ErrorMetodo("Pedido no encontrado", 404);
    }
  }
  const primera = venta.get(ids[0])!;
  const companyId: number | null = primera.company_id?.[0] ?? null;
  if (ids.length > 1) {
    if (ventas.some((v) => (v.company_id?.[0] ?? null) !== companyId)) {
      throw new ErrorMetodo("Solo se pueden juntar pedidos de la misma sucursal.");
    }
    // El mismo cliente: la empresa, aunque cada pedido sea de un contacto suyo.
    const partners = [...new Set(ventas.map((v) => v.partner_id?.[0]).filter(Boolean))] as number[];
    const empresas = new Set(
      ((await callOdooRPC<any[]>("res.partner", "read", [partners, ["commercial_partner_id"]])) || []).map(
        (x: any) => x.commercial_partner_id?.[0] ?? x.id,
      ),
    );
    if (empresas.size !== 1) throw new ErrorMetodo("Solo se pueden juntar pedidos del mismo cliente.");
  }

  // Ya en manos de Almacén: el egreso salió con el método que tenía. Solo
  // Almacén lo cambia, y mientras el egreso siga siendo suyo.
  const pickings =
    (await callOdooRPC<any[]>("stock.picking", "search_read", [[["sale_id", "in", ids]]], {
      fields: ["id", "sale_id"],
      limit: 50 * ids.length,
    })) || [];
  let egresos: { id: number; etapa: Etapa; empaquetado_at: string | null }[] = [];
  if (pickings.length) {
    const r = await query(
      `SELECT id, etapa, empaquetado_at, odoo_picking_id,
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
      const pedidoDe = new Map(pickings.map((p) => [p.id, p.sale_id?.[0]]));
      const ocupados = [
        ...new Set(filas.map((f) => venta.get(pedidoDe.get(Number(f.odoo_picking_id)))?.name).filter(Boolean)),
      ];
      throw new ErrorMetodo(
        ids.length > 1 && ocupados.length
          ? `Almacén ya está despachando ${ocupados.join(", ")}: quítalo de la selección, su método ya no se puede cambiar.`
          : "Almacén ya está despachando este pedido: el método ya no se puede cambiar.",
        409,
      );
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
    const ruta = (await listarRutasConSede()).find((r) => r.id === datos.rutaId && esDeLaSede(r.cids, companyId));
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

  // Transporte externo: la autorización del cliente es obligatoria. Una nueva
  // tiene que ser de quien guarda (o ya de uno de estos pedidos): con el id
  // de la foto de otro no se la puede ver nadie más.
  const autorizacion = new Map<number, number | null>();
  if (metodo === "transporte") {
    const nueva = datos.autorizacionId && datos.autorizacionId > 0 ? datos.autorizacionId : null;
    if (nueva && !(await autorizacionUsable(nueva, datos.email, ids))) {
      throw new ErrorMetodo("No se encontró la foto de la autorización: vuelve a adjuntarla.");
    }
    for (const id of ids) {
      const actual = guardados.get(id);
      const valor = nueva ?? (actual?.metodo === "transporte" ? actual.autorizacion_id ?? null : null);
      if (!valor) {
        throw new ErrorMetodo("Adjunta la foto de la autorización del cliente para el transporte externo (nítida, que se lea).");
      }
      autorizacion.set(id, valor);
    }
  }

  // Ruta gratis o con flete (Valencia y Panamá): con la suma de los pedidos
  // (montoDelGrupo) y con el estado del cliente. Hasta que Almacén registre el
  // egreso se sigue recalculando con lo que diga Odoo (evaluarConGrupos).
  const datosOdoo = await datosDePedidos(ids);
  const ds: DatosPedido[] = ids.map(
    (id) =>
      datosOdoo.get(id) ?? {
        company_id: companyId,
        moneda: venta.get(id)!.currency_id?.[1] || "",
        base_pedido: Number(venta.get(id)!.amount_untaxed) || 0,
        facturado: null,
        por_facturar: true,
        con_nota_credito: false,
        estado_cliente: null,
      },
  );
  const suma = montoDelGrupo(ds);
  const rutaGratis =
    metodo === "ruta"
      ? evaluarRutaGratis({
          companyId,
          rutaNombre,
          monto: suma.monto,
          moneda: suma.moneda,
          estadoCliente: ds.find((x) => x.estado_cliente)?.estado_cliente,
        }).gratis
      : null;

  // El vendedor arma un grupo nuevo con lo que eligió (y un pedido guardado
  // solo sale del grupo en que estaba). Almacén no toca el grupo.
  const grupo = ids.length > 1 ? randomUUID() : null;
  await asegurarTablaMetodoRetiro();
  for (const id of ids) {
    const v = venta.get(id)!;
    await query(
      `INSERT INTO ventas_metodo_retiro
         (odoo_sale_id, pedido, company_id, cliente, vendedor_uid, vendedor_nombre, metodo, ruta_id, ruta_nombre,
          agencia, nota, registrado_por, registrado_rol, ruta_gratis, monto_base, grupo, autorizacion_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE metodo = VALUES(metodo), ruta_id = VALUES(ruta_id), ruta_nombre = VALUES(ruta_nombre),
         ruta_gratis = VALUES(ruta_gratis), monto_base = VALUES(monto_base),
         monto_facturado = NULL, ruta_gratis_final = NULL, alerta = NULL, recalculado_at = NULL,
         agencia = VALUES(agencia), nota = VALUES(nota), registrado_por = VALUES(registrado_por),
         registrado_rol = VALUES(registrado_rol), cliente = VALUES(cliente), pedido = VALUES(pedido),
         autorizacion_id = VALUES(autorizacion_id)${datos.porAlmacen ? "" : ", grupo = VALUES(grupo)"}`,
      [
        id,
        String(v.name || "").slice(0, 64),
        v.company_id?.[0] ?? null,
        String(v.partner_id?.[1] || "").slice(0, 255),
        v.user_id?.[0] ?? null,
        String(v.user_id?.[1] || "").slice(0, 200),
        metodo,
        rutaId,
        rutaNombre,
        agencia,
        (datos.nota || "").trim().slice(0, 500) || null,
        datos.autor.slice(0, 200),
        datos.rol.slice(0, 50),
        rutaGratis,
        suma.monto,
        grupo,
        autorizacion.get(id) ?? null,
      ],
    );
  }
  const evaluados = await evaluarConGrupos(await metodosDePedidos(ids), datosOdoo);
  const metodos = ids.map((id) => evaluados.get(id)).filter(Boolean) as FilaMetodo[];
  const fila = metodos[0];
  if (!egresos.length) return { metodo: fila, metodos, egresos: [] };

  // Con el egreso ya registrado, la ruta gratis se fija ahora (como al
  // registrarlo) y el egreso toma el nuevo tipo de entrega.
  await fijarRutaGratisFinal(fila);
  const cambiados = await cambiarEgresos(egresos, fila, anterior, datos.autor);
  const final = (await metodosEvaluados([ids[0]])).get(ids[0]) || fila;
  return { metodo: final, metodos: [final], egresos: cambiados };
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
