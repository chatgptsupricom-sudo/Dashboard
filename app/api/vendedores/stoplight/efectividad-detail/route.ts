import { query } from "@/lib/db";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { obtenerCotizaciones } from "@/lib/stoplight/cotizaciones";
import { contarDiasUtiles } from "@/lib/feriados";
import { jwtSecretBytes } from "@/lib/secretos";

const JWT_SECRET = jwtSecretBytes();

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const uid = payload.uid as number;

    const url = new URL(request.url);
    const companyIdParam = url.searchParams.get("company_id");
    const mesParam = url.searchParams.get("mes");
    const companyId = companyIdParam ? parseInt(companyIdParam, 10) : (payload.cids as number);

    const now = new Date();
    const mes = mesParam || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const [anioStr, mesStr] = mes.split("-");
    const anio = parseInt(anioStr, 10);
    const mesNum = parseInt(mesStr, 10);

    const fechaInicio = `${anio}-${String(mesNum).padStart(2, "0")}-01`;
    const ultimoDia = new Date(anio, mesNum, 0).getDate();
    const fechaFin = `${anio}-${String(mesNum).padStart(2, "0")}-${ultimoDia}`;

    const semanas = (() => {
      const result: { inicio: Date; fin: Date; label: string }[] = [];
      let inicio = new Date(anio, mesNum - 1, 1);
      const ultimoDiaMes = new Date(anio, mesNum, 0);
      while (inicio <= ultimoDiaMes) {
        let fin = new Date(inicio);
        fin.setDate(fin.getDate() + 6);
        if (fin > ultimoDiaMes) fin = new Date(ultimoDiaMes);
        const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
        result.push({ inicio: new Date(inicio), fin: new Date(fin), label: `${inicio.toLocaleDateString("es-VE", opts)} - ${fin.toLocaleDateString("es-VE", opts)}` });
        inicio = new Date(fin);
        inicio.setDate(inicio.getDate() + 1);
      }
      return result;
    })();

    const sellerResult = await query(
      `SELECT s.id as seller_id, s.name FROM sellers s WHERE s.cids = ? AND s.user_id = ?`,
      [companyId, uid]
    );
    const sellers = sellerResult.rows as any[];
    if (sellers.length === 0) {
      return NextResponse.json({ success: true, data: { mes, metaEfectividad: 0, global: { emitidas: 0, confirmadas: 0, canceladas: 0, pendientes: 0, montoEmitido: 0, montoConfirmado: 0, efectividad: 0 }, sellers: [] } });
    }

    // Cotizaciones del vendedor: confirmadas ÷ emitidas (lib/stoplight/cotizaciones).
    // Mismo formato que /api/superadmin/stoplight/efectividad-detail.
    const cotizaciones = await obtenerCotizaciones(companyId, fechaInicio, fechaFin, [["user_id", "=", uid]]);

    type Acum = { emitidas: number; confirmadas: number; canceladas: number; pendientes: number; montoEmitido: number; montoConfirmado: number };
    const vacio = (): Acum => ({ emitidas: 0, confirmadas: 0, canceladas: 0, pendientes: 0, montoEmitido: 0, montoConfirmado: 0 });
    const sumar = (acc: Acum, estado: string, monto: number) => {
      acc.emitidas++;
      acc.montoEmitido += monto;
      if (estado === "confirmada") { acc.confirmadas++; acc.montoConfirmado += monto; }
      else if (estado === "cancelada") acc.canceladas++;
      else acc.pendientes++;
    };
    const total = vacio();
    const porSemana = semanas.map(vacio);
    for (const c of cotizaciones) {
      sumar(total, c.estado, c.monto);
      const i = semanas.findIndex((w) => c.fecha >= w.inicio && c.fecha <= w.fin);
      if (i !== -1) sumar(porSemana[i], c.estado, c.monto);
    }

    const metaResult = await query(
      "SELECT meta_mensual FROM kpi_targets WHERE kpi_key = ? AND company_id = ? AND mes = ?",
      ["efectividad_cierre", companyId, mes]
    );
    const metaEfectividad = Number((metaResult.rows as any[])[0]?.meta_mensual) || 0;

    const r2 = (n: number) => Math.round(n * 100) / 100;
    const tasa = (a: Acum) => (a.emitidas > 0 ? Math.round((a.confirmadas / a.emitidas) * 100) : null);
    const plano = (a: Acum) => ({ ...a, montoEmitido: r2(a.montoEmitido), montoConfirmado: r2(a.montoConfirmado) });
    const efectividad = tasa(total) ?? 0;

    return NextResponse.json({
      success: true,
      data: {
        mes,
        metaEfectividad,
        global: { ...plano(total), efectividad },
        sellers: [{
          nombre: sellers[0].name,
          ...plano(total),
          efectividad,
          semanas: porSemana.map((w, i) => ({
            numero: i + 1,
            label: semanas[i].label,
            ...plano(w),
            efectividad: semanas[i].inicio > now ? null : tasa(w),
          })),
        }],
      },
    });
  } catch (error: any) {
    console.error("Error en API efectividad-detail vendedor:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
