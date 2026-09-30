import { callOdooRPC } from "@/lib/odoo";
import { query } from "@/lib/db";
import { requireRoles } from "@/lib/auth/roles";
import { esCarteraVieja } from "@/lib/cxc/carteraVieja";
import { calcularSeriesCxC } from "@/lib/cxc/seriesSemanales";
import { NextRequest, NextResponse } from "next/server";

/**
 * Incobrables marcados a mano (tabla `cxc_incobrables`, sql/cxc_incobrables.sql).
 *
 *   GET                 → registro de marcas (vigentes y revertidas) con el saldo de hoy
 *   GET ?buscar=texto   → facturas abiertas que se pueden marcar (cliente o número)
 *   GET ?todos=1        → TODOS los incobrables de hoy (automáticos antes de 2025 +
 *                         marcados), con el mismo cálculo que la tarjeta del Dashboard
 *   POST {accion:"marcar", moveId, justificacion}
 *   POST {accion:"revertir", id, motivo}
 *
 * CxC y SuperAdmin pueden marcar y revertir, siempre con texto y quedando
 * registrado quién. Un usuario de CxC solo ve y toca su sede (cids del token,
 * no un parámetro); SuperAdmin elige sede o ve todas.
 */

const COMPANY_MAP: Record<string, number> = { valencia: 9, caracas: 10, panama: 7 };
const TODAS = [7, 9, 10];
const MIN_TEXTO = 10;
const MAX_TEXTO = 2000;

function sedesPermitidas(payload: any, empresa: string | null): number[] {
  const esSuperadmin = String(payload?.role || "").toLowerCase().trim() === "superadmin";
  if (esSuperadmin) return empresa && COMPANY_MAP[empresa] ? [COMPANY_MAP[empresa]] : TODAS;
  const propias = String(payload?.cids ?? "")
    .split(",")
    .map((c) => parseInt(c, 10))
    .filter((n) => TODAS.includes(n));
  return propias;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["cuentas por cobrar"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const companyIds = sedesPermitidas(auth.payload, searchParams.get("empresa")?.toLowerCase() || null);
    if (companyIds.length === 0) return NextResponse.json({ error: "Usuario sin sede asignada" }, { status: 403 });
    const buscar = (searchParams.get("buscar") || "").trim();

    // Sin la tabla (sql/cxc_incobrables.sql sin correr) la pantalla sigue
    // mostrando los incobrables automáticos; marcar sí va a fallar.
    let registro: any[] = [];
    try {
      const { rows } = await query(
        `SELECT * FROM cxc_incobrables WHERE company_id IN (${companyIds.map(() => "?").join(",")}) ORDER BY marcado_en DESC, id DESC`,
        companyIds,
      );
      registro = rows as any[];
    } catch (e: any) {
      console.error("cxc_incobrables no disponible:", e.message);
    }
    const vigentes = new Set(registro.filter((r) => Number(r.activo) === 1).map((r) => Number(r.move_id)));

    if (searchParams.get("todos")) {
      const hoy = new Date();
      hoy.setHours(23, 59, 59, 999);
      const inicio = new Date(hoy);
      inicio.setHours(0, 0, 0, 0);
      const { saldosEn } = await calcularSeriesCxC(companyIds, [{ inicio, fin: hoy }], hoy);
      const { viejas } = saldosEn(hoy);
      const ids = [...viejas.keys()];
      const moves: any[] = [];
      for (let i = 0; i < ids.length; i += 5000) {
        moves.push(...((await callOdooRPC<any[]>("account.move", "read", [ids.slice(i, i + 5000)], {
          fields: ["id", "name", "move_type", "partner_id", "company_id", "invoice_user_id", "invoice_date", "invoice_date_due"],
        })) || []));
      }
      const marca = new Map(registro.filter((r) => Number(r.activo) === 1).map((r) => [Number(r.move_id), r]));
      return NextResponse.json({
        success: true,
        data: {
          todos: moves
            .map((m) => {
              const r = marca.get(m.id);
              return {
                id: m.id,
                name: m.name,
                esNotaCredito: m.move_type === "out_refund",
                partnerName: m.partner_id?.[1] || "Sin cliente",
                companyId: m.company_id?.[0],
                vendedor: m.invoice_user_id?.[1] || "",
                invoiceDate: m.invoice_date || null,
                invoiceDateDue: m.invoice_date_due || null,
                saldo: r2(viejas.get(m.id) || 0),
                origen: r ? "marcada" : "automatica",
                justificacion: r?.justificacion || null,
                marcadoPor: r?.marcado_por || null,
                marcadoEn: r?.marcado_en || null,
              };
            })
            .sort((a, b) => b.saldo - a.saldo),
        },
      });
    }

    if (buscar) {
      if (buscar.length < 3) return NextResponse.json({ success: true, data: { facturas: [] } });
      const facturas = await callOdooRPC<any[]>(
        "account.move",
        "search_read",
        [[
          ["move_type", "=", "out_invoice"],
          ["state", "=", "posted"],
          ["company_id", "in", companyIds],
          ["amount_residual", ">", 0],
          ["partner_id.name", "not ilike", "supricom"],
          "|", ["name", "ilike", buscar], ["partner_id.name", "ilike", buscar],
        ]],
        {
          fields: ["id", "name", "partner_id", "company_id", "invoice_date", "invoice_date_due", "amount_total_signed", "amount_residual"],
          order: "invoice_date_due asc",
          limit: 100,
        },
      );
      return NextResponse.json({
        success: true,
        data: {
          facturas: (facturas || []).map((f) => ({
            id: f.id,
            name: f.name,
            partnerId: f.partner_id?.[0] ?? null,
            partnerName: f.partner_id?.[1] || "Sin cliente",
            companyId: f.company_id?.[0],
            companyName: f.company_id?.[1] || "",
            invoiceDate: f.invoice_date || null,
            invoiceDateDue: f.invoice_date_due || null,
            amountTotal: r2(Number(f.amount_total_signed) || 0),
            saldo: r2(Number(f.amount_residual) || 0),
            // Ya fuera de los KPIs: vencida antes de 2025 o marcada.
            estado: vigentes.has(f.id) ? "marcada" : esCarteraVieja(f.invoice_date_due) ? "automatica" : "disponible",
          })),
        },
      });
    }

    // Registro con el saldo actual de cada factura (si ya se cobró, se ve).
    const ids = [...new Set(registro.map((r) => Number(r.move_id)))];
    const saldoHoy = new Map<number, number>();
    if (ids.length) {
      const moves = await callOdooRPC<any[]>("account.move", "read", [ids], { fields: ["id", "amount_residual"] });
      for (const m of moves || []) saldoHoy.set(m.id, r2(Number(m.amount_residual) || 0));
    }
    return NextResponse.json({
      success: true,
      data: {
        registro: registro.map((r) => ({
          id: r.id,
          companyId: r.company_id,
          moveId: r.move_id,
          moveName: r.move_name,
          partnerName: r.partner_name,
          saldoAlMarcar: Number(r.saldo_al_marcar),
          saldoHoy: saldoHoy.get(Number(r.move_id)) ?? null,
          vencimiento: r.vencimiento,
          justificacion: r.justificacion,
          marcadoPor: r.marcado_por,
          marcadoEn: r.marcado_en,
          activo: Number(r.activo) === 1,
          revertidoPor: r.revertido_por,
          revertidoEn: r.revertido_en,
          motivoReversion: r.motivo_reversion,
        })),
      },
    });
  } catch (error: any) {
    console.error("Error CxC incobrables GET:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRoles(request, ["cuentas por cobrar"]);
  if (auth.error) return auth.error;

  try {
    const body = await request.json().catch(() => ({}));
    const quien = String(auth.payload?.name || auth.payload?.email || "Desconocido").slice(0, 200);
    const email = auth.payload?.email ? String(auth.payload.email).slice(0, 200) : null;
    const companyIds = sedesPermitidas(auth.payload, null);

    if (body.accion === "marcar") {
      const moveId = parseInt(String(body.moveId), 10);
      const justificacion = String(body.justificacion || "").trim();
      if (!Number.isFinite(moveId) || moveId <= 0) return NextResponse.json({ error: "Factura inválida" }, { status: 400 });
      if (justificacion.length < MIN_TEXTO || justificacion.length > MAX_TEXTO) {
        return NextResponse.json({ error: `La justificación debe tener entre ${MIN_TEXTO} y ${MAX_TEXTO} caracteres` }, { status: 400 });
      }

      // La factura se valida contra Odoo, no contra lo que mande el navegador.
      const [m] = (await callOdooRPC<any[]>("account.move", "read", [[moveId]], {
        fields: ["id", "name", "move_type", "state", "partner_id", "company_id", "invoice_date_due", "amount_residual"],
      })) || [];
      if (!m || m.move_type !== "out_invoice" || m.state !== "posted") {
        return NextResponse.json({ error: "No es una factura de cliente publicada" }, { status: 400 });
      }
      if (!companyIds.includes(m.company_id?.[0])) return NextResponse.json({ error: "Factura de otra sede" }, { status: 403 });
      if (!(Number(m.amount_residual) > 0)) return NextResponse.json({ error: "La factura no tiene saldo pendiente" }, { status: 400 });
      if (esCarteraVieja(m.invoice_date_due)) {
        return NextResponse.json({ error: "Vencida antes de 2025: ya es incobrable automáticamente" }, { status: 400 });
      }
      const { rows: ya } = await query("SELECT id FROM cxc_incobrables WHERE move_id = ? AND activo = 1 LIMIT 1", [moveId]);
      if ((ya as any[]).length) return NextResponse.json({ error: "La factura ya está marcada como incobrable" }, { status: 409 });

      await query(
        `INSERT INTO cxc_incobrables
           (company_id, move_id, move_name, partner_id, partner_name, saldo_al_marcar, vencimiento, justificacion, marcado_por, marcado_por_email)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [m.company_id[0], m.id, m.name || "", m.partner_id?.[0] ?? null, m.partner_id?.[1] ?? null,
          r2(Number(m.amount_residual)), m.invoice_date_due || null, justificacion, quien, email],
      );
      return NextResponse.json({ success: true });
    }

    if (body.accion === "revertir") {
      const id = parseInt(String(body.id), 10);
      const motivo = String(body.motivo || "").trim();
      if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: "Registro inválido" }, { status: 400 });
      if (motivo.length < MIN_TEXTO || motivo.length > MAX_TEXTO) {
        return NextResponse.json({ error: `El motivo debe tener entre ${MIN_TEXTO} y ${MAX_TEXTO} caracteres` }, { status: 400 });
      }
      const { rows } = await query("SELECT id, company_id, activo FROM cxc_incobrables WHERE id = ?", [id]);
      const fila = (rows as any[])[0];
      if (!fila) return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });
      if (!companyIds.includes(Number(fila.company_id))) return NextResponse.json({ error: "Registro de otra sede" }, { status: 403 });
      if (Number(fila.activo) !== 1) return NextResponse.json({ error: "Ya estaba revertida" }, { status: 409 });
      await query(
        "UPDATE cxc_incobrables SET activo = 0, revertido_por = ?, revertido_en = CURRENT_TIMESTAMP, motivo_reversion = ? WHERE id = ? AND activo = 1",
        [quien, motivo, id],
      );
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  } catch (error: any) {
    console.error("Error CxC incobrables POST:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
