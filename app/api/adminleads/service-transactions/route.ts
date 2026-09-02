import { query } from "@/lib/db";
import { jwtVerify } from "jose";
import { NextResponse } from "next/server";
import { jwtSecretBytes } from "@/lib/secretos";

export async function GET(request: Request) {
  try {
    const cookieHeader = request.headers.get("cookie");
    const token = cookieHeader
      ?.split(";")
      .find((c) => c.trim().startsWith("token="))
      ?.split("=")[1];
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const secret = jwtSecretBytes();
    await jwtVerify(token, secret);

    const { searchParams } = new URL(request.url);
    const serviceName = searchParams.get("service_name");
    const fechaInicio = searchParams.get("fecha_inicio");
    const fechaFin = searchParams.get("fecha_fin");

    let conditions: string[] = [];
    let params: any[] = [];

    if (serviceName) {
      conditions.push("service_name = ?");
      params.push(serviceName);
    }
    if (fechaInicio) {
      conditions.push("transaction_date >= ?");
      params.push(fechaInicio);
    }
    if (fechaFin) {
      conditions.push("transaction_date <= ?");
      params.push(fechaFin);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result: any = await query(
      `SELECT id, service_name, amount_usd, transaction_date, notes, created_at
       FROM service_transactions
       ${where}
       ORDER BY transaction_date DESC
       LIMIT 100`,
      params,
    );

    return NextResponse.json({ transactions: result.rows || [] });
  } catch (error: any) {
    console.error("Error en GET service-transactions:", error);
    return NextResponse.json(
      { error: error?.message || "Error interno" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const cookieHeader = request.headers.get("cookie");
    const token = cookieHeader
      ?.split(";")
      .find((c) => c.trim().startsWith("token="))
      ?.split("=")[1];
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const secret = jwtSecretBytes();
    await jwtVerify(token, secret);

    const body = await request.json();
    const { service_name, amount_usd, transaction_date, notes } = body;

    if (!service_name || amount_usd === undefined || !transaction_date) {
      return NextResponse.json(
        { error: "service_name, amount_usd y transaction_date son requeridos" },
        { status: 400 },
      );
    }

    const result: any = await query(
      `INSERT INTO service_transactions (service_name, amount_usd, transaction_date, notes)
       VALUES (?, ?, ?, ?)`,
      [service_name, parseFloat(amount_usd), transaction_date, notes || null],
    );

    return NextResponse.json({
      ok: true,
      id: result.rows?.insertId,
    });
  } catch (error: any) {
    console.error("Error en POST service-transactions:", error);
    return NextResponse.json(
      { error: error?.message || "Error interno" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const cookieHeader = request.headers.get("cookie");
    const token = cookieHeader
      ?.split(";")
      .find((c) => c.trim().startsWith("token="))
      ?.split("=")[1];
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const secret = jwtSecretBytes();
    await jwtVerify(token, secret);

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id es requerido" }, { status: 400 });
    }

    await query("DELETE FROM service_transactions WHERE id = ?", [parseInt(id)]);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Error en DELETE service-transactions:", error);
    return NextResponse.json(
      { error: error?.message || "Error interno" },
      { status: 500 },
    );
  }
}
