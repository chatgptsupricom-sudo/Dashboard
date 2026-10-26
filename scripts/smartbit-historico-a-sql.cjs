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

const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const [cidArg, excel, salidaDir = "."] = process.argv.slice(2);
const companyId = Number(cidArg);
if (!companyId || !excel) {
  console.error("uso: node scripts/smartbit-historico-a-sql.cjs <company_id> <Ventas_historico.xlsx> [carpeta_salida]");
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
// `max` = largo de la columna (MySQL estricto rechaza lo que sobra).
const esc = (v, max) => {
  const s = texto(v);
  return s === "" ? "NULL" : `'${s.slice(0, max).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
};
// Las devoluciones llevan su propia numeracion: con el prefijo no pisan una factura del mismo numero.
const numeroDoc = (doc, devolucion) => (devolucion ? "NC-" : "") + texto(doc);

function hoja(wb, nombre) {
  const ws = wb.Sheets[nombre];
  if (!ws) throw new Error(`${excel}: no encuentro la hoja "${nombre}"`);
  const filas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
  const cols = filas[0].map(texto);
  const i = (c) => {
    const j = cols.indexOf(c);
    if (j < 0) throw new Error(`Hoja "${nombre}": falta la columna "${c}"`);
    return j;
  };
  return { filas: filas.slice(1).filter((r) => r && r[0] != null), i };
}

const wb = XLSX.readFile(excel, { dense: true });

// ── Detalle -> ventas_smartbit ──
const d = hoja(wb, "Detalle");
const c = {
  trn: d.i("Trn"), doc: d.i("N° Documento"), fecha: d.i("Fecha"), cliente: d.i("Cliente"), rif: d.i("RIF"),
  vend: d.i("Vendedor"), sku: d.i("SKU"), prod: d.i("Producto"), serial: d.i("Serial"), unid: d.i("Unidades"),
  monto: d.i("Monto USD"),
};
const renglones = [];
const porAnio = new Map(); // año -> { renglones, venta }
let conSerial = 0;
for (const r of d.filas) {
  const trn = texto(r[c.trn]).toUpperCase();
  if (trn !== "FV" && trn !== "NCC") continue;
  const f = fecha(r[c.fecha]);
  const venta = num(r[c.monto]);
  const unidades = num(r[c.unid]);
  if (texto(r[c.serial])) conSerial++;
  const a = porAnio.get(f.slice(0, 4)) || { renglones: 0, venta: 0 };
  a.renglones++;
  a.venta += venta;
  porAnio.set(f.slice(0, 4), a);
  renglones.push(
    `(${companyId},'${f}',${esc(numeroDoc(r[c.doc], trn === "NCC"), 30)},NULL,NULL,${esc(r[c.vend], 150)},` +
      `${esc(r[c.rif], 60)},${esc(r[c.cliente], 255)},${esc(r[c.sku], 80)},${esc(r[c.prod], 255)},` +
      `${esc(r[c.serial], 80)},NULL,${venta.toFixed(2)},${unidades},NULL)`,
  );
}

// ── Resumen por factura -> ventas_smartbit_facturas ──
const h = hoja(wb, "Resumen por factura");
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
      `${esc(r[k.cliente], 255)},${esc(texto(r[k.vend]).replace(/\s+/g, " "), 150)},${num(r[k.unid])},${venta.toFixed(2)})`,
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
if (Math.abs(ventaRenglones - ventaFacturas) > 5) console.warn("OJO: la suma de los renglones no cuadra con la del resumen por factura.");
