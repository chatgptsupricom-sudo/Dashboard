import { query } from "@/lib/db";
import { requireSession } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";

// Declaración global para TypeScript
declare global {
  var io: any;
}

export async function POST(req: NextRequest) {
  const auth = await requireSession(req);
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
    const usersResult = await query(
      "SELECT id, role_id, cids FROM users_config WHERE email = ?",
      [user_email],
    );
    const users = usersResult.rows;

    let user_id = body.user_id ?? null;
    let role_id = body.role_id ?? null;
    let cids = body.cids ?? null;

    if (users.length > 0) {
      user_id = user_id ?? users[0].id;
      role_id = role_id ?? users[0].role_id;
      cids = cids ?? users[0].cids;
    }

    // 2. INSERTAR EN ACTIVITIES
    const insertResult = await query(
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
    await query(
      `INSERT INTO audit_logs (user_id, user_name, role, action, changes, created_at) VALUES (?, ?, ?, ?, ?, NOW())`,
      [
        user_id ?? 0,
        user_email.split("@")[0],
        "user",
        "CREATE_ACTIVITY",
        JSON.stringify({ action: "Creación de actividad", title }),
      ],
    );

    return NextResponse.json({ success: true, id: (insertResult.rows as any).insertId });
  } catch (error) {
    console.error("Error al insertar actividad:", error);
    return NextResponse.json(
      { error: "Error al crear actividad" },
      { status: 500 },
    );
  }
}
