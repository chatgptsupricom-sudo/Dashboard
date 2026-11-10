// Chequeo del reparto de un packing list entre Valencia y Caracas:
//   node scripts/check-reparto-sedes.cjs
// Transpila lib/recepcion/repartoSedes.ts con TypeScript (no usa la base ni Odoo).
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");

const fuente = fs.readFileSync(path.join(__dirname, "..", "lib/recepcion/repartoSedes.ts"), "utf8");
const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = { exports: {} };
new Function("require", "module", "exports", js)(require, m, m.exports);
const {
  pctCuotaCaracas,
  objetivoCaracas,
  cantidadParaCaracas,
  unidadesPorCaja,
  agruparRenglones,
  lineaAutomatica,
  resumirReparto,
  conCantidadManual,
  conAutomatico,
  errorCantidadManual,
  diferenciasConPacking,
  normalizarParametros,
  claveProducto,
  puedeRepartirse,
  fraccionDeRenglon,
} = m.exports;

const cerca = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} != ${b}`);

// Cuota: el ejemplo del pedido (1.400.000 Caracas / 1.600.000 Valencia = 40 %)
cerca(pctCuotaCaracas(1_600_000, 1_400_000), 1_400_000 / 3_000_000, "cuota exacta");
assert.strictEqual(pctCuotaCaracas(0, 0), null);
cerca(pctCuotaCaracas(0, 500), 1, "solo Caracas con cuota");

// Objetivo: sin ventas = cuota; 60 % de la venta en Caracas con peso 0.5 → 50 %
let o = objetivoCaracas(0, 0, 0.4, 0.5);
assert.strictEqual(o.base, "cuota");
cerca(o.pct, 0.4, "sin ventas");
o = objetivoCaracas(40, 60, 0.4, 0.5);
assert.strictEqual(o.base, "rotacion");
cerca(o.pctRotacion, 0.6, "rotación");
cerca(o.pct, 0.5, "ejemplo del pedido: sube a 50 %");
cerca(objetivoCaracas(40, 60, 0.4, 0).pct, 0.4, "peso 0 = solo cuota");
cerca(objetivoCaracas(40, 60, 0.4, 1).pct, 0.6, "peso 1 = solo rotación");
cerca(objetivoCaracas(-5, 10, 0.4, 1).pct, 1, "NC que deja negativa una sede cuenta como 0");
cerca(objetivoCaracas(100, 0, 0.4, 0.5).pct, 0.2, "solo vende Valencia");

// Cantidades: cajas completas si caben exactas, si no unidades enteras
assert.strictEqual(unidadesPorCaja(100, 10), 10);
assert.strictEqual(unidadesPorCaja(100, 3), null);
assert.strictEqual(unidadesPorCaja(100, null), null);
let c = cantidadParaCaracas(100, 10, 0.44);
assert.deepStrictEqual(c, { caracas: 40, porCaja: 10 }, "4,4 cajas → 4 cajas");
c = cantidadParaCaracas(100, 10, 0.46);
assert.deepStrictEqual(c, { caracas: 50, porCaja: 10 }, "4,6 cajas → 5 cajas");
c = cantidadParaCaracas(100, 3, 0.4);
assert.deepStrictEqual(c, { caracas: 40, porCaja: null });
c = cantidadParaCaracas(7, null, 0.5);
assert.strictEqual(c.caracas, 4, "3,5 → 4");
c = cantidadParaCaracas(2.5, null, 1);
assert.strictEqual(c.caracas, 2, "nunca más que la parte entera de una cantidad con decimales");
c = cantidadParaCaracas(10, null, 1.5);
assert.strictEqual(c.caracas, 10, "% acotado a 100");
c = cantidadParaCaracas(10, null, -1);
assert.strictEqual(c.caracas, 0, "% acotado a 0");

// Agrupar: la Factura Especial de Caracas NUNCA entra; mismo código se suma
const items = [
  { id: 1, codigo: "ab 123", producto: "Uno", cantidad_esperada: "60", cajas_esperadas: 6, cantidad_recibida: null },
  { id: 2, codigo: "AB123", producto: "Uno", cantidad_esperada: "40", cajas_esperadas: 4, cantidad_recibida: "38" },
  { id: 3, codigo: "AB123", producto: "Uno", cantidad_esperada: "25", cajas_esperadas: null, factura_aparte: "INV1062" },
  { id: 4, codigo: "", producto: "Sin  código", cantidad_esperada: "5", cajas_esperadas: null },
  { id: 5, codigo: "ZZ", producto: "Cero", cantidad_esperada: "0" },
  { id: 6, codigo: "XY", producto: "Especial sin número", cantidad_esperada: "9", factura_aparte: "FACTURA ESPECIAL" },
];
const g = agruparRenglones(items, "esperada");
assert.strictEqual(g.length, 2, "Factura Especial y cantidad 0 fuera");
assert.strictEqual(g[0].clave, "AB123");
assert.strictEqual(g[0].cantidad, 100);
assert.strictEqual(g[0].cajas, 10);
assert.deepStrictEqual(g[0].renglones, [1, 2]);
assert.strictEqual(g[1].clave, "N:SIN CÓDIGO");
assert.ok(!g.some((p) => p.clave === "XY"), "la Factura Especial sin número tampoco entra");
const gr = agruparRenglones(items, "recibida");
assert.strictEqual(gr.length, 1, "lo no contado (null) queda en 0");
assert.strictEqual(gr[0].cantidad, 38);
assert.strictEqual(claveProducto(" ab 123 ", "x"), "AB123");

// Línea automática + resumen: el % del contenedor sube si viene lo que vende Caracas
const params = normalizarParametros({});
assert.deepStrictEqual(params, { pesoRotacion: 0.5, ventanaDias: 90 });
assert.deepStrictEqual(normalizarParametros({ pesoRotacion: 7, ventanaDias: 12 }), { pesoRotacion: 1, ventanaDias: 90 });
const l1 = lineaAutomatica(
  { clave: "A", codigo: "A", producto: "A", odooProductId: 1, cantidad: 100, cajas: 10 },
  { ventasValencia: 20, ventasCaracas: 80, stockValencia: 0, stockCaracas: 0, costo: 10 },
  0.4,
  params,
);
cerca(l1.pctObjetivoCaracas, 0.6, "0.5·0.8 + 0.5·0.4");
assert.strictEqual(l1.cantidadCaracas, 60);
assert.strictEqual(l1.cantidadValencia, 40);
const l2 = lineaAutomatica(
  { clave: "B", codigo: "B", producto: "B", odooProductId: 2, cantidad: 50, cajas: null },
  { ventasValencia: 0, ventasCaracas: 0, stockValencia: null, stockCaracas: null, costo: null },
  0.4,
  params,
);
assert.strictEqual(l2.base, "cuota");
assert.strictEqual(l2.cantidadCaracas, 20);
const r = resumirReparto([l1, l2]);
assert.strictEqual(r.unidades, 150);
assert.strictEqual(r.unidadesCaracas, 80);
cerca(r.pctUnidadesCaracas, 80 / 150, "% unidades");
cerca(r.pctValorCaracas, 0.6, "% valor solo con costo");
assert.strictEqual(r.sinCosto, 1);
assert.strictEqual(r.sinVentas, 1);
assert.ok(r.pctUnidadesCaracas > 0.4, "sube por encima de la cuota");

// Manual
assert.strictEqual(errorCantidadManual("", 10) !== null, true);
assert.strictEqual(errorCantidadManual(-1, 10) !== null, true);
assert.strictEqual(errorCantidadManual(11, 10) !== null, true);
assert.strictEqual(errorCantidadManual(1.2345, 10) !== null, true);
assert.strictEqual(errorCantidadManual(10, 10), null);
assert.strictEqual(errorCantidadManual("0", 10), null);
const lm = conCantidadManual(l1, 30, "pedido de Caracas");
assert.strictEqual(lm.origen, "manual");
assert.strictEqual(lm.cantidadValencia, 70);
assert.strictEqual(lm.autoCaracas, 60, "el automático queda guardado");
const la = conAutomatico(lm);
assert.strictEqual(la.cantidadCaracas, 60);
assert.strictEqual(la.origen, "auto");

// Diferencias con el packing list
assert.deepStrictEqual(diferenciasConPacking([{ clave: "A", cantidad: 100 }], [{ clave: "A", cantidad: 100 }]), []);
assert.deepStrictEqual(diferenciasConPacking([{ clave: "A", cantidad: 100 }], [{ clave: "A", cantidad: 98 }, { clave: "C", cantidad: 5 }]), [
  { clave: "A", enReparto: 100, enPacking: 98 },
  { clave: "C", enReparto: 0, enPacking: 5 },
]);

// Solo packing list de Valencia o Caracas
assert.ok(puedeRepartirse(9, "packing_list"));
assert.ok(puedeRepartirse("10"));
assert.ok(!puedeRepartirse(7, "packing_list"));
assert.ok(!puedeRepartirse(9, "factura"));

// Cajas: renglones con cajas de distinto tamaño no se reparten por cajas
// (20/2 = 10 u/caja y 40/8 = 5 u/caja darían 60/10 = 6, una caja que no existe)
let gc = agruparRenglones([
  { codigo: "C1", producto: "x", cantidad_esperada: 20, cajas_esperadas: 2 },
  { codigo: "C1", producto: "x", cantidad_esperada: 40, cajas_esperadas: 8 },
], "esperada");
assert.strictEqual(gc[0].cajas, null, "tamaños distintos: sin cajas");
gc = agruparRenglones([
  { codigo: "C1", producto: "x", cantidad_esperada: 20, cajas_esperadas: 2 },
  { codigo: "C1", producto: "x", cantidad_esperada: 30, cajas_esperadas: 3 },
], "esperada");
assert.strictEqual(gc[0].cajas, 5, "mismo tamaño: se suman");
// Con lo contado, las cajas del packing list solo valen si se contó lo esperado
gc = agruparRenglones([{ codigo: "C1", producto: "x", cantidad_esperada: 100, cantidad_recibida: 98, cajas_esperadas: 10 }], "recibida");
assert.strictEqual(gc[0].cajas, null, "contado distinto: sin cajas");
gc = agruparRenglones([{ codigo: "C1", producto: "x", cantidad_esperada: 100, cantidad_recibida: 100, cajas_esperadas: 10 }], "recibida");
assert.strictEqual(gc[0].cajas, 10, "contado igual: cajas del packing list");

// Fracción del renglón: por código y, si no, por el nombre (código puesto después)
const fr = new Map([["N:IMPRESORA X", 0.4], ["AB1", 0.7]]);
assert.strictEqual(fraccionDeRenglon(fr, "ab1", "lo que sea"), 0.7);
assert.strictEqual(fraccionDeRenglon(fr, "NUEVO-COD", "Impresora  X"), 0.4);
assert.strictEqual(fraccionDeRenglon(fr, "ZZ", "otro"), undefined);
assert.strictEqual(fraccionDeRenglon(undefined, "AB1", "x"), undefined);

console.log("check-reparto-sedes: OK");
