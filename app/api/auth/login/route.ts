import { query } from "@/lib/db";
import { generateToken } from "@/lib/jwt";
import { authenticateWithOdoo, callOdooRPC } from "@/lib/odoo";
import {
  aplicarLimites,
  consultarLimite,
  obtenerIp,
  registrarUso,
} from "@/lib/servicio-tecnico/limites";
import { NextResponse } from "next/server";

/**
 * Intentos FALLIDOS permitidos por IP. Solo se consumen cuando las
 * credenciales no sirven: quien entra bien no gasta cuota, así que a un
 * usuario legítimo esto no le existe.
 *
 * 10 por hora deja margen de sobra para equivocarse escribiendo la contraseña
 * y frena en seco el probar contraseñas a ciegas.
 *
 * Ojo con bajarlo: toda una oficina sale a internet por una sola IP.
 */
const FALLOS = { max: 10, ventanaSegundos: 3600 };

export async function POST(req: Request) {
  // Este endpoint autentica contra Odoo y está publicado en tres dominios,
  // uno de los cuales va a aparecer en supricom.com.ve. Sin límite, cualquiera
  // puede probar contraseñas contra las cuentas del equipo a la velocidad que
  // quiera, y cada intento además golpea el Odoo de producción.
  const rafaga = aplicarLimites(req, "login-intentos", [
    { max: 20, ventanaSegundos: 60 },
  ]);
  if (rafaga) return rafaga;

  const bloqueoFallos = consultarLimite(req, "login-fallos", FALLOS);
  if (bloqueoFallos) return bloqueoFallos;

  try {
    const { email, password } = await req.json();

    // 1. Autenticación en Odoo
    const odooUid = await authenticateWithOdoo(email, password);
    if (!odooUid) {
      // Solo los fallos consumen cuota.
      registrarUso(req, "login-fallos", FALLOS);
      console.warn(`[login] credenciales inválidas desde ${obtenerIp(req)}`);
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

    // 6. Respuesta con cookie — el token va SOLO en la cookie httpOnly, nunca
    // en el body: antes el cliente lo guardaba en localStorage (via el store
    // de Zustand), lo que dejaba cualquier XSS robar una sesion de 7 dias
    // pese al httpOnly de la cookie.
    const response = NextResponse.json({ user: normalizedUser });

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


