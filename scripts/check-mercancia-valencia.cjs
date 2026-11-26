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

console.log("check-mercancia-valencia: OK");
