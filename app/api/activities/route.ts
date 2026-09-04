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
import { query } from "@/lib/db"; // Importación centralizada
import { requireSession } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";

// Declaración global para soporte de WebSocket en Next.js
declare global {
  var io: any;
}

// Usado por las 3 vistas de actividades (superadmin/gerente/estandar), asi
// que el guard exige sesion valida de cualquier rol, no uno especifico.

export async function GET(req: NextRequest) {
  const auth = await requireSession(req);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    // Consulta con cálculo de días restantes para alertas
    let sql = `
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
      sql += " AND a.user_id = ?";
      params.push(userId);
    }
    sql += " ORDER BY a.created_at DESC";

    const result = await query(sql, params);
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("API GET Error:", error);
    return NextResponse.json(
      { error: "Error al obtener actividades" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireSession(req);
  if (auth.error) return auth.error;

  try {
    const { id, status, observacion } = await req.json();

    // Solo el dueño de la tarea (user_id), quien la asigno (assigned_by
    // guarda el nombre de quien la creo, ver AssignActivityModal.tsx) o
    // superadmin pueden tocarla: antes cualquier sesion autenticada podia
    // cerrar/editar la tarea de cualquier otro con solo cambiar el id.
    const ownerRows = await query("SELECT user_id, assigned_by FROM activities WHERE id = ?", [id]);
    const activity = ownerRows.rows?.[0];
    if (!activity) {
      return NextResponse.json({ error: "Actividad no encontrada" }, { status: 404 });
    }
    const callerRole = ((auth.payload!.role as string) || "").toLowerCase().trim();
    const callerId = String(auth.payload!.sub ?? auth.payload!.uid ?? "");
    const callerName = ((auth.payload!.name as string) || "").trim().toLowerCase();
    const isOwner = String(activity.user_id) === callerId;
    const isAssigner = ((activity.assigned_by as string) || "").trim().toLowerCase() === callerName;
    if (callerRole !== "superadmin" && !isOwner && !isAssigner) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    if (status) {
      await query("UPDATE activities SET status = ? WHERE id = ?", [
        status,
        id,
      ]);
    }
    if (observacion !== undefined) {
      await query("UPDATE activities SET observacion = ? WHERE id = ?", [
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
  const auth = await requireSession(req);
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const { title, description, user_email, due_date, assigned_by } = body;

    if (!title)
      return NextResponse.json({ error: "Título requerido" }, { status: 400 });

    // Inserción de la nueva actividad
    const result = await query(
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

    return NextResponse.json({ success: true, id: (result.rows as any).insertId });
  } catch (error) {
    console.error("API POST Error:", error);
    return NextResponse.json(
      { error: "Error al crear actividad" },
      { status: 500 },
    );
  }
}
