import { query } from "@/lib/db";

// Compartido entre app/api/disenador/disenos y app/api/disenador/ia-imagen/guardar:
// ambos escriben en la misma tabla del catálogo de diseños.

/**
 * La pantalla pide catálogo y KPIs a la vez, así que esta función corre en
 * paralelo desde varios endpoints. Sin memorizar la promesa, cada request
 * repetía el CREATE/ALTER; y dos que miraran el schema al mismo tiempo veían
 * las dos que faltaba la columna y la segunda moría con
 * "Duplicate column name 'category'". Se resuelve una vez por proceso, y si
 * falla se descarta para reintentar en la próxima llamada.
 */
let listo: Promise<void> | null = null;

export function ensureDesignerDesignsTable(): Promise<void> {
  if (!listo) {
    listo = crearOMigrar().catch((e) => {
      listo = null;
      throw e;
    });
  }
  return listo;
}

/** Códigos de MySQL para "ya existe": la migración ya la hizo otro proceso. */
const YA_EXISTE = new Set(["ER_DUP_FIELDNAME", "ER_DUP_KEYNAME"]);

async function ignorarSiYaExiste(sql: string) {
  try {
    await query(sql);
  } catch (e: any) {
    if (!YA_EXISTE.has(e?.code)) throw e;
  }
}

async function crearOMigrar(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS designer_designs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL DEFAULT '',
      folder VARCHAR(255) NULL,
      image_data LONGBLOB NULL,
      image_mime VARCHAR(100) NULL,
      created_by VARCHAR(255) NOT NULL DEFAULT '',
      category VARCHAR(80) NULL,
      -- Fecha del diseño: la que cuenta para los KPIs. Es distinta de
      -- created_at (cuándo se subió): un lote que se sube todo junto puede
      -- corresponder a flyers hechos en días distintos.
      design_date DATE NULL,
      deleted_at TIMESTAMP NULL DEFAULT NULL,
      deleted_by VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_folder (folder),
      INDEX idx_category (category),
      INDEX idx_deleted_at (deleted_at),
      INDEX idx_design_date (design_date),
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // `category` se agregó después (categorías fijas de diseño, ver
  // lib/disenos/categorias.ts). En instalaciones viejas la tabla ya existe, así
  // que el CREATE de arriba no la crea: se agrega acá, solo si falta, y se
  // ignora el error de duplicado por si otro proceso la agregó en el medio.
  const columnas = await query(
    `SELECT column_name AS c FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'designer_designs'`
  );
  const tiene = new Set((columnas.rows || []).map((r: any) => String(r.c || r.COLUMN_NAME)));

  if (!tiene.has("category")) {
    await ignorarSiYaExiste(`ALTER TABLE designer_designs ADD COLUMN category VARCHAR(80) NULL`);
    await ignorarSiYaExiste(`ALTER TABLE designer_designs ADD INDEX idx_category (category)`);
  }

  // Papelera: borrar un diseño lo marca en vez de eliminar la fila, así se
  // puede restaurar. La eliminación definitiva sigue existiendo, pero es un
  // paso aparte y explícito.
  if (!tiene.has("deleted_at")) {
    await ignorarSiYaExiste(`ALTER TABLE designer_designs ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL`);
    await ignorarSiYaExiste(`ALTER TABLE designer_designs ADD COLUMN deleted_by VARCHAR(255) NULL`);
    await ignorarSiYaExiste(`ALTER TABLE designer_designs ADD INDEX idx_deleted_at (deleted_at)`);
  }

  // `design_date` (fecha del diseño) se agregó después: antes todo se contaba
  // por `created_at`, así que un lote subido de una vez quedaba entero en el
  // día de la subida. Lo ya cargado se rellena con el día en que se subió,
  // que es la mejor aproximación que hay.
  if (!tiene.has("design_date")) {
    await ignorarSiYaExiste(`ALTER TABLE designer_designs ADD COLUMN design_date DATE NULL`);
    await ignorarSiYaExiste(`ALTER TABLE designer_designs ADD INDEX idx_design_date (design_date)`);
    await query(`UPDATE designer_designs SET design_date = DATE(created_at) WHERE design_date IS NULL`);
  }
}
