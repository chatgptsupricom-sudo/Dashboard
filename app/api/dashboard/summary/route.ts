import { getOdooUsers } from "@/lib/odoo";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const users = await getOdooUsers();

    if (!users || users.length === 0) {
      return NextResponse.json(
        {
          status: "error",
          message:
            "No se devolvieron datos. Revisa la terminal de VS Code para ver el error de Odoo.",
          config_check: {
            db: process.env.ODOO_DB ? "Configurada" : "Faltante",
            url: process.env.NEXT_PUBLIC_ODOO_URL ? "Configurada" : "Faltante",
          },
        },
        { status: 404 },
      );
    }

    return NextResponse.json(users);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
