// lib/db.ts
import mysql from "mysql2/promise";
import { capturarAntes, detectarAccion, registrarMutacion } from "@/lib/audit/logger";

export const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 40, // Aumentado para 60 usuarios simultáneos
  queueLimit: 0, // 0 significa cola ilimitada (cuidado con esto)
});

// Se crea perezosamente en la primera mutación, no en cada arranque del
// proceso — evita una query extra en cada import de este módulo (que ocurre
// muchísimas veces, incluso en rutas que solo leen).
let tablaAuditoriaLista: Promise<void> | null = null;
function asegurarTablaAuditoria(): Promise<void> {
  if (!tablaAuditoriaLista) {
    tablaAuditoriaLista = db
      .execute(
        `CREATE TABLE IF NOT EXISTS system_audit_log (
          id INT AUTO_INCREMENT PRIMARY KEY,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          user_id VARCHAR(50) NULL,
          user_name VARCHAR(255) NULL,
          user_role VARCHAR(100) NULL,
          method VARCHAR(10) NOT NULL,
          path VARCHAR(255) NULL,
          table_name VARCHAR(100) NULL,
          record_id VARCHAR(100) NULL,
          sql_text TEXT NULL,
          sql_params LONGTEXT NULL,
          before_data LONGTEXT NULL,
          after_data LONGTEXT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'ok',
          error_message TEXT NULL,
          INDEX idx_created_at (created_at),
          INDEX idx_user_id (user_id),
          INDEX idx_table_name (table_name)
        )`,
      )
      .then(() => undefined)
      .catch((e: any) => {
        console.error("[audit] no se pudo asegurar system_audit_log:", e?.message);
        tablaAuditoriaLista = null; // reintentar en la proxima mutacion
      });
  }
  return tablaAuditoriaLista;
}

export const query = async (sql: string, params?: any[]) => {
  // Filtro rápido: los SELECT (la inmensa mayoría de las llamadas) no
  // pagan ningún costo extra por la instrumentación de auditoría.
  const accion = detectarAccion(sql);

  const antes = accion ? await capturarAntes(db, sql, params) : null;

  try {
    const [results] = await db.execute(sql, params);
    if (accion) {
      void asegurarTablaAuditoria().then(() =>
        registrarMutacion(db, sql, params, results, antes),
      );
    }
    return { rows: results as any[] };
  } catch (error: any) {
    // Las migraciones idempotentes (ALTER ... ADD COLUMN / ADD INDEX, CREATE
    // TABLE) chocan con lo que ya existe en cada arranque y el caller lo
    // atrapa a proposito: no es un error, y registrarlo llenaba el log de
    // "Duplicate column" con stack y todo. El resto se registra en una linea;
    // el error completo sigue llegando al caller.
    if (!esDuplicadoDeMigracion(error, sql)) {
      console.error(
        `❌ Error en la DB [${error?.code || "?"}] ${error?.message || error} — ${String(sql).replace(/\s+/g, " ").trim().slice(0, 160)}`,
      );
    }
    throw error;
  }
};

/** Un ALTER/CREATE que falla porque la columna, el indice o la tabla ya existe. */
function esDuplicadoDeMigracion(error: any, sql: string): boolean {
  return (
    ["ER_DUP_FIELDNAME", "ER_DUP_KEYNAME", "ER_TABLE_EXISTS_ERROR"].includes(error?.code) &&
    /^\s*(ALTER|CREATE)\b/i.test(String(sql))
  );
}

// Devuelve una conexion dedicada del pool, para hacer varias queries en una
// transaccion (commit/rollback) o que comparten estado.
//
// El caller DEBE llamar a conn.release() en un finally cuando termine. No
// conn.close() ni conn.end(): en una conexion de pool de mysql2, close() lanza
// un TypeError y end() esta deprecado. Si la conexion no se libera se agota el
// pool (connectionLimit 40) y, como waitForConnections es true con la cola sin
// limite, todas las consultas de la app se quedan esperando indefinidamente.
export const getConnection = async () => {
  return db.getConnection();
};
