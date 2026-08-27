import { NextResponse } from "next/server";
import { odooApiKey } from "@/lib/env";

export const runtime = "nodejs";

const ODOO_URL = (
  process.env.NEXT_PUBLIC_ODOO_URL || "https://supricom2.odoo.com"
).replace(/\/$/, "");
const ODOO_DB = process.env.ODOO_DB || "";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const id = parseInt(params.id);
    if (!id) return new NextResponse(null, { status: 400 });

    // Read image_128 via RPC
    const payload = {
      jsonrpc: "2.0",
      method: "call",
      params: {
        service: "object",
        method: "execute_kw",
        args: [
          ODOO_DB,
          388,
          odooApiKey(),
          "product.product",
          "read",
          [[id]],
          { fields: ["image_128"] },
        ],
      },
      id: Date.now(),
    };

    const res = await fetch(`${ODOO_URL}/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    const b64 = data?.result?.[0]?.image_128;
    if (!b64) return new NextResponse(null, { status: 404 });

    const imgBuffer = Buffer.from(b64, "base64");
    return new NextResponse(imgBuffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400", // cache 24h
      },
    });
  } catch {
    return new NextResponse(null, { status: 500 });
  }
}
