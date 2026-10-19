// Chequeo de lib/politicas (quién entra, vigencia, acuse y limpieza del editor):
//   node scripts/check-politicas.cjs
// Transpila los módulos con TypeScript y reemplaza la base por un stub.
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");

function cargar(archivo, stubs) {
  const fuente = fs.readFileSync(path.join(__dirname, "..", archivo), "utf8");
  const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const m = { exports: {} };
  new Function("require", "module", "exports", js)((id) => stubs[id] ?? require(id), m, m.exports);
  return m.exports;
}

const permisos = cargar("lib/politicas/permisos.ts", {});
const datos = cargar("lib/politicas/datos.ts", {
  "@/lib/db": { db: { execute: async () => [[]] } },
  "@/lib/politicas/permisos": permisos,
});

// Quién entra y quién publica (roles como vienen del JWT, con mayúsculas).
assert.ok(permisos.puedeVerPoliticas("Gerencia De Ventas"));
assert.ok(permisos.puedeVerPoliticas("administración"));
assert.ok(permisos.puedeVerPoliticas("cuentas por cobrar"));
assert.ok(!permisos.puedeVerPoliticas("seller"));
assert.ok(!permisos.puedeVerPoliticas("almacen"));
assert.ok(permisos.puedeEditarPoliticas("superAdmin"));
assert.ok(permisos.puedeEditarPoliticas("procesos"));
assert.ok(!permisos.puedeEditarPoliticas("administración"));

// Vigencia: el estado guardado manda; las fechas solo matizan "vigente".
const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Caracas" });
const sit = (estado, vigenciaDesde = null, vigenciaHasta = null) =>
  permisos.situacionPolitica({ estado, vigenciaDesde, vigenciaHasta }).texto;
assert.strictEqual(sit("borrador"), "Borrador");
assert.strictEqual(sit("derogada"), "Derogada");
assert.strictEqual(sit("vigente"), "Vigente");
assert.strictEqual(sit("vigente", hoy, hoy), "Vigente");
assert.strictEqual(sit("vigente", null, "2000-01-01"), "Vencida");
assert.strictEqual(sit("vigente", "2999-01-01"), "Próxima");

// Pendiente de leer: solo vigente hoy, con acuse pedido y sin leer.
const base = { estado: "vigente", vigenciaDesde: null, vigenciaHasta: null, requiereAcuse: true, leidaEl: null };
assert.ok(permisos.pendienteDeLeer(base));
assert.ok(!permisos.pendienteDeLeer({ ...base, leidaEl: "2026-10-19T00:00:00Z" }));
assert.ok(!permisos.pendienteDeLeer({ ...base, requiereAcuse: false }));
assert.ok(!permisos.pendienteDeLeer({ ...base, estado: "borrador" }));
assert.ok(!permisos.pendienteDeLeer({ ...base, vigenciaHasta: "2000-01-01" }));

// Limpieza de lo que manda el editor: valores fuera de lista caen al default.
const l = datos.limpiarPolitica({
  tipo: "hackeo",
  titulo: "  Carta  ",
  sede: 99,
  estado: "publicada",
  vigenciaDesde: "19/10/2026",
  vigenciaHasta: "2026-12-31",
  version: "",
});
assert.strictEqual(l.tipo, "politica");
assert.strictEqual(l.titulo, "Carta");
assert.strictEqual(l.sede, 0);
assert.strictEqual(l.estado, "borrador");
assert.strictEqual(l.vigenciaDesde, null);
assert.strictEqual(l.vigenciaHasta, "2026-12-31");
assert.strictEqual(l.version, "1.0");
assert.strictEqual(l.requiereAcuse, true);
assert.strictEqual(datos.limpiarPolitica({ sede: "10", requiereAcuse: false }).sede, 10);
assert.strictEqual(datos.limpiarPolitica({ requiereAcuse: false }).requiereAcuse, false);

console.log("check-politicas: ok");
