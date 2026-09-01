import { canViewRole } from "@/lib/actividades/rolesConfig";
import { requireRoles } from "@/lib/auth/roles";
import { UserRole } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db"; // Importación centralizada

// Este endpoint lo usan varias vistas de actividades (superadmin/gerente/
// estandar) para distintos roles — no hay un dueño unico, asi que el guard
// solo exige sesion valida y deja que canViewRole() filtre segun el rol real.
const TODOS_LOS_ROLES = Object.values(UserRole);

export async function GET(req: NextRequest) {
  const auth = await requireRoles(req, TODOS_LOS_ROLES);
  if (auth.error) return auth.error;

  // El rol del visor sale del JWT verificado, no del query string: con
  // ?role=superAdmin cualquiera con sesion (o antes, sin sesion) obtenia
  // canView "all" sin serlo de verdad.
  const viewerRole = String(auth.payload?.role || "");

  console.log("DEBUG API - Rol del visor:", viewerRole);

  const [users]: any = await db.execute(`
    SELECT u.id, u.name, r.name as role_name
    FROM users_config u
    LEFT JOIN roles r ON u.role_id = r.id
  `);

  console.log("DEBUG API - Usuarios totales en BD:", users.length);

  const allowedUsers = users.filter((u: any) => {
    const canView = canViewRole(viewerRole, u.role_name);
    if (!canView) {
      console.log(
        `DEBUG API - Usuario ${u.name} (rol: ${u.role_name}) bloqueado para visor ${viewerRole}`,
      );
    }
    return canView;
  });

  console.log("DEBUG API - Usuarios permitidos:", allowedUsers.length);

  return NextResponse.json(allowedUsers);
}
