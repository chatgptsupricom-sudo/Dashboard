// app/api/superadmin/requests/route.ts
import { db } from "@/lib/db"; // Tu cliente de BD
import { NextResponse } from "next/server";

export async function POST(req: Request) {
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

export async function GET() {
  // El SuperAdmin consulta todas las solicitudes pendientes
  const requests = await db.activity_requests.findMany({
    where: { status: "pending" },
  });
  return NextResponse.json(requests);
}
