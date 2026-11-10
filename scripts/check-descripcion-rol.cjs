// Chequeo de lib/usuarios/descripcionRol.ts (lo que dice el correo de bienvenida
// al asignar un rol):
//   node scripts/check-descripcion-rol.cjs
// Avisa qué secciones de rolePermissions no tienen etiqueta (no salen en el
// correo) y falla si un rol queda sin resumen propio o sin secciones.
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

const tipos = cargar("lib/types.ts", {});
const d = cargar("lib/usuarios/descripcionRol.ts", { "@/lib/types": tipos });

// Nombres como vienen de la tabla roles (minúsculas) y el alias viejo.
assert.strictEqual(d.rolDelPanel("superadmin"), "superAdmin");
assert.strictEqual(d.rolDelPanel("gerencia de ventas"), "Gerencia De Ventas");
assert.strictEqual(d.rolDelPanel("vendedor"), "seller");
assert.strictEqual(d.rolDelPanel("no existe"), null);
assert.deepStrictEqual(d.describirRol("no existe").grupos, []);

// Los roles en uso tienen resumen propio y al menos una sección.
const enUso = [
  "superadmin", "seller", "adminleads", "gerencia de ventas", "gerente de operaciones",
  "asistente de ventas", "administración", "cuentas por cobrar", "recursos humanos", "compras",
  "rma", "diseñador", "seguridad", "almacen", "procesos", "it", "inteligencia de negocio",
  "gerente de marca", "marketing y electrodomesticos",
];
for (const r of enUso) {
  const x = d.describirRol(r);
  assert.ok(x.resumen && !x.resumen.startsWith("Ingresa al panel"), `${r}: sin resumen propio`);
  assert.ok(x.grupos.length > 0, `${r}: sin secciones`);
  const nombres = x.grupos.flatMap((g) => g.secciones.map((s) => `${g.area}|${s.nombre}`));
  assert.strictEqual(new Set(nombres).size, nombres.length, `${r}: secciones repetidas`);
}

// Secciones sin etiqueta (no salen en el correo): solo aviso.
const sinEtiqueta = new Set();
for (const p of Object.values(tipos.rolePermissions)) for (const s of p.sections) if (!d.SECCIONES[s]) sinEtiqueta.add(s);
if (sinEtiqueta.size) console.log("Secciones sin etiqueta (no salen en el correo):", [...sinEtiqueta].sort().join(", "));

console.log("check-descripcion-rol: ok");
