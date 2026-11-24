// Chequeo del lector de listas de precios de la Inteligencia de Precios:
//   node scripts/check-precios.cjs
// Transpila lib/inteligencia-negocio/precios/leerLista.ts y reglas.ts con
// TypeScript y los prueba con listas armadas aquí (no usa la base ni Odoo).
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");
const XLSX = require("xlsx");

const RAIZ = path.join(__dirname, "..");
const cache = {};
function cargar(archivo) {
  if (cache[archivo]) return cache[archivo].exports;
  const js = ts.transpileModule(fs.readFileSync(archivo, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const m = { exports: {} };
  cache[archivo] = m;
  const req = (id) => (id.startsWith("@/") ? cargar(path.join(RAIZ, id.slice(2) + ".ts")) : require(id));
  new Function("require", "module", "exports", js)(req, m, m.exports);
  return m.exports;
}
const { leerLista, numero, fechaEnTexto, mayoristaDelArchivo } = cargar(path.join(RAIZ, "lib/inteligencia-negocio/precios/leerLista.ts"));
const { clasificarPorReglas } = cargar(path.join(RAIZ, "lib/inteligencia-negocio/precios/reglas.ts"));

const libro = (hojas) => {
  const wb = XLSX.utils.book_new();
  for (const [n, aoa] of Object.entries(hojas)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), n);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
};
const op = { marcasConocidas: new Set(["TP-LINK", "HP"]), mayoristasConocidos: ["GAHL TECH", "MAGNABYTE"] };

// Números, fechas y mayorista por el nombre del archivo
assert.strictEqual(numero("$1,699.00"), 1699);
assert.strictEqual(numero("12,50"), 12.5);
assert.ok(isNaN(numero("Consultar")));
assert.strictEqual(fechaEnTexto("VIERNES 16-10-2026 LISTA"), "2026-10-16");
assert.strictEqual(fechaEnTexto("LISTA 21-10- 2026"), "2026-10-21");
assert.strictEqual(fechaEnTexto("LP ECD 21 DE OCTUBRE", 2026), "2026-10-21");
assert.strictEqual(mayoristaDelArchivo("LISTA DE PRECIO GAHLTECH 21-10- 2026.xlsx", op.mayoristasConocidos), "GAHL TECH");
assert.strictEqual(mayoristaDelArchivo("LP ECD 21 DE OCTUBRE.xlsx", []), "ECD");

// Lista desordenada: encabezado abajo, secciones de marca y de línea, dos precios,
// sin precio, agotado, repetido con precio más bajo, línea arrastrada.
let r = leerLista(
  libro({
    Lista: [
      ["MAYORISTA DE PRUEBA"],
      ["Telf: 0212"],
      [],
      ["Línea", "Código", "Descripción", "Precio Transf", "Precio Efect.", "Stock"],
      ["DECIBEL"],
      ["AUDIFONOS", "A1", "AUDIFONOS INALAMBRICOS E03 BLANCO DECIBEL", 7.9, 7.5, 10],
      ["", "A2", "AUDIFONOS INALAMBRICOS E01 NEGRO DECIBEL", 0, 12, "Mas de 50"],
      ["", "A3", "AUDIFONOS SIN PRECIO DECIBEL", "Consultar", "", 3],
      ["", "A4", "AUDIFONOS AGOTADOS DECIBEL", 5, 5, 0],
      ["ADAPTADOR"],
      ["", "B1", "ADAPTADOR TP-LINK T4U USB 3.0 WIFI AC1300", 26.35, 27, 4],
      ["", "B1", "ADAPTADOR TP-LINK T4U USB 3.0 WIFI AC1300", 25, 26, 4],
    ],
  }),
  "LISTA PRUEBA 14-10.xlsx",
  op,
);
assert.strictEqual(r.ordenada, false);
assert.strictEqual(r.filas.length, 3);
const porCodigo = Object.fromEntries(r.filas.map((f) => [f.codigo, f]));
assert.strictEqual(porCodigo.A1.pvp, 7.5, "el menor de las dos columnas");
assert.strictEqual(porCodigo.A2.pvp, 12, "un precio en cero no cuenta");
assert.strictEqual(porCodigo.A1.marca, "DECIBEL", "sección = marca (sale al final de la descripción)");
assert.strictEqual(porCodigo.A2.linea, "AUDIFONOS", "línea arrastrada");
assert.strictEqual(porCodigo.B1.marca, "TP-LINK", "sección «ADAPTADOR» no es marca: se busca en la descripción");
assert.strictEqual(porCodigo.B1.marcaDeLista, false);
assert.strictEqual(porCodigo.B1.pvp, 25, "repetido: queda el precio más bajo");
assert.deepStrictEqual(
  { sinPrecio: r.descartes.sinPrecio, sinStock: r.descartes.sinStock, duplicados: r.descartes.duplicados },
  { sinPrecio: 1, sinStock: 1, duplicados: 1 },
);
assert.strictEqual(r.fechaLista, `${new Date().getFullYear()}-10-14`);

// IVA incluido por leyenda: se quita el 16 %. Hoja copia de otra: no duplica.
r = leerLista(
  libro({
    Todo: [["PRECIOS CON IVA INCLUIDO"], ["Código", "Nombre del Producto", "Marca", "Precio"], ["X1", "Mouse inalámbrico", "HP", 11.6]],
    Mouse: [["PRECIOS CON IVA INCLUIDO"], ["Código", "Nombre del Producto", "Marca", "Precio"], ["X1", "Mouse inalámbrico", "HP", 11.6]],
  }),
  "lista.xlsx",
  op,
);
assert.strictEqual(r.ivaIncluido, true);
assert.strictEqual(r.filas.length, 1);
assert.strictEqual(r.filas[0].pvp, 10);
assert.strictEqual(r.descartes.copias, 1);

// Lista ya ordenada (formato del Excel de ejemplo)
r = leerLista(
  libro({
    Catalogo: [
      ["Código", "Marca", "Categoría", "Subcategoría (nombre corto)", "Grado de Confianza", "Nivel", "Observaciones / Verificar", "Mayorista", "Fecha", "PVP", "Descripción original"],
      ["83NM8", "DELL", "LAPTOP", "Laptop Core i7 8GB 512GB SSD", 1, "Alto", "", "GAHL TECH", "15/10/2026", 684.78, "NOTEBOOK DELL I7-1355U 8GB 512GB SSD"],
    ],
  }),
  "Lista Ejemplo Ordenada.xlsx",
  op,
);
assert.strictEqual(r.ordenada, true);
assert.strictEqual(r.ordenadas[0].fecha, "2026-10-15");
assert.strictEqual(r.ordenadas[0].mayorista, "GAHL TECH");

// Reglas de respaldo
let c = clasificarPorReglas("LAPTOP LENOVO 15.6 CORE I5-1235U 16GB RAM 512GB SSD", "");
assert.strictEqual(c.categoria, "LAPTOP");
assert.strictEqual(c.subcategoria, "Laptop Core i5 16GB 512GB SSD");
c = clasificarPorReglas("MONITOR LG 24 PULG FHD 100HZ IPS", "");
assert.strictEqual(c.subcategoria, 'Monitor 24" FHD 100Hz IPS');
assert.ok(c.confianza < 0.7, "lo de reglas sale con confianza baja");

console.log("check-precios: todo bien");
