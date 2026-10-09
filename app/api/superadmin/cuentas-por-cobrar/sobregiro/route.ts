import { requireRoles } from "@/lib/auth/roles";
import { companyIdsEnAlcance } from "@/lib/cxc/alcance";
import { calcularSobregiro } from "@/lib/cxc/sobregiro";
import { NextRequest, NextResponse } from "next/server";

// Sobregiro (lib/cxc/sobregiro.ts): uso del límite de crédito de cada cliente,
// por sede, con los que se pasan del límite primero. Es una foto de hoy.

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["cuentas por cobrar", "gerente de operaciones"]);
  if (auth.error) return auth.error;

  try {
    const empresa = new URL(request.url).searchParams.get("empresa") || "";
    const companyIds = companyIdsEnAlcance(auth.payload, empresa);
    if (companyIds.length === 0) {
      return NextResponse.json({ error: "No tienes acceso a esa sede" }, { status: 403 });
    }

    const data = await calcularSobregiro(companyIds);
    return NextResponse.json({
      success: true,
      data: { ...data, filters: { empresa, companyIds }, updatedAt: new Date().toISOString() },
    });
  } catch (error: any) {
    console.error("Error CxC sobregiro:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
