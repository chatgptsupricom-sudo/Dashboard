import { db } from "@/lib/db";

/**
 * Bitácora de los cambios que el Agente IA ejecuta en Odoo: quién confirmó
 * qué. En Odoo el cambio queda a nombre del usuario de la API del panel, así
 * que aquí (y en una nota del chatter del registro) queda la persona real.
 * Tabla agenteia_cambios, se crea sola. `jti` (único) es el id del token de
 * confirmación: un mismo botón no se ejecuta dos veces, ni tras reiniciar.
 */

let tablaLista = false;
export async function ensureBitacora() {
  if (tablaLista) return;
  await db.execute(`
    CREATE TABLE IF NOT EXISTS agenteia_cambios (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      jti VARCHAR(64) NOT NULL UNIQUE,
      email VARCHAR(190) NOT NULL,
      nombre VARCHAR(190) NULL,
      odoo_uid INT NULL,
      operacion VARCHAR(10) NOT NULL,
      modelo VARCHAR(128) NOT NULL,
      ids TEXT NULL,
      detalle MEDIUMTEXT NULL,
      resumen TEXT NOT NULL,
      estado ENUM('ejecutando','ok','error') NOT NULL DEFAULT 'ejecutando',
      resultado TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_email (email),
      KEY idx_fecha (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  tablaLista = true;
}

export async function listarCambios(limite = 200) {
  await ensureBitacora();
  const [filas] = await db.query(
    `SELECT id, email, nombre, operacion, modelo, ids, resumen, estado, resultado, created_at
     FROM agenteia_cambios ORDER BY id DESC LIMIT ${Math.min(Math.max(1, Math.floor(limite)), 1000)}`,
  );
  return filas as any[];
}
