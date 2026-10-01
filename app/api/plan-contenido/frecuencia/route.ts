// ============================================================
// API — Frecuencia CPM: servir HTML + guardar/cargar plan
// GET  /api/plan-contenido/frecuencia?year=2026&month=10
// POST /api/plan-contenido/frecuencia
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { query } from "@/lib/db";
import { readFile } from "fs/promises";
import { join } from "path";

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["marketing", "superadmin"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get("year") || "0");
    const month = parseInt(searchParams.get("month") || "0");

    // If no year/month, serve the HTML file
    if (!year || !month) {
      const htmlPath = join(process.cwd(), "public", "frecuencia-cpm.html");
      const html = await readFile(htmlPath, "utf-8");
      return new NextResponse(html, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Otherwise, load the plan from DB
    const plans = await query(
      "SELECT * FROM cpm_plans WHERE year = ? AND month = ? ORDER BY updated_at DESC LIMIT 1",
      [year, month],
    );

    if (plans.length === 0) {
      return NextResponse.json({ plan: null });
    }

    const plan = plans[0];
    const cpms = await query(
      "SELECT * FROM plan_cpms WHERE plan_id = ? ORDER BY sort_order",
      [plan.id],
    );

    for (const cpm of cpms) {
      cpm.products = await query(
        "SELECT * FROM plan_cpm_products WHERE cpm_id = ? AND included = 1",
        [cpm.id],
      );
    }

    const savedContent = await query(
      "SELECT * FROM plan_saved_content WHERE plan_id = ? ORDER BY publish_date",
      [plan.id],
    );

    const calendar = await query(
      "SELECT * FROM plan_calendar WHERE plan_id = ? ORDER BY date_key, piece_number",
      [plan.id],
    );

    return NextResponse.json({
      plan: { ...plan, cpms, savedContent, calendar },
    });
  } catch (error) {
    console.error("[plan-contenido/frecuencia GET]", error);
    return NextResponse.json(
      { error: "Error al cargar plan" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRoles(request, ["marketing", "superadmin"]);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const { year, month, cpms, savedContent, calendar } = body;

    if (!year || !month) {
      return NextResponse.json(
        { error: "Year y month son requeridos" },
        { status: 400 },
      );
    }

    // Check existing plan
    const existing = await query(
      "SELECT id FROM cpm_plans WHERE year = ? AND month = ?",
      [year, month],
    );

    let planId: number;
    if (existing.length > 0) {
      planId = existing[0].id;
      await query("UPDATE cpm_plans SET updated_at = NOW() WHERE id = ?", [planId]);
      // Clean old data
      await query("DELETE FROM plan_calendar WHERE plan_id = ?", [planId]);
      await query("DELETE FROM plan_saved_content WHERE plan_id = ?", [planId]);
      await query(
        "DELETE FROM plan_cpm_products WHERE cpm_id IN (SELECT id FROM plan_cpms WHERE plan_id = ?)",
        [planId],
      );
      await query("DELETE FROM plan_cpms WHERE plan_id = ?", [planId]);
    } else {
      const result = await query(
        "INSERT INTO cpm_plans (year, month, status) VALUES (?, ?, 'borrador')",
        [year, month],
      );
      planId = result.insertId;
    }

    // Insert CPMS
    if (cpms) {
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
    console.error("[plan-contenido/frecuencia POST]", error);
    return NextResponse.json(
      { error: "Error al guardar plan" },
      { status: 500 },
    );
  }
}
