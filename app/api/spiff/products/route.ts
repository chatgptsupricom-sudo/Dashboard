import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextResponse } from "next/server";
import { jwtSecretBytes } from "@/lib/env";


export async function GET(request: Request) {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .find((c) => c.trim().startsWith("token="))
    ?.split("=")[1];
  if (!token)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const { payload } = await jwtVerify(token, jwtSecretBytes(), {
      algorithms: ["HS256"],
    });
    const uid = parseInt(payload.uid as string);
    const userCids = Number(payload.cids);
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("q") || "";
    const brand = searchParams.get("brand") || "";

    console.log("[products] uid:", uid, "userCids:", userCids, "brand:", brand, "search:", search);

    const domain: any[] = [["sale_ok", "=", true]];
    if (brand) domain.push(["x_studio_marca", "=", brand]);
    if (search) domain.push(["name", "ilike", search]);

    const products = await callOdooRPC<any[]>(
      "product.product",
      "search_read",
      [domain],
      {
        fields: ["id", "name", "x_studio_marca"],
        limit: 200,
      },
    );

    console.log("[products] products count:", products?.length ?? "null");

    if (!products) {
      console.error("[products] RPC returned null");
      return NextResponse.json([]);
    }

    const result = products.map((p: any) => {
      const m = p.x_studio_marca;
      return {
        id: p.id,
        name: p.name,
        marca: Array.isArray(m) ? m[1] : m || "Sin marca",
      };
    });

    console.log("[products] found:", result.length);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("GET /api/spiff/products error:", error.message, error.stack);
    return NextResponse.json([]);
  }
}
