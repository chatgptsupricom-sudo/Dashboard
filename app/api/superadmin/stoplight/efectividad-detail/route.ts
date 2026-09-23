import { query } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { fechaLocal } from "@/lib/stoplight/margen";
import { obtenerCotizaciones } from "@/lib/stoplight/cotizaciones";
import { contarDiasUtiles } from "@/lib/feriados";
import { accesoStoplight } from "@/lib/stoplight/acceso";

function normalize(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\./g, "")
    .toUpperCase()
    .trim()
    .replace(/\s+/g, " ");
}

export async function GET(request: NextRequest) {
  try {
    const acceso = await accesoStoplight(request);
    if (acceso.error) return acceso.error;
    const { companyId } = acceso;

    const url = new URL(request.url);
    const mesParam = url.searchParams.get("mes");
    const periodoParam = url.searchParams.get("periodo") || "mes"; // mes, trimestre, anio, todo

    const now = new Date();
    const mes = mesParam || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const [anioStr, mesStr] = mes.split("-");
    const anio = parseInt(anioStr, 10);
    const mesNum = parseInt(mesStr, 10);

    // Calculate date range based on period
    let fechaInicio: string;
    let fechaFin: string;
    let periodoLabel: string;

    if (periodoParam === "trimestre") {
      const trimestre = Math.ceil(mesNum / 3);
      const mesInicioTrimestre = (trimestre - 1) * 3 + 1;
      fechaInicio = `${anio}-${String(mesInicioTrimestre).padStart(2, "0")}-01`;
      const ultimoDiaTrimestre = new Date(anio, mesInicioTrimestre + 2, 0).getDate();
      fechaFin = `${anio}-${String(mesInicioTrimestre + 2).padStart(2, "0")}-${ultimoDiaTrimestre}`;
      periodoLabel = `Trimestre ${trimestre} ${anio}`;
    } else if (periodoParam === "anio") {
      fechaInicio = `${anio}-01-01`;
      fechaFin = `${anio}-12-31`;
      periodoLabel = `Año ${anio}`;
    } else if (periodoParam === "todo") {
      fechaInicio = "2000-01-01";
      fechaFin = "2099-12-31";
      periodoLabel = "Todo el tiempo";
    } else {
      // mes (default)
      fechaInicio = `${anio}-${String(mesNum).padStart(2, "0")}-01`;
      const ultimoDia = new Date(anio, mesNum, 0).getDate();
      fechaFin = `${anio}-${String(mesNum).padStart(2, "0")}-${ultimoDia}`;
      periodoLabel = `${new Date(anio, mesNum - 1, 1).toLocaleString("es-VE", { month: "long" })} ${anio}`;
    }

    // Calculate weeks based on period
    const semanas = (() => {
      const result: { inicio: Date; fin: Date; diasUtiles: number; label: string }[] = [];
      const fechaInicioDate = fechaLocal(fechaInicio);
      const fechaFinDate = fechaLocal(fechaFin);
      let inicio = new Date(fechaInicioDate);

      while (inicio <= fechaFinDate) {
        let fin = new Date(inicio);
        fin.setDate(fin.getDate() + 6);
        if (fin > fechaFinDate) fin = new Date(fechaFinDate);
        
        const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
        const label = `${inicio.toLocaleDateString("es-VE", opts)} - ${fin.toLocaleDateString("es-VE", opts)}`;
        
        result.push({
          inicio: new Date(inicio),
          fin: new Date(fin),
          diasUtiles: contarDiasUtiles(inicio, fin),
          label,
        });
        inicio = new Date(fin);
        inicio.setDate(inicio.getDate() + 1);
      }
      return result;
    })();

    // 1. Fetch sellers
    const cuotaResult = await query(
      `SELECT s.id as seller_id, s.name, s.user_id
       FROM sellers s
       WHERE s.cids = ?`,
      [companyId]
    );
    const sellers = cuotaResult.rows as any[];

    // 2. Cotizaciones emitidas en el período (lib/stoplight/cotizaciones):
    // efectividad = confirmadas ÷ emitidas.
    const cotizaciones = await obtenerCotizaciones(companyId, fechaInicio, fechaFin);

    // 3. Por vendedor (solo los de `sellers` de la sede) y por semana.
    type Acum = { emitidas: number; confirmadas: number; canceladas: number; pendientes: number; montoEmitido: number; montoConfirmado: number };
    const vacio = (): Acum => ({ emitidas: 0, confirmadas: 0, canceladas: 0, pendientes: 0, montoEmitido: 0, montoConfirmado: 0 });
    const sumar = (acc: Acum, estado: string, monto: number) => {
      acc.emitidas++;
      acc.montoEmitido += monto;
      if (estado === "confirmada") { acc.confirmadas++; acc.montoConfirmado += monto; }
      else if (estado === "cancelada") acc.canceladas++;
      else acc.pendientes++;
    };
    const normalizedSellerMap: Record<string, string> = {};
    const sellerDataMap: Record<string, { nombre: string; total: Acum; semanas: Acum[] }> = {};
    sellers.forEach((s: any) => {
      normalizedSellerMap[normalize(s.name)] = s.name;
      sellerDataMap[s.name] = { nombre: s.name, total: vacio(), semanas: semanas.map(vacio) };
    });

    for (const c of cotizaciones) {
      const matchedName = normalizedSellerMap[normalize(c.vendedor)];
      const sd = matchedName ? sellerDataMap[matchedName] : undefined;
      if (!sd) continue;
      sumar(sd.total, c.estado, c.monto);
      const i = semanas.findIndex((w) => c.fecha >= w.inicio && c.fecha <= w.fin);
      if (i !== -1) sumar(sd.semanas[i], c.estado, c.monto);
    }

    // 4. Meta
    const metaResult = await query(
      "SELECT meta_mensual FROM kpi_targets WHERE kpi_key = ? AND company_id = ? AND mes = ?",
      ["efectividad_cierre", companyId, mes]
    );
    const metaEfectividad = Number((metaResult.rows as any[])[0]?.meta_mensual) || 0;

    const r2 = (n: number) => Math.round(n * 100) / 100;
    const tasa = (a: Acum) => (a.emitidas > 0 ? Math.round((a.confirmadas / a.emitidas) * 100) : null);
    const plano = (a: Acum) => ({ ...a, montoEmitido: r2(a.montoEmitido), montoConfirmado: r2(a.montoConfirmado) });

    // 5. Respuesta
    const result = Object.values(sellerDataMap)
      .filter((sd) => sd.total.emitidas > 0)
      .map((sd) => ({
        nombre: sd.nombre,
        ...plano(sd.total),
        efectividad: tasa(sd.total) ?? 0,
        semanas: sd.semanas.map((w, i) => ({
          numero: i + 1,
          label: semanas[i].label,
          ...plano(w),
          efectividad: semanas[i].inicio > now ? null : tasa(w),
        })),
      }))
      .sort((a, b) => b.efectividad - a.efectividad || b.emitidas - a.emitidas);

    const global = result.reduce((acc, s) => {
      acc.emitidas += s.emitidas; acc.confirmadas += s.confirmadas; acc.canceladas += s.canceladas;
      acc.pendientes += s.pendientes; acc.montoEmitido += s.montoEmitido; acc.montoConfirmado += s.montoConfirmado;
      return acc;
    }, vacio());

    return NextResponse.json({
      success: true,
      data: {
        mes,
        periodo: periodoParam,
        periodoLabel,
        fechaInicio,
        fechaFin,
        metaEfectividad,
        global: { ...plano(global), efectividad: tasa(global) ?? 0 },
        sellers: result,
      },
    });
  } catch (error: any) {
    console.error("Error en API efectividad-detail:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
