// lib/db.ts
import mysql from "mysql2/promise";

export const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 40, // Aumentado para 60 usuarios simultáneos
  queueLimit: 0, // 0 significa cola ilimitada (cuidado con esto)
});

export const query = async (sql: string, params?: any[]) => {
  try {
    const [results] = await db.execute(sql, params);
    return { rows: results as any[] };
  } catch (error) {
    console.error("❌ Error ejecutando query en la DB:", error);
    throw error;
  }
};

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
