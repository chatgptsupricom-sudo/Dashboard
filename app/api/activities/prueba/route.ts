import { ROLE_HIERARCHY } from "@/lib/actividades/rolesConfig";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/jwt";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  // 1. Extraer token de forma segura
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : null;

  // 2. Si no hay token, rechazamos antes de llamar a verifyToken
  if (!token || token === "undefined") {
    return NextResponse.json(
      { error: "No autorizado: Token faltante" },
      { status: 401 },
    );
  }

  // 3. Verificar el token
  const user = verifyToken(token);
  if (!user) {
    return NextResponse.json(
      { error: "No autorizado: Token inválido" },
      { status: 401 },
    );
  }

  // 4. Lógica de filtrado
  const roleConfig = ROLE_HIERARCHY[user.role];
  if (!roleConfig) {
    return NextResponse.json({ error: "Rol no definido" }, { status: 403 });
  }

  const isSuperAdminOrAudit = roleConfig.canView === "all";

  const whereClause: any = {
    AND: [
      !isSuperAdminOrAudit ? { cid: user.cid } : {},
      !isSuperAdminOrAudit
        ? { userRole: { in: roleConfig.canView as string[] } }
        : {},
    ],
  };

  const activities = await db.activity.findMany({ where: whereClause });
  return NextResponse.json(activities);
}
