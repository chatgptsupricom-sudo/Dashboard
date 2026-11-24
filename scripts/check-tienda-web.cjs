// Chequeo de las reglas de la tienda web pública (nombre legible, marca, categoría, descripción):
//   node scripts/check-tienda-web.cjs
// Transpila lib/tienda-web/tipos.ts con TypeScript (no usa Odoo ni la base).
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");

const fuente = fs.readFileSync(path.join(__dirname, "..", "lib/tienda-web/tipos.ts"), "utf8");
const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = { exports: {} };
new Function("require", "module", "exports", js)(require, m, m.exports);
const { nombreBonito, marcaBonita, categoriaDe, limpiarDescripcion, textoPlano, recortar } = m.exports;

// Nombres reales de Odoo
assert.strictEqual(nombreBonito("CANON IMPRESORA PIXMA G4170 -  MULTIFUNCIONAL, T. TINTA, WIFI", "Canon"),
    "Impresora PIXMA G4170 - Multifuncional, T. Tinta, WiFi");
assert.strictEqual(nombreBonito("HAVIT AUDIFONOS PRO INALAMBRICOS BLUETOOTH  SPACE NC01H GREY", "Havit"),
    "Audífonos Pro Inalámbricos Bluetooth Space NC01H Grey");
assert.strictEqual(nombreBonito("IMPRESORA HP MULTIFUNCIONAL SMART TANK 580 W", "HP"), "Impresora HP Multifuncional Smart Tank 580 W");
assert.strictEqual(nombreBonito("HP TINTA GT52 CYAN PROMO (ORIGINAL)", "HP"), "Tinta GT52 Cyan Promo (Original)");
assert.strictEqual(nombreBonito("ASUS VIVOBOOK 16 F1605VA-WS96 CORETM I9-13900H 1TB SSD 16GB", "ASUS"),
    "Vivobook 16 F1605VA-WS96 Coretm I9-13900H 1TB SSD 16GB");
assert.strictEqual(nombreBonito("TP-LINK ROUTER ARCHER C6U AC1200 DE DOBLE BANDA", "TP-Link"), "Router Archer C6U AC1200 de Doble Banda");
// Lo que ya viene con minúsculas se respeta
assert.strictEqual(nombreBonito("NEXXT HOME Cámara inteligente Wi-Fi PTZ", "Nexxt"), "Home Cámara inteligente Wi-Fi PTZ");
assert.strictEqual(nombreBonito("", "HP"), "");
// Sin marca no se quita nada
assert.strictEqual(nombreBonito("CABLE USB A TIPO C 1M", ""), "Cable USB a Tipo C 1M");

// Marcas
assert.strictEqual(marcaBonita("TP-LINK"), "TP-Link");
assert.strictEqual(marcaBonita("HAVIT"), "Havit");
assert.strictEqual(marcaBonita("SIN MARCA"), "");
assert.strictEqual(marcaBonita("GRAN MARCA NUEVA"), "Gran Marca Nueva");
assert.strictEqual(marcaBonita("Smartbitt"), "Smartbitt");

// Categorías de Odoo → de la página
assert.strictEqual(categoriaDe("IMPRESORA"), "impresion");
assert.strictEqual(categoriaDe("PAPELERIA"), "consumibles");
assert.strictEqual(categoriaDe("COMPONENTES / COMPUTACION"), "computo");
assert.strictEqual(categoriaDe("UPS Y REGULADORES"), "energia");
assert.strictEqual(categoriaDe("All / Saleable / ROUTERING"), "redes");
assert.strictEqual(categoriaDe("GENERAL"), "otros");
assert.strictEqual(categoriaDe(null), "otros");

// Descripción: viñetas de la larga, sin etiquetas ni entidades
const larga = '<section><div><h2>Descripción</h2><ul><li><strong>Impresión</strong>:&nbsp;<a href="x">A color</a></li><li>Peso: 5 kg</li><li>Peso: 5 kg</li></ul></div></section>';
const d = limpiarDescripcion("<p>La HP Smart Tank 580 es una impresora multifuncional para hogares y oficinas.</p><ul><li>no</li></ul>", larga);
assert.deepStrictEqual(d.puntos, ["Impresión: A color", "Peso: 5 kg"]);
assert.strictEqual(d.resumen, "La HP Smart Tank 580 es una impresora multifuncional para hogares y oficinas.");
// Sin <li> en la larga: los párrafos «Clave: valor»
const kv = limpiarDescripcion("", "<p>Resolución DPI: 800-1200-1600</p><p>Un párrafo largo sin dos puntos que no es especificación.</p><p>Teclas: 104</p>");
assert.deepStrictEqual(kv.puntos, ["Resolución DPI: 800-1200-1600", "Teclas: 104"]);
// Sin nada en la larga: las <li> del resumen
assert.deepStrictEqual(limpiarDescripcion("<ul><li>Color: Cian</li></ul>", "").puntos, ["Color: Cian"]);
// Un resumen que es solo el nombre no sirve
assert.strictEqual(limpiarDescripcion("CANON IMPRESORA PIXMA TS3610", "").resumen, "");
assert.strictEqual(textoPlano("A&amp;B<br>C"), "A&B C");
assert.strictEqual(recortar("Uno dos tres. Cuatro cinco seis siete", 20), "Uno dos tres.");

console.log("tienda-web: todo bien");
