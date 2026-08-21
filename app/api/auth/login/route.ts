import { query } from "@/lib/db";
import { generateToken } from "@/lib/jwt";
import { authenticateWithOdoo, callOdooRPC } from "@/lib/odoo";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    // 1. Autenticación en Odoo
    const odooUid = await authenticateWithOdoo(email, password);
    if (!odooUid) {
      return NextResponse.json(
        { error: "Credenciales inválidas" },
        { status: 401 },
      );
    }

    // 2. Consulta a DB local
    const localUserData = await query(
      `SELECT uc.id, uc.email, uc.name, r.name as role_name, r.id as role_id, uc.cids
   FROM users_config uc
   JOIN roles r ON uc.role_id = r.id
   WHERE uc.email = ?`,
      [email],
    );

    if (localUserData.rows.length === 0) {
      return NextResponse.json(
        { error: "No tiene perfil configurado." },
        { status: 403 },
      );
    }

    const dbUser = localUserData.rows[0];

    let sellerActivo = 1;
    if (dbUser.role_name === "seller" || dbUser.role_name === "vendedor") {
      const sellerResult = await query(
        "SELECT activo FROM sellers WHERE user_id = ? LIMIT 1",
        [dbUser.id]
      );
      if (sellerResult.rows.length > 0) {
        sellerActivo = sellerResult.rows[0].activo ?? 1;
      }
    }

    // 3. Obtención del nombre (Prioridad: DB Local -> Odoo)
    let userName = dbUser.name;
    if (!userName) {
      const odooData = await callOdooRPC<any[]>(
        "res.users",
        "search_read",
        [[["id", "=", odooUid]]],
        {
          fields: ["name"],
          limit: 1,
        },
      );
      userName = odooData.length > 0 ? odooData[0].name : "Usuario";
    }

    // 4. Normalización
    const normalizedUser = {
      id: dbUser.id,
      email: dbUser.email,
      name: userName,
      role: dbUser.role_name,
      role_id: dbUser.role_id,
      odoo_uid: odooUid,
      cids: dbUser.cids,
      activo: sellerActivo,
    };

    // 5. Generación del token con el nombre
    const token = generateToken({
      sub: normalizedUser.id.toString(),
      uid: odooUid,
      email: normalizedUser.email,
      role: normalizedUser.role,
      role_id: normalizedUser.role_id,
      name: normalizedUser.name,
      cids: normalizedUser.cids,
    });

    // 6. Respuesta con cookie
    const response = NextResponse.json({ user: normalizedUser, token });

    response.cookies.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 días
    });

    return response;
  } catch (error: any) {
    console.error("Error en login:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}


