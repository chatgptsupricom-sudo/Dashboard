import { query } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";

    // 1. OBTENER ROLES DISPONIBLES DESDE MYSQL
    const rolesListResult = await query(
      "SELECT id, name, display_name FROM roles ORDER BY display_name ASC",
    );
    const dbRolesList = rolesListResult?.rows || [];

    // Mapeo estructurado para el select del Modal y Filtros
    const availableRoles = dbRolesList.map((r: any) => ({
      key: r.id.toString(), // ID numérico para guardar en el POST
      name: r.name,
      displayName: r.display_name || r.name,
    }));

    // 2. OBTENER VINCULACIONES DE USUARIOS CONFIG DESDE MYSQL (LEFT JOIN)
    let rolesMap = new Map();
    let userRoleNamesMap = new Map(); // Mapa para filtrar por nombre exacto en el cuadro

    try {
      const mysqlUsersResult = await query(`
        SELECT uc.email, r.name as role_name, r.display_name
        FROM users_config uc
        JOIN roles r ON uc.role_id = r.id
      `);
      const mysqlUsers = mysqlUsersResult?.rows || [];

      // Mapeamos usando el email como clave
      rolesMap = new Map(
        mysqlUsers.map((r: any) => [
          r.email.toLowerCase().trim(),
          r.display_name || r.role_name,
        ]),
      );
      userRoleNamesMap = new Map(
        mysqlUsers.map((r: any) => [r.email.toLowerCase().trim(), r.role_name]),
      );
    } catch (mysqlError) {
      console.error("MySQL Mappings Error:", mysqlError);
    }

    // 3. OBTENER USUARIOS DE ODOO (Trayendo login_date para la Última Sesión)
    const odooUsers = await callOdooRPC<any[]>("res.users", "search_read", [
      [
        ["name", "ilike", search],
        ["active", "in", [true, false]],
      ],
      ["name", "login", "active", "login_date", "share", "company_ids"], // <--- AGREGADO
    ]);

    // Obtener array de puros correos asignados localmente en minúsculas para limpiar el modal
    const localUsersResult = await query("SELECT email FROM users_config");
    const localUsers = localUsersResult?.rows || [];
    const existingEmails: string[] = localUsers.map((u: any) =>
      u.email ? u.email.toLowerCase().trim() : "",
    );

    // 4. FILTRAR USUARIOS HUÉRFANOS PARA EL MODAL (Solo los que NO tienen rol en el panel)
    const availableUsers = odooUsers
      .filter(
        (ou) =>
          ou.login && !existingEmails.includes(ou.login.toLowerCase().trim()),
      )
      .map((ou) => ({
        id: ou.id,
        name: ou.name,
        email: ou.login.toLowerCase().trim(), // <--- ESTO ES LO QUE NECESITAMOS
      }));

    // 5. CRUZAR DATOS PARA LA TABLA PRINCIPAL
    const formattedUsers = odooUsers.map((u, index) => {
      const odooEmailClean = u.login ? u.login.toLowerCase().trim() : "";

      return {
        id: u.id || index,
        name: u.name,
        email: u.login,
        odooStatus: u.active ? "Activo" : "Inactivo",
        panelRole: rolesMap.get(odooEmailClean) || "Sin Acceso", // Nombre legible para la grilla
        panelRoleName: userRoleNamesMap.get(odooEmailClean) || "Sin Acceso", // Nombre técnico para filtros del frontend
        role: u.share ? "Portal" : "Interno",
        lastLogin: u.login_date
          ? new Date(u.login_date + " UTC").toLocaleString("es-VE", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
            })
          : "Nunca",
      };
    });

    const roleIdFilter = searchParams.get("roleId");

    let finalUsers = formattedUsers;

    if (roleIdFilter) {
      // Filtramos por el role_id técnico (panelRoleName)
      // Nota: Asegúrate de que panelRoleName coincida con el ID o nombre del rol
      finalUsers = formattedUsers.filter((u: any) => {
        // Aquí debes buscar el nombre técnico del rol según el ID enviado
        // Opcional: puedes obtener el nombre técnico del rol desde la tabla roles con el roleId
        return u.panelRoleName !== "Sin Acceso";
      });
    }

    return NextResponse.json({
      users: finalUsers, // Devuelve solo los filtrados
      availableUsers: availableUsers,
      availableRoles: availableRoles,
    });
  } catch (error: any) {
    console.error("❌ Error Crítico en GET /api/superadmin/users:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// export async function POST(request: Request) {
//   try {
//     const { email, role } = await request.json(); // 'role' contiene el ID numérico que viene de role.key

//     if (!email || !role) {
//       return NextResponse.json(
//         { error: "Parámetros incompletos" },
//         { status: 400 },
//       );
//     }

//     const cleanEmail = email.toLowerCase().trim();
//     const roleId = parseInt(role, 10);

//     if (isNaN(roleId)) {
//       return NextResponse.json(
//         { error: "El ID del rol debe ser numérico" },
//         { status: 400 }, // ❌ AQUÍ ES DONDE SE CONFIGURA EL BAD REQUEST
//       );
//     }

//     // Comprobar existencia en users_config por email normalizado
//     const checkUser = await query(
//       "SELECT id FROM users_config WHERE LOWER(email) = ?",
//       [cleanEmail],
//     );
//     const userExists = checkUser?.rows && checkUser.rows.length > 0;

//     if (userExists) {
//       await query(
//         "UPDATE users_config SET role_id = ? WHERE LOWER(email) = ?",
//         [roleId, cleanEmail],
//       );
//     } else {
//       await query("INSERT INTO users_config (email, role_id) VALUES (?, ?)", [
//         cleanEmail,
//         roleId,
//       ]);
//     }

//     return NextResponse.json({ success: true });
//   } catch (error: any) {
//     console.error("❌ Error en POST /api/superadmin/users:", error);
//     return NextResponse.json({ error: error.message }, { status: 500 });
//   }
// }
// export async function POST(request: Request) {
//   try {
//     const body = await request.json();
//     console.log("Cuerpo recibido:", body);
//     const { email, role, cids } = body;

//     // Validación básica de entrada
//     if (!email || !role) {
//       return NextResponse.json(
//         { error: "Parámetros incompletos" },
//         { status: 400 },
//       );
//     }

//     const cleanEmail = email.toLowerCase().trim();
//     const roleId = parseInt(role, 10);

//     // 1. OBTENER NOMBRE DESDE ODOO
//     const odooUsers = await callOdooRPC<any[]>("res.users", "search_read", [
//       [["login", "=", cleanEmail]],
//       ["name"],
//     ]);
//     const userName =
//       odooUsers.length > 0 && odooUsers[0].name ? odooUsers[0].name : "Usuario";

//     // 2. GESTIONAR users_config (Búsqueda y Creación/Actualización)
//     let localUserId: number;
//     const checkUser = await query(
//       "SELECT id FROM users_config WHERE LOWER(email) = ?",
//       [cleanEmail],
//     );

//     if (checkUser?.rows && checkUser.rows.length > 0) {
//       localUserId = checkUser.rows[0].id;
//       await query(
//         "UPDATE users_config SET role_id = ?, name = ? WHERE id = ?",
//         [roleId, userName, localUserId],
//       );
//     } else {
//       const insert = await query(
//         "INSERT INTO users_config (email, name, role_id) VALUES (?, ?, ?)",
//         [cleanEmail, userName, roleId],
//       );
//       // Captura segura del ID insertado
//       localUserId = (insert as any).insertId || (insert as any).rows?.insertId;
//     }

//     // Refuerzo: Si localUserId sigue siendo undefined, recuperarlo de la base
//     if (!localUserId) {
//       const recovery = await query(
//         "SELECT id FROM users_config WHERE LOWER(email) = ?",
//         [cleanEmail],
//       );
//       localUserId = recovery?.rows[0]?.id;
//     }

//     // 3. GESTIONAR TABLA sellers
//     // 3. GESTIONAR TABLA sellers
//     if (roleId === 7 && localUserId) {
//       // Si cids es una cadena vacía o undefined, enviamos null (para borrarlo si estaba lleno)
//       // Si tiene contenido, enviamos el contenido tal cual.
//       const safeCids =
//         cids === undefined || cids === "" || cids === null ? null : cids;

//       const safeUserId = localUserId;
//       const safeName = userName || "Sin Nombre";
//       const safeRoleId = roleId;

//       const checkSeller = await query(
//         "SELECT id FROM sellers WHERE user_id = ?",
//         [safeUserId],
//       );

//       if (checkSeller?.rows && checkSeller.rows.length > 0) {
//         // ACTUALIZACIÓN: Pasamos safeCids directamente.
//         // Si es null, guardará NULL en la base de datos.
//         await query(
//           "UPDATE sellers SET name = ?, role = ?, cids = ?, activo = 1 WHERE user_id = ?",
//           [safeName, safeRoleId, safeCids, safeUserId],
//         );
//       } else {
//         // INSERCIÓN
//         await query(
//           "INSERT INTO sellers (user_id, name, role, cids, activo, created_at) VALUES (?, ?, ?, ?, 1, NOW())",
//           [safeUserId, safeName, safeRoleId, safeCids],
//         );
//       }
//     }

//     return NextResponse.json({ success: true });
//   } catch (error: any) {
//     console.error("❌ Error final en POST:", error);
//     return NextResponse.json({ error: error.message }, { status: 500 });
//   }
// }
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, role, cids, odooId } = body; // Asegúrate de recibir odooId desde el frontend

    if (!email || !role || !odooId) {
      return NextResponse.json(
        { error: "Parámetros incompletos" },
        { status: 400 },
      );
    }

    const cleanEmail = email.toLowerCase().trim();
    const roleId = parseInt(role, 10);
    const userId = parseInt(odooId, 10); // Este es el ID de Odoo

    // 1. OBTENER NOMBRE DESDE ODOO
    const odooUsers = await callOdooRPC<any[]>("res.users", "search_read", [
      [["id", "=", userId]],
      ["name"],
    ]);
    const userName = odooUsers.length > 0 ? odooUsers[0].name : "Usuario";

    // 2. GESTIONAR users_config (Forzando el ID de Odoo)
    const checkUser = await query("SELECT id FROM users_config WHERE id = ?", [
      userId,
    ]);

    if (checkUser?.rows && checkUser.rows.length > 0) {
      await query(
        "UPDATE users_config SET role_id = ?, name = ?, email = ? WHERE id = ?",
        [roleId, userName, cleanEmail, userId],
      );
    } else {
      // INSERTAMOS FORZANDO EL ID DE ODOO
      await query(
        "INSERT INTO users_config (id, email, name, role_id) VALUES (?, ?, ?, ?)",
        [userId, cleanEmail, userName, roleId],
      );
    }

    // 3. GESTIONAR TABLA sellers (VINCULACIÓN)
    if (roleId === 7) {
      // Mapeo de ciudades a IDs de CIDS
      const cityMapping: Record<string, number> = {
        Panama: 7,
        Valencia: 9,
        Caracas: 10,
      };

      // Obtenemos el ID numérico si recibimos el nombre,
      // o mantenemos el valor si ya viene como número/string numérico
      let finalCids = cids;
      if (cityMapping[cids]) {
        finalCids = cityMapping[cids];
      }

      const safeCids =
        finalCids === "" || finalCids === undefined || finalCids === null
          ? null
          : parseInt(finalCids, 10);

      const checkSeller = await query(
        "SELECT id FROM sellers WHERE user_id = ?",
        [userId],
      );

      if (checkSeller?.rows && checkSeller.rows.length > 0) {
        await query(
          "UPDATE sellers SET name = ?, role = ?, cids = ?, activo = 1 WHERE user_id = ?",
          [userName, roleId, safeCids, userId],
        );
      } else {
        await query(
          "INSERT INTO sellers (user_id, name, role, cids, activo, created_at) VALUES (?, ?, ?, ?, 1, NOW())",
          [userId, userName, roleId, safeCids],
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("❌ Error final en POST:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
