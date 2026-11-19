// Chequeo de lo puro de Cupo de crédito (lib/cupo-credito/tipos.ts) y del DSO
// por plazo (lib/cxc/dsoPlazos.ts):
//   node scripts/check-cupo-credito.cjs
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");

function cargar(rel) {
  const fuente = fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
  const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const m = { exports: {} };
  new Function("require", "module", "exports", js)(require, m, m.exports);
  return m.exports;
}

// ---------------------------------------------------------------- cupo
const cupo = cargar("lib/cupo-credito/tipos.ts");
const c = (o) => ({
  partnerId: 1, cliente: "X", rif: "", companyId: 9, sede: "Valencia", vendedor: "Ana", vendedorId: 10, zona: "Carabobo", ciudad: "Valencia",
  plazo: "", limite: 0, usado: 0, disponible: 0, usoPct: null, excedido: 0, vencido: 0, diasVencido: 0, estado: "sin_limite", ...o,
});
const clientes = [
  c({ partnerId: 1, limite: 1000, usado: 1200, excedido: 200, usoPct: 120, estado: "excedido", vencido: 300 }),
  c({ partnerId: 2, limite: 1000, usado: 850, usoPct: 85, estado: "al_limite" }),
  // Un saldo a favor no libera cupo de otro cliente.
  c({ partnerId: 3, limite: 1000, usado: -500, usoPct: -50, estado: "sin_uso" }),
  c({ partnerId: 4, usado: 400, estado: "sin_limite", vendedor: "Luis", vendedorId: 11, zona: "" }),
  c({ partnerId: 5, limite: 2000, usado: 500, usoPct: 25, estado: "en_uso", vendedor: "Luis", vendedorId: 11, zona: "Lara", ciudad: "Barquisimeto" }),
];
const total = cupo.consolidar(clientes);
assert.strictEqual(total.conLimite, 4);
assert.strictEqual(total.limite, 5000);
assert.strictEqual(total.usado, 2550); // 1200 + 850 + 0 + 500
assert.strictEqual(total.usoPct, 51);
assert.strictEqual(total.excedidos, 1);
assert.strictEqual(total.montoExcedido, 200);
assert.strictEqual(total.alLimite, 1);
assert.strictEqual(total.sinLimite, 1);
assert.strictEqual(total.usadoSinLimite, 400);

const vend = cupo.porVendedor(clientes);
assert.deepStrictEqual(vend.map((v) => v.nombre), ["Ana", "Luis"]); // Ana tiene un excedido
assert.strictEqual(vend[0].usoPct, 68.33);
assert.strictEqual(vend[1].conLimite, 1);
assert.strictEqual(vend[1].sinLimite, 1);

const zonas = cupo.porZona(clientes);
assert.strictEqual(zonas[zonas.length - 1].nombre, "Sin ubicar");
assert.strictEqual(zonas[0].nombre, "Carabobo");
assert.strictEqual(zonas[0].ciudades[0].nombre, "Valencia");

// Histórico: una foto vieja sin id se une con el vendedor del mismo nombre.
const f = (fecha, vendedorId, vendedor, limite, usado, excedidos = 0) =>
  ({ fecha, vendedorId, vendedor, limite, usado, vencido: 0, conLimite: 1, excedidos, alLimite: 0, montoExcedido: 0 });
const h = cupo.armarHistorico([
  f("2026-11-01", null, "Ana", 1000, 500),
  f("2026-11-01", 11, "Luis", 1000, 100),
  f("2026-11-02", 10, "Ana", 1000, 800, 1),
  f("2026-11-02", 11, "Luis", 1000, 100),
]);
assert.deepStrictEqual(h.fechas, ["2026-11-01", "2026-11-02"]);
assert.strictEqual(h.vendedores.length, 2);
assert.strictEqual(h.total[0].usoPct, 30);
assert.strictEqual(h.total[1].usoPct, 45);
const ana = h.vendedores.find((v) => v.nombre === "Ana");
assert.strictEqual(ana.cambioPts, 30);
assert.strictEqual(ana.diasConExcedidos, 1);
assert.strictEqual(ana.usoPromedio, 65);

// ---------------------------------------------------------------- DSO por plazo
const dso = cargar("lib/cxc/dsoPlazos.ts");
assert.strictEqual(dso.tramoDePlazo(0), "hasta15");
assert.strictEqual(dso.tramoDePlazo(15), "hasta15");
assert.strictEqual(dso.tramoDePlazo(30), "hasta30");
assert.strictEqual(dso.tramoDePlazo(45), "hasta45");
assert.strictEqual(dso.tramoDePlazo(90), "mas60");
assert.strictEqual(dso.tramoDePlazo(null), "sin_plazo");
assert.strictEqual(dso.diasDePlazo("2026-11-01", "2026-12-01"), 30);

const d = (o) => ({ id: 1, companyId: 9, partnerId: 1, esNC: false, revierte: null, fecha: "2026-11-01", vence: "2026-12-01", saldo: 0, venta: 0, ...o });
const docs = [
  d({ id: 1, partnerId: 1, saldo: 1000, venta: 1000 }),                                            // 30 días
  d({ id: 2, partnerId: 1, esNC: true, revierte: 1, fecha: "2026-11-10", vence: "2026-11-10", venta: -100 }), // NC: plazo de la factura 1
  d({ id: 3, partnerId: 2, vence: "2026-11-16", saldo: 300, venta: 600 }),                          // 15 días
  d({ id: 4, partnerId: 3, esNC: true, revierte: 99, fecha: "2026-11-05", vence: "2026-11-05", saldo: -50 }), // factura afuera: 60 días
  d({ id: 5, partnerId: 4, esNC: true, revierte: null, fecha: "2026-11-05", vence: "2026-11-05", saldo: -10 }), // sin nada: sin plazo
];
const plazos = dso.plazosDeDocs(docs, new Map([[99, 60]]));
assert.strictEqual(plazos.get(2), 30);
assert.strictEqual(plazos.get(4), 60);
assert.strictEqual(plazos.get(5), null);
const tramos = dso.dsoPorTramo(docs, plazos, 30);
const t30 = tramos.find((t) => t.id === "hasta30");
assert.strictEqual(t30.saldo, 1000);
assert.strictEqual(t30.ventas, 900);
assert.strictEqual(t30.dso, 33);
assert.strictEqual(t30.plazoPromedio, 30);
assert.strictEqual(t30.atraso, 3);
const t15 = tramos.find((t) => t.id === "hasta15");
assert.strictEqual(t15.dso, 15);
assert.strictEqual(t15.atraso, 0);
assert.strictEqual(tramos.find((t) => t.id === "hasta60").dso, null); // sin ventas
assert.ok(tramos.find((t) => t.id === "sin_plazo"));

const g = dso.grupoDso(docs.slice(0, 2), 30);
assert.strictEqual(g.saldo, 1000);
assert.strictEqual(g.ventas, 900);
assert.strictEqual(g.dso, 33);
assert.strictEqual(g.clientes, 1);

console.log("check-cupo-credito: OK");
