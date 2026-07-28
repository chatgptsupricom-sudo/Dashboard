// app/api/auth/verify/route.ts
import { verifyToken } from "@/lib/jwt";
import { NextRequest, NextResponse } from "next/server";

// export async function GET(request: NextRequest) {
//   const token = request.cookies.get("token")?.value;

//   console.log(
//     "[API Verify] Intentando verificar token:",
//     token ? "Presente" : "Ausente",
//   );

//   if (!token) {
//     return NextResponse.json({ message: "No token" }, { status: 401 });
//   }

//   try {
//     const payload = verifyToken(token);
//     if (!payload) {
//       console.log(
//         "[API Verify] ❌ Token detectado pero FALLÓ la verificación (JWT inválido)",
//       );
//       return NextResponse.json({ message: "Token inválido" }, { status: 401 });
//     }

//     console.log(
//       "[API Verify] 👤 Token verificado para el usuario:",
//       payload.email,
//     );
//     return NextResponse.json({ user: payload });
//   } catch (error) {
//     console.error("[API Verify] 🔥 Error crítico:", error);
//     return NextResponse.json({ message: "Error" }, { status: 401 });
//   }
// }
// app/api/auth/verify/route.ts
export async function GET(request: NextRequest) {
  const token = request.cookies.get("token")?.value;

  if (!token) {
    return NextResponse.json({ message: "No token" }, { status: 401 });
  }

  try {
    // CORRECCIÓN: Añade 'await' aquí
    const payload = await verifyToken(token);

    if (!payload) {
      return NextResponse.json({ message: "Token inválido" }, { status: 401 });
    }

    // Normalizar el payload para que tenga los mismos campos que el login response
    // El JWT guarda sub=MySQL_id, uid=Odoo_id — el auth store necesita .id y .uid
    const user = {
      id: Number((payload as any).sub || (payload as any).userId || 0),
      uid: (payload as any).uid ?? (payload as any).odooId ?? 0,
      email: payload.email,
      name: payload.name,
      role: payload.role,
      cids: payload.cids,
    };

    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json({ message: "Error" }, { status: 401 });
  }
}
