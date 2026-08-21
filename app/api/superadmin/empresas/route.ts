import { callOdooRPC } from "@/lib/odoo";
import { NextResponse } from "next/server";

export async function GET() {
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
