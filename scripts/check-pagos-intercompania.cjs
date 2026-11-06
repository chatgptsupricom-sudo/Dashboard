// Chequeo del cruce de Pagos entre sedes (lib/administracion/pagosIntercompaniaCruce.ts):
//   node scripts/check-pagos-intercompania.cjs
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");

const fuente = fs.readFileSync(path.join(__dirname, "..", "lib/administracion/pagosIntercompaniaCruce.ts"), "utf8");
const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = { exports: {} };
new Function("require", "module", "exports", js)(require, m, m.exports);
const { sedeDePartner, buscarEquivalente, claveNumero } = m.exports;

// Nombres de las sedes en los libros de las otras (nov-2026).
assert.strictEqual(sedeDePartner("OFFICE SOLUTIONS CENTER 2004, C.A"), "valencia");
assert.strictEqual(sedeDePartner("OFFICE SOLUTIONS CENTER 2004, C.A. (OSC - ASTA)."), "valencia");
assert.strictEqual(sedeDePartner("SUPRICOM CCS 21, C.A."), "caracas");
assert.strictEqual(sedeDePartner("SUPRICOM, S.A."), "panama");
assert.strictEqual(sedeDePartner("Supricom, S.A"), "panama");
for (const n of ["SUPRICOM, LLC", "SUPRICOM USA, LLC", "SUPRICOM LLC", "SUPRICOM GASTOS", "Ofimaster Panama", "CLIENTE X"]) {
  assert.strictEqual(sedeDePartner(n), null, n);
}

assert.strictEqual(claveNumero("FCLIE/2026/04434"), "4434");
assert.strictEqual(claveNumero("5039017"), "5039017");

const f = (id, numero, total, fecha = "2026-10-28", tipo = "out_invoice") => ({
  id, numero, tipo, fecha, total, saldo: total, estadoPago: "not_paid",
});
const valencia = [f(1, "5039017", 240058.48), f(2, "5039018", 198762.73), f(3, "5036216", 491, "2026-06-10"), f(4, "5034375", 332.66, "2026-03-01")];
const caracas = [f(10, "FCLIE/2026/04434", 1891), f(11, "FCLIE/2026/02026", 50), f(12, "FCLIE/2026/03024", 5688)];
const panama = [f(20, "INV/2026/07120", 225.22, "2026-09-08"), f(21, "INV/2026/05525", 224.72, "2026-08-01")];

assert.strictEqual(buscarEquivalente("5039017", "in_invoice", "2026-10-29", 240058.48, valencia).factura.id, 1);
assert.strictEqual(buscarEquivalente("FACT 5036216 - HONORARIOS PROFESIONALES MAYO 2026", "in_invoice", "2026-06-17", 491, valencia).factura.id, 3);
assert.strictEqual(buscarEquivalente("Importación Masiva - FAC 5034375", "in_invoice", "2026-03-25", 332.66, valencia).factura.id, 4);
assert.strictEqual(buscarEquivalente("5038097.", "in_invoice", "2026-09-17", 1, valencia), null);
assert.strictEqual(buscarEquivalente("04434", "in_invoice", "2026-09-30", 1891, caracas).factura.id, 10);
// "FCLI/2026/03024": el 2026 tambien es numero de otra factura; desempata el monto.
assert.strictEqual(buscarEquivalente("FCLI/2026/03024", "in_invoice", "2026-08-04", 5688, caracas).factura.id, 12);
// Panama: la ref es el numero fiscal; se toma la unica del mismo monto en ±15 dias.
const p = buscarEquivalente("0000007281", "in_invoice", "2026-09-10", 225.22, panama);
assert.ok(p && p.factura.id === 20 && p.porMonto);
// Una nota de credito no se cruza con una factura.
assert.strictEqual(buscarEquivalente("5039017", "in_refund", "2026-10-29", 240058.48, valencia), null);

console.log("check-pagos-intercompania: OK");
