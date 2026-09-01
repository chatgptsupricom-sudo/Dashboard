import mysql from "mysql2/promise";
import { requireRoles } from "@/lib/auth/roles";
import { UserRole } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";

// Declaración global para TypeScript
declare global {
  var io: any;
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
});

export async function POST(req: NextRequest) {
  const auth = await requireRoles(req, Object.values(UserRole));
  if (auth.error) return auth.error;

  try {
    const body = await req.json();

    if (!body.title) {
      return NextResponse.json(
        { error: "El título es requerido" },
        { status: 400 },
      );
    }

    const user_email = body.user_email ?? "no-email@supricom.com";
    const title = body.title;
    const description = body.description ?? null;
    const observacion = body.observacion ?? null;
    const due_date = body.due_date ?? null;
    const assigned_by = body.assigned_by ?? null;

    // 1. OBTENER DATOS DEL USUARIO DESDE users_config
    const [users]: any = await pool.execute(
      "SELECT id, role_id, cids FROM users_config WHERE email = ?",
      [user_email],
    );

    let user_id = body.user_id ?? null;
    let role_id = body.role_id ?? null;
    let cids = body.cids ?? null;

    if (users.length > 0) {
      user_id = user_id ?? users[0].id;
      role_id = role_id ?? users[0].role_id;
      cids = cids ?? users[0].cids;
    }

    // 2. INSERTAR EN ACTIVITIES
    const [result]: any = await pool.execute(
      `INSERT INTO activities
      (user_id, role_id, cids, description, user_email, action_type, status, observacion, due_date, assigned_by, title)
      VALUES (?, ?, ?, ?, ?, 'TASK', 'pending', ?, ?, ?, ?)`,
      [
        user_id,
        role_id,
        cids,
        description,
        user_email,
        observacion,
        due_date,
        assigned_by,
        title,
      ],
    );

    // --- INTEGRACIÓN WEBSOCKET (TIEMPO REAL) ---
    // Emitimos el evento para que todas las pestañas se refresquen
    if (global.io) {
      global.io.emit("activity-updated", {
        action: "CREATED",
        userId: user_id,
      });
    }

    // 3. AUDITORÍA
    await pool.execute(
      `INSERT INTO audit_logs (user_id, user_name, role, action, changes, created_at) VALUES (?, ?, ?, ?, ?, NOW())`,
      [
        user_id ?? 0,
        user_email.split("@")[0],
        "user",
        "CREATE_ACTIVITY",
        JSON.stringify({ action: "Creación de actividad", title }),
      ],
    );

    return NextResponse.json({ success: true, id: result.insertId });
  } catch (error) {
    console.error("Error al insertar actividad:", error);
    return NextResponse.json(
      { error: "Error al crear actividad" },
      { status: 500 },
    );
  }
}
