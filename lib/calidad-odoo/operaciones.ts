import type { Chequeo, Fila } from "./tipos";
import {
  asientos, extractoSinConciliar, facturasSinRif, ordenesCompra, pagos, pedidosVenta, saldoSinAplicar, stockNegativo, traslados,
  CORTE_ODOO,
} from "./odoo";
import { diaCaracasMenos, diasEntre } from "./texto";

/**
 * Chequeos de documentos (inventario, ventas, compras, contabilidad): cosas
 * pendientes que quedaron a medias y documentos con datos faltantes.
 */

const ESTADO_TRASLADO: Record<string, string> = {
  draft: "Borrador", waiting: "Esperando otra operación", confirmed: "Esperando disponibilidad", assigned: "Listo",
};
const TIPO_ASIENTO: Record<string, string> = {
  entry: "Asiento", out_invoice: "Factura de cliente", out_refund: "Nota de crédito de cliente",
  in_invoice: "Factura de proveedor", in_refund: "Nota de crédito de proveedor", out_receipt: "Recibo de venta", in_receipt: "Recibo de compra",
};
const RECEPCION: Record<string, string> = { pending: "Sin recibir", partial: "Recibida en parte", full: "Recibida" };

/** Umbrales de antigüedad (días). */
export const DIAS = { traslado: 15, trasladoBorrador: 7, porFacturar: 15, cotizacion: 30, facturaBorrador: 7, compraSinRecibir: 30, compraPorFacturar: 15, pago: 30 };

export async function chequeosOperaciones(): Promise<Chequeo[]> {
  const hoy = diaCaracasMenos(0);
  // Datetimes de Odoo en UTC: el día de Caracas empieza a las 04:00 UTC.
  const antes = (d: number) => `${diaCaracasMenos(d)} 04:00:00`;
  const dias = (f: string | null) => diasEntre(f, hoy);
  const masViejo = (a: Fila, b: Fila) => Number(b.dias ?? 0) - Number(a.dias ?? 0);

  const [
    negativos, atrasados, trasBorrador, porFacturar, cotizaciones, factBorrador, sinVendedor, sinRif,
    sinRecibir, compraPorFacturar, solicitudes, provBorrador, asientosBorrador, pagosSinConciliar, pagosBorrador, extracto,
  ] = await Promise.all([
    stockNegativo(),
    traslados([["state", "in", ["assigned", "confirmed", "waiting"]], ["scheduled_date", "<", antes(DIAS.traslado)]]),
    traslados([["state", "=", "draft"], ["create_date", "<", antes(DIAS.trasladoBorrador)]]),
    pedidosVenta([["state", "=", "sale"], ["invoice_status", "=", "to invoice"], ["date_order", "<", antes(DIAS.porFacturar)]]),
    pedidosVenta([["state", "in", ["draft", "sent"]], ["date_order", "<", antes(DIAS.cotizacion)]]),
    asientos([["state", "=", "draft"], ["move_type", "in", ["out_invoice", "out_refund"]], ["create_date", "<", antes(DIAS.facturaBorrador)]]),
    asientos([["state", "=", "posted"], ["move_type", "=", "out_invoice"], ["invoice_user_id", "=", false], ["invoice_date", ">=", CORTE_ODOO]]),
    facturasSinRif(),
    ordenesCompra([["state", "=", "purchase"], ["receipt_status", "in", ["pending", "partial"]], ["date_approve", "<", antes(DIAS.compraSinRecibir)]]),
    ordenesCompra([["state", "=", "purchase"], ["invoice_status", "=", "to invoice"], ["date_approve", "<", antes(DIAS.compraPorFacturar)]]),
    ordenesCompra([["state", "in", ["draft", "sent"]], ["create_date", "<", antes(DIAS.cotizacion)]]),
    asientos([["state", "=", "draft"], ["move_type", "in", ["in_invoice", "in_refund"]]]),
    asientos([["state", "=", "draft"], ["move_type", "=", "entry"]]),
    pagos([["state", "=", "posted"], ["is_reconciled", "=", false], ["is_internal_transfer", "=", false], ["date", "<", diaCaracasMenos(DIAS.pago)]]),
    pagos([["state", "=", "draft"]]),
    extractoSinConciliar(),
  ]);

  // Sobrantes de céntimos (diferencias de cambio, redondeos) no son un pago suelto.
  const saldos = await saldoSinAplicar(pagosSinConciliar.map((p) => p.moveId).filter(Boolean));
  const pagosSueltos = pagosSinConciliar
    .map((p) => ({ ...p, sinAplicar: Math.round(Math.abs(saldos.get(p.moveId) ?? p.monto) * 100) / 100 }))
    .filter((p) => p.sinAplicar >= 1);

  const fila = (modelo: string, x: { id: number; companyId: number | null }, campos: Record<string, unknown>): Fila =>
    ({ id: x.id, modelo, companyId: x.companyId, ...campos });

  const filasAsiento = (lista: Awaited<ReturnType<typeof asientos>>) =>
    lista
      .map((m) => fila("account.move", m, {
        numero: m.numero, tipo: TIPO_ASIENTO[m.tipo] ?? m.tipo, contacto: m.contacto, diario: m.diario,
        fecha: m.fecha, total: m.total, creadoPor: m.creadoPor, dias: dias(m.creado),
      }))
      .sort(masViejo);
  const COL_ASIENTO = [
    { clave: "numero", titulo: "Documento" }, { clave: "tipo", titulo: "Tipo" }, { clave: "contacto", titulo: "Contacto" },
    { clave: "diario", titulo: "Diario" }, { clave: "fecha", titulo: "Fecha", tipo: "fecha" as const },
    { clave: "total", titulo: "Total (USD)", tipo: "dinero" as const }, { clave: "creadoPor", titulo: "Creado por" },
    { clave: "dias", titulo: "Días desde que se creó", tipo: "dias" as const },
  ];

  return [
    // ── Inventario ──
    {
      id: "stock-negativo",
      area: "inventario",
      severidad: "error",
      titulo: "Stock negativo",
      descripcion: `Productos con existencia negativa en una ubicación interna.`,
      porQue: "Físicamente no puede haber −1 unidades: se despachó algo que según Odoo no estaba. El stock de la sede está mal y la valoración del inventario también.",
      pasos: [
        "Ver el historial del producto en esa ubicación (Inventario → Reportes → Historial de movimientos) para encontrar el despacho que lo dejó en negativo.",
        "Normalmente falta validar una recepción o un traslado de entrada, o se despachó desde la ubicación equivocada: corregir ese documento.",
        "Si no hay documento que lo explique, contar físicamente y hacer un ajuste de inventario (Inventario → Operaciones → Ajustes).",
      ],
      columnas: [{ clave: "producto", titulo: "Producto" }, { clave: "ubicacion", titulo: "Ubicación" }, { clave: "lote", titulo: "Lote / serie" }, { clave: "cantidad", titulo: "Cantidad", tipo: "numero" }],
      filas: negativos.map((q) => fila("product.product", { id: q.productoId, companyId: q.companyId }, { producto: q.producto, ubicacion: q.ubicacion, lote: q.lote, cantidad: q.cantidad })),
    },
    {
      id: "traslados-atrasados",
      area: "inventario",
      severidad: "atencion",
      titulo: `Traslados pendientes hace más de ${DIAS.traslado} días`,
      descripcion: `Recepciones, entregas o traslados internos sin validar cuya fecha programada pasó hace más de ${DIAS.traslado} días.`,
      porQue: "La mercancía reservada en esos traslados no está disponible para vender, el stock de Odoo no coincide con el físico y las recepciones sin validar no suman al inventario.",
      pasos: [
        "Abrir el traslado y verificar con Almacén si la mercancía ya se movió.",
        "Si se movió: validarlo con las cantidades reales.",
        "Si no se va a mover: cancelarlo para liberar la reserva.",
      ],
      columnas: [{ clave: "numero", titulo: "Traslado" }, { clave: "tipo", titulo: "Operación" }, { clave: "contacto", titulo: "Contacto" }, { clave: "origen", titulo: "Origen" }, { clave: "estado", titulo: "Estado" }, { clave: "programada", titulo: "Programada", tipo: "fecha" }, { clave: "dias", titulo: "Días de atraso", tipo: "dias" }],
      filas: atrasados.map((t) => fila("stock.picking", t, { numero: t.numero, tipo: t.tipo, contacto: t.contacto, origen: t.origen, estado: ESTADO_TRASLADO[t.estado] ?? t.estado, programada: t.programada, dias: dias(t.programada) })).sort(masViejo),
    },
    {
      id: "traslados-borrador",
      area: "inventario",
      severidad: "atencion",
      titulo: "Traslados olvidados en borrador",
      descripcion: `Traslados en borrador creados hace más de ${DIAS.trasladoBorrador} días.`,
      porQue: "Un traslado en borrador no mueve ni reserva nada: o falta confirmarlo, o sobra y confunde.",
      pasos: ["Abrir el traslado: si corresponde, confirmarlo y validarlo; si no, cancelarlo/eliminarlo."],
      columnas: [{ clave: "numero", titulo: "Traslado" }, { clave: "tipo", titulo: "Operación" }, { clave: "contacto", titulo: "Contacto" }, { clave: "origen", titulo: "Origen" }, { clave: "creado", titulo: "Creado", tipo: "fecha" }, { clave: "dias", titulo: "Días", tipo: "dias" }],
      filas: trasBorrador.map((t) => fila("stock.picking", t, { numero: t.numero, tipo: t.tipo, contacto: t.contacto, origen: t.origen, creado: t.creado, dias: dias(t.creado) })).sort(masViejo),
    },

    // ── Ventas ──
    {
      id: "ventas-por-facturar",
      area: "ventas",
      severidad: "atencion",
      titulo: `Órdenes de venta sin facturar (más de ${DIAS.porFacturar} días)`,
      descripcion: `Órdenes confirmadas con algo pendiente de facturar desde hace más de ${DIAS.porFacturar} días.`,
      porQue: "O se entregó mercancía sin factura (venta que no está en los libros), o la orden quedó abierta por una diferencia y ensucia los reportes de pendientes.",
      pasos: [
        "En Ventas → Por facturar → Órdenes a facturar, abrir la orden y ver qué líneas faltan.",
        "Si se entregó y no se facturó: crear la factura.",
        "Si la diferencia no se va a facturar (devolución, ajuste): bajar la cantidad de la línea o cancelar el resto, para que la orden quede «Facturada completamente».",
      ],
      columnas: [{ clave: "numero", titulo: "Orden" }, { clave: "cliente", titulo: "Cliente" }, { clave: "vendedor", titulo: "Vendedor" }, { clave: "fecha", titulo: "Fecha", tipo: "fecha" }, { clave: "total", titulo: "Total (USD)", tipo: "dinero" }, { clave: "dias", titulo: "Días", tipo: "dias" }],
      filas: porFacturar.map((o) => fila("sale.order", o, { numero: o.numero, cliente: o.cliente, vendedor: o.vendedor, fecha: o.fecha, total: o.total, dias: dias(o.fecha) })).sort(masViejo),
    },
    {
      id: "ventas-cotizaciones-viejas",
      area: "ventas",
      severidad: "mejora",
      titulo: `Cotizaciones abiertas hace más de ${DIAS.cotizacion} días`,
      descripcion: `Cotizaciones en borrador o enviadas que nadie cerró.`,
      porQue: "Inflan el embudo de ventas y los reportes de cotizaciones; las que ya no se van a cerrar deberían estar canceladas.",
      pasos: ["En Ventas → Órdenes → Cotizaciones, filtrar por fecha, seleccionar las que ya no aplican → Acción → Cancelar."],
      columnas: [{ clave: "numero", titulo: "Cotización" }, { clave: "cliente", titulo: "Cliente" }, { clave: "vendedor", titulo: "Vendedor" }, { clave: "fecha", titulo: "Fecha", tipo: "fecha" }, { clave: "total", titulo: "Total (USD)", tipo: "dinero" }, { clave: "dias", titulo: "Días", tipo: "dias" }],
      filas: cotizaciones.map((o) => fila("sale.order", o, { numero: o.numero, cliente: o.cliente, vendedor: o.vendedor, fecha: o.fecha, total: o.total, dias: dias(o.fecha) })).sort(masViejo),
    },
    {
      id: "facturas-cliente-borrador",
      area: "ventas",
      severidad: "atencion",
      titulo: "Facturas y notas de crédito de cliente en borrador",
      descripcion: `Documentos de cliente en borrador desde hace más de ${DIAS.facturaBorrador} días.`,
      porQue: "Una factura en borrador no cuenta como venta ni como cuenta por cobrar. Si la mercancía salió, falta registrarla; si no, sobra.",
      pasos: ["Abrir el documento (Contabilidad → Clientes → Facturas de clientes, filtro Borrador).", "Si corresponde: revisar y Confirmar.", "Si no: eliminarlo o cancelarlo."],
      columnas: COL_ASIENTO,
      filas: filasAsiento(factBorrador),
    },
    {
      id: "facturas-sin-vendedor",
      area: "ventas",
      severidad: "error",
      titulo: "Facturas publicadas sin vendedor",
      descripcion: `Facturas de cliente publicadas desde abril 2026 sin vendedor.`,
      porQue: "Esa venta no le cuenta a nadie: no entra en las metas, comisiones ni SPIFF de ningún vendedor.",
      pasos: ["Abrir la factura → pestaña Otra información → Vendedor, y asignarlo (se puede cambiar con la factura publicada)."],
      columnas: COL_ASIENTO.slice(0, 7),
      filas: filasAsiento(sinVendedor),
    },
    {
      id: "facturas-sin-rif",
      area: "ventas",
      severidad: "error",
      titulo: "Facturas a clientes sin RIF",
      descripcion: `Facturas publicadas desde abril 2026 a clientes que no tienen RIF/RUC cargado.`,
      porQue: "Una factura fiscal sin RIF del comprador no cumple con el SENIAT/DGI y no sirve al cliente para su crédito fiscal.",
      pasos: ["Cargar el RIF en la ficha del cliente (ver «Clientes y proveedores sin RIF»).", "Consultar con Contabilidad si hay que anular y rehacer la factura."],
      columnas: [{ clave: "numero", titulo: "Factura" }, { clave: "cliente", titulo: "Cliente" }, { clave: "vendedor", titulo: "Vendedor" }, { clave: "fecha", titulo: "Fecha", tipo: "fecha" }, { clave: "total", titulo: "Total (USD)", tipo: "dinero" }],
      filas: sinRif.map((m) => fila("account.move", m, { numero: m.numero, cliente: m.cliente, vendedor: m.vendedor, fecha: m.fecha, total: m.total })),
    },

    // ── Compras ──
    {
      id: "compras-sin-recibir",
      area: "compras",
      severidad: "atencion",
      titulo: `Órdenes de compra sin recibir (más de ${DIAS.compraSinRecibir} días)`,
      descripcion: `Órdenes de compra confirmadas hace más de ${DIAS.compraSinRecibir} días con mercancía pendiente de recibir.`,
      porQue: "Esa mercancía aparece como «en tránsito» en Compras y en el sugerido de compra. Si nunca va a llegar, infla el tránsito y frena compras necesarias.",
      pasos: [
        "Confirmar con Compras si la mercancía llegó, viene en camino o no va a llegar.",
        "Si llegó: validar la recepción.",
        "Si no va a llegar: en la recepción pendiente, «Crear entrega parcial» → «Sin entrega parcial», o cancelar las líneas pendientes de la orden.",
      ],
      columnas: [{ clave: "numero", titulo: "Orden" }, { clave: "proveedor", titulo: "Proveedor" }, { clave: "recepcion", titulo: "Recepción" }, { clave: "fecha", titulo: "Confirmada", tipo: "fecha" }, { clave: "total", titulo: "Total (USD)", tipo: "dinero" }, { clave: "dias", titulo: "Días", tipo: "dias" }],
      filas: sinRecibir.map((o) => fila("purchase.order", o, { numero: o.numero, proveedor: o.proveedor, recepcion: RECEPCION[o.recepcion] ?? o.recepcion, fecha: o.fecha, total: o.total, dias: dias(o.fecha) })).sort(masViejo),
    },
    {
      id: "compras-por-facturar",
      area: "compras",
      severidad: "atencion",
      titulo: "Compras recibidas sin factura del proveedor",
      descripcion: `Órdenes de compra con mercancía recibida (o por recibir) sin su factura de proveedor, confirmadas hace más de ${DIAS.compraPorFacturar} días.`,
      porQue: "La deuda con el proveedor no está en cuentas por pagar y el costo del inventario puede no estar bien hasta que entra la factura.",
      pasos: ["Abrir la orden → botón «Crear factura» cuando llegue la factura del proveedor, o pedírsela.", "Si no habrá factura (devuelta, regalo), ajustar la orden para que no quede pendiente."],
      columnas: [{ clave: "numero", titulo: "Orden" }, { clave: "proveedor", titulo: "Proveedor" }, { clave: "recepcion", titulo: "Recepción" }, { clave: "fecha", titulo: "Confirmada", tipo: "fecha" }, { clave: "total", titulo: "Total (USD)", tipo: "dinero" }, { clave: "dias", titulo: "Días", tipo: "dias" }],
      filas: compraPorFacturar.map((o) => fila("purchase.order", o, { numero: o.numero, proveedor: o.proveedor, recepcion: RECEPCION[o.recepcion] ?? o.recepcion, fecha: o.fecha, total: o.total, dias: dias(o.fecha) })).sort(masViejo),
    },
    {
      id: "compras-solicitudes-viejas",
      area: "compras",
      severidad: "mejora",
      titulo: `Solicitudes de cotización abiertas hace más de ${DIAS.cotizacion} días`,
      descripcion: `Solicitudes de cotización a proveedores sin confirmar ni cancelar.`,
      porQue: "Ensucian la lista de compras y el seguimiento de lo que se le pidió a cada proveedor.",
      pasos: ["En Compras → Órdenes → Solicitudes de cotización: confirmar las que siguen vigentes y cancelar las demás."],
      columnas: [{ clave: "numero", titulo: "Solicitud" }, { clave: "proveedor", titulo: "Proveedor" }, { clave: "comprador", titulo: "Comprador" }, { clave: "fecha", titulo: "Fecha", tipo: "fecha" }, { clave: "total", titulo: "Total (USD)", tipo: "dinero" }, { clave: "dias", titulo: "Días", tipo: "dias" }],
      filas: solicitudes.map((o) => fila("purchase.order", o, { numero: o.numero, proveedor: o.proveedor, comprador: o.comprador, fecha: o.fecha, total: o.total, dias: dias(o.fecha) })).sort(masViejo),
    },
    {
      id: "facturas-proveedor-borrador",
      area: "compras",
      severidad: "atencion",
      titulo: "Facturas de proveedor en borrador",
      descripcion: `Facturas o notas de crédito de proveedor sin registrar.`,
      porQue: "La deuda no aparece en cuentas por pagar ni el gasto/costo en la contabilidad del mes.",
      pasos: ["Abrir el documento (Contabilidad → Proveedores → Facturas, filtro Borrador).", "Verificar contra la factura física, completar y Confirmar; si es un duplicado, eliminarlo."],
      columnas: COL_ASIENTO,
      filas: filasAsiento(provBorrador),
    },

    // ── Contabilidad ──
    {
      id: "asientos-borrador",
      area: "contabilidad",
      severidad: "error",
      titulo: "Asientos contables sin registrar",
      descripcion: `Asientos manuales en borrador.`,
      porQue: "No cuentan en los estados financieros y bloquean la fecha de cierre: Odoo no deja bloquear un período con asientos en borrador.",
      pasos: [
        "Contabilidad → Contabilidad → Asientos contables, filtro «Borrador».",
        "Revisar cada uno con Contabilidad: si es correcto, Registrar; si no, eliminarlo.",
      ],
      columnas: COL_ASIENTO,
      filas: filasAsiento(asientosBorrador),
    },
    {
      id: "pagos-sin-conciliar",
      area: "contabilidad",
      severidad: "atencion",
      titulo: `Pagos sin aplicar a una factura (más de ${DIAS.pago} días)`,
      descripcion: `Cobros o pagos registrados hace más de ${DIAS.pago} días con $1 o más sin aplicar a ninguna factura (no aplicados, o aplicados a una factura menor).`,
      porQue: "El cliente aparece debiendo una factura que ya pagó (y con un saldo a favor suelto), o el proveedor con una deuda ya pagada. Los reportes de CxC y CxP salen inflados.",
      pasos: [
        "Abrir el pago y ver el contacto.",
        "En la factura pendiente de ese contacto, usar «Agregar» en el aviso de pagos pendientes para conciliarlo.",
        "Si es un anticipo real, dejarlo, pero revisar que esté identificado como tal.",
      ],
      columnas: [{ clave: "numero", titulo: "Pago" }, { clave: "tipo", titulo: "De" }, { clave: "contacto", titulo: "Contacto" }, { clave: "diario", titulo: "Diario" }, { clave: "fecha", titulo: "Fecha", tipo: "fecha" }, { clave: "monto", titulo: "Monto (USD)", tipo: "dinero" }, { clave: "sinAplicar", titulo: "Sin aplicar (USD)", tipo: "dinero" }, { clave: "situacion", titulo: "Situación" }, { clave: "dias", titulo: "Días", tipo: "dias" }],
      filas: pagosSueltos.map((p) => fila("account.payment", p, { numero: p.numero, tipo: `${p.tipo} (${p.direccion.toLowerCase()})`, contacto: p.contacto, diario: p.diario, fecha: p.fecha, monto: p.monto, sinAplicar: p.sinAplicar, situacion: p.aplicadoA ? "Aplicado en parte: sobra saldo" : "Sin aplicar a ninguna factura", dias: dias(p.fecha) })).sort(masViejo),
    },
    {
      id: "pagos-borrador",
      area: "contabilidad",
      severidad: "atencion",
      titulo: "Pagos en borrador",
      descripcion: `Pagos creados y no confirmados.`,
      porQue: "No rebajan la deuda del cliente/proveedor ni mueven el banco.",
      pasos: ["Abrir el pago: si se hizo, Confirmar; si no, cancelarlo."],
      columnas: [{ clave: "numero", titulo: "Pago" }, { clave: "tipo", titulo: "De" }, { clave: "contacto", titulo: "Contacto" }, { clave: "diario", titulo: "Diario" }, { clave: "fecha", titulo: "Fecha", tipo: "fecha" }, { clave: "monto", titulo: "Monto (USD)", tipo: "dinero" }, { clave: "creadoPor", titulo: "Creado por" }],
      filas: pagosBorrador.map((p) => fila("account.payment", p, { numero: p.numero, tipo: p.tipo, contacto: p.contacto, diario: p.diario, fecha: p.fecha, monto: p.monto, creadoPor: p.creadoPor })),
    },
    {
      id: "extracto-sin-conciliar",
      area: "contabilidad",
      severidad: "atencion",
      titulo: "Movimientos de banco sin conciliar",
      descripcion: `Líneas de extracto bancario sin conciliar.`,
      porQue: "El saldo del banco en Odoo no se puede cuadrar con el estado de cuenta, y puede haber cobros que no se aplicaron a ningún cliente.",
      pasos: ["Contabilidad → Tablero → banco → «Conciliar»: emparejar cada línea con su pago o factura, o registrar el gasto/comisión bancaria."],
      columnas: [{ clave: "fecha", titulo: "Fecha", tipo: "fecha" }, { clave: "concepto", titulo: "Concepto" }, { clave: "contacto", titulo: "Contacto" }, { clave: "diario", titulo: "Banco" }, { clave: "monto", titulo: "Monto (USD)", tipo: "dinero" }, { clave: "dias", titulo: "Días", tipo: "dias" }],
      filas: extracto.map((l) => fila("account.move", { id: l.moveId, companyId: l.companyId }, { fecha: l.fecha, concepto: l.concepto, contacto: l.contacto, diario: l.diario, monto: l.monto, dias: dias(l.fecha) })).sort(masViejo),
    },
  ];
}
