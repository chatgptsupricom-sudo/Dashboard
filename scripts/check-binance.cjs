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

// Fecha de conciliacion: el ultimo que se subio de los dos; a mano, cuando se amarro.
const { conciliadoEl } = m.exports;
const pagoSubido = { ...pago(1, "2026-11-02T14:56:00Z", 5), subidoEl: "2026-11-04T12:00:00.000Z" };
const conc = (extra) => ({ ...base(1, "2026-11-02T14:56:21Z", 5), subidoEl: "2026-11-03T10:00:00.000Z", amarradoEl: null, estado: "conciliado", binance: pagoSubido, ...extra });
assert.strictEqual(conciliadoEl(conc({})), "2026-11-04T12:00:00.000Z");
assert.strictEqual(conciliadoEl(conc({ subidoEl: "2026-11-05T09:00:00.000Z" })), "2026-11-05T09:00:00.000Z");
assert.strictEqual(conciliadoEl(conc({ estado: "manual", amarradoEl: "2026-11-06T15:00:00Z" })), "2026-11-06T15:00:00Z");
assert.strictEqual(conciliadoEl(conc({ estado: "no_encontrado", binance: null })), null);
assert.strictEqual(conciliadoEl(conc({ estado: "por_monto_hora" })), null);

// Fecha del pago desde el ID de orden (comprobantes de nov-2026 con su fecha leída, al segundo).
const { fechaDeOrden, fechaDelPago } = m.exports;
const AHORA = Date.parse("2026-11-18T12:00:00Z");
for (const [id, fecha] of [
  ["466357290377854976", "2026-11-18T11:28:56Z"],
  ["464897680034603008", "2026-11-10T14:40:52Z"],
  ["465333687950229504", "2026-11-12T23:04:44Z"],
  ["466059610272808961", "2026-11-16T20:58:38Z"],
  ["464992149916786868", "2026-11-11T02:54:03Z"],
]) {
  assert.ok(Math.abs(fechaDeOrden(id, AHORA) - Date.parse(fecha)) < 1000, id);
}
// Los 12 de Caracas que quedaron "sin fecha": PC es del domingo 15 (Caracas), no del 16.
assert.strictEqual(new Date(fechaDeOrden("465899515582201856", AHORA)).toISOString().slice(0, 19), "2026-11-16T00:16:08");
// ID que no es de Binance Pay o da una fecha imposible: va la de la imagen.
const imagen = Date.parse("2026-11-16T15:00:00Z");
assert.strictEqual(fechaDelPago("12345678", imagen, AHORA), imagen);
assert.strictEqual(fechaDelPago("999999999999999999", imagen, AHORA), imagen);
assert.strictEqual(fechaDelPago("12345678", null, AHORA), null);
// Manda el ID aunque la imagen diga otra hora (ej. UTC leída como Caracas)...
assert.strictEqual(fechaDelPago("466010327628775424", Date.parse("2026-11-16T18:36:09Z"), AHORA), fechaDeOrden("466010327628775424", AHORA));
// ...salvo que se separen más de un día: la IA leyó mal un dígito alto del ID.
assert.strictEqual(fechaDelPago("456010327628775424", imagen, AHORA), imagen);

console.log("check-binance: OK");
