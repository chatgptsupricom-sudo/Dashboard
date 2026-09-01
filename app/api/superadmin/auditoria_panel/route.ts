import mysql from "mysql2/promise"; // Asegúrate de tener instalado mysql2
import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["superadmin", "gerente de operaciones"]);
  if (auth.error) return auth.error;

  try {
    // Configura tu conexión (usa variables de entorno en producción)
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });

    // Consultar todos los logs ordenados por fecha
    const [rows] = await connection.execute(
      "SELECT * FROM audit_logs ORDER BY created_at DESC",
    );

    await connection.end();

    return NextResponse.json(rows);
  } catch (error) {
    console.error("Error al obtener logs:", error);
    return NextResponse.json(
      { error: "Error al consultar logs" },
      { status: 500 },
    );
  }
}
