// app/api/sellers/route.ts
import { query } from "@/lib/db";
import { jwtVerify } from "jose";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const cookieHeader = request.headers.get("cookie");
    const token = cookieHeader?.split(";").find((c) => c.trim().startsWith("token="))?.split("=")[1];
    if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    const userCids = payload.cids as number;

    const sql =
      userCids === 7
        ? "SELECT * FROM sellers WHERE cids = 7"
        : "SELECT * FROM sellers WHERE cids != 7";

    const result: any = await query(sql);
    return NextResponse.json(result.rows || []);
  } catch (error) {
    console.error("Error al obtener vendedores:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
