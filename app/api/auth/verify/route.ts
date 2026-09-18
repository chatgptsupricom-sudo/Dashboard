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

    // `activo` es un dato accesorio: solo sirve para ocultarle un par de
    // secciones a un vendedor pausado. El token ya quedó verificado arriba,
    // así que si la MySQL no responde la sesión sigue siendo válida y se
    // asume activo. Antes esta consulta estaba dentro del try general y
    // cualquier fallo suyo salía por el catch como 401: la sesión se caía
    // por un problema de base de datos, y solo le pasaba a los vendedores,
    // que son los únicos que entran en esta rama. El cliente, al recibir el
    // 401, se queda sin `user` y la pantalla nunca termina de cargar.
    let activo = 1;
    if (userRole === "seller" || userRole === "vendedor") {
      try {
        const sellerResult = await query(
          "SELECT activo FROM sellers WHERE user_id = ? LIMIT 1",
          [userId]
        );
        if (sellerResult.rows.length > 0) {
          activo = sellerResult.rows[0].activo ?? 1;
        }
      } catch (error) {
        console.error(
          `[verify] no se pudo leer sellers.activo para user_id=${userId}:`,
          error,
        );
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
