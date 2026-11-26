// Chequeo del reporte "Mercancía comprada a Valencia":
//   node scripts/check-mercancia-valencia.cjs
// Transpila lib/ventas/mercanciaValenciaTipos.ts con TypeScript (no usa Odoo).
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");

const fuente = fs.readFileSync(path.join(__dirname, "..", "lib/ventas/mercanciaValenciaTipos.ts"), "utf8");
const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = { exports: {} };
new Function("require", "module", "exports", js)(require, m, m.exports);
const { armarLinea, delMes, resumir, porProducto } = m.exports;

const HOY = "2026-11-26";
const base = (o) => ({
  lineaId: 1, pedido: "S-1", pedidoId: 1, facturas: ["F1"], fechaFactura: "2026-11-20",
  productoId: 10, codigo: "A", producto: "Prod A", marca: "M", facturado: 10, despachado: 4,
  precio: 2.5, despachoAbierto: "VAL/OUT/1", fechaPrevista: null, ...o,
});

// Pendiente = facturado − despachado, con monto y días de espera
const a = armarLinea(base({}), HOY);
assert.strictEqual(a.pendiente, 6);
assert.strictEqual(a.montoPendiente, 15);
assert.strictEqual(a.montoFacturado, 25);
assert.strictEqual(a.diasEsperando, 6);

// Despachado de más (o sin facturar todo) nunca da pendiente negativo ni días
const b = armarLinea(base({ lineaId: 2, despachado: 12, fechaFactura: "2026-10-01" }), HOY);
assert.strictEqual(b.pendiente, 0);
assert.strictEqual(b.despachado, 10);
assert.strictEqual(b.diasEsperando, null);

// Otro pedido del mismo producto suma en "por producto" y toma la factura más vieja
const c = armarLinea(base({ lineaId: 3, pedidoId: 2, pedido: "S-2", facturado: 3, despachado: 0, fechaFactura: "2026-11-01" }), HOY);
const prods = porProducto([a, b, c], HOY);
assert.strictEqual(prods.length, 1);
assert.strictEqual(prods[0].pendiente, 9);
assert.strictEqual(prods[0].pedidos, 2);
assert.strictEqual(prods[0].desde, "2026-11-01");
assert.strictEqual(prods[0].diasEsperando, 25);

// Filtro de mes por fecha de factura y resumen (lo despachado de más no infla)
assert.deepStrictEqual(delMes([a, b, c], "2026-10").map((l) => l.lineaId), [2]);
assert.strictEqual(delMes([a, b, c], "todos").length, 3);
const r = resumir([a, b, c]);
assert.strictEqual(r.facturado, 23);
assert.strictEqual(r.despachado, 14);
assert.strictEqual(r.pendiente, 9);
assert.strictEqual(r.pedidos, 2);
assert.strictEqual(r.productosPendientes, 1);

// Odoo simulado: una factura emitida, una NC emitida y un borrador del mismo renglón.
// Otro renglón del pedido no debe heredar el despacho del primero.
async function checkOdoo() {
  const assertDomain = (args, condition) => assert.ok(args[0].some((term) => JSON.stringify(term) === JSON.stringify(condition)));
  const renglon = {
    order_id: [1, "S-1"], product_uom: [1, "Units"], product_uom_qty: 24,
    qty_delivered: 2, price_subtotal: 60,
  };
  const apunte = (id, move, uom, quantity, state) => ({
    id, move_id: [move, "Documento"], product_uom_id: [uom, "Unidad"], quantity, state,
  });
  const rpc = async (modelo, _metodo, args) => {
    switch (modelo) {
      case "sale.order.line":
        assertDomain(args, ["invoice_lines.move_id.state", "=", "posted"]);
        return [
          { ...renglon, id: 1, product_id: [10, "A"], invoice_lines: [101, 102, 103] },
          { ...renglon, id: 2, product_id: [20, "B"], invoice_lines: [104] },
        ];
      case "account.move.line":
        assertDomain(args, ["parent_state", "=", "posted"]);
        assertDomain(args, ["display_type", "=", "product"]);
        return [
          apunte(101, 11, 2, 2, "posted"),
          apunte(102, 12, 1, 4, "posted"),
          apunte(103, 13, 1, 90, "draft"),
          apunte(104, 11, 1, 8, "posted"),
        ].filter((a) => a.state === "posted");
      case "account.move":
        return [
          { id: 11, name: "F1", invoice_date: "2026-11-20", move_type: "out_invoice" },
          { id: 12, name: "NC1", invoice_date: "2026-11-22", move_type: "out_refund" },
        ];
      case "uom.uom":
        return [{ id: 1, factor: 1 }, { id: 2, factor: 1 / 12 }];
      case "product.product":
        return [];
      case "stock.move":
        return [
          { sale_line_id: [1, "A"], picking_id: [21, "OUT-21"] },
          { sale_line_id: [1, "A"], picking_id: [20, "OUT-20"] },
        ];
      case "stock.picking":
        return [
          { id: 20, name: "OUT-20", scheduled_date: "2026-11-26 02:00:00" },
          { id: 21, name: "OUT-21", scheduled_date: "2026-11-26 03:00:00" },
        ];
      default:
        throw new Error("Modelo inesperado: " + modelo);
    }
  };

  const consulta = fs.readFileSync(path.join(__dirname, "..", "lib/ventas/mercanciaValencia.ts"), "utf8");
  const codigo = ts.transpileModule(consulta, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const modulo = { exports: {} };
  const imports = {
    "@/lib/odoo": { callOdooRPCEstricto: rpc },
    "@/lib/smartbit": { CORTE_ODOO: "2026-04-01" },
    "@/lib/ventas/mercanciaValenciaTipos": m.exports,
  };
  new Function("require", "module", "exports", codigo)((nombre) => imports[nombre], modulo, modulo.exports);
  const [primero, segundo] = await modulo.exports.lineasCaracas(HOY);
  assert.strictEqual(primero.facturado, 20);
  assert.strictEqual(primero.pendiente, 18);
  assert.deepStrictEqual(primero.facturas, ["F1"]);
  assert.strictEqual(primero.despachoAbierto, "OUT-20");
  assert.strictEqual(primero.fechaPrevista, "2026-11-25");
  assert.strictEqual(segundo.despachoAbierto, null);
}

checkOdoo().then(() => console.log("check-mercancia-valencia: OK")).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
