import { getSuppliers } from "@/lib/compras/proveedores";
import { MAIN_WAREHOUSE_BY_COMPANY } from "@/lib/compras/constants";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { jwtSecretBytes } from "@/lib/secretos";

const JWT_SECRET = jwtSecretBytes();

// GET /api/compras/ordenes/proveedores?sede=9
// Lista de proveedores para el select del formulario de orden (issue #152 +
// #153). Sin `sede`, trae los de todas las companias.
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userRole = ((payload.role as string) || "").toLowerCase().trim();
    if (userRole !== "compras" && userRole !== "superadmin") {
      return NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const sedeParam = searchParams.get("sede");
    const sedeId = sedeParam ? parseInt(sedeParam, 10) : null;
    const companies = sedeId
      ? [sedeId]
      : Object.keys(MAIN_WAREHOUSE_BY_COMPANY).map(Number);

    const suppliers = await getSuppliers(companies);
    return NextResponse.json({ success: true, data: suppliers });
  } catch (error: any) {
    console.error("Error listando proveedores:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
