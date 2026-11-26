// Chequeo de la conciliacion bancaria (lectura de estados de cuenta y cruce):
//   node scripts/check-bancos.cjs
// Transpila lib/administracion/bancosCruce.ts con TypeScript (no usa la base).
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");

const fuente = fs.readFileSync(path.join(__dirname, "..", "lib/administracion/bancosCruce.ts"), "utf8");
const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = { exports: {} };
new Function("require", "module", "exports", js)(require, m, m.exports);
const { leerFilasExcel, armarEstado, montoDeCelda, fechaDeCelda, mismaReferencia, cruzarBanco, codigoBanco, referenciaMercantil, esBolivares, celular58 } = m.exports;

// Montos y fechas
assert.strictEqual(montoDeCelda("+1.394.295,35"), 1394295.35);
assert.strictEqual(montoDeCelda("-391,00"), -391);
assert.strictEqual(montoDeCelda("136,108.70"), 136108.7);
assert.strictEqual(montoDeCelda("204.000"), 204000);
assert.strictEqual(montoDeCelda("(50.00)"), -50);
assert.strictEqual(montoDeCelda(1155), 1155);
assert.strictEqual(fechaDeCelda("2026/10/22"), "2026-10-22");
assert.strictEqual(fechaDeCelda("27/10/2026"), "2026-10-27");
assert.strictEqual(fechaDeCelda(46322), "2026-10-27");
assert.strictEqual(fechaDeCelda("31/02/2026"), null);

// Referencias: ceros adelante, prefijos del banco, ACH
assert.ok(mismaReferencia("00000694003", "694003"));
assert.ok(mismaReferencia("20467137440", "67137440"));
assert.ok(mismaReferencia("0025505198339", "25505198339"));
assert.ok(mismaReferencia("ACH-10092026I920175", "I920175"));
assert.ok(!mismaReferencia("51895207", "00047710548"));
assert.ok(!mismaReferencia("", ""));
assert.ok(mismaReferencia("000056789", "56789")); // ceros a la izquierda
assert.ok(mismaReferencia("0000056789", "REF: 56789 FACT 5039")); // Memo con texto
assert.ok(mismaReferencia("1234056789", "56789")); // el banco antepone cifras
assert.ok(!mismaReferencia("1234056789", "6789")); // 4 cifras al final no bastan
assert.ok(!mismaReferencia("12345", "54321"));

// Formato Mercantil: encabezado con datos de la empresa arriba, saldo inicial/final
const mercantil = leerFilasExcel([
  ["Nombre empresa:", "EMPRESA DE PRUEBA, C.A.", "Monto total:", "1.000,00", ""],
  ["Nro. Cuenta:", "0000000001", "", "", ""],
  ["Fecha", "Referencia", "Descripción", "Monto", "Saldo"],
  ["24/10/2026", "   ", "SALDO INICIAL", "0,00", "0,00"],
  ["27/10/2026", "20467137440", "CREDITO INMEDIATO CAMARA DE COMPENSACION", "887.400,00", "4.416.400,89"],
  ["", "82558667850", "PAGO MOVIL COMERCIAL INTERBANCARIO", "26.000,00", "4.442.400,89"],
  ["27/10/2026", "80558667850", "COMISION PAGO MOVIL", "-391,00", "4.442.009,89"],
  ["27/10/2026", "   ", "SALDO FINAL", "4.442.009,89", "4.442.009,89"],
]);
assert.strictEqual(mercantil.filas.length, 3);
assert.strictEqual(mercantil.filas[1].fecha, "2026-10-27"); // fecha vacia = la de arriba
assert.strictEqual(mercantil.desde, "2026-10-24");
assert.strictEqual(mercantil.hasta, "2026-10-27");
assert.strictEqual(mercantil.saltos, 0);

// Formato Banesco (tabla HTML): montos con signo, falta una fila en el medio
const banesco = leerFilasExcel([
  ["Fecha", "Referencia", "Descripción", "Monto", "Balance"],
  ["2026/10/22", "00000694003", "TRF CR INM 0115 J000000001 CLIENTE UNO", "+1.394.295,35", "17.245.986,02"],
  ["2026/10/22", "00000694142", "TRF CR INM 0115 J000000001 CLIENTE UNO", "+99.820,24", "17.345.806,26"],
  ["2026/10/22", "13417591504", "TRFOB 0108 J000000002 PROVEEDOR", "-13.120,95", "18.000.000,00"],
]);
assert.strictEqual(banesco.filas[0].monto, 1394295.35);
assert.strictEqual(banesco.saltos, 1);

// Debito / Credito en columnas separadas
const separado = leerFilasExcel([
  ["Fecha", "Concepto", "Débito", "Crédito", "Saldo"],
  ["01/10/2026", "DEPOSITO", "", "100,00", "100,00"],
  ["02/10/2026", "COMISION", "5,00", "", "95,00"],
]);
assert.deepStrictEqual(separado.filas.map((f) => f.monto), [100, -5]);

// Captura sin signo, lo mas nuevo arriba (Banesco Panama): el signo sale del saldo
const panama = armarEstado([
  { fecha: "2026-10-27", referencia: "", descripcion: "Transf DE CUENTA NO.- 221023059068", monto: 3321.2, saldo: 573812.91 },
  { fecha: "2026-10-26", referencia: "", descripcion: "PAGO PROVEEDOR", monto: 1000, saldo: 570491.71 },
  { fecha: "2026-10-26", referencia: "", descripcion: "Transf DE CUENTA NO.- 221021542357", monto: 136108.7, saldo: 571491.71 },
  { fecha: "2026-10-26", referencia: "", descripcion: "Transf", monto: 247, saldo: 435383.01 },
]);
assert.deepStrictEqual(panama.filas.map((f) => f.monto), [3321.2, -1000, 136108.7, 247]);
assert.strictEqual(panama.saltos, 0);

// Columna "Movimiento" o "Valor" con signo (ingresos y egresos juntos); "Fecha valor" no es el monto
const conMovimiento = leerFilasExcel([
  ["Fecha", "Fecha valor", "Referencia", "Concepto", "Movimiento", "Saldo"],
  ["03/11/2026", "03/11/2026", "111222333", "TRF RECIBIDA", "1.500,00", "11.500,00"],
  ["03/11/2026", "03/11/2026", "444555666", "PAGO PROVEEDOR", "-500,00", "11.000,00"],
]);
assert.deepStrictEqual(conMovimiento.filas.map((f) => f.monto), [1500, -500]);
assert.deepStrictEqual(leerFilasExcel([["Fecha", "Descripción", "Valor"], ["03/11/2026", "X", "-20,00"]]).filas.map((f) => f.monto), [-20]);
// Con Monto, "Movimiento" no se usa como monto (es la descripcion)
assert.deepStrictEqual(
  leerFilasExcel([["Fecha", "Movimiento", "Monto"], ["03/11/2026", "TRF 0115 J000000001", "-20,00"]]).filas.map((f) => f.monto),
  [-20],
);

// Periodo: un mes o un rango de hasta 93 dias
const { errorPeriodo } = m.exports;
assert.strictEqual(errorPeriodo("2026-11-01", "2026-11-30"), null);
assert.strictEqual(errorPeriodo("2026-09-01", "2026-11-30"), null); // 91 dias
assert.ok(errorPeriodo("2026-08-01", "2026-11-30")); // mas de 93
assert.ok(errorPeriodo("2026-11-30", "2026-11-01")); // al reves
assert.ok(errorPeriodo("2026-02-30", "2026-03-01")); // fecha que no existe
assert.ok(errorPeriodo("", "2026-11-01"));

// Cruce
const mov = (id, fecha, referencia, monto, descripcion = "") => ({ id, fecha, referencia, descripcion, monto, saldo: null });
const movimientos = [
  mov("a".repeat(64), "2026-10-27", "20467137440", 887400),
  mov("b".repeat(64), "2026-10-26", "", 136108.7, "Transf Banesco Online DE CUENTA NO.- 221021542357 A"),
  mov("c".repeat(64), "2026-10-26", "", 247),
  mov("d".repeat(64), "2026-10-27", "80558667850", -391),
  mov("e".repeat(64), "2026-10-22", "00000302398", 280789.6),
];
const pagos = [
  { id: 1, nombre: "PMERCA/1", fecha: "2026-10-26", monto: 887400, cliente: "Cliente A", ref: "67137440" },
  { id: 2, nombre: "PBANEP/1", fecha: "2026-10-26", monto: 136108.7, cliente: "Cliente B", ref: "FT26299HGVGCF" },
  { id: 3, nombre: "PBANES/1", fecha: "2026-10-22", monto: 280789.6, cliente: "Cliente C", ref: "100676544" },
  { id: 4, nombre: "PBANES/2", fecha: "2026-10-23", monto: 5000, cliente: "Cliente D", ref: "999999" },
  { id: 5, nombre: "PBANES/3", fecha: "2026-10-10", monto: 7000, cliente: "Cliente E", ref: "888888" },
];
const comp = (id, fecha, referencia, monto, cuentaOrigen = "") => ({
  id, fecha, referencia, monto, moneda: "USD", cuentaOrigen, banco: "", motivo: "", cliente: `C${id}`, movimientoId: null, archivoNombre: "", subidoPor: "",
});
const comprobantes = [
  comp(10, "2026-10-26", "FT26299HGVGCF", 136108.7, "2357"), // por la ref del cobro de Odoo
  comp(11, "2026-10-26", "XYZ123456", 247), // un solo movimiento de ese monto, sin cobro en Odoo
  comp(12, "2026-10-25", "ABC999999", 999), // no esta en el banco
  comp(13, "2026-10-01", "QWE111111", 50), // dia sin estado de cuenta
];
const cubierto = (d) => d >= "2026-10-22" && d <= "2026-10-27";
const r = cruzarBanco(movimientos, pagos, comprobantes, new Map(), cubierto);
const estadoMov = Object.fromEntries(r.movimientos.map((x) => [x.id[0], [x.estado, x.pago?.id ?? null]]));
assert.deepStrictEqual(estadoMov, {
  a: ["referencia", 1],
  b: ["parcial", 2], // monto + fecha, sin referencia
  c: ["sin_registrar", null],
  d: ["sin_registrar", null], // salida sin pago ni "comision"
  e: ["parcial", 3],
});

// Salidas: con el pago a proveedor (monto negativo) por el Memo; comision sin pago
const salidas = cruzarBanco(
  [mov("f".repeat(64), "2026-10-27", "13428526349", -145536.99), mov("g".repeat(64), "2026-10-27", "80558667850", -391, "COMISION PAGO MOVIL")],
  [...pagos, { id: 6, nombre: "PBANES/4", fecha: "2026-10-26", monto: -145536.99, cliente: "Proveedor", ref: "13428526349" }],
  [],
  new Map(),
  cubierto,
);
assert.deepStrictEqual(salidas.movimientos.map((x) => [x.estado, x.pago?.id ?? null]), [["referencia", 6], ["comision", null]]);
assert.ok(m.exports.esComision({ monto: -10, descripcion: "COMIS. TRF" }) && !m.exports.esComision({ monto: 10, descripcion: "COMISION" }));
assert.ok(!m.exports.esComision({ monto: -10, descripcion: "COMPRA DE PINTURA" }));
const { cuentaSugerida, errorPagos } = m.exports;
assert.strictEqual(cuentaSugerida({ monto: -30, descripcion: "COBRO IGTF 3%" }), "igtf");
assert.strictEqual(cuentaSugerida({ monto: -30, descripcion: "COMISION PAGO MOVIL" }), "comision");
assert.strictEqual(cuentaSugerida({ monto: -30, descripcion: "PAGO PROVEEDOR" }), null);
// Varios cobros: suman justo el movimiento; uno solo puede ser mayor (cobro abonado en partes)
assert.strictEqual(errorPagos(1000, [600, 400]), null);
assert.ok(errorPagos(1000, [600, 500]));
assert.strictEqual(errorPagos(-400, [1000]), null);
assert.ok(errorPagos(1000, [400]));
assert.ok(errorPagos(1000, [1000, 0]));
assert.ok(errorPagos(1000, []));
// Fecha, referencia y monto: dos de tres (o solo la referencia) quedan "parcial", con lo que coincide
const tres = cruzarBanco(
  [
    mov("i".repeat(64), "2026-10-20", "0000056789", 1000), // ref + monto, fecha lejos
    mov("j".repeat(64), "2026-10-26", "00077777", 999), // ref + fecha, monto distinto
    mov("k".repeat(64), "2026-10-26", "11111111", 321), // solo la referencia
  ],
  [
    { id: 7, nombre: "P7", fecha: "2026-10-28", monto: 1000, cliente: "", ref: "56789" },
    { id: 8, nombre: "P8", fecha: "2026-10-27", monto: 900, cliente: "", ref: "77777" },
    { id: 9, nombre: "P9", fecha: "2026-11-05", monto: 500, cliente: "", ref: "11111111" },
  ],
  [],
  new Map(),
  cubierto,
);
assert.deepStrictEqual(
  tres.movimientos.map((x) => [x.estado, x.pago && x.pago.id, x.coincide]),
  [
    ["parcial", 7, { referencia: true, monto: true, fecha: false }],
    ["parcial", 8, { referencia: true, monto: false, fecha: true }],
    ["parcial", 9, { referencia: true, monto: false, fecha: false }],
  ],
);
// Cobro dividido: mismo Memo con -1, que suman el movimiento (antes tomaba solo el -1 por referencia + fecha)
const dividido = cruzarBanco(
  [mov("l".repeat(64), "2026-10-05", "03626455533", 498871.03)],
  [
    { id: 21, nombre: "PBANES/01322", fecha: "2026-10-05", monto: 19187.35, cliente: "MICROMAC", ref: "3626455533-1" },
    { id: 20, nombre: "PBANES/01321", fecha: "2026-10-05", monto: 479683.68, cliente: "MICROMAC", ref: "3626455533" },
  ],
  [],
  new Map(),
  cubierto,
).movimientos[0];
assert.deepStrictEqual([dividido.estado, dividido.pago.id, dividido.otrosPagos.map((p) => p.id)], ["referencia", 20, [21]]);
assert.deepStrictEqual(dividido.coincide, { referencia: true, monto: true, fecha: true });
// Un cobro no se amarra con una salida del mismo monto
assert.strictEqual(cruzarBanco([mov("h".repeat(64), "2026-10-26", "", -5000)], pagos, [], new Map(), cubierto).movimientos[0].pago, null);
assert.deepStrictEqual(r.comprobantes.map((c) => c.estado), ["conciliado", "sin_registrar", "no_encontrado", "sin_estado"]);
assert.deepStrictEqual(r.pagosSinMovimiento.map((p) => p.id), [4]); // el 5 es de un dia sin estado de cuenta

// A mano: el movimiento c con el cobro 4 aunque el monto no coincida
const manual = cruzarBanco(movimientos, pagos, [], new Map([["c".repeat(64), 4]]), cubierto);
assert.deepStrictEqual(
  manual.movimientos.filter((x) => x.id[0] === "c").map((x) => [x.estado, x.pago.id]),
  [["manual", 4]],
);

// Sin estado de cuenta, con la API del banco (Mercantil)
const api = (estado) => ({ estado, el: "2026-11-13T00:00:00Z" });
const conApi = [
  { ...comp(20, "2026-10-10", "0000888888", 7000), api: api("confirmado") }, // confirmado + cobro 5 por ref y monto
  { ...comp(21, "2026-10-10", "777777", 7000), api: api("confirmado") }, // confirmado, sin cobro en Odoo
  { ...comp(22, "2026-10-10", "666666", 1), api: api("no_encontrado") }, // el banco no lo encontro
  { ...comp(23, "2026-10-10", "555555", 1), api: api("error") }, // error: como si no se hubiera consultado
  { ...comp(24, "2026-10-01", "QWE111111", 50), api: api("confirmado"), odooPagoId: 4 }, // registrado desde el panel
];
const ra = cruzarBanco([], pagos, conApi, new Map(), () => false);
assert.deepStrictEqual(
  ra.comprobantes.map((c) => [c.estado, c.pago?.id ?? null]),
  [["conciliado", 5], ["sin_registrar", null], ["no_encontrado", null], ["sin_estado", null], ["conciliado", 4]],
);
assert.deepStrictEqual([...ra.pagosConfirmadosApi].sort(), [4, 5]);

// Bancos y referencias para la API de Mercantil
assert.strictEqual(codigoBanco("BANESCO BANCO UNIVERSAL"), 134);
assert.strictEqual(codigoBanco("Banco de Venezuela"), 102);
assert.strictEqual(codigoBanco("Venezolano de Crédito"), 104);
assert.strictEqual(codigoBanco("0191 - BNC"), 191);
assert.strictEqual(codigoBanco("Banco Nacional de Crédito"), 191);
assert.strictEqual(codigoBanco("BBVA Provincial"), 108);
assert.strictEqual(codigoBanco("Pago móvil"), null);
assert.strictEqual(referenciaMercantil("13427068326"), "27068326");
assert.ok(esBolivares("") && esBolivares("VES") && esBolivares("Bs") && !esBolivares("USD"));

assert.strictEqual(celular58("0412-5075239"), "584125075239");
assert.strictEqual(celular58("+58 412-507-5239"), "584125075239");
assert.strictEqual(celular58("04**-***5239"), null);

// Lineas viejas de Odoo con el monto mal cargado
const { distanciaMonto, emparejarViejas } = m.exports;
assert.strictEqual(distanciaMonto(187841.46, 187841.46), 0);
assert.ok(distanciaMonto(187841.5, 187841.46) > 0); // redondeada
assert.ok(distanciaMonto(1878414.6, 187841.46) !== null); // coma corrida
assert.strictEqual(distanciaMonto(-5000, 5000), null); // otro signo
assert.strictEqual(distanciaMonto(190000, 187841.46), null); // otro monto
const viejas = [
  { id: 1, fecha: "2026-04-06", monto: -95700, ref: "13313559299" },
  { id: 2, fecha: "2026-04-06", monto: -28710.4, ref: "13313559299" }, // decimales mal
  { id: 3, fecha: "2026-04-06", monto: 187841.5, ref: "" }, // redondeada, sin ref
  { id: 4, fecha: "2026-04-07", monto: 500, ref: "" }, // otro dia, sin ref: no
  { id: 5, fecha: "2026-04-08", monto: 1000.3, ref: "77777777" }, // otro dia con la misma ref
];
const movsPanel = [
  { fecha: "2026-04-06", monto: -95700, referencia: "00013313559299" },
  { fecha: "2026-04-06", monto: -28710, referencia: "00013313559299" },
  { fecha: "2026-04-06", monto: 187841.46, referencia: "38080585" },
  { fecha: "2026-04-06", monto: 500, referencia: "" },
  { fecha: "2026-04-06", monto: 1000, referencia: "0077777777" },
];
const em = emparejarViejas(viejas, movsPanel);
assert.strictEqual(em.get(1).monto, -95700);
assert.strictEqual(em.get(2).monto, -28710);
assert.strictEqual(em.get(3).monto, 187841.46);
assert.ok(!em.has(4));
assert.strictEqual(em.get(5).monto, 1000);

// Solo el monto: un unico pago de ese monto exacto en ±15 dias y nadie mas lo quiere
const pg = (id, fecha, monto, ref) => ({ id, nombre: "P/" + id, fecha, monto, cliente: "X", ref });
const soloMonto = cruzarBanco(
  [
    mov("cepro", "2026-05-04", "00000000089", -37483.12, "DOMICILIACEDI CEPRO ALARM C"), // pago el 12/05 con Memo 877
    mov("rep1", "2026-05-04", "111", -5000), // dos movimientos de 5000 y un pago: duda, nada
    mov("rep2", "2026-05-06", "222", -5000),
    mov("dos", "2026-05-04", "333", 700), // dos cobros de 700: duda, nada
    mov("com", "2026-05-04", "", -12.5, "COMISION TRANSF"), // comision: no
  ],
  [pg(90, "2026-05-12", -37483.12, "877"), pg(91, "2026-05-10", -5000, "x"), pg(92, "2026-05-10", 700, "a"), pg(93, "2026-05-12", 700, "b"), pg(94, "2026-05-12", -12.5, "c")],
  [],
  new Map(),
  () => true,
);
const porMov = (id) => soloMonto.movimientos.find((x) => x.id === id);
assert.strictEqual(porMov("cepro").pago?.id, 90);
assert.strictEqual(porMov("cepro").estado, "parcial");
assert.ok(!porMov("cepro").coincide.fecha && !porMov("cepro").coincide.referencia && porMov("cepro").coincide.monto);
assert.strictEqual(porMov("rep1").pago, null);
assert.strictEqual(porMov("rep2").pago, null);
assert.strictEqual(porMov("dos").pago, null);
assert.strictEqual(porMov("com").estado, "comision");

// Misma fecha y monto casi igual (Odoo con unos centimos de diferencia): un unico candidato
const casi = cruzarBanco(
  [
    mov("t2", "2026-04-06", "13313570942", -861300, "TRFOB 0102 V022730491 JOSE LINAREZ 4182"), // TRANSF/00002 en Odoo -861.300,29
    mov("lejos", "2026-04-06", "999", -50000), // pago casi igual, pero 14 dias despues: nada
    mov("d1", "2026-04-07", "1", -1000), // dos movimientos casi iguales al mismo pago: duda, nada
    mov("d2", "2026-04-07", "2", -1000.5),
  ],
  [pg(95, "2026-04-06", -861300.29, "TRANSF/00002 - Send"), pg(96, "2026-04-20", -50010, "y"), pg(97, "2026-04-07", -1000.2, "z")],
  [],
  new Map(),
  () => true,
);
const casiMov = (id) => casi.movimientos.find((x) => x.id === id);
assert.strictEqual(casiMov("t2").pago?.id, 95);
assert.strictEqual(casiMov("t2").estado, "parcial");
assert.ok(casiMov("t2").coincide.fecha && !casiMov("t2").coincide.monto);
assert.strictEqual(casiMov("lejos").pago, null); // fuera de los dias
assert.strictEqual(casiMov("d1").pago, null);
assert.strictEqual(casiMov("d2").pago, null);

// Fechas mes/dia (Excel de Banesco Panama) y dia/mes
{
  const { ordenDeFechas } = m.exports;
  assert.strictEqual(ordenDeFechas(["04/01/2026", "04/13/2026", "04/30/2026"]), "mdy");
  assert.strictEqual(ordenDeFechas(["01/04/2026", "13/04/2026"]), "dmy");
  assert.strictEqual(ordenDeFechas(["01/04/2026", "02/04/2026"]), "dmy"); // sin pistas: dia/mes
  assert.strictEqual(fechaDeCelda("04/13/2026", "mdy"), "2026-04-13");
  const pan = leerFilasExcel([["Fecha", "Descripcion", "Monto"], ["04/01/2026", "ACH A", "100.00"], ["04/13/2026", "ACH B", "50.00"]]);
  assert.deepStrictEqual(pan.filas.map((f) => f.fecha), ["2026-04-01", "2026-04-13"]);
}

// Excel en ingles con dia/mes cruzados: dias 1-12 como fecha real al reves, 13+ como texto (Banesco Panama abril)
{
  const filas = [["Fecha ", "Referencia", "monto"], [46026, "ACH A", 3029.64], [46177, "ACH B", 2149.13], ["13/04/2026", "ACH C", 100], ["30/04/2026", "ACH D", 50]];
  const l = leerFilasExcel(filas);
  assert.deepStrictEqual(l.filas.map((f) => f.fecha), ["2026-04-01", "2026-04-06", "2026-04-13", "2026-04-30"]);
  // Un Excel normal con fechas reales no se toca
  assert.deepStrictEqual(leerFilasExcel([["Fecha", "Monto"], [46026, 10], [46177, 20]]).filas.map((f) => f.fecha), ["2026-01-04", "2026-06-04"]);
}

// Bancamiga: periodo y «Saldo Inicial» arriba del encabezado, totales abajo, «Nro.» y «Referencia»
{
  const l = leerFilasExcel([
    ["Bancamiga Banco Universal"],
    ["Movimientos del 01/04/2026-30/04/2026"],
    ["Saldo Inicial: 21076.56"],
    ["Nro.", "Fecha", "Referencia", "Concepto", "Débito", "Crédito", "Saldo"],
    [1, 46119, "'13914869", "NC Credito Inmediato", 0, 150000, 171076.56],
    [23, 46142, "'563042", "Envio de SMS", 8, 0, 717.59],
    ["", "", "", "", "", "", ""],
    ["Creditos Total: 798000", "", "", "Debito Total: 818358,97", "", "Saldo Final: 717,59000000004"],
  ]);
  assert.strictEqual(l.filas.length, 2);
  assert.deepStrictEqual(l.filas.map((f) => f.referencia), ["13914869", "563042"]);
  assert.strictEqual(l.desde, "2026-04-01");
  assert.strictEqual(l.hasta, "2026-04-30");
}

// Cobro dividido del mismo cliente (principal + 4 %) con Memo que no es la referencia del banco
const pc = (id, fecha, monto, ref, cliente) => ({ id, nombre: "P/" + id, fecha, monto, cliente, ref });
const div = cruzarBanco(
  [mov("d", "2026-08-26", "00007190453", 798544.87, "TRF")],
  [pc(951, "2026-08-26", 767831.61, "51795203", "CORPORACION X"), pc(952, "2026-08-26", 30713.26, "51795203-1", "CORPORACION X"), pc(953, "2026-08-25", 30713.26, "z", "OTRO")],
  [],
  new Map(),
  () => true,
);
assert.strictEqual(div.movimientos[0].pago?.id, 951);
assert.deepStrictEqual(div.movimientos[0].otrosPagos.map((p) => p.id), [952]);
assert.ok(div.movimientos[0].coincide.monto);

// Cobro dividido con Memo = referencia + 1 cifra, sin guion
const ext = cruzarBanco(
  [mov("e", "2026-05-08", "03600573202", 643526.93, "TRF")],
  [pc(4362, "2026-05-08", 618775.9, "3600573202", "X"), pc(131, "2026-05-08", 24751.03, "36005732021", "X")],
  [],
  new Map(),
  () => true,
);
assert.strictEqual(ext.movimientos[0].pago?.id, 4362);
assert.deepStrictEqual(ext.movimientos[0].otrosPagos.map((p) => p.id), [131]);
assert.ok(ext.movimientos[0].coincide.monto);
// Casi igual: 800 Bs en 985.800 ya no (tope 2 o 0,01 %)
const ochocientos = cruzarBanco([mov("x", "2026-04-20", "1", -985800)], [pc(10, "2026-04-20", -984999.7, "TRANSF/00013 - Send", "")], [], new Map(), () => true);
assert.strictEqual(ochocientos.movimientos[0].pago, null);

// La referencia del banco con un registro de un mes despues
const lejos = cruzarBanco([mov("r", "2026-04-15", "03596376793", 160000, "TRF")], [pc(171, "2026-05-15", 160000, "3596376793", "JAILINA")], [], new Map(), () => true);
assert.strictEqual(lejos.movimientos[0].pago?.id, 171);
assert.strictEqual(lejos.movimientos[0].estado, "parcial");

// Dos registros identicos (mismo monto y dia) y dos movimientos: se emparejan en orden; con uno solo, toma el primero
const gemelos = cruzarBanco(
  [mov("g1", "2026-04-23", "13322883918", -2497740), mov("g2", "2026-04-23", "13322883999", -2497740)],
  [pg(48, "2026-04-23", -2497740.43, "TRANSF/00048 - Send"), pg(47, "2026-04-23", -2497740.43, "TRANSF/00047 - Send")],
  [],
  new Map(),
  () => true,
);
assert.deepStrictEqual(gemelos.movimientos.map((x) => x.pago?.id).sort(), [47, 48]);
const uno = cruzarBanco([mov("g1", "2026-04-23", "13322883918", -2497740)], [pg(48, "2026-04-23", -2497740.43, "a"), pg(47, "2026-04-23", -2497740.43, "b")], [], new Map(), () => true);
assert.strictEqual(uno.movimientos[0].pago?.id, 47);
// Tres movimientos para dos registros identicos: duda, nada
const tresDos = cruzarBanco(
  [mov("a", "2026-04-23", "1", -2497740), mov("b", "2026-04-23", "2", -2497740), mov("c", "2026-04-23", "3", -2497740)],
  [pg(48, "2026-04-23", -2497740.43, "a"), pg(47, "2026-04-23", -2497740.43, "b")],
  [],
  new Map(),
  () => true,
);
assert.ok(tresDos.movimientos.every((x) => x.pago === null));

console.log("check-bancos: OK");

// saldosDelMes: archivo en cualquier orden, saldo inicial y final del mes.
{
  const { saldosDelMes } = m.exports;
  const movs = [
    { fecha: "2026-10-31", monto: -50, saldo: 1150 },
    { fecha: "2026-10-31", monto: 200, saldo: 1200 },
    { fecha: "2026-10-02", monto: 100, saldo: 1000 },
  ];
  assert.deepStrictEqual(saldosDelMes(movs), { inicial: 900, final: 1150, cuadra: true });
  assert.deepStrictEqual(saldosDelMes([...movs].reverse()), { inicial: 900, final: 1150, cuadra: true });
  // Falta una fila: el inicial no calza con ningun movimiento.
  assert.strictEqual(saldosDelMes(movs.slice(0, 2).concat([{ fecha: "2026-10-02", monto: 100, saldo: 990 }])).cuadra, false);
  assert.strictEqual(saldosDelMes([{ fecha: "2026-10-02", monto: 5, saldo: null }]), null);
}
console.log("saldosDelMes ok");

// ajustePermitido: corregir en Odoo el monto de un cobro/pago que difiere poco del banco.
{
  const { ajustePermitido } = m.exports;
  assert.ok(ajustePermitido(-95700, -95698.45)); // Valencia, BANES/2026/00002
  assert.ok(ajustePermitido(1000, 1009.99));
  assert.ok(!ajustePermitido(1000, 1011)); // mas de 1 %
  assert.ok(!ajustePermitido(-1000, 999)); // signo contrario
  assert.ok(!ajustePermitido(1000, 1000)); // ya es igual
}
console.log("ajustePermitido ok");
