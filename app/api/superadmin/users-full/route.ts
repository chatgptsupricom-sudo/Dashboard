import mysql from "mysql2/promise";
import { NextResponse } from "next/server";

// Asegúrate de definir el pool usando process.env directamente aquí para depurar
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

export async function GET() {
  try {
    const query = `
      SELECT
        u.id,
        u.name,
        u.cids,           /* NECESARIO para el filtro */
        r.name as role,   /* Asegúrate que el campo sea 'name' o 'slug' */
        r.display_name as role_name,
        CASE
          WHEN u.cids = 9 THEN 'Valencia'
          WHEN u.cids = 10 THEN 'Caracas'
          WHEN u.cids = 7 THEN 'Panama'
          ELSE 'SuperAdmin'
        END as cids_name
      FROM users_config u
      LEFT JOIN roles r ON u.role_id = r.id
    `;

    const [rows] = await pool.execute(query);
    return NextResponse.json(rows);
  } catch (error) {
    console.error("DEBUG API ERROR:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
