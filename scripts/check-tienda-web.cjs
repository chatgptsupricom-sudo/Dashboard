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

// Solicitud de cuenta (lib/tienda-web/cuentaTipos.ts)
const fuenteCuenta = fs.readFileSync(path.join(__dirname, "..", "lib/tienda-web/cuentaTipos.ts"), "utf8");
const jsCuenta = ts.transpileModule(fuenteCuenta, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mc = { exports: {} };
new Function("require", "module", "exports", jsCuenta)(require, mc, mc.exports);
const { validarSolicitud, normalizarRif, telefonoValido, correosDeSede } = mc.exports;

assert.strictEqual(normalizarRif("j123456789"), "J-12345678-9");
assert.strictEqual(normalizarRif("J-31737690-0"), "J-31737690-0");
assert.strictEqual(normalizarRif("V 12.345.678"), "V-12345678");
assert.strictEqual(normalizarRif("123456789"), null); // sin letra
assert.strictEqual(normalizarRif("X123456789"), null);
assert.ok(telefonoValido("0412-555 5555"));
assert.ok(telefonoValido("+507 399-4554"));
assert.ok(!telefonoValido("12345"));
assert.ok(!telefonoValido("0412abc5555"));

// A quién le llega: por sede, y la variable de entorno manda si trae correos válidos
assert.deepStrictEqual(correosDeSede("caracas"), ["azampetti@supricom.com.ve"]);
assert.deepStrictEqual(correosDeSede("valencia"), ["gerencia.ventas@supricom.com.ve"]);
assert.deepStrictEqual(correosDeSede("panama"), ["contabilidad@supricom.com"]);
assert.deepStrictEqual(correosDeSede("caracas", "valencia=a@x.com;caracas=b@x.com, c@x.com"), ["b@x.com", "c@x.com"]);
assert.deepStrictEqual(correosDeSede("panama", "panama=no-es-correo"), ["contabilidad@supricom.com"]);

const base = {
    sede: "caracas", compraMayor: "si", nombre: "Ana", apellido: "Pérez", telefono: "0412 555 5555", correo: "Ana@Empresa.com",
    empresa: "Tecno Ana C.A.", documento: "j-40123456-7", estado: "Miranda", direccion: "Av. Principal, local 3", tipoNegocio: "Otro",
};
const ok = validarSolicitud(base);
assert.ok(ok.ok);
assert.strictEqual(ok.datos.documento, "J-40123456-7");
assert.strictEqual(ok.datos.correo, "ana@empresa.com");
assert.strictEqual(ok.datos.compraMayor, true);
assert.strictEqual(validarSolicitud({ ...base, sede: "maracaibo" }).campo, "sede");
assert.strictEqual(validarSolicitud({ ...base, documento: "123" }).campo, "documento");
assert.strictEqual(validarSolicitud({ ...base, estado: "Chiriquí" }).campo, "estado"); // provincia de Panamá en Caracas
assert.strictEqual(validarSolicitud({ ...base, correo: "ana@" }).campo, "correo");
assert.strictEqual(validarSolicitud({ ...base, compraMayor: "" }).campo, "compraMayor");
assert.strictEqual(validarSolicitud({ ...base, tipoNegocio: "<script>" }).datos.tipoNegocio, ""); // fuera de la lista: vacío
const pa = validarSolicitud({ ...base, sede: "panama", documento: "155612345-2-2021", estado: "Chiriquí" });
assert.ok(pa.ok);
assert.strictEqual(pa.datos.documento, "155612345-2-2021");

// «Mi cuenta» (lib/tienda-web/clientes/tipos.ts)
const fuenteCli = fs.readFileSync(path.join(__dirname, "..", "lib/tienda-web/clientes/tipos.ts"), "utf8");
const jsCli = ts.transpileModule(fuenteCli, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mk = { exports: {} };
new Function("require", "module", "exports", jsCli)(require, mk, mk.exports);
const { normalizarCorreo, esCorreoInterno, problemaContrasena, codigoValido, claveDocumento, nucleoDocumento, etapaPedido, estadoFactura, diasDeAtraso } = mk.exports;

assert.strictEqual(normalizarCorreo("  Ana@Empresa.COM "), "ana@empresa.com");
assert.strictEqual(normalizarCorreo("ana@empresa"), null);
assert.ok(esCorreoInterno("ventas@supricom.com.ve"));
assert.ok(esCorreoInterno("contabilidad@supricom.com"));
assert.ok(!esCorreoInterno("compras@tiendasupricomx.com"));
assert.strictEqual(problemaContrasena("abc12345"), null);
assert.ok(problemaContrasena("corta1"));
assert.ok(problemaContrasena("soloLetrasAqui"));
assert.ok(problemaContrasena("12345678"));
assert.ok(codigoValido("012345"));
assert.ok(!codigoValido("12345"));
assert.ok(!codigoValido("12a456"));
assert.strictEqual(claveDocumento("J-31737690-0"), claveDocumento("j317376900"));
assert.strictEqual(nucleoDocumento("J-31737690-0"), "31737690");
assert.strictEqual(nucleoDocumento("155612345-2-2021"), "155612345");
assert.strictEqual(nucleoDocumento("J-123"), null);

// Etapa del pedido
assert.strictEqual(etapaPedido({ state: "draft" }), "cotizacion");
assert.strictEqual(etapaPedido({ state: "sent" }), "cotizacion");
assert.strictEqual(etapaPedido({ state: "sale", delivery_status: "partial", invoice_status: "to invoice" }), "confirmado");
assert.strictEqual(etapaPedido({ state: "sale", delivery_status: "full", invoice_status: "to invoice" }), "despachado");
assert.strictEqual(etapaPedido({ state: "sale", delivery_status: "full", invoice_status: "invoiced" }), "facturado");
assert.strictEqual(etapaPedido({ state: "cancel", invoice_status: "invoiced" }), "anulado");

// Estado de la factura
const hoyF = "2026-11-25";
assert.strictEqual(estadoFactura({ move_type: "out_invoice", payment_state: "paid", amount_residual: 0 }, hoyF), "pagada");
assert.strictEqual(estadoFactura({ move_type: "out_invoice", payment_state: "not_paid", amount_residual: 100, invoice_date_due: "2026-11-30" }, hoyF), "pendiente");
assert.strictEqual(estadoFactura({ move_type: "out_invoice", payment_state: "partial", amount_residual: 40, invoice_date_due: "2026-12-30" }, hoyF), "parcial");
assert.strictEqual(estadoFactura({ move_type: "out_invoice", payment_state: "partial", amount_residual: 40, invoice_date_due: "2026-11-24" }, hoyF), "vencida");
assert.strictEqual(estadoFactura({ move_type: "out_invoice", payment_state: "not_paid", amount_residual: 100, invoice_date_due: "2026-11-25" }, hoyF), "pendiente"); // vence hoy: todavía no
assert.strictEqual(estadoFactura({ move_type: "out_refund", amount_residual: -20 }, hoyF), "nota");
assert.strictEqual(diasDeAtraso("2026-11-15", hoyF), 10);
assert.strictEqual(diasDeAtraso("2026-12-05", hoyF), -10);
assert.strictEqual(diasDeAtraso(false, hoyF), null);

console.log("tienda-web: todo bien");
