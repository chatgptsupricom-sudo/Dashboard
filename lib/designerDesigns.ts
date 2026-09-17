import { query } from "@/lib/db";

// Compartido entre app/api/disenador/disenos y app/api/disenador/ia-imagen/guardar:
// ambos escriben en la misma tabla del catálogo de diseños.
export async function ensureDesignerDesignsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS designer_designs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL DEFAULT '',
      folder VARCHAR(255) NULL,
      image_data LONGBLOB NULL,
      image_mime VARCHAR(100) NULL,
      created_by VARCHAR(255) NOT NULL DEFAULT '',
      category VARCHAR(80) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_folder (folder),
      INDEX idx_category (category),
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // La columna `category` se agregó después (categorías fijas de diseño, ver
  // lib/disenos/categorias.ts). En instalaciones viejas la tabla ya existe, así
  // que el CREATE de arriba no la crea: se agrega aquí, y solo si falta.
  const col = await query(
    `SELECT COUNT(*) AS n FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'designer_designs' AND column_name = 'category'`
  );
  if (!Number(col.rows?.[0]?.n)) {
    await query(`ALTER TABLE designer_designs ADD COLUMN category VARCHAR(80) NULL`);
    await query(`ALTER TABLE designer_designs ADD INDEX idx_category (category)`);
  }
}
