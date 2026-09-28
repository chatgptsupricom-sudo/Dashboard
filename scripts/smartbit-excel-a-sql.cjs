// Convierte dos exports de Smartbit (escritorio remoto, boton Exportar F11)
// en archivos .sql para ventas_smartbit, uno por año, para las sedes sin
// llave de API (Valencia y Caracas; Panama se carga por API: lib/smartbit.ts).
//
//   node scripts/smartbit-excel-a-sql.cjs <company_id> <ventas.xlsx> <transacciones.xlsx|.csv> [carpeta_salida]
//
// Los exports:
//   - Inventarios y Facturacion > Consultas y Reportes > Ventas / Devoluciones
//     (.xlsx; una fila por documento: Numero, Cuenta, Cliente, Vendedor, Venta...)
//   - ... > Transaccion por producto (.xlsx, o .csv con "|" si es muy grande)
//     (una fila por articulo de cada movimiento; se usan solo FV y NCC)
// Se cruzan por numero + tipo de documento, asi que un Ventas/Devoluciones del
// rango completo sirve para cualquier tramo de Transaccion por producto.
// Verificado con Valencia 2023-01 a 2026-03: FV - NCC = Ventas/Devoluciones
// por año (diferencias de centavos) y = amount_untaxed de Odoo por factura.
//
// Cada .sql borra y reinserta esa sede en ese año (recortado al rango del
// export y al corte), asi que se puede volver a correr. Se pega en el
// phpMyAdmin (lleva supricom_panel. delante).

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const XLSX = require("xlsx");

const CORTE = process.env.SMARTBIT_CORTE || "2026-04-01";
const [cidArg, ventasPath, transPath, salidaDir = "."] = process.argv.slice(2);
const companyId = Number(cidArg);
if (!companyId || !ventasPath || !transPath) {
  console.error("uso: node scripts/smartbit-excel-a-sql.cjs <company_id> <ventas.xlsx> <transacciones.xlsx|.csv> [carpeta_salida]");
  process.exit(1);
}

// "2026/03/02", "25/03/2026 14:12:41" o serial de Excel -> "2026-03-02"
function fecha(v) {
  if (typeof v === "number") return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10);
  const s = String(v).trim();
  const dmy = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return s.slice(0, 10).replace(/\//g, "-");
}
// "1,234.56" (CSV) o numero (xlsx)
const numero = (v) => (typeof v === "number" ? v : Number(String(v ?? "").replace(/,/g, "")) || 0);

function rangoDe(texto) {
  const m = texto.match(/Del (\d{2})\/(\d{2})\/(\d{4}) al (\d{2})\/(\d{2})\/(\d{4})/);
  return m ? [`${m[3]}-${m[2]}-${m[1]}`, `${m[6]}-${m[5]}-${m[4]}`] : null;
}

// Filas (objetos por columna) debajo del encabezado que empieza con `primeraColumna`.
function leerXlsx(archivo, primeraColumna) {
  const wb = XLSX.readFile(archivo);
  const filas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });
  const i = filas.findIndex((r) => r[0] === primeraColumna);
  if (i < 0) throw new Error(`${archivo}: no encuentro el encabezado "${primeraColumna}"`);
  const cols = filas[i];
  const datos = filas.slice(i + 1).filter((r) => r[0]).map((r) => Object.fromEntries(cols.map((c, j) => [c, r[j]])));
  datos.rango = rangoDe(filas.slice(0, i).map((r) => r[0] || "").join(" "));
  return datos;
}

// CSV de Smartbit: separador "|", campos entre comillas, Latin-1. Se lee en
// streaming (Transaccion por producto de 3 años pesa ~100 MB) y solo se
// guardan las filas que pasan `filtro`.
function partir(linea) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (q) {
      if (c === '"') { if (linea[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
    } else if (c === '"') q = true;
    else if (c === "|") { out.push(cur); cur = ""; } else cur += c;
  }
  out.push(cur);
  return out;
}
async function leerCsv(archivo, filtro) {
  const rl = readline.createInterface({ input: fs.createReadStream(archivo, { encoding: "latin1" }) });
  let cols = null;
  const datos = [];
  for await (const linea of rl) {
    const c = partir(linea);
    if (!cols) { cols = c; continue; }
    const fila = Object.fromEntries(cols.map((k, j) => [k, c[j]]));
    if (filtro(fila)) datos.push(fila);
  }
  datos.rango = null; // el CSV no trae titulo con el rango
  return datos;
}

// `max` = largo de la columna en sql/ventas_smartbit.sql (MySQL estricto rechaza lo que sobra).
const esc = (s, max) =>
  s == null || String(s).trim() === ""
    ? "NULL"
    : `'${String(s).trim().slice(0, max).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;

(async () => {
  const ventas = leerXlsx(ventasPath, "Fecha");
  const esFv = (t) => t.Trn === "FV" || t.Trn === "NCC";
  const trans = /\.csv$/i.test(transPath) ? await leerCsv(transPath, esFv) : leerXlsx(transPath, "Trn").filter(esFv);

  // Documento -> cliente/vendedor. En Ventas/Devoluciones las NCC vienen con venta negativa.
  const docs = new Map();
  for (const v of ventas) docs.set(`${numero(v.Venta) < 0 ? "NCC" : "FV"}|${String(v.Numero).trim()}`, v);

  const porAnio = new Map(); // año -> { valores, total, min, max }
  const sinDoc = new Set();
  for (const t of trans) {
    const f = fecha(t.Fecha);
    if (f >= CORTE) continue;
    const doc = docs.get(`${t.Trn}|${String(t["Número"]).trim()}`);
    if (!doc) { sinDoc.add(`${t.Trn} ${t["Número"]}`); continue; }
    const venta = (t.Trn === "NCC" ? -1 : 1) * Math.abs(numero(t["Precio Total"]));
    // Smartbit registra la salida de inventario en negativo: unidades vendidas = -Cantidad.
    const unidades = -numero(t.Cantidad);
    const anio = f.slice(0, 4);
    if (!porAnio.has(anio)) porAnio.set(anio, { valores: [], total: 0 });
    const a = porAnio.get(anio);
    a.total += venta;
    a.valores.push(
      `(${companyId},'${f}',NULL,NULL,${esc(doc.Vendedor, 150)},${esc(doc.Cuenta, 60)},${esc(doc.Cliente, 255)},` +
        `${esc(t.Referencia, 80)},${esc(t["Descripción"], 255)},NULL,${venta.toFixed(2)},${unidades},NULL)`,
    );
  }
  if (porAnio.size === 0) {
    console.error("No hay renglones FV/NCC antes del corte en esos archivos.");
    process.exit(1);
  }

  // Total de control por año segun Ventas/Devoluciones.
  const esperado = new Map();
  for (const v of ventas) {
    const f = fecha(v.Fecha);
    if (f < CORTE) esperado.set(f.slice(0, 4), (esperado.get(f.slice(0, 4)) || 0) + numero(v.Venta));
  }

  const [rIni, rFin] = trans.rango || ventas.rango || ["0000-01-01", "9999-12-31"];
  const ultimoDia = new Date(Date.parse(CORTE) - 864e5).toISOString().slice(0, 10);
  fs.mkdirSync(salidaDir, { recursive: true });
  for (const [anio, a] of [...porAnio].sort()) {
    // Se borra el año entero dentro del rango exportado, no solo los dias con ventas.
    const min = `${anio}-01-01` > rIni ? `${anio}-01-01` : rIni;
    let max = `${anio}-12-31` < rFin ? `${anio}-12-31` : rFin;
    if (max > ultimoDia) max = ultimoDia;
    const out = [
      `-- Smartbit -> ventas_smartbit, sede ${companyId}, ${min} a ${max}`,
      `-- ${a.valores.length} renglones, venta ${a.total.toFixed(2)} (Ventas/Devoluciones: ${(esperado.get(anio) || 0).toFixed(2)})`,
      `DELETE FROM supricom_panel.ventas_smartbit WHERE company_id = ${companyId} AND fecha BETWEEN '${min}' AND '${max}';`,
    ];
    for (let i = 0; i < a.valores.length; i += 500) {
      out.push(
        "INSERT INTO supricom_panel.ventas_smartbit (company_id, fecha, id_sucursal, sucursal, vendedor, codigo_cliente, cliente, codigo_articulo, articulo, linea, venta, unidades, costo) VALUES\n" +
          a.valores.slice(i, i + 500).join(",\n") + ";",
      );
    }
    out.push(
      `-- Control: tiene que dar ${a.valores.length} renglones y ${a.total.toFixed(2)}`,
      `SELECT COUNT(*), SUM(venta) FROM supricom_panel.ventas_smartbit WHERE company_id = ${companyId} AND fecha BETWEEN '${min}' AND '${max}';`,
    );
    const destino = path.join(salidaDir, `ventas_smartbit_${companyId}_${anio}.sql`);
    fs.writeFileSync(destino, out.join("\n") + "\n");
    const dif = Math.abs(a.total - (esperado.get(anio) || 0));
    console.log(`${destino}: ${a.valores.length} renglones, venta ${a.total.toFixed(2)} (esperado ${(esperado.get(anio) || 0).toFixed(2)})${dif > 5 ? "  <-- OJO no cuadra" : ""}`);
  }
  if (sinDoc.size) console.warn(`OJO: ${sinDoc.size} documentos sin cliente/vendedor (no estan en Ventas/Devoluciones):`, [...sinDoc].slice(0, 10));
})();
