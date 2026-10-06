// Chequeo de lib/agenteia/alcance.ts (límites del Agente IA por rol):
//   node scripts/check-alcance-agente.cjs
// Transpila el módulo con TypeScript y reemplaza la base y Odoo por stubs.
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");

const fuente = fs.readFileSync(path.join(__dirname, "../lib/agenteia/alcance.ts"), "utf8");
const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const stubs = {
  "@/lib/db": { db: {} },
  "@/lib/odoo": { callOdooRPCEstricto: async () => 0 },
  "@/lib/agenteia/acceso": {
    normRol: (r) => String(r ?? "").toLowerCase().trim(),
    esSuperadmin: (r) => String(r ?? "").toLowerCase().trim() === "superadmin",
  },
};
const mod = { exports: {} };
new Function("require", "module", "exports", js)((m) => stubs[m] ?? require(m), mod, mod.exports);
const { tablasDeSql, sqlPanelPermitido, dominioConAlcance, sinCostos } = mod.exports;

// SQL del panel: toda tabla leída debe quedar a la vista.
assert.deepStrictEqual(tablasDeSql("SELECT * FROM leads l JOIN sellers s ON s.id = l.seller_id"), ["leads", "sellers"]);
assert.deepStrictEqual(tablasDeSql("SELECT * FROM leads WHERE id IN (SELECT lead_id FROM lead_history)"), ["leads", "lead_history"]);
assert.deepStrictEqual(tablasDeSql("DESCRIBE leads"), ["leads"]);
for (const malo of [
  "SELECT * FROM leads, users_config",
  "SELECT * FROM leads AS l , users_config",
  "SELECT * FROM (SELECT 1) x, users_config",
  "SELECT * FROM leads USE INDEX (PRIMARY), users_config",
  "SELECT * FROM otra.users_config",
  "SELECT * FROM information_schema.tables",
  "WITH x AS (TABLE users_config) SELECT * FROM x",
  "SHOW TABLES",
]) assert.strictEqual(tablasDeSql(malo), null, malo);

const alcance = (o = {}) => ({ rol: "x", areas: new Set(["leads"]), companias: [9], propio: null, costos: false, panel: true, ...o });
assert.strictEqual(sqlPanelPermitido(alcance(), "SELECT * FROM leads"), null);
assert.match(sqlPanelPermitido(alcance(), "SELECT * FROM leads JOIN users_config u ON 1"), /users_config/);
assert.match(sqlPanelPermitido(alcance({ panel: false }), "SELECT * FROM leads"), /no incluye/);

// Odoo: sede y "solo lo suyo" van en el dominio; modelos fuera de las áreas, bloqueados.
const ventas = alcance({ areas: new Set(["ventas"]), propio: { uid: 7, nombre: "Ana" } });
assert.deepStrictEqual(dominioConAlcance(ventas, "sale.order", [["state", "=", "sale"]]), [
  ["company_id", "in", [9]],
  ["user_id", "=", 7],
  ["state", "=", "sale"],
]);
assert.match(dominioConAlcance(ventas, "hr.employee", []), /no tiene acceso/);
assert.match(dominioConAlcance(ventas, "stock.picking", []), /no tiene acceso/);
assert.match(dominioConAlcance(ventas, "account.move", [["line_ids.product_id.standard_price", ">", 0]]), /costos/);
assert.deepStrictEqual(sinCostos([{ name: "a", standard_price: 3, margin: 1 }]), [{ name: "a" }]);

console.log("ok: alcance del Agente IA");
