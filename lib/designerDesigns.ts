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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_folder (folder),
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}
