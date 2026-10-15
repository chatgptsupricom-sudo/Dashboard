import { callOdooRPC } from "@/lib/odoo";
import { ROLES_ADMINISTRACION, SEDES_VALIDAS, esRolAdministracion, limitarSedesPorRol, respuestaSedeNoPermitida } from "@/lib/auth/sedeRol";
import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";

async function fetchPaginated(model: string, domain: any[], fields: string[]): Promise<any[]> {
  let result: any[] = [];
  let offset = 0;
  while (true) {
    const page = await callOdooRPC<any[]>(
      model, "search_read", [domain],
      { fields, order: "id asc", limit: 5000, offset },
    );
    if (!page || page.length === 0) break;
    result = result.concat(page);
    if (page.length < 5000) break;
    offset += 5000;
  }
  return result;
}

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, [...ROLES_ADMINISTRACION, "cuentas por cobrar", "gerente de operaciones"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    // Administracion solo lee la sede de su `cids` ("all" incluido).
    const pedido = searchParams.get("companyId");
    const sedeAdmin = esRolAdministracion(auth.payload?.role)
      ? limitarSedesPorRol(auth.payload, pedido && pedido !== "all" ? [parseInt(pedido, 10)] : SEDES_VALIDAS)
      : null;
    if (sedeAdmin && sedeAdmin.length === 0) return respuestaSedeNoPermitida();
    const companyId = sedeAdmin ? String(sedeAdmin[0]) : pedido;

    let partnerIds: number[] | null = null;

    if (companyId && companyId !== "all") {
      const cid = parseInt(companyId, 10);
      const invoices = await callOdooRPC<any[]>(
        "account.move",
        "search_read",
        [[["move_type", "in", ["out_invoice", "out_refund"]], ["state", "=", "posted"], ["company_id", "=", cid]]],
        { fields: ["partner_id"], limit: 0 },
      );
      if (invoices && invoices.length > 0) {
        partnerIds = [...new Set(invoices.map((inv) => inv.partner_id?.[0]).filter(Boolean))];
      } else {
        return NextResponse.json({ success: true, data: [] });
      }
    }

    const domain: any[] = [["parent_id", "=", false]];
    if (partnerIds) {
      domain.push(["id", "in", partnerIds]);
    }

    const partners = await fetchPaginated(
      "res.partner",
      domain,
      ["id", "name", "vat"],
    );

    return NextResponse.json({
      success: true,
      data: partners.map((p) => ({
        id: p.id,
        name: p.name || "",
        vat: p.vat || "",
      })),
    });
  } catch (error) {
    console.error("Error fetching partners:", error);
    return NextResponse.json({ success: false, error: "Error fetching partners" }, { status: 500 });
  }
}
