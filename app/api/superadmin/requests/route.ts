// app/api/superadmin/requests/route.ts
import { db } from "@/lib/db"; // Tu cliente de BD
import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";

// OJO: `db` aqui es el pool mysql2 de lib/db.ts, no un cliente Prisma —
// `db.activity_requests.create/findMany` no existen sobre ese pool y esto
// lanza en cualquier llamada real. Sin caller de POST encontrado en el
// frontend; GET lo usa RequestNotifications.tsx. Se deja el guard puesto
// (issue de acceso) pero el bug de fondo queda fuera de este cambio.
export async function POST(req: NextRequest) {
  const auth = await requireRoles(req, ["superadmin"]);
  if (auth.error) return auth.error;

  const body = await req.json();
  // 1. Guardar solicitud en BD
  const newRequest = await db.activity_requests.create({
    data: {
      title: body.title,
      message: body.message,
      from_role: body.fromRole,
      to_role: "superAdmin",
      status: "pending",
    },
  });

  return NextResponse.json(newRequest);
}

export async function GET(req: NextRequest) {
  const auth = await requireRoles(req, ["superadmin"]);
  if (auth.error) return auth.error;

  // El SuperAdmin consulta todas las solicitudes pendientes
  const requests = await db.activity_requests.findMany({
    where: { status: "pending" },
  });
  return NextResponse.json(requests);
}
