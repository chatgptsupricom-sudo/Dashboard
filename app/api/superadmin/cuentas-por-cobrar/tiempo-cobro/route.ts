import { requireRoles } from "@/lib/auth/roles";
import { empresaForzadaPorRol, respuestaSedeNoPermitida, ROLES_ADMINISTRACION } from "@/lib/auth/sedeRol";
import { calcularTiempoCobro, explicarAusencia } from "@/lib/cxc/tiempoCobro";
import { NextRequest, NextResponse } from "next/server";

// Tiempo de cobro (lib/cxc/tiempoCobro.ts): días desde la emisión hasta el
// pago completo de las facturas a crédito que se terminaron de pagar en el
// período.

const COMPANY_MAP: Record<string, number> = { valencia: 9, caracas: 10, panama: 7 };

const fechaLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, [...ROLES_ADMINISTRACION, "cuentas por cobrar", "gerente de operaciones"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const empresaPedida = searchParams.get("empresa")?.toLowerCase() || "";
    // Administracion solo lee la sede de su `cids` (lib/auth/sedeRol.ts).
    const empresaForzada = empresaForzadaPorRol(auth.payload, empresaPedida);
    if (empresaForzada === null) return respuestaSedeNoPermitida();
    const empresa = empresaForzada ?? empresaPedida;
    const userCidsParam = searchParams.get("userCids");
    const companyIds = empresa && COMPANY_MAP[empresa]
      ? [COMPANY_MAP[empresa]]
      : userCidsParam ? [parseInt(userCidsParam, 10)] : [7, 9, 10];

    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    let desde: string, hasta: string;
    if (startDate && endDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) && /^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      desde = startDate;
      hasta = endDate;
    } else {
      const now = new Date();
      const year = parseInt(searchParams.get("year") || "", 10) || now.getFullYear();
      const month = (parseInt(searchParams.get("month") || "", 10) || now.getMonth() + 1) - 1;
      desde = fechaLocal(new Date(year, month, 1));
      hasta = fechaLocal(new Date(year, month + 1, 0));
    }

    // ?explicar=<texto>: por qué un cliente buscado no sale en el período.
    const explicar = searchParams.get("explicar")?.trim() || "";
    if (explicar) {
      if (explicar.length < 3 || explicar.length > 80) return NextResponse.json({ error: "Escribe entre 3 y 80 letras." }, { status: 400 });
      return NextResponse.json({ success: true, data: { ausencias: await explicarAusencia(companyIds, desde, hasta, explicar) } });
    }

    const data = await calcularTiempoCobro(companyIds, desde, hasta);
    return NextResponse.json({
      success: true,
      data: { ...data, filters: { empresa, companyIds, desde, hasta }, updatedAt: new Date().toISOString() },
    });
  } catch (error: any) {
    console.error("Error CxC tiempo-cobro:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
