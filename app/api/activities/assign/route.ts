// // import { db } from "@/lib/db"; // Importación centralizada
// // import { NextResponse } from "next/server";

// // // Declaración para evitar errores de TypeScript con la propiedad global
// // declare global {
// //   var io: any;
// // }

// // export async function POST(req: Request) {
// //   try {
// //     const body = await req.json();

// //     const user_id = body.user_id ?? null;
// //     let role_id = body.role_id ?? null;
// //     let cids = body.cids ?? null;
// //     let user_email = body.user_email ?? null;
// //     const title = body.title ?? "Sin título";
// //     const description = body.description ?? null;
// //     const due_date = body.due_date ?? null;
// //     const assigned_by = body.assigned_by ?? null;
// //     const admin_id = body.admin_id ?? 0;
// //     const admin_name = body.admin_name ?? "Sistema";

// //     // 1. Buscar configuración del usuario destino
// //     if (user_id) {
// //       const [users]: any = await db.execute(
// //         "SELECT email, role_id, cids FROM users_config WHERE id = ?",
// //         [user_id],
// //       );
// //       if (users.length > 0) {
// //         user_email = users[0].email;
// //         role_id = users[0].role_id;
// //         cids = users[0].cids;
// //       }
// //     }

// //     if (!user_email) user_email = "no-email@supricom.com";

// //     // 2. Ejecutar el INSERT con las 10 columnas y 10 valores
// //     // Nota: Se agregaron los valores fijos 'TASK' y 'pending' al array de parámetros
// //     const [result]: any = await db.execute(
// //       `INSERT INTO activities
// //       (user_id, role_id, cids, title, description, user_email, action_type, status, due_date, assigned_by)
// //       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
// //       [
// //         user_id,
// //         role_id,
// //         cids,
// //         title,
// //         description,
// //         user_email,
// //         "TASK", // Parámetro 7
// //         "pending", // Parámetro 8
// //         due_date, // Parámetro 9
// //         assigned_by, // Parámetro 10
// //       ],
// //     );

// //     // --- EMISIÓN DE TIEMPO REAL ---
// //     if (global.io) {
// //       global.io.emit("activity-updated", {
// //         action: "CREATED",
// //         targetUserId: user_id,
// //       });
// //     }

// //     // 3. Auditoría
// //     await db.execute(
// //       `INSERT INTO audit_logs (user_id, user_name, role, action, changes, created_at) VALUES (?, ?, ?, ?, ?, NOW())`,
// //       [
// //         admin_id,
// //         admin_name,
// //         "superAdmin",
// //         "ASSIGN_TASK",
// //         JSON.stringify({ action: "Asignación", target_user: user_id, title }),
// //       ],
// //     );

// //     return NextResponse.json({ success: true, id: result.insertId });
// //   } catch (error) {
// //     console.error("Error en assign:", error);
// //     return NextResponse.json({ error: "Error al asignar" }, { status: 500 });
// //   }
// // }
// import { db } from "@/lib/db"; // Importación centralizada
// import { NextResponse } from "next/server";

// // Declaración para evitar errores de TypeScript con la propiedad global
// declare global {
//   var io: any;
// }

// export async function GET(req: Request) {
//   try {
//     const { searchParams } = new URL(req.url);
//     const userId = searchParams.get("userId");

//     // CAPTURAMOS EL NOMBRE DEL ASIGNADOR DESDE EL FRONTEND
//     const assignedBy = searchParams.get("assignedBy");

//     // Consulta explícita y segura con cálculo de días restantes
//     let query = `
//       SELECT
//         a.id,
//         a.title,
//         a.description,
//         a.status,
//         a.due_date,
//         DATEDIFF(a.due_date, CURDATE()) as days_left,
//         u.name as user_name_display,
//         a.assigned_by,
//         a.created_at,
//         a.observacion
//       FROM activities a
//       LEFT JOIN users_config u ON a.user_id = u.id
//       WHERE 1=1
//     `;

//     const params: any[] = [];

//     // CONDICIONAL DE BÚSQUEDA: Si viene assignedBy, filtramos las que el usuario actual creó
//     if (assignedBy) {
//       query += " AND a.assigned_by = ?";
//       params.push(assignedBy);
//     } else if (userId) {
//       // Filtro tradicional: Mis tareas asignadas para mí mismo
//       query += " AND a.user_id = ?";
//       params.push(userId);
//     }

//     query += " ORDER BY a.created_at DESC";

//     const [rows] = await db.execute(query, params);
//     return NextResponse.json(rows);
//   } catch (error) {
//     console.error("API GET Error:", error);
//     return NextResponse.json(
//       { error: "Error al obtener actividades" },
//       { status: 500 },
//     );
//   }
// }

// export async function PATCH(req: Request) {
//   try {
//     const { id, status, observacion } = await req.json();

//     if (status) {
//       await db.execute("UPDATE activities SET status = ? WHERE id = ?", [
//         status,
//         id,
//       ]);
//     }
//     if (observacion !== undefined) {
//       await db.execute("UPDATE activities SET observacion = ? WHERE id = ?", [
//         observacion,
//         id,
//       ]);
//     }

//     if (global.io) {
//       global.io.emit("activity-updated", {
//         action: "STATUS_OR_OBSERVATION_CHANGED",
//         id,
//       });
//     }

//     return NextResponse.json({ success: true });
//   } catch (error) {
//     console.error("API PATCH Error:", error);
//     return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
//   }
// }
// app/api/activities/assign/route.ts
import { query } from "@/lib/db"; // Importación centralizada
import { requireSession } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";

// Declaración para evitar errores de TypeScript con la propiedad global si usas socket.io
declare global {
  var io: any;
}

// Lo usan tanto la vista de superadmin como la estandar (asignar tareas
// entre pares), asi que el guard exige sesion valida de cualquier rol.

export async function GET(req: NextRequest) {
  const auth = await requireSession(req);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    // Capturamos el nombre o identificador del asignador desde el frontend
    const assignedBy = searchParams.get("assignedBy");

    // Consulta explícita y segura con cálculo de días restantes
    let sql = `
      SELECT
        a.id,
        a.title,
        a.description,
        a.status,
        a.due_date,
        DATEDIFF(a.due_date, CURDATE()) as days_left,
        u.name as user_name_display,
        a.assigned_by,
        a.created_at,
        a.observacion
      FROM activities a
      LEFT JOIN users_config u ON a.user_id = u.id
      WHERE 1=1
    `;

    const params: any[] = [];

    // CONDICIONAL DE BÚSQUEDA:
    if (assignedBy) {
      // Filtramos exactamente por el nombre de quien asignó la tarea
      sql += " AND a.assigned_by = ?";
      params.push(assignedBy.trim());
    } else if (userId) {
      // Filtro tradicional: Mis tareas asignadas para mí mismo
      sql += " AND a.user_id = ?";
      params.push(userId);
    }

    // Ordenamos cronológicamente (las más nuevas primero)
    sql += " ORDER BY a.created_at DESC";

    const result = await query(sql, params);

    // Retornamos el arreglo de actividades encontradas
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("API GET Error en assign/route.ts:", error);
    return NextResponse.json(
      { error: "Error al obtener actividades" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireSession(req);
  if (auth.error) return auth.error;

  try {
    const body = await req.json();

    const user_id = body.user_id ?? null;
    let role_id = body.role_id ?? null;
    let cids = body.cids ?? null;
    let user_email = body.user_email ?? null;
    const title = body.title ?? "Sin título";
    const description = body.description ?? null;
    const due_date = body.due_date ?? null;
    const assigned_by = body.assigned_by ?? null;
    const admin_id = body.admin_id ?? 0;
    const admin_name = body.admin_name ?? "Sistema";

    if (user_id) {
      const usersResult = await query(
        "SELECT email, role_id, cids FROM users_config WHERE id = ?",
        [user_id],
      );
      const users = usersResult.rows;
      if (users.length > 0) {
        user_email = users[0].email;
        role_id = users[0].role_id;
        cids = users[0].cids;
      }
    }

    if (!user_email) user_email = "no-email@supricom.com";

    const insertResult = await query(
      `INSERT INTO activities
      (user_id, role_id, cids, title, description, user_email, action_type, status, due_date, assigned_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user_id,
        role_id,
        cids,
        title,
        description,
        user_email,
        "TASK",
        "pending",
        due_date,
        assigned_by,
      ],
    );

    if (global.io) {
      global.io.emit("activity-updated", {
        action: "CREATED",
        targetUserId: user_id,
      });
    }

    await query(
      `INSERT INTO audit_logs (user_id, user_name, role, action, changes, created_at) VALUES (?, ?, ?, ?, ?, NOW())`,
      [
        admin_id,
        admin_name,
        "superAdmin",
        "ASSIGN_TASK",
        JSON.stringify({ action: "Asignación", target_user: user_id, title }),
      ],
    );

    return NextResponse.json({ success: true, id: (insertResult.rows as any).insertId });
  } catch (error) {
    console.error("Error en assign POST:", error);
    return NextResponse.json({ error: "Error al asignar" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireSession(req);
  if (auth.error) return auth.error;

  try {
    const { id, status, observacion } = await req.json();

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
