// Chequeo de lib/intercompania.ts: Inteligencia de Negocio sin intercompañía, por request:
//   node scripts/check-intercompania-bi.cjs
// Transpila el módulo con TypeScript y reemplaza Odoo y la sesión por stubs.
const fs = require("fs"), ts = require("typescript"), assert = require("assert");
const fuente = fs.readFileSync(require("path").join(__dirname, "../lib/intercompania.ts"), "utf8");
const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
let llamadas = 0;
const stubs = {
  "@/lib/odoo": { callOdooRPC: async (model) => { llamadas++; return model === "res.partner" ? [{ id: 5, name: "SUPRICOM CCS" }, { id: 6, name: "OFFICE SOLUTIONS CENTER" }] : [{ partner_id: [14, "OSC B"] }]; } },
  "@/lib/auth/inteligenciaNegocio": { esRolBI: (r) => String(r ?? "").toLowerCase().trim() === "inteligencia de negocio" },
  "@/lib/auth/roles": { rolDelToken: async (req) => req.rol },
};
const mod = { exports: {} };
new Function("require", "module", "exports", js)((m) => stubs[m] ?? require(m), mod, mod.exports);
const { conSinIntercompaniaBI, terminosSinIC, esICExcluido, conSinIntercompaniaParaBI } = mod.exports;
(async () => {
  const lento = () => new Promise((r) => setTimeout(r, 5));
  const bi = await conSinIntercompaniaBI("Inteligencia de Negocio", async () => {
    await lento();
    const [a, b] = await Promise.all([(async () => { await lento(); return terminosSinIC("move_id.commercial_partner_id"); })(), (async () => esICExcluido(14))()]);
    return { a, b, c: esICExcluido(99) };
  });
  assert.deepStrictEqual(bi.a, [["move_id.commercial_partner_id", "not in", [5, 6, 14]]]);
  assert.strictEqual(bi.b, true); assert.strictEqual(bi.c, false);
  const otro = await conSinIntercompaniaBI("superAdmin", async () => { await lento(); return { t: terminosSinIC(), e: esICExcluido(5) }; });
  assert.deepStrictEqual(otro, { t: [], e: false });
  assert.deepStrictEqual(terminosSinIC(), []); // fuera de toda request
  // Dos requests a la vez no se mezclan
  const h = conSinIntercompaniaParaBI(async (req) => { await lento(); return terminosSinIC().length; });
  const [x, y] = await Promise.all([h({ rol: "inteligencia de negocio" }), h({ rol: "gerencia de ventas" })]);
  assert.strictEqual(x, 1); assert.strictEqual(y, 0);
  console.log("ok: intercompañía por request (llamadas a Odoo:", llamadas + ")");
})().catch((e) => { console.error(e); process.exit(1); });
