import { query } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { facturasDeVentas, type FacturaVenta } from "@/lib/seguridad/mercancia";
import { listarRutas } from "@/lib/rma/rutasEnvio";
import { esMetodoRetiro, evaluarRutaGratis, type FilaMetodo } from "@/lib/ventas/metodoRetiroTipos";

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
            ruta_gratis, monto_base, monto_facturado, ruta_gratis_final, alerta
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
      ["company_id", "currency_id", "amount_untaxed", "invoice_ids", "partner_shipping_id", "partner_id"],
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
      estado_cliente: estado.get((v.partner_shipping_id || v.partner_id)?.[0]) ?? null,
    });
  }
  return porVenta;
}

const usd = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * La ruta gratis que vale ahora: con lo FACTURADO si ya hay factura (si no,
 * con el pedido) y con el estado del cliente. Devuelve el método con
 * `ruta_gratis` actualizado, lo que marcó el vendedor en
 * `ruta_gratis_vendedor` y un aviso si cambió o si la ruta no es la del
 * cliente. Métodos que no son por ruta, tal cual.
 */
export function aplicarEvaluacion(m: FilaMetodo, d: DatosPedido | undefined): FilaMetodo {
  if (m.metodo !== "ruta" || !d) return m;
  const monto = d.facturado ?? d.base_pedido;
  const ev = evaluarRutaGratis({
    companyId: d.company_id,
    rutaNombre: m.ruta_nombre,
    monto,
    moneda: d.moneda,
    estadoCliente: d.estado_cliente,
  });
  const alertas: string[] = [];
  const vendedor = m.ruta_gratis === null || m.ruta_gratis === undefined ? null : Number(m.ruta_gratis);
  if (vendedor === 1 && ev.gratis === 0) {
    alertas.push(
      `Ya no es gratis: se marcó gratis con ${usd(Number(m.monto_base) || 0)} $, pero ${d.facturado !== null ? "lo facturado" : "el pedido"} sin IVA es ${usd(monto)} $ (mínimo ${usd(ev.minimo || 0)} $). Flete a cargo del cliente`,
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
 * Al registrar el egreso: guarda la decisión final (con lo facturado) en el
 * método del pedido, para que quede de dónde salió.
 */
export async function fijarRutaGratisFinal(m: FilaMetodo): Promise<void> {
  if (m.metodo !== "ruta") return;
  await query(
    `UPDATE ventas_metodo_retiro
        SET monto_facturado = ?, ruta_gratis_final = ?, alerta = ?, recalculado_at = NOW()
      WHERE odoo_sale_id = ?`,
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
  /** Estado de la dirección de entrega del cliente. */
  estado_cliente: string | null;
  ordenes: { id: number; nombre: string; estado: string }[];
  facturas: FacturaVenta[];
  /** Almacén ya registró el egreso de alguna orden: el método ya no se cambia. */
  en_despacho: boolean;
  metodo: FilaMetodo | null;
};

/**
 * Pedidos con órdenes de despacho abiertas en Odoo (no hechas ni canceladas):
 * los de un vendedor (`vendedorUid`), o todos los de la sucursal (`cids`;
 * null = todas) para el Asistente de Ventas.
 */
export async function listarPedidosPendientes(opciones: {
  cids: number | null;
  vendedorUid: number | null;
}): Promise<PedidoPendiente[]> {
  const domain: any[] = [
    ["picking_type_id.code", "=", "outgoing"],
    ["state", "not in", ["done", "cancel"]],
    ["sale_id", "!=", false],
  ];
  if (opciones.cids !== null) domain.push(["company_id", "=", opciones.cids]);
  if (opciones.vendedorUid !== null) domain.push(["sale_id.user_id", "=", opciones.vendedorUid]);

  const pickings =
    (await callOdooRPC<any[]>("stock.picking", "search_read", [domain], {
      fields: ["name", "state", "sale_id", "scheduled_date"],
      order: "scheduled_date asc",
      limit: 400,
    })) || [];
  const saleIds = [...new Set(pickings.map((p) => p.sale_id?.[0]).filter(Boolean))] as number[];
  if (!saleIds.length) return [];

  const [ventas, facturas, metodos, usados, datos] = await Promise.all([
    callOdooRPC<any[]>("sale.order", "read", [saleIds, ["name", "partner_id", "user_id", "date_order", "amount_total", "amount_untaxed", "currency_id", "company_id"]]),
    facturasDeVentas(saleIds),
    metodosDePedidos(saleIds),
    query(
      `SELECT odoo_picking_id FROM seguridad_mercancia
        WHERE tipo = 'egreso' AND odoo_picking_id IN (${pickings.map(() => "?").join(",")})`,
      pickings.map((p) => p.id),
    ).catch(() => ({ rows: [] as any[] })),
    datosDePedidos(saleIds),
  ]);
  const egresados = new Set((usados.rows as any[]).map((r) => Number(r.odoo_picking_id)));

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
      estado_cliente: datos.get(v.id)?.estado_cliente ?? null,
      ordenes: [],
      facturas: facturas.get(v.id) || [],
      en_despacho: false,
      // La ruta gratis que vale hoy (con lo facturado si ya hay factura).
      metodo: metodos.has(v.id) ? aplicarEvaluacion(metodos.get(v.id)!, datos.get(v.id)) : null,
    });
  }
  for (const p of pickings) {
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

/**
 * Guarda el método de un pedido. `vendedorUid`: si viene, el pedido tiene
 * que ser de ese vendedor (sesión de vendedor). `cids`: la sucursal de la
 * sesión (null = superadmin).
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
}): Promise<FilaMetodo> {
  if (!esMetodoRetiro(datos.metodo)) throw new ErrorMetodo("Elige retiro en sucursal, ruta o encomienda.");
  const metodo = datos.metodo;

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

  // Ya en manos de Almacén: el egreso salió con el método que tenía.
  const pickings =
    (await callOdooRPC<any[]>("stock.picking", "search_read", [[["sale_id", "=", datos.saleId]]], { fields: ["id"], limit: 50 })) || [];
  if (pickings.length) {
    const r = await query(
      `SELECT id FROM seguridad_mercancia WHERE tipo = 'egreso' AND odoo_picking_id IN (${pickings.map(() => "?").join(",")}) LIMIT 1`,
      pickings.map((p) => p.id),
    ).catch(() => ({ rows: [] as any[] }));
    if ((r.rows as any[]).length) {
      throw new ErrorMetodo("Almacén ya está despachando este pedido: el método ya no se puede cambiar.", 409);
    }
  }

  let rutaId: number | null = null;
  let rutaNombre: string | null = null;
  let agencia: string | null = null;
  if (metodo === "ruta") {
    const ruta = (await listarRutas()).find((r) => r.id === datos.rutaId);
    if (!ruta) throw new ErrorMetodo("Elige la ruta.");
    rutaId = ruta.id;
    rutaNombre = ruta.nombre;
  } else if (metodo === "encomienda") {
    // De la lista de agencias o escrita ("otra"), como en el portal de RMA.
    agencia = (datos.agencia || "").trim().slice(0, 100) || null;
    if (!agencia) throw new ErrorMetodo("Elige la agencia de la encomienda.");
  }

  // Ruta gratis o con flete (solo Valencia): con lo facturado si ya hay
  // factura, si no con el pedido; y con el estado del cliente. Al registrar
  // el egreso se vuelve a calcular con lo facturado (aplicarEvaluacion).
  const d = (await datosDePedidos([datos.saleId])).get(datos.saleId);
  const montoBase = d ? (d.facturado ?? d.base_pedido) : Number(venta.amount_untaxed) || 0;
  const rutaGratis =
    metodo === "ruta"
      ? evaluarRutaGratis({
          companyId: venta.company_id?.[0],
          rutaNombre,
          monto: montoBase,
          moneda: venta.currency_id?.[1],
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
  const fila = (await metodosDePedidos([datos.saleId])).get(datos.saleId)!;
  return aplicarEvaluacion(fila, d);
}
