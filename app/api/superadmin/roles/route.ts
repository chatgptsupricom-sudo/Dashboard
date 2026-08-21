import mysql from "mysql2/promise";
import { NextResponse } from "next/server";

const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
};

export async function GET() {
  try {
    const connection = await mysql.createConnection(dbConfig);

    // Consulta simple a tu tabla 'roles'
    const [roles] = await connection.execute(
      "SELECT id, name, display_name FROM roles",
    );

    await connection.end();

    return NextResponse.json(roles);
  } catch (error) {
    console.error("Error al obtener roles:", error);
    return NextResponse.json([], { status: 500 });
  }
}
