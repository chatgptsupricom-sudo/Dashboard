import { canViewRole } from "@/lib/actividades/rolesConfig";
import { NextResponse } from "next/server";
import { db } from "@/lib/db"; // Importación centralizada


export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const viewerRole = searchParams.get("role") || "";

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
