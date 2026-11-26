// Chequeo de las horas extra de Asistencia (lib/asistencia/tipos.ts y
// lib/asistencia/horasExtra.ts):
//   node scripts/check-horas-extra.cjs [salida.html]
// Con un archivo de salida escribe ahí la hoja del PDF con datos de ejemplo.
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");

const cargados = {};
function cargar(rel) {
  if (cargados[rel]) return cargados[rel];
  const fuente = fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
  const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const m = { exports: {} };
  const req = (p) => (p.startsWith(".") ? cargar(path.join(path.dirname(rel), p) + ".ts") : require(p));
  new Function("require", "module", "exports", js)(req, m, m.exports);
  return (cargados[rel] = m.exports);
}

const t = cargar("lib/asistencia/tipos.ts");
const x = cargar("lib/asistencia/horasExtra.ts");

// ------------------------------------------------------------ por día
assert.strictEqual(t.HORARIO.salida, "17:00");
// Laborable: si sale a las 17:00 o después, cada minuto desde las 16:30; antes de las 17:00, nada.
assert.strictEqual(t.minutosExtra("08:00", "17:04", true), 34);
assert.strictEqual(t.minutosExtra("08:00", "17:00", true), 30);
assert.strictEqual(t.minutosExtra("08:00", "16:59", true), 0);
assert.strictEqual(t.minutosExtra("08:00", "16:35", true), 0);
assert.strictEqual(t.minutosExtra("07:00", "19:15", true), 165); // llegar temprano no suma
assert.strictEqual(t.minutosExtra("18:00", "20:00", true), 120); // entró después de las 16:30
// Descanso o feriado: todo, de entrada a salida.
assert.strictEqual(t.minutosExtra("09:00", "13:00", false), 240);
assert.strictEqual(t.minutosExtra("09:00", "10:20", false), 80);
// Sin una de las marcas no se calcula.
assert.strictEqual(t.minutosExtra("08:00", null, true), 0);
assert.strictEqual(t.minutosExtra(null, "19:00", false), 0);

const lunes = t.evaluarDia("2026-11-02", ["07:55", "18:45"], true, null);
assert.strictEqual(lunes.extraMin, 135);
assert.strictEqual(lunes.salidaAnticipadaMin, 0);
const domingo = t.evaluarDia("2026-11-08", ["08:10", "12:40"], false, null);
assert.strictEqual(domingo.extraMin, 270);
const unaMarca = t.evaluarDia("2026-11-03", ["18:30"], true, null);
assert.strictEqual(unaMarca.extraMin, 0);

// ------------------------------------------------------------ reporte
const empleados = [
  { sede: 9, codigo: "1", nombre: "ANA PEREZ", departamento: "Almacén", desde: null, activo: true, primera_fecha: "2026-11-02", ultima_fecha: "2026-11-08" },
  { sede: 9, codigo: "2", nombre: "LUIS GOMEZ", departamento: "Almacén", desde: null, activo: true, primera_fecha: "2026-11-02", ultima_fecha: "2026-11-06" },
  { sede: 9, codigo: "3", nombre: "MARIA DIAZ", departamento: "Ventas", desde: null, activo: true, primera_fecha: "2026-11-02", ultima_fecha: "2026-11-06" },
];
const m = (codigo, fecha, ...horas) => horas.map((hora) => ({ codigo, fecha, hora }));
const marcas = [
  ...m("1", "2026-11-02", "07:58", "18:45"), // 2 h 15 (desde las 16:30)
  ...m("1", "2026-11-03", "08:00", "17:10"), // 40 min
  ...m("1", "2026-11-04", "08:00", "16:55"), // salió antes de las 17:00: nada
  ...m("1", "2026-11-08", "08:10", "12:40"), // domingo: 4 h 30
  ...m("2", "2026-11-02", "08:05", "19:00"), // 2 h 30
  ...m("2", "2026-11-07", "08:00", "17:45"), // sábado de inventario: 1 h 15
  ...m("3", "2026-11-02", "08:00", "17:00"), // salió justo a las 17:00: 30 min
];
const especiales = [{ id: 1, fecha: "2026-11-07", sede: 9, tipo: "inventario", nota: "" }];
const rep = t.calcularReporte({ sede: 9, desde: "2026-11-02", hasta: "2026-11-08", empleados, marcas, especiales, cobertura: "2026-11-08" });
const ana = rep.empleados.find((e) => e.codigo === "1");
assert.strictEqual(ana.minutosExtra, 135 + 40 + 270);
assert.strictEqual(ana.diasExtra, 3);
assert.strictEqual(rep.empleados.find((e) => e.codigo === "3").minutosExtra, 30);

const r = x.resumirExtra(rep.empleados, "2026-11-02", "2026-11-08");
assert.strictEqual(r.totalMin, 135 + 40 + 270 + 150 + 75 + 30);
// El sábado de inventario es laborable: va en «después de hora».
assert.strictEqual(r.laborableMin, 135 + 40 + 150 + 75 + 30);
assert.strictEqual(r.descansoMin, 270);
assert.strictEqual(r.empleados, 3);
assert.strictEqual(r.dias, 4);
assert.strictEqual(r.porDia.length, 7); // todos los días del rango, también los de 0
assert.deepStrictEqual(r.porEmpleado.map((e) => e.codigo), ["1", "2", "3"]);
assert.deepStrictEqual(r.porSemana.map((s) => [s.lunes, s.minutos]), [["2026-11-02", 700]]);
assert.deepStrictEqual(r.porDepartamento.map((d) => [d.departamento, d.empleados]), [["Almacén", 2], ["Ventas", 1]]);
assert.strictEqual(x.lunesDe("2026-11-08"), "2026-11-02");
assert.strictEqual(x.lunesDe("2026-11-02"), "2026-11-02");
assert.strictEqual(x.formatoExtra(105), "1 h 45 min");
assert.strictEqual(x.formatoExtra(120), "2 h");
assert.strictEqual(x.tipoDiaExtra(domingo), "Día de descanso");

const html = x.htmlPdfExtra(r, { sede: "Valencia", desde: "2026-11-02", hasta: "2026-11-08", filtro: "<Almacén>" });
assert.ok(html.includes("&lt;Almacén&gt;"), "el filtro se escapa");
assert.ok(html.includes("ANA PEREZ"));

if (process.argv[2]) {
  // Un mes de ejemplo más grande para ver la hoja.
  const nombres = ["ANA PEREZ", "LUIS GOMEZ", "MARIA DIAZ", "JOSE RODRIGUEZ", "CARLA MENDOZA", "PEDRO SUAREZ", "LUISA TORRES", "MIGUEL ROJAS"];
  const deptos = ["Almacén", "Almacén", "Ventas", "Almacén", "Administración", "Despacho", "Ventas", "Despacho"];
  const emps = nombres.map((nombre, i) => ({ sede: 9, codigo: String(100 + i), nombre, departamento: deptos[i], desde: "2026-11-01", activo: true, primera_fecha: "2026-11-02", ultima_fecha: "2026-11-25" }));
  const mm = [];
  let s = 7;
  const azar = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (const f of t.diasDelRango("2026-11-01", "2026-11-25")) {
    const dow = t.diaSemana(f);
    emps.forEach((e, i) => {
      if (dow >= 1 && dow <= 5) {
        const extra = azar() < 0.35 + i * 0.04 ? Math.floor(azar() * 180) : 0;
        mm.push(...m(e.codigo, f, "07:5" + Math.floor(azar() * 9), t.aHora(17 * 60 + extra)));
      } else if (dow === 6 && azar() < 0.3) mm.push(...m(e.codigo, f, "08:00", t.aHora(12 * 60 + Math.floor(azar() * 120))));
    });
  }
  const rep2 = t.calcularReporte({ sede: 9, desde: "2026-11-01", hasta: "2026-11-25", empleados: emps, marcas: mm, especiales: [], cobertura: "2026-11-25" });
  fs.writeFileSync(process.argv[2], x.htmlPdfExtra(x.resumirExtra(rep2.empleados, "2026-11-01", "2026-11-25"), { sede: "Valencia", desde: "2026-11-01", hasta: "2026-11-25" }));
  console.log("Hoja de ejemplo:", process.argv[2]);
}

console.log("Horas extra: todo bien.");
