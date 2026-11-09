// Chequeo de lib/clientes-odoo/validar.ts (RIF, teléfono, correo):
//   node scripts/check-clientes-odoo.cjs
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");

const fuente = fs.readFileSync(path.join(__dirname, "..", "lib/clientes-odoo/validar.ts"), "utf8");
const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = { exports: {} };
new Function("require", "module", "exports", js)(require, m, m.exports);
const v = m.exports;

// RIF de fichas reales de Odoo (dígito verificador correcto).
assert.ok(v.revisarRif("J306368418", "empresa").ok);
assert.ok(v.revisarRif("j-50784945-7", "empresa").ok);
assert.strictEqual(v.revisarRif("J-50784945-7", "empresa").valor, "J507849457");
// 10 dígitos (EL MUNDO DE LA OFICINA quedó así en Odoo).
assert.match(v.revisarRif("J3032110996", "empresa").error, /sobran/);
assert.match(v.revisarRif("J306368419", "empresa").error, /verificador es 8/);
assert.match(v.revisarRif("30636841", "empresa").error, /letra/);
assert.match(v.revisarRif("V32186236", "empresa").error, /Persona/);
assert.ok(v.revisarRif("V32186236", "persona").ok);
assert.ok(v.revisarRif("V-3218623", "persona").ok);
assert.match(v.revisarRif("V11111111", "persona").error, /relleno/);
assert.match(v.revisarRif("J306368418", "persona").error, /Empresa/);
// Misma persona con cédula o con RIF.
assert.strictEqual(v.claveRif("V32186236"), v.claveRif("V-32186236-4"));
assert.strictEqual(v.claveRif("V08123456"), v.claveRif("V8123456"));
assert.strictEqual(v.claveRif("J-30636841-8"), "J30636841");

// Teléfono.
assert.strictEqual(v.revisarTelefono("0412 756.65.87").valor, "+58 412-7566587");
assert.strictEqual(v.revisarTelefono("+58 412-7566587").valor, "+58 412-7566587");
assert.strictEqual(v.revisarTelefono("0241-8234567").valor, "+58 241-8234567");
assert.ok(!v.revisarTelefono("0418-7566587").ok);
assert.ok(!v.revisarTelefono("0412-756658").ok);
assert.ok(!v.revisarTelefono("0412-1111111").ok);
assert.ok(!v.revisarTelefono("0512-7566587").ok);

// Correo.
assert.ok(v.revisarEmail(" Ventas@Empresa.com.ve ").ok);
assert.match(v.revisarEmail("Córdobadenny3@gmail.com").error, /acentos/);
assert.ok(!v.revisarEmail("algo@gmail").ok);
assert.ok(!v.revisarEmail("algo@gmail.con").ok);

// Nombre comercial sugerido.
assert.strictEqual(v.sugerirComercial("El mundo de la oficina, C.A."), "EL MUNDO DE LA OFICINA");
assert.strictEqual(v.sugerirComercial("SERVINET CA"), "SERVINET");

// Ficha completa.
const { errores, valores } = v.validarCliente({
  sede: 9, tipo: "empresa", rif: "J-30636841-8", nombre: "servinet,  c.a.", comercial: "servinet",
  telefono: "04129777487", email: "servinetamazonas@gmail.com", direccion: "calle ayacucho cc la orquidea local 5b",
  ciudad: "puerto ayacucho", estadoId: 1750, vendedorId: 372,
});
assert.deepStrictEqual(errores, {});
assert.strictEqual(valores.nombre, "SERVINET, C.A.");
assert.strictEqual(valores.telefono, "+58 412-9777487");
assert.ok(Object.keys(v.validarCliente({ sede: 7 }).errores).includes("sede"));

console.log("check-clientes-odoo: ok");
