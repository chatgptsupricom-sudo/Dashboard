// import mysql from "mysql2/promise";
// import { NextResponse } from "next/server";

// // Declaración global para TypeScript
// declare global {
//   var io: any;
// }

// const pool = mysql.createPool({
//   host: process.env.DB_HOST,
//   user: process.env.DB_USER,
//   password: process.env.DB_PASSWORD,
//   database: process.env.DB_NAME,
//   waitForConnections: true,
//   connectionLimit: 10,
// });

// export async function GET(req: Request) {
//   try {
//     const { searchParams } = new URL(req.url);
//     const userId = searchParams.get("userId");

//     // Consulta explícita y segura
//     let query = `
//   SELECT
//     a.id,
//     a.title,
//     a.description,
//     a.status,
//     a.due_date,
//     DATEDIFF(a.due_date, CURDATE()) as days_left, -- CALCULO DE DÍAS
//     u.name as user_name_display,
//     a.assigned_by,
//     a.created_at,
//     a.observacion
//   FROM activities a
//   LEFT JOIN users_config u ON a.user_id = u.id
//   WHERE 1=1
// `;

//     const params: any[] = [];

//     if (userId) {
//       query += " AND a.user_id = ?";
//       params.push(userId);
//     }

//     // Añadimos ordenamiento por fecha para que sea consistente
//     query += " ORDER BY a.created_at DESC";

//     const [rows] = await pool.execute(query, params);
//     return NextResponse.json(rows);
//   } catch (error) {
//     // IMPORTANTE: Esto te dirá exactamente qué falla en tu consola de VS Code
//     console.error("API GET Error detallado:", error);
//     return NextResponse.json(
//       { error: "Error interno en el servidor" },
//       { status: 500 },
//     );
//   }
// }

// export async function PATCH(req: Request) {
//   try {
//     const { id, status, observacion } = await req.json();

//     if (status) {
//       await pool.execute("UPDATE activities SET status = ? WHERE id = ?", [
//         status,
//         id,
//       ]);
//     }
//     if (observacion !== undefined) {
//       await pool.execute("UPDATE activities SET observacion = ? WHERE id = ?", [
//         observacion,
//         id,
//       ]);
//     }

//     // --- EMISIÓN EN TIEMPO REAL AL ACTUALIZAR ---
//     if (global.io) {
//       global.io.emit("activity-updated", {
//         action: "STATUS_OR_OBSERVATION_CHANGED",
//         id,
//       });
//     }

//     return NextResponse.json({ success: true });
//   } catch (error) {
//     return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
//   }
// }

// export async function POST(req: Request) {
//   try {
//     const body = await req.json();
//     const user_id = body.user_id ?? null;
//     const role_id = body.role_id ?? null;
//     const cids = body.cids ?? null;
//     const user_email = body.user_email ?? null;
//     const assigned_by = body.assigned_by ?? null;
//     const due_date = body.due_date ?? null;
//     const description = body.description || body.title || "Sin descripción";

//     await pool.execute(
//       `INSERT INTO activities (user_id, role_id, cids, description, user_email, action_type, status, due_date, assigned_by)
//        VALUES (?, ?, ?, ?, ?, 'TASK', 'pending', ?, ?)`,
//       [user_id, role_id, cids, description, user_email, due_date, assigned_by],
//     );

//     // --- EMISIÓN EN TIEMPO REAL AL CREAR ---
//     if (global.io) {
//       global.io.emit("activity-updated", { action: "CREATED" });
//     }

//     return NextResponse.json({ success: true });
//   } catch (error) {
//     return NextResponse.json(
//       { error: "Error interno al crear actividad" },
//       { status: 500 },
//     );
//   }
// }
import { db } from "@/lib/db"; // Importación centralizada
import { requireRoles } from "@/lib/auth/roles";
import { UserRole } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";

// Declaración global para soporte de WebSocket en Next.js
declare global {
  var io: any;
}

// Usado por las 3 vistas de actividades (superadmin/gerente/estandar), asi
// que el guard exige sesion valida de cualquier rol, no uno especifico.
const TODOS_LOS_ROLES = Object.values(UserRole);

export async function GET(req: NextRequest) {
  const auth = await requireRoles(req, TODOS_LOS_ROLES);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    // Consulta con cálculo de días restantes para alertas
    let query = `
      SELECT
        a.id, a.title, a.description, a.status, a.due_date,
        DATEDIFF(a.due_date, CURDATE()) as days_left,
        u.name as user_name_display,
        a.assigned_by, a.created_at, a.observacion
      FROM activities a
      LEFT JOIN users_config u ON a.user_id = u.id
      WHERE 1=1
    `;

    const params: any[] = [];
    if (userId) {
      query += " AND a.user_id = ?";
      params.push(userId);
    }
    query += " ORDER BY a.created_at DESC";

    const [rows] = await db.execute(query, params);
    return NextResponse.json(rows);
  } catch (error) {
    console.error("API GET Error:", error);
    return NextResponse.json(
      { error: "Error al obtener actividades" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireRoles(req, TODOS_LOS_ROLES);
  if (auth.error) return auth.error;

  try {
    const { id, status, observacion } = await req.json();

    if (status) {
      await db.execute("UPDATE activities SET status = ? WHERE id = ?", [
        status,
        id,
      ]);
    }
    if (observacion !== undefined) {
      await db.execute("UPDATE activities SET observacion = ? WHERE id = ?", [
        observacion,
        id,
      ]);
    }

    // Notificación en tiempo real a todos los clientes conectados
    if (global.io) {
      global.io.emit("activity-updated", {
        action: "STATUS_OR_OBSERVATION_CHANGED",
        id,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API PATCH Error:", error);
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireRoles(req, TODOS_LOS_ROLES);
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const { title, description, user_email, due_date, assigned_by } = body;

    if (!title)
      return NextResponse.json({ error: "Título requerido" }, { status: 400 });

    // Inserción de la nueva actividad
    const [result]: any = await db.execute(
      `INSERT INTO activities
      (user_id, role_id, cids, description, user_email, action_type, status, due_date, assigned_by, title)
      VALUES (?, ?, ?, ?, ?, 'TASK', 'pending', ?, ?, ?)`,
      [
        body.user_id, // 1
        body.role_id, // 2
        body.cids, // 3
        description, // 4
        user_email, // 5
        due_date, // 6
        assigned_by, // 7
        title, // 8
      ],
    );

    // Notificación en tiempo real a todos los clientes
    if (global.io) {
      global.io.emit("activity-updated", { action: "CREATED" });
    }

    return NextResponse.json({ success: true, id: result.insertId });
  } catch (error) {
    console.error("API POST Error:", error);
    return NextResponse.json(
      { error: "Error al crear actividad" },
      { status: 500 },
    );
  }
}
