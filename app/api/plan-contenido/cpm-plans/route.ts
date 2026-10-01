// ============================================================
// API — CRUD de Planes de Contenido CPM
// GET  /api/plan-contenido/cpm-plans?year=2026&month=10
// POST /api/plan-contenido/cpm-plans
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { query } from "@/lib/db";
import type { CPMPlan, CreatePlanRequest } from "@/lib/plan-contenido/types";

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["marketing", "superadmin"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get("year") || "0");
    const month = parseInt(searchParams.get("month") || "0");

    let sql = "SELECT * FROM cpm_plans";
    const params: any[] = [];

    if (year > 0 && month > 0) {
      sql += " WHERE year = ? AND month = ?";
      params.push(year, month);
    }

    sql += " ORDER BY year DESC, month DESC LIMIT 50";

    const rows = await query(sql, params);

    // For each plan, load CPMS
    const plans = await Promise.all(
      rows.map(async (plan: any) => {
        const cpms = await query(
          "SELECT * FROM plan_cpms WHERE plan_id = ? ORDER BY sort_order",
          [plan.id],
        );
        return { ...plan, cpms };
      }),
    );

    return NextResponse.json({ plans });
  } catch (error) {
    console.error("[plan-contenido/cpm-plans GET]", error);
    return NextResponse.json(
      { error: "Error al cargar planes" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRoles(request, ["marketing", "superadmin"]);
  if (auth.error) return auth.error;

  try {
    const body: CreatePlanRequest = await request.json();
    const { year, month, cpms, savedContent, calendar } = body;

    if (!year || !month) {
      return NextResponse.json(
        { error: "Year y month son requeridos" },
        { status: 400 },
      );
    }

    if (!cpms || cpms.length === 0) {
      return NextResponse.json(
        { error: "Debe haber al menos un CPM" },
        { status: 400 },
      );
    }

    // Check if plan already exists for this user
    const userId = auth.payload?.userId;
    const existing = await query(
      "SELECT id FROM cpm_plans WHERE year = ? AND month = ? AND created_by = ?",
      [year, month, userId],
    );

    let planId: number;

    if (existing.length > 0) {
      // Update existing plan
      planId = existing[0].id;
      await query("UPDATE cpm_plans SET updated_at = NOW() WHERE id = ?", [planId]);
      // Delete existing CPMS and products
      await query("DELETE FROM plan_cpm_products WHERE cpm_id IN (SELECT id FROM plan_cpms WHERE plan_id = ?)", [planId]);
      await query("DELETE FROM plan_cpms WHERE plan_id = ?", [planId]);
      await query("DELETE FROM plan_saved_content WHERE plan_id = ?", [planId]);
      await query("DELETE FROM plan_calendar WHERE plan_id = ?", [planId]);
    } else {
      // Create new plan
      const result = await query(
        "INSERT INTO cpm_plans (year, month, created_by) VALUES (?, ?, ?)",
        [year, month, userId],
      );
      planId = result.insertId;
    }

    // Insert CPMS
    for (let i = 0; i < cpms.length; i++) {
      const cpm = cpms[i];
      const cpmResult = await query(
        "INSERT INTO plan_cpms (plan_id, name, type, stock_total, supri_count, persona_count, carrusel_count, post_count, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          planId,
          cpm.name,
          cpm.type,
          cpm.stockTotal || 0,
          cpm.supriCount || 0,
          cpm.personaCount || 0,
          cpm.carruselCount || 0,
          cpm.postCount || 0,
          i,
        ],
      );
      const cpmId = cpmResult.insertId;

      // Insert products
      if (cpm.products) {
        for (const prod of cpm.products) {
          await query(
            "INSERT INTO plan_cpm_products (cpm_id, odoo_product_id, sku, product_name, brand, stock, price, included) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
              cpmId,
              prod.odooProductId || null,
              prod.sku,
              prod.productName,
              prod.brand,
              prod.stock,
              prod.price,
              prod.included ? 1 : 0,
            ],
          );
        }
      }
    }

    // Insert saved content
    if (savedContent) {
      for (const sc of savedContent) {
        await query(
          "INSERT INTO plan_saved_content (plan_id, name, format, publish_date, justification) VALUES (?, ?, ?, ?, ?)",
          [planId, sc.name, sc.format, sc.publishDate, sc.justification],
        );
      }
    }

    // Insert calendar
    if (calendar) {
      for (const cal of calendar) {
        await query(
          "INSERT INTO plan_calendar (plan_id, piece_number, date_key, cpm_name, format, topic, is_saved) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [
            planId,
            cal.pieceNumber,
            cal.dateKey,
            cal.cpmName,
            cal.format,
            cal.topic,
            cal.isSaved ? 1 : 0,
          ],
        );
      }
    }

    return NextResponse.json({ success: true, planId });
  } catch (error) {
    console.error("[plan-contenido/cpm-plans POST]", error);
    return NextResponse.json(
      { error: "Error al guardar el plan" },
      { status: 500 },
    );
  }
}
