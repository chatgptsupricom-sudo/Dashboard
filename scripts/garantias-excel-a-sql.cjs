// Excel "GARANTIA SUPRICOM" → SQL para el phpMyAdmin (tabla rma_garantias por
// marca + categoría y rma_centros_servicio). Ver sql/rma_garantias_por_categoria.sql.
//
//   node scripts/garantias-excel-a-sql.cjs "<ruta del Excel>" [sql/seed_garantias_excel.sql]
//
// Hoja 1: título, encabezado MARCA | CATEGORÍA | TIEMPO DE GARANTÍA | CONTACTO / ENLACE
// y una fila por marca + categoría; más abajo, el encabezado CSA | DIRECCION |
// CONTACTO | TELEFONO con los centros de servicio autorizados.
//
// Las marcas del Excel reemplazan a la fila de "toda la marca" que tenían en la
// tabla (sus plazos ahora van por categoría); las marcas que el Excel no trae
// quedan como estaban. Se puede volver a correr con una versión nueva del Excel.
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const [, , entrada, salida = path.join(__dirname, "..", "sql", "seed_garantias_excel.sql")] = process.argv;
if (!entrada) {
  console.error('Uso: node scripts/garantias-excel-a-sql.cjs "<Excel>" [salida.sql]');
  process.exit(1);
}

const limpio = (v) => String(v ?? "").replace(/\r/g, "").replace(/[ \t]+/g, " ").trim();
const sinAcentos = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");

// Nombres del Excel → como están en Odoo (spiff.brand).
const MARCA_ODOO = { "WESTER DIGITAL": "WESTERN DIGITAL", "TP LINK": "TP-LINK" };

// Palabras del nombre del producto que identifican cada categoría del Excel.
// Gana la palabra más larga que aparezca (MOUSE PAD antes que MOUSE).
const PALABRAS = {
  "REGULADOR": ["REGULADOR", "AVR"],
  "SURGEARREST": ["SURGEARREST", "SURGE"],
  "TEMPORIZADOR": ["TEMPORIZADOR", "TIMER"],
  "UPS": ["UPS"],
  "LAPTOP": ["LAPTOP", "NOTEBOOK", "PORTATIL"],
  "ESTACIONES DE ENERGIA": ["ESTACION", "POWER STATION", "GENERADOR"],
  "IMPRESORA": ["IMPRESORA", "MULTIFUNCIONAL", "PRINTER"],
  "DISCOS DUROS": ["DISCO", "SSD", "HDD", "NVME"],
  "MEMORIA": ["MEMORIA RAM", "RAM", "DDR4", "DDR5", "DDR3", "SODIMM"],
  "UPS,REGULADORES, REGLETAS": ["UPS", "REGULADOR", "REGLETA", "PROTECTOR"],
  "CAMARAS DE VIGILANCIA / WEB": ["CAMARA", "WEBCAM", "CAM"],
  "ACCESORIOS TELEFONOS": ["CARGADOR", "POWER BANK", "SOPORTE", "HOLDER", "ADAPTADOR"],
  "CABLES": ["CABLE"],
  "MOUSE + TECLADO": ["COMBO", "MOUSE Y TECLADO", "TECLADO Y MOUSE", "TECLADO + MOUSE", "MOUSE + TECLADO", "KIT TECLADO"],
  "MESAS": ["MESA", "DESK"],
  "MOUSE": ["MOUSE", "RATON"],
  "SILLAS GAMING": ["SILLA"],
  "SPEAKER": ["SPEAKER", "CORNETA", "PARLANTE", "ALTAVOZ", "BOCINA"],
  "HEADSET": ["HEADSET", "AUDIFONO", "AURICULAR", "DIADEMA", "HEADPHONE"],
  "MOUSE PAD": ["MOUSE PAD", "MOUSEPAD"],
  "CONSUMIBLES": ["TONER", "CARTUCHO", "TINTA", "BOTELLA"],
  "MEMORIAS USB": ["PENDRIVE", "PEN DRIVE", "MEMORIA USB", "FLASH"],
  "ROUTER": ["ROUTER"],
  "TECLADOS": ["TECLADO"],
  "REDES": ["ROUTER", "ACCESS POINT", "ADAPTADOR", "WIFI", "MESH", "TARJETA DE RED"],
  "SWITCH": ["SWITCH"],
  "MONITORES": ["MONITOR"],
  "BOLSOS": ["BOLSO", "MORRAL", "MALETIN", "FUNDA", "MOCHILA", "BACKPACK"],
  "EXTENSORES": ["EXTENSOR", "REPETIDOR"],
};

/** Meses de "6 MESES", "1 AÑO CON EL FABRICANTE", "3 AÑOS"; N/A = 0; vacío = null. */
function meses(tiempo) {
  const t = sinAcentos(tiempo).toUpperCase();
  if (!t) return null;
  if (/^N\s*\/?\s*A$/.test(t)) return 0;
  const m = /(\d+)\s*(MES|ANO)/.exec(t);
  if (!m) return undefined;
  return Number(m[1]) * (m[2] === "MES" ? 1 : 12);
}

const sql = (v) => (v == null ? "NULL" : `'${String(v).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`);

const wb = XLSX.readFile(entrada);
const filas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });

const garantias = [];
const centros = [];
const avisos = [];
let modo = null;
for (const f of filas) {
  const c = f.slice(1, 5).map(limpio);
  const cabecera = sinAcentos(c[0]).toUpperCase();
  if (cabecera === "MARCA") { modo = "g"; continue; }
  if (cabecera === "CSA") { modo = "c"; continue; }
  if (!c[0]) continue;
  if (modo === "g") {
    const marcaExcel = c[0].toUpperCase();
    const marca = MARCA_ODOO[marcaExcel] || marcaExcel;
    const categoria = sinAcentos(c[1]).toUpperCase();
    let m = meses(c[2]);
    let notas = null;
    if (m === undefined) {
      avisos.push(`${marca} / ${categoria}: no se entiende el tiempo «${c[2]}» (se usan 12 meses)`);
      m = 12;
      notas = `Tiempo del Excel sin entender: ${c[2]}`;
    } else if (m === null) {
      avisos.push(`${marca} / ${categoria}: el Excel no trae tiempo de garantía (se usan 12 meses, el de por defecto)`);
      m = 12;
      notas = "Plazo por confirmar: el Excel no trae el tiempo; se usa el de por defecto (12 meses)";
    }
    if (m === 0) notas = "Sin garantía (N/A en el Excel)";
    const palabras = PALABRAS[categoria] || categoria.split(/[\s,/+]+/).filter((p) => p.length > 2);
    if (!PALABRAS[categoria]) avisos.push(`${marca} / ${categoria}: categoría nueva, palabras deducidas: ${palabras.join(", ")}`);
    garantias.push({
      marca,
      categoria,
      meses: m,
      notas,
      palabras: palabras.join(","),
      tiempo_texto: c[2] || null,
      con_fabricante: /FABRICANTE/i.test(sinAcentos(c[2])) ? 1 : 0,
      tramite: c[3] || null,
    });
  } else if (modo === "c") {
    centros.push({ nombre: c[0], direccion: c[1] || null, contacto: c[2] || null, telefono: c[3] || null });
  }
}

// Avisos de datos que conviene revisar en el Excel.
for (const g of garantias) {
  if (g.marca !== "HP" && /\+52 1 33 1930 9499/.test(g.tramite || "")) avisos.push(`${g.marca} / ${g.categoria}: el trámite es el WhatsApp de HP`);
  if (g.con_fabricante && /HABLAR DIRECTAMENTE CON SUPRICOM/i.test(g.tramite || ""))
    avisos.push(`${g.marca} / ${g.categoria}: dice «con el fabricante» pero el trámite es con Supricom`);
}
const vistos = new Set();
for (const g of garantias) {
  const k = `${g.marca}|${g.categoria}`;
  if (vistos.has(k)) avisos.push(`${g.marca} / ${g.categoria}: está repetida, queda la última`);
  vistos.add(k);
}

const marcas = [...new Set(garantias.map((g) => g.marca))].sort();
const lineas = [
  `-- Generado por scripts/garantias-excel-a-sql.cjs desde ${path.basename(entrada)} (${new Date().toISOString().slice(0, 10)}).`,
  "-- Correr DESPUÉS de sql/rma_garantias_respaldo_20261112.sql y sql/rma_garantias_por_categoria.sql.",
  `-- ${garantias.length} filas de ${marcas.length} marcas y ${centros.length} centros de servicio.`,
  "",
  "-- Las marcas del Excel pasan a ir por categoría: se borra su fila de toda la marca.",
  `DELETE FROM supricom_panel.rma_garantias WHERE categoria = '' AND marca IN (${marcas.map(sql).join(", ")});`,
  "",
  "INSERT INTO supricom_panel.rma_garantias (marca, categoria, meses, notas, palabras, tiempo_texto, con_fabricante, tramite, updated_by) VALUES",
  garantias
    .map((g) => `  (${[g.marca, g.categoria].map(sql).join(", ")}, ${g.meses}, ${sql(g.notas)}, ${sql(g.palabras)}, ${sql(g.tiempo_texto)}, ${g.con_fabricante}, ${sql(g.tramite)}, 'Excel GARANTIA SUPRICOM')`)
    .join(",\n"),
  "ON DUPLICATE KEY UPDATE meses = VALUES(meses), notas = VALUES(notas), palabras = VALUES(palabras), tiempo_texto = VALUES(tiempo_texto),",
  "  con_fabricante = VALUES(con_fabricante), tramite = VALUES(tramite), updated_by = VALUES(updated_by);",
  "",
  "DELETE FROM supricom_panel.rma_centros_servicio;",
  "INSERT INTO supricom_panel.rma_centros_servicio (nombre, direccion, contacto, telefono) VALUES",
  centros.map((c) => `  (${[c.nombre, c.direccion, c.contacto, c.telefono].map(sql).join(", ")})`).join(",\n") + ";",
  "",
  "-- Verificación: filas por marca y los centros.",
  "SELECT marca, COUNT(*) AS filas, GROUP_CONCAT(CONCAT(IF(categoria = '', '(toda la marca)', categoria), ': ', IFNULL(meses, 'vida util')) SEPARATOR ' | ') AS plazos",
  "  FROM supricom_panel.rma_garantias GROUP BY marca ORDER BY marca;",
  "SELECT COUNT(*) AS centros FROM supricom_panel.rma_centros_servicio;",
  "",
];
fs.writeFileSync(salida, lineas.join("\n"), "utf8");
console.log(`${garantias.length} garantías (${marcas.length} marcas), ${centros.length} centros → ${salida}`);
for (const a of avisos) console.log("AVISO:", a);
