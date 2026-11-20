// Chequeo del cruce de SKUs de Compras › Validar factura:
//   node scripts/check-validar-factura.cjs
// Transpila lib/compras/validarFacturaCruce.ts con TypeScript (no usa Odoo).
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");

const fuente = fs.readFileSync(path.join(__dirname, "..", "lib/compras/validarFacturaCruce.ts"), "utf8");
const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = { exports: {} };
new Function("require", "module", "exports", js)(require, m, m.exports);
const { indexar, cruzar, normalizar } = m.exports;

const p = (id, codigo, nombre = "", extra = {}) => ({ id, codigo, nombre, barcode: "", activo: true, categoria: "", marca: "", ...extra });
const indice = indexar([
  p(1, "C11CL62301", "EPSON ECOTANK L3350"),
  p(2, "T544120-AL", "EPSON BLACK"),
  p(3, "90LM02W0-B011I1", "ASUS MONITOR"),
  p(4, "VIEJO01", "ARCHIVADO", { activo: false }),
  p(5, "", "NX.DTBAL.001"),
  p(6, "ABC123", "CON BARRAS", { barcode: "7501234567890" }),
]);
const estado = (codigo) => cruzar(codigo, indice).estado;

assert.strictEqual(normalizar(" c11cl-623.01 "), "C11CL62301");
// Igual, sin importar mayusculas ni espacios alrededor
assert.strictEqual(estado("c11cl62301 "), "en_odoo");
// Archivado
assert.strictEqual(estado("VIEJO01"), "archivado");
// Mismo SKU con otro formato
assert.strictEqual(estado("T544120AL"), "sku_distinto");
assert.strictEqual(estado("90LM02W0 B011I1"), "sku_distinto");
// Codigo de barras
assert.strictEqual(estado("7501234567890"), "por_barcode");
// Uno dentro del otro, o el codigo en el nombre de un producto sin SKU
assert.strictEqual(estado("C11CL62301-LA"), "posible");
assert.deepStrictEqual(cruzar("NXDTBAL001", indice).coincidencias.map((x) => x.id), [5]);
// Corto: no busca parecidos
assert.strictEqual(estado("ABC1"), "no_existe");
assert.strictEqual(estado("ZZZ99999"), "no_existe");
assert.strictEqual(estado("--"), "no_existe");

console.log("check-validar-factura: ok");
