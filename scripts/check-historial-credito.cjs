// Chequeo de la comparación entre fotos del Historial de crédito
// (lib/cxc/historialCreditoCruce.ts):
//   node scripts/check-historial-credito.cjs
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");

const fuente = fs.readFileSync(path.join(__dirname, "..", "lib/cxc/historialCreditoCruce.ts"), "utf8");
const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = { exports: {} };
new Function("require", "module", "exports", js)(require, m, m.exports);
const { compararFotos } = m.exports;

const c = (partnerId, limite, usado, estado) => ({ partnerId, cliente: `C${partnerId}`, rif: "", vendedor: "", limite, usado, vencido: 0, estado });
const p = (limite, usado, estado) => ({ limite, usado, estado, cliente: "X" });
const tipos = (r) => r.eventos.map((e) => `${e.partnerId}:${e.tipo}`).sort();

// Primera corrida: solo base, aunque haya excedidos.
let r = compararFotos(new Map(), [c(1, 1000, 1500, "excedido"), c(2, 500, 0, "sin_uso")]);
assert.deepStrictEqual(r.eventos, []);
assert.strictEqual(r.filas.length, 2);

// Cupo subido, cliente que se pasa, cliente que vuelve, cliente sin cambios.
const previa = new Map([
  [1, p(1000, 900, "al_limite")],
  [2, p(500, 0, "sin_uso")],
  [3, p(2000, 2500, "excedido")],
  [4, p(300, 100, "en_uso")],
]);
r = compararFotos(previa, [c(1, 1000, 1200, "excedido"), c(2, 800, 0, "sin_uso"), c(3, 3000, 2500, "en_uso"), c(4, 300, 100, "en_uso")]);
assert.deepStrictEqual(tipos(r), ["1:excedio", "2:cupo", "3:cupo", "3:normalizo"]);
const cupo2 = r.eventos.find((e) => e.partnerId === 2 && e.tipo === "cupo");
assert.strictEqual(cupo2.antes, 500);
assert.strictEqual(cupo2.despues, 800);

// Cliente nuevo con cupo (antes no estaba): cupo de 0 a lo que tiene.
r = compararFotos(previa, [c(1, 1000, 900, "al_limite"), c(2, 500, 0, "sin_uso"), c(3, 2000, 2500, "excedido"), c(4, 300, 100, "en_uso"), c(5, 700, 0, "sin_uso")]);
assert.deepStrictEqual(tipos(r), ["5:cupo"]);

// Le quitan el cupo y no debe: sale del Sobregiro, se guarda en 0 una vez.
r = compararFotos(previa, [c(1, 1000, 900, "al_limite"), c(3, 2000, 2500, "excedido"), c(4, 300, 100, "en_uso")]);
assert.deepStrictEqual(tipos(r), ["2:cupo"]);
assert.strictEqual(r.filas.find((f) => f.partnerId === 2).limite, 0);
// Y la corrida siguiente ya no lo vuelve a anotar.
previa.set(2, p(0, 0, "sin_limite"));
r = compararFotos(previa, [c(1, 1000, 900, "al_limite"), c(3, 2000, 2500, "excedido"), c(4, 300, 100, "en_uso")]);
assert.deepStrictEqual(tipos(r), []);
assert.ok(!r.filas.some((f) => f.partnerId === 2));

// Centavos de redondeo no son cambio de cupo.
r = compararFotos(new Map([[1, p(1000, 0, "sin_uso")]]), [c(1, 1000.004, 0, "sin_uso")]);
assert.deepStrictEqual(r.eventos, []);

console.log("check-historial-credito: OK");
