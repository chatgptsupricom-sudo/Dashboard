// Chequeo de las reglas de la Rotación de inventario (semáforo, días sin venta, plan de 90 días):
//   node scripts/check-rotacion-inventario.cjs
// Transpila lib/rotacion-inventario/tipos.ts con TypeScript (no usa Odoo ni la base).
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");

const fuente = fs.readFileSync(path.join(__dirname, "..", "lib/rotacion-inventario/tipos.ts"), "utf8");
const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = { exports: {} };
new Function("require", "module", "exports", js)(require, m, m.exports);
const {
  colorDe, referenciaSinVenta, colorDesde, calcularPlan, estadoPlanHoy, inicioSemana, mesesSeguimiento,
  resumir, vendidasEntre, margenRemate, finDePlan,
} = m.exports;

// Semáforo: verde 0-45, amarillo 46-90, rojo 91+
assert.strictEqual(colorDe(0), "verde");
assert.strictEqual(colorDe(45), "verde");
assert.strictEqual(colorDe(46), "amarillo");
assert.strictEqual(colorDe(90), "amarillo");
assert.strictEqual(colorDe(91), "rojo");

// Días sin venta: nunca antes del 1-abr ni antes de la unidad más vieja que queda
const hoy = "2026-11-18";
assert.strictEqual(referenciaSinVenta(null, "2026-04-05", hoy), "2026-04-05"); // carga inicial, nunca vendido
assert.strictEqual(referenciaSinVenta("2026-03-10", "2026-02-01", hoy), "2026-04-01"); // última venta en Smartbit
assert.strictEqual(referenciaSinVenta("2026-08-01", "2026-04-05", hoy), "2026-08-01");
assert.strictEqual(referenciaSinVenta("2026-05-01", "2026-11-10", hoy), "2026-11-10"); // se agotó y llegó de nuevo
assert.strictEqual(referenciaSinVenta(null, null, hoy), "2026-04-01");
assert.strictEqual(colorDesde("2026-04-01", "rojo"), "2026-07-01");
assert.strictEqual(colorDesde("2026-04-01", "amarillo"), "2026-05-17");

// Semanas y meses
assert.strictEqual(inicioSemana("2026-11-18"), "2026-11-16"); // miércoles → lunes
assert.strictEqual(inicioSemana("2026-11-22"), "2026-11-16"); // domingo
assert.strictEqual(inicioSemana("2026-11-16"), "2026-11-16");
assert.deepStrictEqual(mesesSeguimiento(hoy), ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]);
assert.deepStrictEqual(mesesSeguimiento("2027-01-03").slice(-3), ["2026-11", "2026-12", "2027-01"]);

// Plan: 90 unidades desde el 1-nov → 1/día, 7/semana, 30/mes
assert.strictEqual(finDePlan("2026-11-01"), "2027-01-29");
const ventas = new Map([["2026-11-02", 5], ["2026-11-16", 3], ["2026-11-18", 2], ["2026-10-30", 9]]);
const plan = calcularPlan({ id: 1, inicio: "2026-11-01", unidadesInicio: 90, creadoPor: null, motivo: null }, ventas, 80, hoy);
assert.strictEqual(plan.metaDiaria, 1);
assert.strictEqual(plan.metaSemanal, 7);
assert.strictEqual(plan.metaMensual, 30);
assert.strictEqual(plan.diasTranscurridos, 18);
assert.strictEqual(plan.diasRestantes, 73);
assert.strictEqual(plan.vendidasPlan, 10); // lo del 30-oct no cuenta
assert.strictEqual(plan.esperadoAHoy, 18);
assert.strictEqual(plan.avancePlan, 55.6);
assert.strictEqual(plan.vendidasSemana, 5);
assert.strictEqual(plan.vendidasMes, 10);
assert.strictEqual(plan.necesariaDiaria, Math.round((80 / 73) * 100) / 100);
assert.strictEqual(plan.ritmoActual, Math.round((19 / 30) * 100) / 100);
// Vencido: lo que queda se reparte en 90 días
const vencido = calcularPlan({ id: 1, inicio: "2026-07-01", unidadesInicio: 90, creadoPor: null, motivo: null }, ventas, 45, hoy);
assert.strictEqual(vencido.diasRestantes, 0);
assert.strictEqual(vencido.necesariaDiaria, 0.5);
assert.strictEqual(vencido.diasTranscurridos, 90);

assert.strictEqual(estadoPlanHoy({ inicio: "2026-11-01", unidadesInicio: 90 }, 10, 80, hoy), "activo");
assert.strictEqual(estadoPlanHoy({ inicio: "2026-11-01", unidadesInicio: 90 }, 10, 0, hoy), "cumplido");
assert.strictEqual(estadoPlanHoy({ inicio: "2026-11-01", unidadesInicio: 10 }, 10, 5, hoy), "cumplido");
assert.strictEqual(estadoPlanHoy({ inicio: "2026-07-01", unidadesInicio: 90 }, 10, 80, hoy), "vencido");

assert.strictEqual(vendidasEntre({ "2026-11-01": 2, "2026-11-30": 1, "2026-12-01": 4 }, "2026-11-01", "2026-11-31"), 3);

// Resumen por marca con el valor a costo de cada color
const f = (marca, color, disponible, valorCosto) => ({ marca, color, disponible, valorCosto });
const grupos = resumir([f("CANON", "rojo", 10, 100), f("CANON", "verde", 5, 50), f("HP", "amarillo", 1, 300)], (x) => x.marca);
assert.strictEqual(grupos[0].clave, "CANON"); // más valor en rojo primero
assert.strictEqual(grupos[0].porColor.rojo.valor, 100);
assert.strictEqual(grupos[0].total.unidades, 15);
assert.strictEqual(grupos[1].porColor.amarillo.referencias, 1);

// Precio de remate con el apoyo de la marca
assert.deepStrictEqual(margenRemate(100, 20, 90), { costoNeto: 80, margen: 11.1 });
assert.deepStrictEqual(margenRemate(100, null, null), { costoNeto: 100, margen: null });

console.log("OK rotación de inventario");
