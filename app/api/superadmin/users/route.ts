import { query } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["superadmin", "gerente de operaciones"]);
  if (auth.error) return auth.error;

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
    let userConfigMap = new Map(); // email -> {role_id, cids, display_name} para reasignar/editar

    try {
      const mysqlUsersResult = await query(`
        SELECT uc.email, uc.role_id, uc.cids, r.name as role_name, r.display_name
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
      userConfigMap = new Map(
        mysqlUsers.map((r: any) => [
          r.email.toLowerCase().trim(),
          { roleId: r.role_id, cids: r.cids, displayName: r.display_name || r.role_name },
        ]),
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

    // 4. LISTA PARA EL MODAL: todos los usuarios de Odoo con login, ya tengan
    // o no rol en el panel — antes se excluían los que ya tenían uno, así
    // que no había forma de cambiarle el rol a alguien que ya lo tenía (el
    // modal simplemente no lo dejaba elegir). Se les adjunta su rol/cids
    // actual para poder editarlos, no solo asignar de cero.
    const availableUsers = odooUsers
      .filter((ou) => ou.login)
      .map((ou) => {
        const email = ou.login.toLowerCase().trim();
        const actual = userConfigMap.get(email) as
          | { roleId: number; cids: number | null; displayName: string }
          | undefined;
        return {
          id: ou.id,
          name: ou.name,
          email,
          currentRoleId: actual?.roleId != null ? String(actual.roleId) : null,
          currentRoleName: actual?.displayName ?? null,
          currentCids: actual?.cids != null ? String(actual.cids) : "",
        };
      });

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

export async function POST(request: NextRequest) {
  const auth = await requireRoles(request, ["superadmin", "gerente de operaciones"]);
  if (auth.error) return auth.error;

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

    // Un gerente de operaciones puede llegar hasta aca (comparte el guard de
    // arriba con superadmin), pero no debe poder otorgarse a si mismo (ni a
    // nadie) el rol superadmin, ni tocar una cuenta que ya es superadmin —
    // antes bastaba con mandar el roleId de superadmin (visible en el GET de
    // esta misma ruta) para autoescalarse o pisar a un superadmin existente.
    const callerRole = ((auth.payload!.role as string) || "").toLowerCase().trim();
    if (callerRole !== "superadmin") {
      const targetRoleResult = await query("SELECT name FROM roles WHERE id = ?", [roleId]);
      const targetRoleName = ((targetRoleResult?.rows?.[0]?.name as string) || "").toLowerCase().trim();
      if (targetRoleName === "superadmin") {
        return NextResponse.json({ error: "No autorizado para otorgar ese rol" }, { status: 403 });
      }

      const currentRoleResult = await query(
        `SELECT r.name FROM users_config uc JOIN roles r ON uc.role_id = r.id WHERE uc.id = ?`,
        [userId],
      );
      const currentRoleName = ((currentRoleResult?.rows?.[0]?.name as string) || "").toLowerCase().trim();
      if (currentRoleName === "superadmin") {
        return NextResponse.json({ error: "No autorizado para modificar esa cuenta" }, { status: 403 });
      }
    }

    // 1. OBTENER NOMBRE DESDE ODOO
    const odooUsers = await callOdooRPC<any[]>("res.users", "search_read", [
      [["id", "=", userId]],
      ["name"],
    ]);
    const userName = odooUsers.length > 0 ? odooUsers[0].name : "Usuario";

    // Mapeo de ciudades a IDs de CIDS (compania: 9 Valencia, 10 Caracas, 7
    // Panama — ver sql/insert_role_rma.sql). Se calcula una sola vez y se
    // usa tanto para users_config como para sellers: antes solo se guardaba
    // en sellers y solo si roleId===7, así que login (que lee
    // users_config.cids, ver app/api/auth/login/route.ts) nunca lo veía
    // para NINGÚN rol, ni siquiera ese.
    const cityMapping: Record<string, number> = {
      Panama: 7,
      Valencia: 9,
      Caracas: 10,
    };
    let finalCids = cids;
    if (cityMapping[cids]) {
      finalCids = cityMapping[cids];
    }
    const safeCids =
      finalCids === "" || finalCids === undefined || finalCids === null
        ? null
        : parseInt(finalCids, 10);

    // 2. GESTIONAR users_config (Forzando el ID de Odoo)
    const checkUser = await query("SELECT id FROM users_config WHERE id = ?", [
      userId,
    ]);

    if (checkUser?.rows && checkUser.rows.length > 0) {
      await query(
        "UPDATE users_config SET role_id = ?, name = ?, email = ?, cids = ? WHERE id = ?",
        [roleId, userName, cleanEmail, safeCids, userId],
      );
    } else {
      // INSERTAMOS FORZANDO EL ID DE ODOO
      await query(
        "INSERT INTO users_config (id, email, name, role_id, cids) VALUES (?, ?, ?, ?, ?)",
        [userId, cleanEmail, userName, roleId, safeCids],
      );
    }

    // 3. GESTIONAR TABLA sellers (VINCULACIÓN) — además de users_config,
    // el rol de vendedor lleva una fila propia en sellers (cuota, activo).
    if (roleId === 7) {
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
