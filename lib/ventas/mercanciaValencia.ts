import { callOdooRPCEstricto } from "@/lib/odoo";
import { CORTE_ODOO } from "@/lib/smartbit";
import { armarLinea, type LineaMercancia } from "@/lib/ventas/mercanciaValenciaTipos";

const VALENCIA = 9;
const CTX = { context: { allowed_company_ids: [VALENCIA] } };
type Relacion = [number, string];

interface LineaOdoo {
  id: number;
  order_id: Relacion;
  product_id: Relacion;
  product_uom: Relacion;
  product_uom_qty: number;
  qty_delivered: number;
  price_subtotal: number;
  invoice_lines: number[];
}

interface ApunteOdoo {
  id: number;
  move_id: Relacion;
  product_uom_id: Relacion;
  quantity: number;
}

interface FacturaOdoo {
  id: number;
  name: string;
  invoice_date: string;
  move_type: "out_invoice" | "out_refund";
}

interface ProductoOdoo {
  id: number;
  name: string;
  default_code: string | false;
  spiff_brand_id: Relacion | false;
}

export async function lineasCaracas(hoy: string): Promise<LineaMercancia[]> {
  const lineas = await callOdooRPCEstricto<LineaOdoo[]>("sale.order.line", "search_read", [[
    ["order_id.company_id", "=", VALENCIA],
    ["order_id.state", "=", "sale"],
    ["order_id.partner_id.commercial_partner_id.name", "ilike", "supricom ccs"],
    ["order_id.date_order", ">=", CORTE_ODOO],
    ["display_type", "=", false],
    ["product_id.type", "=", "product"],
    ["invoice_lines.move_id.state", "=", "posted"],
  ]], {
    fields: ["order_id", "product_id", "product_uom", "product_uom_qty", "qty_delivered", "price_subtotal", "invoice_lines"],
    limit: 0,
    ...CTX,
  }) ?? [];
  if (!lineas.length) return [];

  const productoIds = [...new Set(lineas.map((l) => l.product_id[0]))];
  const apunteIds = [...new Set(lineas.flatMap((l) => l.invoice_lines))];
  const [productos, apuntes] = await Promise.all([
    callOdooRPCEstricto<ProductoOdoo[]>("product.product", "read", [productoIds, ["default_code", "name", "spiff_brand_id"]], {
      context: { ...CTX.context, active_test: false },
    }),
    callOdooRPCEstricto<ApunteOdoo[]>("account.move.line", "search_read", [[
      ["id", "in", apunteIds],
      ["parent_state", "=", "posted"],
      ["display_type", "=", "product"],
    ]], { fields: ["move_id", "product_uom_id", "quantity"], limit: 0, ...CTX }),
  ]);

  const moveIds = [...new Set((apuntes ?? []).map((a) => a.move_id[0]))];
  if (!moveIds.length) return [];

  const productoPorId = new Map((productos ?? []).map((p) => [p.id, p]));
  const apuntePorId = new Map((apuntes ?? []).map((a) => [a.id, a]));
  const unidadesDistintas = new Set<number>();
  for (const linea of lineas) {
    for (const id of linea.invoice_lines) {
      const apunte = apuntePorId.get(id);
      if (apunte && apunte.product_uom_id[0] !== linea.product_uom[0]) {
        unidadesDistintas.add(apunte.product_uom_id[0]);
        unidadesDistintas.add(linea.product_uom[0]);
      }
    }
  }

  const [facturas, unidades] = await Promise.all([
    callOdooRPCEstricto<FacturaOdoo[]>("account.move", "search_read", [[
      ["id", "in", moveIds],
      ["state", "=", "posted"],
      ["move_type", "in", ["out_invoice", "out_refund"]],
    ]], { fields: ["name", "invoice_date", "move_type"], limit: 0, ...CTX }),
    unidadesDistintas.size
      ? callOdooRPCEstricto<{ id: number; factor: number }[]>("uom.uom", "read", [[...unidadesDistintas], ["factor"]], CTX)
      : [],
  ]);

  const facturaPorId = new Map((facturas ?? []).map((f) => [f.id, f]));
  const factorPorId = new Map((unidades ?? []).map((u) => [u.id, u.factor]));
  const resultado: LineaMercancia[] = [];

  for (const linea of lineas) {
    const facturasLinea = new Map<number, FacturaOdoo>();
    let facturado = 0;
    for (const id of linea.invoice_lines) {
      const apunte = apuntePorId.get(id);
      const factura = apunte && facturaPorId.get(apunte.move_id[0]);
      if (!apunte || !factura) continue;

      const origen = apunte.product_uom_id[0];
      const destino = linea.product_uom[0];
      let cantidad = apunte.quantity;
      if (origen !== destino) {
        const factorOrigen = factorPorId.get(origen);
        const factorDestino = factorPorId.get(destino);
        if (!factorOrigen || !factorDestino) throw new Error("Unidad de medida de Odoo sin factor de conversión");
        cantidad = cantidad / factorOrigen * factorDestino;
      }

      if (factura.move_type === "out_refund") {
        facturado -= cantidad;
      } else {
        facturado += cantidad;
        facturasLinea.set(factura.id, factura);
      }
    }
    if (facturado <= 0 || !facturasLinea.size) continue;

    const ordenadas = [...facturasLinea.values()].sort((a, b) => a.invoice_date.localeCompare(b.invoice_date));
    const producto = productoPorId.get(linea.product_id[0]);
    resultado.push(armarLinea({
      lineaId: linea.id,
      pedido: linea.order_id[1],
      pedidoId: linea.order_id[0],
      facturas: ordenadas.map((f) => f.name),
      fechaFactura: ordenadas[0].invoice_date,
      productoId: linea.product_id[0],
      codigo: producto?.default_code || "",
      producto: producto?.name || linea.product_id[1],
      marca: producto?.spiff_brand_id ? producto.spiff_brand_id[1] : "",
      facturado,
      despachado: linea.qty_delivered,
      precio: linea.product_uom_qty ? linea.price_subtotal / linea.product_uom_qty : 0,
      despachoAbierto: null,
      fechaPrevista: null,
    }, hoy));
  }

  const pendientes = new Map(resultado.filter((l) => l.pendiente > 0).map((l) => [l.lineaId, l]));
  if (!pendientes.size) return resultado;

  const movimientos = await callOdooRPCEstricto<{ sale_line_id: Relacion; picking_id: Relacion }[]>("stock.move", "search_read", [[
    ["sale_line_id", "in", [...pendientes.keys()]],
    ["picking_id.picking_type_code", "=", "outgoing"],
    ["picking_id.state", "not in", ["done", "cancel"]],
    ["state", "not in", ["done", "cancel"]],
  ]], { fields: ["sale_line_id", "picking_id"], limit: 0, ...CTX }) ?? [];
  if (!movimientos.length) return resultado;

  const despachoIds = [...new Set(movimientos.map((m) => m.picking_id[0]))];
  const despachos = await callOdooRPCEstricto<{ id: number; name: string; scheduled_date: string | false }[]>(
    "stock.picking", "search_read", [[["id", "in", despachoIds]]],
    { fields: ["name", "scheduled_date"], order: "scheduled_date asc, id asc", limit: 0, ...CTX },
  );
  const despachoPorId = new Map((despachos ?? []).map((despacho, indice) => [despacho.id, { despacho, indice }]));
  const ordenDespacho = (id: number) => despachoPorId.get(id)?.indice ?? Number.MAX_SAFE_INTEGER;
  movimientos.sort((a, b) => ordenDespacho(a.picking_id[0]) - ordenDespacho(b.picking_id[0]));
  const fechaCaracas = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" });
  for (const movimiento of movimientos) {
    const linea = pendientes.get(movimiento.sale_line_id[0]);
    const despacho = despachoPorId.get(movimiento.picking_id[0])?.despacho;
    if (!linea || linea.despachoAbierto || !despacho) continue;
    const fecha = despacho.scheduled_date
      ? fechaCaracas.format(new Date(despacho.scheduled_date.replace(" ", "T") + "Z"))
      : null;
    linea.despachoAbierto = despacho.name;
    linea.fechaPrevista = fecha;
  }

  return resultado;
}
