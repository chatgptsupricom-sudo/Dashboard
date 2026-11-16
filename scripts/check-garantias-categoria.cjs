// Chequeo de las garantías por marca + categoría (lib/garantia.ts):
//   node scripts/check-garantias-categoria.cjs
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");

const fuente = fs.readFileSync(path.join(__dirname, "..", "lib/garantia.ts"), "utf8");
const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = { exports: {} };
new Function("require", "module", "exports", js)(require, m, m.exports);
const { agruparGarantias, elegirFila, claveMarca, calcularGarantia } = m.exports;

const fila = (marca, categoria, meses, palabras = null) => ({ marca, categoria, meses, notas: null, palabras });
const tabla = agruparGarantias([
  fila("HAVIT", "MOUSE", 12, "MOUSE,RATON"),
  fila("HAVIT", "MOUSE PAD", 0, "MOUSE PAD,MOUSEPAD"),
  fila("HAVIT", "MOUSE + TECLADO", 12, "COMBO,MOUSE Y TECLADO,MOUSE + TECLADO"),
  fila("HAVIT", "MESAS", 6, "MESA,DESK"),
  fila("HAVIT", "", 6),
  fila("LOGITECH", "MOUSE", 6, "MOUSE"),
  fila("LOGITECH", "TECLADOS", 6, "TECLADO"),
  fila("MERCUSYS", "REDES", 36, "ROUTER,WIFI"),
  fila("MERCUSYS", "SWITCH", 12, "SWITCH"),
  fila("TP-LINK", "SWITCH", 6, "SWITCH"),
  fila("SMARTBITT", "UPS", 24, "UPS"),
  fila("SMARTBITT", "REGULADOR", 12, "REGULADOR"),
  fila("ASTA", "", null),
]);
const meses = (marca, nombre) => elegirFila(tabla.get(claveMarca(marca)), nombre)?.meses;

// Gana la palabra más larga: MOUSE PAD antes que MOUSE; combo antes que mouse.
assert.strictEqual(meses("HAVIT", "MOUSE PAD GAMER HAVIT MP830"), 0);
assert.strictEqual(meses("HAVIT", "Mouse inalámbrico Havit MS76"), 12);
assert.strictEqual(meses("HAVIT", "COMBO TECLADO Y MOUSE HAVIT KB272"), 12);
assert.strictEqual(meses("HAVIT", "MESA GAMER HAVIT GD"), 6);
// Sin categoría: la fila de toda la marca.
assert.strictEqual(meses("HAVIT", "POWER BANK HAVIT"), 6);
// Sin fila general y todas sus categorías iguales: ese plazo.
assert.strictEqual(meses("LOGITECH", "WEBCAM LOGITECH C920"), 6);
// Plazos distintos y el nombre no dice cuál: null (indeterminada).
assert.strictEqual(elegirFila(tabla.get("MERCUSYS"), "ADAPTADOR USB MERCUSYS"), null);
assert.strictEqual(meses("MERCUSYS", "ROUTER WIFI MERCUSYS MR30G"), 36);
assert.strictEqual(meses("MERCUSYS", "SWITCH 8 PUERTOS MERCUSYS"), 12);
// Una palabra dentro de otra no cuenta (MESA no está en MESAS... pero sí en "MESA").
assert.strictEqual(meses("HAVIT", "MESANINA HAVIT"), 6);
// Variantes de la marca: TP LINK = TP-LINK, SMARTBIT = SMARTBITT.
assert.strictEqual(claveMarca("TP LINK"), claveMarca("TP-LINK "));
assert.strictEqual(meses("TP LINK", "SWITCH TP-LINK LS1005"), 6);
assert.strictEqual(meses("SMARTBIT", "UPS SMARTBIT 1200VA"), 24);
assert.strictEqual(meses("SMARTBITT", "REGULADOR SMARTBITT 1000VA"), 12);

(async () => {
  const hoy = new Date().toISOString().slice(0, 10);
  const r = await calcularGarantia({ marcaOdoo: "HAVIT", productoNombre: "MOUSE PAD HAVIT", fechaFactura: hoy }, tabla);
  assert.strictEqual(r.estado, "vencida"); // N/A = sin garantía
  const r2 = await calcularGarantia({ marcaOdoo: "MERCUSYS", productoNombre: "ADAPTADOR USB MERCUSYS", fechaFactura: hoy }, tabla);
  assert.strictEqual(r2.estado, "indeterminada");
  assert.strictEqual(r2.motivo, "categoria_no_resuelta");
  const r3 = await calcularGarantia({ marcaOdoo: "ASTA", productoNombre: "LLAVE ASTA", fechaFactura: hoy }, tabla);
  assert.strictEqual(r3.estado, "vida_util");
  const r4 = await calcularGarantia({ marcaOdoo: "SMARTBIT", productoNombre: "UPS SMARTBIT 1200VA", fechaFactura: hoy }, tabla);
  assert.strictEqual(r4.estado, "en_garantia");
  assert.strictEqual(r4.meses_cubiertos, 24);
  const r5 = await calcularGarantia({ marcaOdoo: "MARCA NUEVA", productoNombre: "ALGO", fechaFactura: hoy }, tabla);
  assert.strictEqual(r5.meses_cubiertos, 12); // marca que no está: el de por defecto
  console.log("check-garantias-categoria: OK");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
