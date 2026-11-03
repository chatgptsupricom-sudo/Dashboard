// Chequeo de la conciliacion bancaria (lectura de estados de cuenta y cruce):
//   node scripts/check-bancos.cjs
// Transpila lib/administracion/bancosCruce.ts con TypeScript (no usa la base).
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");

const fuente = fs.readFileSync(path.join(__dirname, "..", "lib/administracion/bancosCruce.ts"), "utf8");
const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = { exports: {} };
new Function("require", "module", "exports", js)(require, m, m.exports);
const { leerFilasExcel, armarEstado, montoDeCelda, fechaDeCelda, mismaReferencia, cruzarBanco } = m.exports;

// Montos y fechas
assert.strictEqual(montoDeCelda("+1.394.295,35"), 1394295.35);
assert.strictEqual(montoDeCelda("-391,00"), -391);
assert.strictEqual(montoDeCelda("136,108.70"), 136108.7);
assert.strictEqual(montoDeCelda("204.000"), 204000);
assert.strictEqual(montoDeCelda("(50.00)"), -50);
assert.strictEqual(montoDeCelda(1155), 1155);
assert.strictEqual(fechaDeCelda("2026/10/22"), "2026-10-22");
assert.strictEqual(fechaDeCelda("27/10/2026"), "2026-10-27");
assert.strictEqual(fechaDeCelda(46322), "2026-10-27");
assert.strictEqual(fechaDeCelda("31/02/2026"), null);

// Referencias: ceros adelante, prefijos del banco, ACH
assert.ok(mismaReferencia("00000694003", "694003"));
assert.ok(mismaReferencia("20467137440", "67137440"));
assert.ok(mismaReferencia("0025505198339", "25505198339"));
assert.ok(mismaReferencia("ACH-10092026I920175", "I920175"));
assert.ok(!mismaReferencia("51895207", "00047710548"));
assert.ok(!mismaReferencia("", ""));

// Formato Mercantil: encabezado con datos de la empresa arriba, saldo inicial/final
const mercantil = leerFilasExcel([
  ["Nombre empresa:", "EMPRESA DE PRUEBA, C.A.", "Monto total:", "1.000,00", ""],
  ["Nro. Cuenta:", "0000000001", "", "", ""],
  ["Fecha", "Referencia", "Descripción", "Monto", "Saldo"],
  ["24/10/2026", "   ", "SALDO INICIAL", "0,00", "0,00"],
  ["27/10/2026", "20467137440", "CREDITO INMEDIATO CAMARA DE COMPENSACION", "887.400,00", "4.416.400,89"],
  ["", "82558667850", "PAGO MOVIL COMERCIAL INTERBANCARIO", "26.000,00", "4.442.400,89"],
  ["27/10/2026", "80558667850", "COMISION PAGO MOVIL", "-391,00", "4.442.009,89"],
  ["27/10/2026", "   ", "SALDO FINAL", "4.442.009,89", "4.442.009,89"],
]);
assert.strictEqual(mercantil.filas.length, 3);
assert.strictEqual(mercantil.filas[1].fecha, "2026-10-27"); // fecha vacia = la de arriba
assert.strictEqual(mercantil.desde, "2026-10-24");
assert.strictEqual(mercantil.hasta, "2026-10-27");
assert.strictEqual(mercantil.saltos, 0);

// Formato Banesco (tabla HTML): montos con signo, falta una fila en el medio
const banesco = leerFilasExcel([
  ["Fecha", "Referencia", "Descripción", "Monto", "Balance"],
  ["2026/10/22", "00000694003", "TRF CR INM 0115 J000000001 CLIENTE UNO", "+1.394.295,35", "17.245.986,02"],
  ["2026/10/22", "00000694142", "TRF CR INM 0115 J000000001 CLIENTE UNO", "+99.820,24", "17.345.806,26"],
  ["2026/10/22", "13417591504", "TRFOB 0108 J000000002 PROVEEDOR", "-13.120,95", "18.000.000,00"],
]);
assert.strictEqual(banesco.filas[0].monto, 1394295.35);
assert.strictEqual(banesco.saltos, 1);

// Debito / Credito en columnas separadas
const separado = leerFilasExcel([
  ["Fecha", "Concepto", "Débito", "Crédito", "Saldo"],
  ["01/10/2026", "DEPOSITO", "", "100,00", "100,00"],
  ["02/10/2026", "COMISION", "5,00", "", "95,00"],
]);
assert.deepStrictEqual(separado.filas.map((f) => f.monto), [100, -5]);

// Captura sin signo, lo mas nuevo arriba (Banesco Panama): el signo sale del saldo
const panama = armarEstado([
  { fecha: "2026-10-27", referencia: "", descripcion: "Transf DE CUENTA NO.- 221023059068", monto: 3321.2, saldo: 573812.91 },
  { fecha: "2026-10-26", referencia: "", descripcion: "PAGO PROVEEDOR", monto: 1000, saldo: 570491.71 },
  { fecha: "2026-10-26", referencia: "", descripcion: "Transf DE CUENTA NO.- 221021542357", monto: 136108.7, saldo: 571491.71 },
  { fecha: "2026-10-26", referencia: "", descripcion: "Transf", monto: 247, saldo: 435383.01 },
]);
assert.deepStrictEqual(panama.filas.map((f) => f.monto), [3321.2, -1000, 136108.7, 247]);
assert.strictEqual(panama.saltos, 0);

// Cruce
const mov = (id, fecha, referencia, monto, descripcion = "") => ({ id, fecha, referencia, descripcion, monto, saldo: null });
const movimientos = [
  mov("a".repeat(64), "2026-10-27", "20467137440", 887400),
  mov("b".repeat(64), "2026-10-26", "", 136108.7, "Transf Banesco Online DE CUENTA NO.- 221021542357 A"),
  mov("c".repeat(64), "2026-10-26", "", 247),
  mov("d".repeat(64), "2026-10-27", "80558667850", -391),
  mov("e".repeat(64), "2026-10-22", "00000302398", 280789.6),
];
const pagos = [
  { id: 1, nombre: "PMERCA/1", fecha: "2026-10-26", monto: 887400, cliente: "Cliente A", ref: "67137440" },
  { id: 2, nombre: "PBANEP/1", fecha: "2026-10-26", monto: 136108.7, cliente: "Cliente B", ref: "FT26299HGVGCF" },
  { id: 3, nombre: "PBANES/1", fecha: "2026-10-22", monto: 280789.6, cliente: "Cliente C", ref: "100676544" },
  { id: 4, nombre: "PBANES/2", fecha: "2026-10-23", monto: 5000, cliente: "Cliente D", ref: "999999" },
  { id: 5, nombre: "PBANES/3", fecha: "2026-10-10", monto: 7000, cliente: "Cliente E", ref: "888888" },
];
const comp = (id, fecha, referencia, monto, cuentaOrigen = "") => ({
  id, fecha, referencia, monto, moneda: "USD", cuentaOrigen, banco: "", motivo: "", cliente: `C${id}`, movimientoId: null, archivoNombre: "", subidoPor: "",
});
const comprobantes = [
  comp(10, "2026-10-26", "FT26299HGVGCF", 136108.7, "2357"), // por la ref del cobro de Odoo
  comp(11, "2026-10-26", "XYZ123456", 247), // un solo movimiento de ese monto, sin cobro en Odoo
  comp(12, "2026-10-25", "ABC999999", 999), // no esta en el banco
  comp(13, "2026-10-01", "QWE111111", 50), // dia sin estado de cuenta
];
const cubierto = (d) => d >= "2026-10-22" && d <= "2026-10-27";
const r = cruzarBanco(movimientos, pagos, comprobantes, new Map(), cubierto);
const estadoMov = Object.fromEntries(r.movimientos.map((x) => [x.id[0], [x.estado, x.pago?.id ?? null]]));
assert.deepStrictEqual(estadoMov, {
  a: ["referencia", 1],
  b: ["por_monto", 2],
  c: ["sin_registrar", null],
  e: ["por_monto", 3],
});
assert.deepStrictEqual(r.comprobantes.map((c) => c.estado), ["conciliado", "sin_registrar", "no_encontrado", "sin_estado"]);
assert.deepStrictEqual(r.pagosSinMovimiento.map((p) => p.id), [4]); // el 5 es de un dia sin estado de cuenta

// A mano: el movimiento c con el cobro 4 aunque el monto no coincida
const manual = cruzarBanco(movimientos, pagos, [], new Map([["c".repeat(64), 4]]), cubierto);
assert.deepStrictEqual(
  manual.movimientos.filter((x) => x.id[0] === "c").map((x) => [x.estado, x.pago.id]),
  [["manual", 4]],
);

console.log("check-bancos: OK");
