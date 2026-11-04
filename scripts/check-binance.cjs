// Chequeo del cruce de la Conciliación Binance (cruzar de lib/administracion/binance.ts):
//   node scripts/check-binance.cjs
// Transpila el módulo con TypeScript y reemplaza la base, Odoo y las IA por stubs.
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");

const fuente = fs.readFileSync(path.join(__dirname, "..", "lib/administracion/binance.ts"), "utf8");
const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const stubs = {
  "@/lib/db": { db: {}, query: async () => ({ rows: [] }) },
  "@/lib/auth/sedeRol": { esRolAdministracion: () => false, sedeDelToken: () => null },
  "@/lib/odoo": { callOdooRPCEstricto: async () => [] },
  "@anthropic-ai/sdk": function () {},
  openai: function () {},
};
const m = { exports: {} };
new Function("require", "module", "exports", js)((id) => stubs[id] ?? require(id), m, m.exports);
const { cruzar } = m.exports;

const base = (id, fecha, monto, extra = {}) => ({
  id, orderId: String(id), monto, moneda: "USDT", fecha, fechaEstimada: false, soloDia: false, horaTelefono: false,
  cliente: "Cliente", movimientoId: null, archivoNombre: "", subidoPor: "", subidoEl: "", ...extra,
});
const pago = (id, fecha, monto, pagador = "Otro") => ({ id: `e${id}`, fecha, monto, moneda: "USDT", tipo: "Estado de cuenta", pagador });
const estados = (bases, pagos) => cruzar(bases, pagos, "estado").comprobantes.map((c) => [c.estado, c.binance?.id ?? null]);

// Misma hora: conciliado (monto único, aunque el pagador no se parezca).
assert.deepStrictEqual(estados([base(1, "2026-11-02T14:56:21Z", 40000)], [pago(1, "2026-11-02T14:56:00Z", 40000, "Tecnomax2023")]), [["conciliado", "e1"]]);

// El caso de nov-2026: comprobante 10:56 Caracas, estado 9:56 (otra zona). Monto único: por revisar, no "no encontrado".
assert.deepStrictEqual(
  estados([base(1, "2026-11-02T14:56:21Z", 40000)], [pago(1, "2026-11-02T13:56:00Z", 40000, "Tecnomax2023"), pago(2, "2026-11-02T13:56:00Z", 50)]),
  [["por_monto_hora", "e1"]],
);

// Comprobante leído como Caracas cuando decía UTC (4 h corrido): también por revisar.
assert.deepStrictEqual(estados([base(1, "2026-11-02T18:56:21Z", 40000)], [pago(1, "2026-11-02T13:56:00Z", 40000)]), [["por_monto_hora", "e1"]]);

// Monto repetido en la semana con la hora distinta: no se adivina.
assert.deepStrictEqual(
  estados([base(1, "2026-11-02T14:56:21Z", 100)], [pago(1, "2026-11-02T13:56:00Z", 100), pago(2, "2026-11-04T13:00:00Z", 100)]),
  [["no_encontrado", null]],
);

// Más de 13 h de diferencia: no es ese pago.
assert.deepStrictEqual(estados([base(1, "2026-11-02T14:56:21Z", 40000)], [pago(1, "2026-11-03T05:00:00Z", 40000)]), [["no_encontrado", null]]);

// El pago ya lo tomó otro comprobante con la hora exacta: el de la otra zona no lo roba.
assert.deepStrictEqual(
  estados([base(1, "2026-11-02T13:56:10Z", 40000), base(2, "2026-11-02T20:00:00Z", 40000)], [pago(1, "2026-11-02T13:56:00Z", 40000)]),
  [["conciliado", "e1"], ["no_encontrado", null]],
);

console.log("check-binance: OK");
