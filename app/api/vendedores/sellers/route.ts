// app/api/sellers/route.ts
import { query } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/roles";
import { condSedeElegida, payloadLeads } from "@/lib/adminleads/sucursal";

export async function GET(request: NextRequest) {
  const auth = await requireSession(request);
  if (auth.error) return auth.error;
  auth.payload = payloadLeads(request, auth.payload);

  try {
    const userCids = auth.payload!.cids as number;

    const elegida = condSedeElegida(auth.payload, "cids");
    const sql = elegida
      ? `SELECT * FROM sellers WHERE ${elegida}`
      : userCids === 7
        ? "SELECT * FROM sellers WHERE cids = 7"
        : "SELECT * FROM sellers WHERE cids != 7";

    const result: any = await query(sql);
    return NextResponse.json(result.rows || []);
  } catch (error) {
    console.error("Error al obtener vendedores:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
