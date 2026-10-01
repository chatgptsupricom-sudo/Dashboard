import { verifyToken } from "@/lib/jwt"; // Importas tu función existente
import mysql from "mysql2/promise";
import { NextResponse } from "next/server";

const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
};
export async function GET(req: Request) {
  try {
    // 1. Obtener token del header Authorization (formato: Bearer <token>)
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : undefined;

    // 2. Verificar el token usando TU función existente
    const userSession = verifyToken(token);

    if (!userSession) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const targetEmail = searchParams.get("email");

    const connection = await mysql.createConnection(dbConfig);

    // 3. Lógica según el ROL
    let query = `SELECT id, user_email as userName, action_type as type,
                        description as title, created_at as time, status
                 FROM activities WHERE 1=1`;
    let params: any[] = [];

    if (userSession.role?.toString().toLowerCase().trim() === "superadmin") {
      if (targetEmail) {
        query += " AND user_email = ?";
        params.push(targetEmail);
      }
    } else {
      // Para gerentes, restringimos a los usuarios de su jerarquía
      // Asegúrate de que userSession.email tenga el identificador necesario
      query += ` AND user_email IN (
        SELECT email FROM users WHERE manager_email = ? OR email = ?
      )`;
      params.push(userSession.email, userSession.email);
    }

    query += " ORDER BY created_at DESC LIMIT 50";

    const [activities] = await connection.execute(query, params);
    await connection.end();

    return NextResponse.json(activities);
  } catch (error) {
    return NextResponse.json([], { status: 500 });
  }
}
