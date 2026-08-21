import { callOdooRPC } from "@/lib/odoo";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get("uid");

    if (!uid) {
      return NextResponse.json({ error: "UID requerido" }, { status: 400 });
    }

    // Consultamos el modelo 'res.users' para obtener el nombre
    const users = await callOdooRPC<any[]>(
      "res.users",
      "search_read",
      [[["id", "=", parseInt(uid)]]], // Filtramos por el ID del usuario
      {
        fields: ["name", "display_name", "login"],
        limit: 1,
      },
    );

    if (users && users.length > 0) {
      // LOGUEA ESTO EN LA CONSOLA DE TU TERMINAL (donde corre Next.js)
      console.log("Datos brutos de Odoo:", users[0]);

      return NextResponse.json({
        // Prueba forzando el campo partner_id si existe
        name: users[0].name || users[0].display_name,
      });
    }

    return NextResponse.json(
      { error: "Usuario no encontrado" },
      { status: 404 },
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
