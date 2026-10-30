// Convierte el Excel "Ventas historico" de Smartbit (hojas "Detalle" y
// "Resumen por factura") en archivos .sql que REEMPLAZAN todo lo de una sede
// en ventas_smartbit y ventas_smartbit_facturas.
//
//   node scripts/smartbit-historico-a-sql.cjs <company_id> <Ventas_historico.xlsx> [carpeta_salida]
//
// Las hojas:
//   - Detalle: un renglon por articulo (Tipo, Trn FV/NCC, N° Documento, Fecha,
//     Cliente, RIF, Vendedor, SKU, Producto, Serial, Unidades, Monto USD). Un
//     articulo con serial viene en un renglon por unidad. Las devoluciones
//     (NCC) traen unidades y monto en negativo, como ventas_smartbit.
//   - Resumen por factura: la cabecera de cada documento -> ventas_smartbit_facturas.
// Monto USD = subtotal sin IVA (verificado con facturas de abril-2026 de
// Valencia, que tienen el mismo numero en Odoo: amount_untaxed igual).
//
// A diferencia de smartbit-excel-a-sql.cjs no se corta en el corte a Odoo:
// abril-2026 entra (Buscar Factura de RMA lo necesita) y las lecturas de
// ventas lo recortan con rangoSmartbit() de lib/smartbit.ts.
//
// Requiere antes sql/ventas_smartbit_numero_serial.sql (columnas numero y
// serial). Se pegan/importan en el phpMyAdmin en orden: 01_borrar, 02_facturas,
// 03_renglones_*, 99_control. Se puede volver a correr todo: 01 borra la sede.
//
// El export de Caracas (oct-2026) viene distinto: "Monto línea USD" + "Monto
// total documento USD" + "Observación" en Detalle y la hoja "Resumen por
// documento". En las facturas con varios productos Smartbit solo da el total
// ("monto solo por factura", 57,8 % de la venta de Caracas): el total se reparte
// entre sus renglones por precio de referencia de cada SKU (el promedio por
// unidad de los renglones con monto de este Excel; si no, del
// [excel_precios], ej. el de Valencia; si no, el promedio de la factura; si no,
// por unidad). El total de cada factura queda exacto; su reparto por producto
// es estimado.

const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const [cidArg, excel, salidaDir = ".", excelPrecios] = process.argv.slice(2);
const companyId = Number(cidArg);
if (!companyId || !excel) {
  console.error("uso: node scripts/smartbit-historico-a-sql.cjs <company_id> <Ventas_historico.xlsx> [carpeta_salida] [excel_precios]");
  process.exit(1);
}
const POR_ARCHIVO = 25000;
const POR_INSERT = 500;

// Serial de Excel o "2026-03-02" / "02/03/2026" -> "2026-03-02"
function fecha(v) {
  if (typeof v === "number") return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10);
  const s = String(v ?? "").trim();
  const dmy = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return s.slice(0, 10).replace(/\//g, "-");
}
const num = (v) => (typeof v === "number" ? v : Number(String(v ?? "").replace(/,/g, "")) || 0);
const texto = (v) => (v == null ? "" : String(v).trim());
// Mismo criterio que normalizarRif() de lib/smartbit.ts.
const rif = (v) => texto(v).toUpperCase().replace(/[^A-Z0-9]/g, "");
// El mismo vendedor en las dos tablas: Smartbit trae espacios dobles ("DANIELA  SUAREZ").
// El RIF también va igual en las dos (sin guiones, puntos ni espacios), así cruzan con RIF_SQL.
const vendedor = (v) => texto(v).replace(/\s+/g, " ");
// `max` = largo de la columna (MySQL estricto rechaza lo que sobra).
const esc = (v, max) => {
  const s = texto(v);
  return s === "" ? "NULL" : `'${s.slice(0, max).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
};
// Las devoluciones llevan su propia numeracion: con el prefijo no pisan una factura del mismo numero.
const numeroDoc = (doc, devolucion) => (devolucion ? "NC-" : "") + texto(doc);

// `nombres`: la hoja o la columna puede venir con cualquiera de esos nombres
// (los exports de cada sede no son iguales). Con `opcional`, -1 si no está.
function hoja(wb, nombres, archivo = excel) {
  const nombre = [].concat(nombres).find((n) => wb.Sheets[n]);
  if (!nombre) throw new Error(`${archivo}: no encuentro la hoja "${[].concat(nombres).join('" ni "')}"`);
  const filas = XLSX.utils.sheet_to_json(wb.Sheets[nombre], { header: 1, defval: null, raw: true });
  const cols = filas[0].map(texto);
  const i = (c, opcional = false) => {
    const j = cols.findIndex((x) => [].concat(c).includes(x));
    if (j < 0 && !opcional) throw new Error(`Hoja "${nombre}": falta la columna "${[].concat(c).join('" o "')}"`);
    return j;
  };
  return { filas: filas.slice(1).filter((r) => r && r[0] != null), i };
}

const MONTO_LINEA = ["Monto USD", "Monto línea USD"];

/** Precio promedio por unidad de cada SKU en los renglones de venta (FV) con monto. */
function precios(filas, c) {
  const suma = new Map();
  for (const r of filas) {
    const u = num(r[c.unid]);
    const v = num(r[c.monto]);
    if (texto(r[c.trn]).toUpperCase() !== "FV" || !u || !v) continue;
    const sku = texto(r[c.sku]).toUpperCase();
    const p = suma.get(sku) || { v: 0, u: 0 };
    p.v += v;
    p.u += u;
    suma.set(sku, p);
  }
  return new Map([...suma].filter(([, p]) => p.v > 0 && p.u > 0).map(([sku, p]) => [sku, p.v / p.u]));
}

const wb = XLSX.readFile(excel, { dense: true });

// ── Detalle -> ventas_smartbit ──
const d = hoja(wb, "Detalle");
const c = {
  trn: d.i("Trn"), doc: d.i("N° Documento"), fecha: d.i("Fecha"), cliente: d.i("Cliente"), rif: d.i("RIF"),
  vend: d.i("Vendedor"), sku: d.i("SKU"), prod: d.i("Producto"), serial: d.i("Serial"), unid: d.i("Unidades"),
  monto: d.i(MONTO_LINEA), totalDoc: d.i("Monto total documento USD", true),
};

// ── Facturas sin monto por renglón: el total se reparte por precio de referencia ──
const montoDe = new Map(d.filas.map((r) => [r, num(r[c.monto])]));
const reparto = { documentos: 0, renglones: 0, porFuente: { propio: 0, referencia: 0, factura: 0, unidad: 0 } };
if (c.totalDoc >= 0) {
  const ref = precios(d.filas, c);
  let refExterna = new Map();
  if (excelPrecios) {
    const de = hoja(XLSX.readFile(excelPrecios, { dense: true }), "Detalle", excelPrecios);
    const ce = { trn: de.i("Trn"), sku: de.i("SKU"), unid: de.i("Unidades"), monto: de.i(MONTO_LINEA) };
    refExterna = precios(de.filas, ce);
  }
  const docs = new Map();
  for (const r of d.filas) {
    const llave = `${texto(r[c.trn])}|${texto(r[c.doc])}`;
    if (!docs.has(llave)) docs.set(llave, []);
    docs.get(llave).push(r);
  }
  for (const filas of docs.values()) {
    const total = num(filas[0][c.totalDoc]);
    const sumaLineas = filas.reduce((s, r) => s + num(r[c.monto]), 0);
    if (Math.abs(sumaLineas - total) < 0.05 || filas.some((r) => num(r[c.monto]))) continue;
    // Peso de cada renglón = unidades × precio de referencia del SKU.
    const unidad = (r) => Math.abs(num(r[c.unid])) || 1;
    const precio = filas.map((r) => {
      const sku = texto(r[c.sku]).toUpperCase();
      if (ref.has(sku)) return [ref.get(sku), "propio"];
      if (refExterna.has(sku)) return [refExterna.get(sku), "referencia"];
      return [null, null];
    });
    const conPrecio = precio.filter(([p]) => p != null);
    const promedio = conPrecio.length ? conPrecio.reduce((s, [p]) => s + p, 0) / conPrecio.length : null;
    const pesos = filas.map((r, j) => {
      let [p, fuente] = precio[j];
      if (p == null) [p, fuente] = promedio != null ? [promedio, "factura"] : [1, "unidad"];
      reparto.porFuente[fuente]++;
      return unidad(r) * p;
    });
    const suma = pesos.reduce((s, w) => s + w, 0);
    let asignado = 0;
    filas.forEach((r, j) => {
      const v = j === filas.length - 1 ? Math.round((total - asignado) * 100) / 100 : Math.round(((total * pesos[j]) / suma) * 100) / 100;
      asignado += v;
      montoDe.set(r, v);
    });
    reparto.documentos++;
    reparto.renglones += filas.length;
  }
}
const renglones = [];
const porAnio = new Map(); // año -> { renglones, venta }
let conSerial = 0;
for (const r of d.filas) {
  const trn = texto(r[c.trn]).toUpperCase();
  if (trn !== "FV" && trn !== "NCC") continue;
  const f = fecha(r[c.fecha]);
  const venta = montoDe.get(r);
  const unidades = num(r[c.unid]);
  if (texto(r[c.serial])) conSerial++;
  const a = porAnio.get(f.slice(0, 4)) || { renglones: 0, venta: 0 };
  a.renglones++;
  a.venta += venta;
  porAnio.set(f.slice(0, 4), a);
  renglones.push(
    `(${companyId},'${f}',${esc(numeroDoc(r[c.doc], trn === "NCC"), 30)},NULL,NULL,${esc(vendedor(r[c.vend]), 150)},` +
      `${esc(rif(r[c.rif]), 60)},${esc(r[c.cliente], 255)},${esc(r[c.sku], 80)},${esc(r[c.prod], 255)},` +
      `${esc(r[c.serial], 80)},NULL,${venta.toFixed(2)},${unidades},NULL)`,
  );
}

// ── Resumen por factura -> ventas_smartbit_facturas ──
const h = hoja(wb, ["Resumen por factura", "Resumen por documento"]);
const k = {
  tipo: h.i("Tipo"), doc: h.i("N° Documento"), fecha: h.i("Fecha"), cliente: h.i("Cliente"), rif: h.i("RIF"),
  vend: h.i("Vendedor"), unid: h.i("Unidades"), monto: h.i("Monto total USD"),
};
const facturas = [];
let ventaFacturas = 0;
for (const r of h.filas) {
  const devolucion = /^devoluci/i.test(texto(r[k.tipo]));
  const venta = num(r[k.monto]);
  ventaFacturas += venta;
  facturas.push(
    `(${companyId},'${fecha(r[k.fecha])}',${esc(numeroDoc(r[k.doc], devolucion), 30)},${esc(rif(r[k.rif]), 30)},` +
      `${esc(r[k.cliente], 255)},${esc(vendedor(r[k.vend]), 150)},${num(r[k.unid])},${venta.toFixed(2)})`,
  );
}

if (!renglones.length || !facturas.length) {
  console.error("El Excel no trae renglones FV/NCC o facturas.");
  process.exit(1);
}

const ventaRenglones = [...porAnio.values()].reduce((s, a) => s + a.venta, 0);
const inserts = (tabla, columnas, valores) => {
  const out = [];
  for (let i = 0; i < valores.length; i += POR_INSERT) {
    out.push(`INSERT INTO supricom_panel.${tabla} (${columnas}) VALUES\n${valores.slice(i, i + POR_INSERT).join(",\n")};`);
  }
  return out;
};
const escribir = (nombre, lineas) => {
  const destino = path.join(salidaDir, nombre);
  fs.writeFileSync(destino, lineas.join("\n") + "\n");
  console.log(`${destino}  (${(fs.statSync(destino).size / 1e6).toFixed(1)} MB)`);
};

fs.mkdirSync(salidaDir, { recursive: true });
escribir("01_borrar_sede.sql", [
  `-- Borra TODO lo de la sede ${companyId} en las dos tablas de Smartbit antes de recargarla.`,
  `-- Requiere sql/ventas_smartbit_numero_serial.sql (si no, 03_* falla por las columnas numero/serial).`,
  `SHOW COLUMNS FROM supricom_panel.ventas_smartbit WHERE Field IN ('numero', 'serial');`,
  `SELECT COUNT(*) AS renglones_antes, SUM(venta) AS venta_antes FROM supricom_panel.ventas_smartbit WHERE company_id = ${companyId};`,
  `SELECT COUNT(*) AS facturas_antes FROM supricom_panel.ventas_smartbit_facturas WHERE company_id = ${companyId};`,
  `DELETE FROM supricom_panel.ventas_smartbit WHERE company_id = ${companyId};`,
  `DELETE FROM supricom_panel.ventas_smartbit_facturas WHERE company_id = ${companyId};`,
]);
escribir("02_facturas.sql", [
  `-- ${facturas.length} facturas y devoluciones de la sede ${companyId}, venta neta ${ventaFacturas.toFixed(2)}`,
  ...inserts("ventas_smartbit_facturas", "company_id, fecha, numero, rif, cliente, vendedor, unidades, venta", facturas),
]);
const partes = Math.ceil(renglones.length / POR_ARCHIVO);
for (let p = 0; p < partes; p++) {
  const tramo = renglones.slice(p * POR_ARCHIVO, (p + 1) * POR_ARCHIVO);
  escribir(`03_renglones_${String(p + 1).padStart(2, "0")}_de_${String(partes).padStart(2, "0")}.sql`, [
    `-- Renglones ${p * POR_ARCHIVO + 1} a ${p * POR_ARCHIVO + tramo.length} de ${renglones.length} (sede ${companyId})`,
    ...inserts(
      "ventas_smartbit",
      "company_id, fecha, numero, id_sucursal, sucursal, vendedor, codigo_cliente, cliente, codigo_articulo, articulo, serial, linea, venta, unidades, costo",
      tramo,
    ),
  ]);
}
escribir("99_control.sql", [
  `-- Tiene que dar: ${renglones.length} renglones (${conSerial} con serial), venta ${ventaRenglones.toFixed(2)}; ${facturas.length} facturas, venta ${ventaFacturas.toFixed(2)}`,
  `SELECT COUNT(*) AS renglones, SUM(serial IS NOT NULL) AS con_serial, SUM(venta) AS venta FROM supricom_panel.ventas_smartbit WHERE company_id = ${companyId};`,
  `SELECT COUNT(*) AS facturas, SUM(venta) AS venta FROM supricom_panel.ventas_smartbit_facturas WHERE company_id = ${companyId};`,
  `-- Por año:`,
  ...[...porAnio].sort().map(([anio, a]) => `--   ${anio}: ${a.renglones} renglones, venta ${a.venta.toFixed(2)}`),
  `SELECT YEAR(fecha) AS anio, COUNT(*) AS renglones, SUM(venta) AS venta FROM supricom_panel.ventas_smartbit WHERE company_id = ${companyId} GROUP BY anio ORDER BY anio;`,
]);
console.log(`${renglones.length} renglones (${conSerial} con serial), venta ${ventaRenglones.toFixed(2)}; ${facturas.length} facturas, venta ${ventaFacturas.toFixed(2)}`);
if (reparto.documentos) console.log(`Repartidos por precio: ${reparto.documentos} documentos, ${reparto.renglones} renglones`, reparto.porFuente);
if (Math.abs(ventaRenglones - ventaFacturas) > 5) console.warn("OJO: la suma de los renglones no cuadra con la del resumen por factura.");
