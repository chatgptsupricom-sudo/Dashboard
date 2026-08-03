import { query } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "GzC8WCMdNfmi9qX7Oj01U/FTwaOAOwMh5EYE8VukFM8=",
);

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userRole = ((payload.role as string) || "").toLowerCase().trim();

    if (userRole !== "compras" && userRole !== "superadmin") {
      return NextResponse.json(
        { error: "Permisos insuficientes" },
        { status: 403 },
      );
    }

    const productDomain = [
      ["active", "=", true],
      ["type", "=", "product"],
    ];
    const productFields = ["default_code"];

    const productsData = await callOdooRPC<any[]>(
      "product.product",
      "search_read",
      [productDomain],
      {
        fields: productFields,
      },
    );

    if (!productsData) {
      return NextResponse.json(
        { error: "Error obteniendo SKUs de Odoo" },
        { status: 500 },
      );
    }

    // Leemos moqs y costo
    const moqsDb = await query("SELECT sku, cantidad, costo FROM moqs");
    const moqMap = new Map(moqsDb.rows.map((row: any) => [row.sku, row]));

    const templateData = productsData
      .filter(
        (p) =>
          p.default_code &&
          typeof p.default_code === "string" &&
          p.default_code.trim() !== "",
      )
      .map((p) => {
        const sku = p.default_code.trim();
        const registro = moqMap.get(sku);

        return {
          sku: sku,
          cantidad: registro?.cantidad ?? "",
          costo: registro?.costo ?? "",
        };
      });

    return NextResponse.json(
      { success: true, data: templateData },
      { status: 200 },
    );
  } catch (error: any) {
    console.error("Error generando plantilla:", error.message);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}
