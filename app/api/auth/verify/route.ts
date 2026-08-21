// app/api/auth/verify/route.ts
import { query } from "@/lib/db";
import { verifyToken } from "@/lib/jwt";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("token")?.value;

  if (!token) {
    return NextResponse.json({ message: "No token" }, { status: 401 });
  }

  try {
    const payload = await verifyToken(token);

    if (!payload) {
      return NextResponse.json({ message: "Token inválido" }, { status: 401 });
    }

    const userId = Number((payload as any).sub || (payload as any).userId || 0);
    const userRole = (payload as any).role || "";

    let activo = 1;
    if (userRole === "seller" || userRole === "vendedor") {
      const sellerResult = await query(
        "SELECT activo FROM sellers WHERE user_id = ? LIMIT 1",
        [userId]
      );
      if (sellerResult.rows.length > 0) {
        activo = sellerResult.rows[0].activo ?? 1;
      }
    }

    const user = {
      id: userId,
      uid: (payload as any).uid ?? (payload as any).odooId ?? 0,
      email: payload.email,
      name: payload.name,
      role: payload.role,
      cids: payload.cids,
      activo,
    };

    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json({ message: "Error" }, { status: 401 });
  }
}
