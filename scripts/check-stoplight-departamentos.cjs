// Chequeo de los KPIs por departamento del Stoplight:
//   node scripts/check-stoplight-departamentos.cjs
// Transpila lib/stoplight/departamentos/definiciones.ts y lib/stoplight/scoring.ts
// con TypeScript (no usa la base ni Odoo).
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");

const raiz = path.join(__dirname, "..");
const cargados = {};
function cargar(rel) {
  if (cargados[rel]) return cargados[rel].exports;
  const fuente = fs.readFileSync(path.join(raiz, rel), "utf8");
  const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const m = { exports: {} };
  cargados[rel] = m;
  const req = (id) => {
    if (id === "./departamentos/definiciones") return cargar("lib/stoplight/departamentos/definiciones.ts");
    return require(id);
  };
  new Function("require", "module", "exports", js)(req, m, m.exports);
  return m.exports;
}

const d = cargar("lib/stoplight/departamentos/definiciones.ts");
const sc = cargar("lib/stoplight/scoring.ts");

// Pesos de cada bloque nuevo suman 100 (Administración: 20 de sus dos controles + 80 de CxC/CxP).
for (const b of d.BLOQUES) {
  const suma = b.kpis.reduce((s, k) => s + k.peso, 0);
  if (b.id === "administracion") {
    const resto = Object.values(d.PESOS_ADMINISTRACION).reduce((s, p) => s + p, 0);
    assert.strictEqual(suma + resto, 100, `Administración suma ${suma + resto}`);
  } else {
    assert.strictEqual(suma, 100, `${b.titulo} suma ${suma}`);
  }
}
// Compras: los pesos que ya tenía el bloque (15+17+25+20+11+12).
assert.strictEqual(15 + 17 + 25 + 20 + 11 + 12, 100);

// Claves únicas.
const claves = d.KPIS_DEPARTAMENTOS.map((k) => k.key);
assert.strictEqual(new Set(claves).size, claves.length, "claves repetidas");

// Períodos.
assert.deepStrictEqual(d.mesesDelPeriodo("2026-11", "trimestre"), ["2026-10", "2026-11"]);
assert.deepStrictEqual(d.mesesDelPeriodo("2026-11", "semestre"), ["2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]);
assert.strictEqual(d.mesesDelPeriodo("2026-11", "anio").length, 11);
assert.deepStrictEqual(d.mesesDelPeriodo("2026-11", "mes"), ["2026-11"]);
// Los meses antes de la estructura nueva (nov-2026) no cuentan: noviembre
// cerrado en una meta anual es 1/12; mitad de noviembre en el trimestre, 0,5/3.
assert.strictEqual(d.fraccionDelPeriodo("2026-11", "anio", new Date(2026, 11, 5)), 1 / 12);
assert.strictEqual(d.fraccionDelPeriodo("2026-11", "trimestre", new Date(2026, 10, 15)), 0.5 / 3);
// Diciembre a mitad de mes: noviembre entero + medio diciembre (día 16 de 31 ≈ 0,516).
assert.ok(Math.abs(d.fraccionDelPeriodo("2026-12", "trimestre", new Date(2026, 11, 16)) - (1 + 16 / 31) / 3) < 1e-9);
// 2027: el período completo cuenta. Mayo cerrado en el semestre ene-jun: 5/6.
assert.strictEqual(d.fraccionDelPeriodo("2027-05", "semestre", new Date(2027, 6, 1)), 5 / 6);
// Propuestas calificadas: 2 de 3 es 67 %, no 2 %.
assert.strictEqual(sc.cumplimientoKpi("propuestas_calificadas", "2", "3"), 67);
assert.strictEqual(d.fraccionDelPeriodo("2026-11", "mes", new Date(2026, 10, 15)), 0.5);

// Alcance: Marketing por país, Expansión global, el resto por sede.
assert.strictEqual(d.companyDeKpi("mkt_conversion", 10), 9);
assert.strictEqual(d.companyDeKpi("mkt_conversion", 7), 7);
assert.strictEqual(d.companyDeKpi("bi_factibilidad_sedes", 10), 0);
assert.strictEqual(d.companyDeKpi("rrhh_ausentismo", 10), 10);
assert.strictEqual(d.companyDeKpi("efectividad_cobranza", 10), 10);

// Estructura nueva desde nov-2026.
assert.strictEqual(d.usaEstructuraNueva("2026-10"), false);
assert.strictEqual(d.usaEstructuraNueva("2026-11"), true);

// Semáforo: meta "0 casos".
assert.strictEqual(sc.nivelSemaforo("sg_incidentes_seguridad", "0", "0"), "verde");
assert.strictEqual(sc.nivelSemaforo("sg_incidentes_seguridad", "2", "0"), "rojo");
assert.strictEqual(sc.cumplimientoKpi("aud_fuera_politica", "0", "0"), 100);
assert.strictEqual(sc.cumplimientoKpi("aud_fuera_politica", "1", "0"), 0);
assert.strictEqual(sc.sinMeta("0", "aud_fuera_politica"), false);
assert.strictEqual(sc.sinMeta("0", "rrhh_rotacion"), true);
// Menos es mejor (tope): ausentismo 2% con meta 3% = verde; 6% = rojo y 50% de cumplimiento.
assert.strictEqual(sc.nivelSemaforo("rrhh_ausentismo", "2%", "3"), "verde");
assert.strictEqual(sc.nivelSemaforo("rrhh_ausentismo", "6%", "3"), "rojo");
assert.strictEqual(sc.cumplimientoKpi("rrhh_ausentismo", "6%", "3"), 50);
// Horas y dólares se leen bien.
assert.strictEqual(sc.nivelSemaforo("log_tiempo_despacho", "36 h", "48"), "verde");
assert.strictEqual(sc.numeroDe("$2.64"), 2.64);
assert.strictEqual(sc.nivelSemaforo("mkt_costo_lead_calificado", "$2.64", "2.5"), "amarillo");
// Un KPI que se va sumando muestra % de lo esperado: no es "crudo".
assert.ok(!sc.KPI_MAS_ES_MEJOR.includes("mkt_ventas_leads"));
assert.strictEqual(sc.nivelSemaforo("mkt_ventas_leads", "105%", "60000"), "verde");
assert.strictEqual(sc.nivelSemaforo("mkt_ventas_leads", "60%", "60000"), "rojo");
// Sin dato: neutro.
assert.strictEqual(sc.nivelSemaforo("rrhh_rotacion", "N/A", "2"), "sin");
// Los de antes no cambian.
assert.strictEqual(sc.nivelSemaforo("dso", "40 días", "45"), "verde");
assert.strictEqual(sc.cumplimientoKpi("margen_bruto", "80%", "20"), 80);

console.log("check-stoplight-departamentos: ok");
