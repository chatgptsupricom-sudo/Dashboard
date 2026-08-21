import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextResponse } from "next/server";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "GzC8WCMdNfmi9qX7Oj01U/FTwaOAOwMh5EYE8VukFM8=",
);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fechaInicio = searchParams.get("fechaInicio") || "";
    const fechaFin = searchParams.get("fechaFin") || "";

    const cookieHeader = request.headers.get("cookie");
    const token = cookieHeader
      ?.split("; ")
      .find((row) => row.startsWith("token="))
      ?.split("=")[1];

    if (!token) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const sellerId = payload.uid;

    if (!sellerId) {
      return NextResponse.json(
        { error: "Token inválido: falta UID" },
        { status: 401 },
      );
    }

    let partnerIds: number[] = [];

    if (fechaInicio || fechaFin) {
      const domainFacturas: any[] = [
        ["move_type", "=", "out_invoice"],
        ["state", "=", "posted"],
        ["invoice_user_id", "=", parseInt(sellerId as string)],
      ];
      if (fechaInicio) domainFacturas.push(["invoice_date", ">=", fechaInicio]);
      if (fechaFin) domainFacturas.push(["invoice_date", "<=", fechaFin]);

      const facturas = await callOdooRPC<any[]>(
        "account.move",
        "search_read",
        [domainFacturas],
        { fields: ["partner_id"] },
      );

      partnerIds = [...new Set(facturas.map((f) => f.partner_id?.[0]).filter(Boolean))];
    }

    const domain: any[] = [
      ["customer_rank", ">", 0],
      ["user_id", "=", parseInt(sellerId as string)],
    ];
    if (partnerIds.length > 0) {
      domain.push(["id", "in", partnerIds]);
    }

    const odooClientes = await callOdooRPC<any[]>(
      "res.partner",
      "search_read",
      [domain],
      {
        fields: [
          "id",
          "name",
          "email",
          "phone",
          "street",
          "vat",
          "user_id",
          "property_payment_term_id",
          "credit_limit",
          "credit",
        ],
      },
    );

    if (!odooClientes) {
      return NextResponse.json(
        { error: "No se pudo conectar con Odoo" },
        { status: 502 },
      );
    }

    const clientesFormateados = odooClientes.map((c) => {
      let paymentTermName = Array.isArray(c.property_payment_term_id)
        ? c.property_payment_term_id[1]
        : "Pago Inmediato";

      if (paymentTermName === "Immediate Payment") {
        paymentTermName = "Pago Inmediato";
      }

      return {
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        street: c.street,
        vat: c.vat,
        user_id: c.user_id,
        payment_terms: paymentTermName,
        credit_limit: c.credit_limit || 0,
        balance: c.credit || 0,
      };
    });

    return NextResponse.json(clientesFormateados);
  } catch (error: any) {
    console.error("Error en API de clientes:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
