// Chequeo del criterio de «Excluir impuestos» (lib/cxc/impuestos.ts):
//   node scripts/check-impuestos.cjs
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");

const fuente = fs.readFileSync(path.join(__dirname, "..", "lib/cxc/impuestos.ts"), "utf8");
const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = { exports: {} };
new Function("require", "module", "exports", js)(require, m, m.exports);
const { esImpuesto, dominioSinImpuestos } = m.exports;

// Impuestos: 25% de IVA, IGTF, ISLR, retenciones (descripción o diario).
for (const t of ["25% de IVA factura 5038191-31139", "pago IGTF FACTURAS 5037774", "iva + igtf fact 31184 nota 538485",
  "5037285-31180 25% DEL IVA", "PAGO BASE + 25% DE IVA 5038553-31187", "igtf 5038324-31156", "25% E IGTF FACTURA 5038596-"]) {
  assert.ok(esImpuesto(t), t);
}
assert.ok(esImpuesto("", "IVA RETENIDO POR CLIENTE"));
// Cobros de facturas: se quedan.
for (const t of ["ABONO", "pago", "ABONO EDO DE CUENTA", "orden 5963", "ARTICULOS DE OFICINA", "5038166", "pago factura 5038495",
  "DIF DE LA FACT 5036125", "s-06044", "PEDIDO 5963", "cuenta activa", "efectiva", "derivados"]) {
  assert.ok(!esImpuesto(t, "Banesco 4182"), t);
}
// Dominio de Odoo bien armado: "|", sin pago, y los "&" que hacen falta.
const d = dominioSinImpuestos("credit_move_id.");
assert.strictEqual(d[0], "|");
assert.strictEqual(d.filter((x) => x === "&").length, d.filter((x) => Array.isArray(x)).length - 2);

console.log("check-impuestos: OK");
