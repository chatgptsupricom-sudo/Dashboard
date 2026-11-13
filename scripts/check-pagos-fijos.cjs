// Chequeo de los pagos fijos del calendario de Cuentas por Pagar:
//   node scripts/check-pagos-fijos.cjs
// Transpila lib/administracion/pagosFijosCruce.ts con TypeScript (no usa la base).
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");

const fuente = fs.readFileSync(path.join(__dirname, "..", "lib/administracion/pagosFijosCruce.ts"), "utf8");
const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = { exports: {} };
new Function("require", "module", "exports", js)(require, m, m.exports);
const { fechaEnMes, cruzarPagosFijos } = m.exports;

// Dia 31 en febrero cae el ultimo dia
assert.strictEqual(fechaEnMes("2026-02", 31), "2026-02-28");
assert.strictEqual(fechaEnMes("2028-02", 30), "2028-02-29");
assert.strictEqual(fechaEnMes("2026-11", 5), "2026-11-05");

const fijo = (id, dia, monto, extra = {}) => ({
  id, sede: "valencia", nombre: `F${id}`, proveedorId: 50, proveedor: "X", monto, dia, notas: "",
  desdeMes: "2026-01", hastaMes: null, ...extra,
});
const pago = (id, fecha, monto, extra = {}) => ({ id, fecha, proveedorId: 50, monto, sede: "valencia", ...extra });

// Dos fijos al mismo proveedor: cada uno toma el pago de monto mas parecido
let r = cruzarPagosFijos([fijo(1, 5, 1000), fijo(2, 10, 300)], [pago(7, "2026-11-03", 310), pago(8, "2026-11-04", 990)], "2026-11", "2026-11-13");
assert.deepStrictEqual(r.map((x) => [x.id, x.estado, x.pagoId]), [[1, "pagado", 8], [2, "pagado", 7]]);

// Sin pago: vencido si ya paso el dia, pendiente si no
r = cruzarPagosFijos([fijo(1, 5, 100), fijo(2, 20, 100)], [], "2026-11", "2026-11-13");
assert.deepStrictEqual(r.map((x) => x.estado), ["vencido", "pendiente"]);

// Otra sede u otro proveedor no cuentan
r = cruzarPagosFijos([fijo(1, 5, 100)], [pago(9, "2026-11-02", 100, { sede: "caracas" }), pago(10, "2026-11-02", 100, { proveedorId: 51 })], "2026-11", "2026-11-13");
assert.strictEqual(r[0].estado, "vencido");

// Fuera de su vigencia no sale
assert.strictEqual(cruzarPagosFijos([fijo(1, 5, 100, { desdeMes: "2026-12" })], [], "2026-11", "2026-11-13").length, 0);
assert.strictEqual(cruzarPagosFijos([fijo(1, 5, 100, { hastaMes: "2026-10" })], [], "2026-11", "2026-11-13").length, 0);

console.log("check-pagos-fijos: OK");
