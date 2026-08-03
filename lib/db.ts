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
    throw error; // Lanzamos el error para que la API sepa qué pasó
  }
};
