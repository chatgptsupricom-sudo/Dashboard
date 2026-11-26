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

// Antigüedad de la deuda y avance del despacho
const { tramoDeuda, avanceDespacho } = mk.exports;
assert.strictEqual(tramoDeuda(null), "porVencer");
assert.strictEqual(tramoDeuda(-5), "porVencer");
assert.strictEqual(tramoDeuda(0), "porVencer");
assert.strictEqual(tramoDeuda(1), "d1_30");
assert.strictEqual(tramoDeuda(30), "d1_30");
assert.strictEqual(tramoDeuda(31), "d31_60");
assert.strictEqual(tramoDeuda(90), "d61_90");
assert.strictEqual(tramoDeuda(91), "d90");
assert.strictEqual(avanceDespacho([]), 0);
assert.strictEqual(avanceDespacho([{ cantidad: 3, despachado: 1 }, { cantidad: 1, despachado: 1 }]), 50);
assert.strictEqual(avanceDespacho([{ cantidad: 2, despachado: 5 }]), 100); // de más no pasa del 100
assert.strictEqual(avanceDespacho([{ cantidad: 0, despachado: 0 }]), 0);

// Perfil editable
const { rifValido, enlaceRed, telefonoValido: telefonoPerfil, validarPerfil, tipoDeImagen } = mk.exports;
assert.strictEqual(rifValido("j317376900"), "J-31737690-0");
assert.strictEqual(rifValido("J-31737690-0"), "J-31737690-0");
assert.strictEqual(rifValido("v 12.345.678"), "V-12345678");
assert.strictEqual(rifValido("155612345-2-2021"), "155612345-2-2021"); // RUC de Panamá
assert.strictEqual(rifValido("8-123-456"), "8-123-456");
assert.strictEqual(rifValido("hola"), null);
assert.strictEqual(rifValido("J-12"), null);
assert.strictEqual(enlaceRed("instagram", "@mitienda.ve"), "https://instagram.com/mitienda.ve");
assert.strictEqual(enlaceRed("instagram", "https://www.instagram.com/mitienda/"), "https://instagram.com/mitienda");
assert.strictEqual(enlaceRed("instagram", "https://facebook.com/mitienda"), null); // enlace de otra red
assert.strictEqual(enlaceRed("facebook", "facebook.com/mitienda"), "https://facebook.com/mitienda");
assert.strictEqual(enlaceRed("tiktok", "mitienda"), "https://tiktok.com/@mitienda");
assert.strictEqual(enlaceRed("web", "javascript:alert(1)"), null);
assert.strictEqual(enlaceRed("instagram", "javascript:alert(1)"), null);
assert.strictEqual(enlaceRed("web", "mitienda.com.ve"), "https://mitienda.com.ve");
assert.strictEqual(enlaceRed("web", "mitienda"), null);
assert.strictEqual(enlaceRed("x", ""), "");
assert.strictEqual(telefonoPerfil("0414-123.45.67"), "0414-123.45.67");
assert.strictEqual(telefonoPerfil("12345"), null);
assert.strictEqual(telefonoPerfil("0414abc1234"), null);
const suc = { nombre: "Principal", direccion: "Av. Bolívar, Valencia", contacto: "Ana", telefono: "0241-8251234" };
const bien = { nombre: "Tienda Ana", razones: [{ razon: "Ana C.A.", rif: "j123456789", sucursales: [suc] }], redes: { instagram: "@ana" } };
let r = validarPerfil(bien);
assert.ok(r.ok);
assert.strictEqual(r.datos.razones[0].rif, "J-12345678-9");
assert.strictEqual(r.datos.redes.instagram, "https://instagram.com/ana");
assert.strictEqual(validarPerfil({ ...bien, razones: [] }).campo, "razones"); // mínimo una razón social
assert.strictEqual(validarPerfil({ ...bien, razones: [{ ...bien.razones[0], sucursales: [] }] }).campo, "razones.0.sucursales"); // mínimo una sucursal
assert.strictEqual(validarPerfil({ ...bien, razones: [bien.razones[0], { ...bien.razones[0], razon: "Otra" }] }).campo, "razones.1.rif"); // RIF repetido
assert.strictEqual(validarPerfil({ ...bien, razones: [{ ...bien.razones[0], sucursales: [{ ...suc, telefono: "12" }] }] }).campo, "razones.0.sucursales.0.telefono");
assert.strictEqual(validarPerfil({ ...bien, redes: { web: "javascript:alert(1)" } }).campo, "redes.web");
assert.strictEqual(tipoDeImagen(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10])), "image/png");
assert.strictEqual(tipoDeImagen(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
assert.strictEqual(tipoDeImagen(Uint8Array.from(Buffer.from("<svg onload=alert(1)>"))), null);
// Historial del panel: qué cambió entre dos versiones
const { resumenCambios } = mk.exports;
const v1 = validarPerfil(bien).datos;
assert.match(resumenCambios(null, v1)[0], /primera vez: 1 razón social y 1 sucursal/);
assert.deepStrictEqual(resumenCambios(v1, v1), []);
const v2 = JSON.parse(JSON.stringify(v1));
v2.razones[0].sucursales[0].telefono = "0241-0000000";
v2.razones[0].sucursales.push({ ...suc, nombre: "Almacén" });
v2.razones.push({ razon: "Otra C.A.", rif: "J-11111111-1", sucursales: [suc] });
v2.redes.web = "https://ana.com";
assert.deepStrictEqual(resumenCambios(v1, v2), [
  "Agregó la razón social Otra C.A. (J-11111111-1) con 1 sucursal",
  "Cambió el teléfono de la sucursal Principal de Ana C.A.",
  "Agregó la sucursal Almacén de Ana C.A.",
  "Agregó su Página web",
]);
// Ubicación, enlaces pegados en otro campo y redes encontradas en una página
const { coordenadas, redDeEnlace, redesEnHtml } = mk.exports;
assert.deepStrictEqual(coordenadas("10.1620305", "-68.0076543"), { lat: 10.162031, lng: -68.007654 });
assert.strictEqual(coordenadas(48.85, 2.35), null); // París: fuera de Venezuela y Panamá
assert.strictEqual(coordenadas("", ""), null);
const conPunto = validarPerfil({ ...bien, razones: [{ ...bien.razones[0], sucursales: [{ ...suc, lat: 10.16, lng: -68.0 }] }] });
assert.strictEqual(conPunto.datos.razones[0].sucursales[0].lat, 10.16);
const puntoMalo = validarPerfil({ ...bien, razones: [{ ...bien.razones[0], sucursales: [{ ...suc, lat: "x", lng: 5 }] }] });
assert.ok(puntoMalo.ok); // una ubicación mala no traba el guardado: se ignora
assert.strictEqual(puntoMalo.datos.razones[0].sucursales[0].lat, undefined);
const v3 = JSON.parse(JSON.stringify(v1));
v3.razones[0].sucursales[0].lat = 10.1; v3.razones[0].sucursales[0].lng = -68;
assert.deepStrictEqual(resumenCambios(v1, v3), ["Cambió la ubicación en el mapa de la sucursal Principal de Ana C.A."]);
assert.strictEqual(redDeEnlace("https://www.instagram.com/tienda"), "instagram");
assert.strictEqual(redDeEnlace("fb.com/tienda"), "facebook");
assert.strictEqual(redDeEnlace("@tienda"), null);
assert.strictEqual(redDeEnlace("https://tienda.com"), null);
assert.deepStrictEqual(redesEnHtml(`
  <a href="https://www.facebook.com/sharer/sharer.php?u=x">Compartir</a>
  <a href="https://www.instagram.com/p/ABC123/">Una foto</a>
  <a href="https://www.instagram.com/mitienda/?hl=es">IG</a>
  <a href='https://facebook.com/MiTienda'>FB</a>
  <a href="https://twitter.com/intent/tweet?text=x">tuit</a>
  <a href="https://www.tiktok.com/@mitienda">TikTok</a>
  <a href="https://instagram.com/otra">otra</a>
`), {
  instagram: "https://instagram.com/mitienda",
  facebook: "https://facebook.com/MiTienda",
  tiktok: "https://tiktok.com/@mitienda",
});

// Sincronización del perfil con Odoo (lib/tienda-web/clientes/sincronizarTipos.ts): plan puro
{
  const fuenteSync = fs.readFileSync(path.join(__dirname, "..", "lib/tienda-web/clientes/sincronizarTipos.ts"), "utf8")
    .replace(/import \{[^}]*\} from "\.\/tipos";/, "");
  const jsSync = ts.transpileModule(fuenteSync, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const ms = { exports: {} };
  new Function("require", "module", "exports", "claveDocumento", jsSync)(require, ms, ms.exports, mk.exports.claveDocumento);
  const { planearSincronizacion, valsDireccion, firmaVals, direccionComparable, pasoAOdooActivo, esDireccionDeLaFicha } = ms.exports;
  // La dirección de la ficha se reconoce completa (como la propone el perfil) o solo la calle, con saltos de línea
  const fichaReal = { street: "AV ABRAHAM LINCOLN CON CALLE UNION CC CITY MARKET, Distrito Capital, Distrito Capital, Venezuela", calle: "AV ABRAHAM LINCOLN CON CALLE UNION CC\nCITY MARKET" };
  assert.ok(esDireccionDeLaFicha(fichaReal, "AV ABRAHAM LINCOLN CON CALLE UNION CC CITY MARKET, Distrito Capital, Distrito Capital, Venezuela"));
  assert.ok(esDireccionDeLaFicha(fichaReal, "Av. Abraham Lincoln con calle Unión CC City Market"));
  assert.ok(!esDireccionDeLaFicha(fichaReal, "Av. Andrés Galarraga local 06, Chacao"));

  // Interruptor TIENDA_PERFIL_ODOO: apagado por defecto, un RIF de prueba, o todos
  assert.strictEqual(pasoAOdooActivo(undefined, "d:J123456789"), false);
  assert.strictEqual(pasoAOdooActivo("", "d:J123456789"), false);
  assert.strictEqual(pasoAOdooActivo("no", "d:J123456789"), false);
  assert.strictEqual(pasoAOdooActivo("todos", "d:J123456789"), true);
  assert.strictEqual(pasoAOdooActivo("todos", "p:4512"), true);
  assert.strictEqual(pasoAOdooActivo("J-12345678-9", "d:J123456789"), true); // el de prueba, escrito con guiones
  assert.strictEqual(pasoAOdooActivo("J-11111111-1, j123456789", "d:J123456789"), true);
  assert.strictEqual(pasoAOdooActivo("J-12345678-9", "d:J999999999"), false); // los demás no
  assert.strictEqual(pasoAOdooActivo("J-12345678-9", "p:4512"), false);
  const { idSucursalValido } = mk.exports;

  assert.ok(idSucursalValido("a1b2c3d4e5f6"));
  assert.ok(!idSucursalValido("ABC"));
  // validarPerfil conserva un id válido y descarta uno repetido o raro
  const conIds = validarPerfil({ ...bien, razones: [{ ...bien.razones[0], sucursales: [{ ...suc, id: "a1b2c3d4e5f6" }, { ...suc, nombre: "Otra", id: "a1b2c3d4e5f6" }, { ...suc, nombre: "Tercera", id: "<script>" }] }] });
  assert.strictEqual(conIds.datos.razones[0].sucursales[0].id, "a1b2c3d4e5f6");
  assert.strictEqual(conIds.datos.razones[0].sucursales[1].id, undefined);
  assert.strictEqual(conIds.datos.razones[0].sucursales[2].id, undefined);
  assert.strictEqual(direccionComparable("Av. Bolívar  Norte, Torre"), direccionComparable("av bolivar norte torre"));

  const s1 = { id: "s1s1s1s1", nombre: "Principal", direccion: "Av. Bolívar Norte, Valencia", contacto: "Ana", telefono: "0241-8251234", lat: 10.2, lng: -68 };
  const s2 = { id: "s2s2s2s2", nombre: "Almacén", direccion: "Zona Industrial Los Guayos, galpón 12", contacto: "Luis", telefono: "0241-5550000" };
  const datos = { nombre: "Ana", redes: {}, razones: [
    { razon: "Ana C.A.", rif: "J-12345678-9", sucursales: [s1, s2] },
    { razon: "Nueva C.A.", rif: "J-99999999-9", sucursales: [{ ...s1, id: "s3s3s3s3" }] }, // no está en Odoo
  ] };
  // Dos fichas (Valencia y Caracas) con el mismo RIF; en Valencia ya hay una dirección igual a la del almacén.
  const padres = [
    { id: 100, company: 9, clave: "J123456789", pais: 238, hijos: [{ id: 501, name: "Ana - Los Guayos", street: "Zona Industrial los guayos galpon 12", active: true }] },
    { id: 200, company: 10, clave: "J123456789", pais: 238, hijos: [] },
  ];
  let plan = planearSincronizacion(datos, padres, []);
  assert.deepStrictEqual(plan.sinOdoo, ["Nueva C.A."]); // no se crea la empresa sola
  assert.deepStrictEqual(plan.ops.map((o) => [o.tipo, o.sucursalId, o.company, o.partnerId || o.padre]), [
    ["crear", "s1s1s1s1", 9, 100], ["crear", "s1s1s1s1", 10, 200],
    ["adoptar", "s2s2s2s2", 9, 501], // misma dirección: se adopta, no se duplica
    ["crear", "s2s2s2s2", 10, 200],
  ]);
  assert.strictEqual(plan.ops[0].vals.name, "Ana C.A. - Principal");
  assert.strictEqual(plan.ops[0].vals.partner_latitude, 10.2);
  assert.match(valsDireccion("X", { ...s1, contacto: "<b>Ana</b>" }).comment, /&lt;b&gt;Ana/); // el contacto va escapado
  // Ya sincronizado: nada que hacer
  const enlaces = [
    { sucursalId: "s1s1s1s1", company: 9, partnerId: 601, firma: firmaVals(valsDireccion("Ana C.A.", s1)) },
    { sucursalId: "s1s1s1s1", company: 10, partnerId: 602, firma: firmaVals(valsDireccion("Ana C.A.", s1)) },
    { sucursalId: "s2s2s2s2", company: 9, partnerId: 501, firma: firmaVals(valsDireccion("Ana C.A.", s2)) },
    { sucursalId: "s2s2s2s2", company: 10, partnerId: 603, firma: firmaVals(valsDireccion("Ana C.A.", s2)) },
  ];
  const padres2 = [
    { ...padres[0], hijos: [{ id: 501, name: "a", street: "x", active: true }, { id: 601, name: "b", street: "y", active: true }] },
    { ...padres[1], hijos: [{ id: 602, name: "c", street: "z", active: true }, { id: 603, name: "d", street: "w", active: false }] },
  ];
  plan = planearSincronizacion(datos, padres2, enlaces);
  assert.deepStrictEqual(plan.ops, []); // 603 la archivó el vendedor: no se revive
  // Cambia el teléfono de la principal y quitan el almacén
  const datos2 = JSON.parse(JSON.stringify(datos));
  datos2.razones[0].sucursales = [{ ...s1, telefono: "0414-0000000" }];
  plan = planearSincronizacion(datos2, padres2, enlaces);
  assert.deepStrictEqual(plan.ops.map((o) => [o.tipo, o.partnerId]), [["actualizar", 601], ["actualizar", 602], ["archivar", 501]]);
  // La «Principal» que vino de Odoo es la dirección de la propia ficha: no se duplica; solo se ubica la ficha en el mapa
  const fichaConDir = [{ id: 300, company: 10, clave: "J123456789", pais: 238, hijos: [], street: "Av. Bolívar Norte, Valencia", lat: 0, lng: 0 }];
  const soloPrincipal = { ...datos, razones: [{ ...datos.razones[0], sucursales: [s1] }] };
  plan = planearSincronizacion(soloPrincipal, fichaConDir, []);
  assert.deepStrictEqual(plan.ops.map((o) => [o.tipo, o.partnerId, o.lat]), [["ubicar_ficha", 300, 10.2]]);
  assert.deepStrictEqual(planearSincronizacion(soloPrincipal, [{ ...fichaConDir[0], lat: 10.2, lng: -68 }], []).ops, []); // ya ubicada
  assert.deepStrictEqual(planearSincronizacion({ ...soloPrincipal, razones: [{ ...soloPrincipal.razones[0], sucursales: [{ ...s1, lat: undefined, lng: undefined }] }] }, fichaConDir, []).ops, []);
  // Una sucursal sin dirección todavía no se manda a Odoo
  const datos3 = JSON.parse(JSON.stringify(datos));
  datos3.razones[0].sucursales = [{ ...s2, id: "s4s4s4s4", direccion: "" }];
  assert.ok(planearSincronizacion(datos3, padres, []).ops.every((o) => o.tipo !== "crear"));
}

console.log("tienda-web: todo bien");
