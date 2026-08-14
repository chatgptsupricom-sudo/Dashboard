const fs = require("fs");
const path = require("path");

const envFile = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf-8");
envFile.split("\n").forEach((line) => {
  const match = line.match(/^\s*([\w]+)\s*=\s*(.*?)\s*$/);
  if (match && !line.trim().startsWith("#")) {
    process.env[match[1]] = match[2];
  }
});

const mysql = require("mysql2/promise");

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME,
  });

  const migrations = [
    "ALTER TABLE spiff_rules ADD COLUMN tipo VARCHAR(20) DEFAULT 'marca' AFTER brand_name",
    "ALTER TABLE spiff_rules ADD COLUMN product_name VARCHAR(255) NULL AFTER tipo",
    "ALTER TABLE spiff_rules ADD COLUMN product_id INT NULL AFTER product_name",
    "ALTER TABLE spiff_rules ADD COLUMN modo VARCHAR(20) DEFAULT 'monto' AFTER spiff_amount",
    "ALTER TABLE spiff_rules ADD COLUMN fecha_inicio DATE NULL AFTER modo",
    "ALTER TABLE spiff_rules ADD COLUMN fecha_fin DATE NULL AFTER fecha_inicio",
  ];

  for (const sql of migrations) {
    try {
      await conn.execute(sql);
      console.log("OK:", sql.substring(0, 60));
    } catch (e) {
      if (e.code === "ER_DUP_FIELDNAME") {
        console.log("SKIP (already exists):", sql.substring(0, 60));
      } else {
        console.error("ERROR:", sql.substring(0, 60), e.message);
      }
    }
  }

  try {
    await conn.execute("UPDATE spiff_rules SET modo = 'monto' WHERE modo = 'acumulado'");
    console.log("OK: Converted 'acumulado' -> 'monto'");
  } catch (e) {
    console.log("SKIP: mode conversion", e.message);
  }

  try {
    await conn.execute("UPDATE spiff_rules SET modo = 'cantidad' WHERE modo = 'individual'");
    console.log("OK: Converted 'individual' -> 'cantidad'");
  } catch (e) {
    console.log("SKIP: mode conversion", e.message);
  }

  const [rows] = await conn.execute("DESCRIBE spiff_rules");
  console.log("\nCurrent schema:");
  console.table(rows);
  await conn.end();
})();
