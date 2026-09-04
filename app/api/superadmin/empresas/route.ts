import { callOdooRPC } from "@/lib/odoo";
import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";

// Usado tambien por SpiffManager (gerente_venta y gerente_operaciones), no
// solo por superadmin — ver components/spiff/spiff-manager.tsx.
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, [
    "superadmin",
    "gerencia de ventas",
    "asistente de ventas",
    "gerente de operaciones",
  ]);
  if (auth.error) return auth.error;

  try {
    const companies = await callOdooRPC<any[]>(
      "res.company",
      "search_read",
      [[]],
      {
        fields: ["id", "name"],
      },
    );

    const formatted = companies.map((c) => ({
      cid: c.id.toString(),
      name: c.name,
    }));

    return NextResponse.json(formatted);
  } catch (error) {
    return NextResponse.json(
      { error: "Error al obtener empresas" },
      { status: 500 },
    );
  }
}
