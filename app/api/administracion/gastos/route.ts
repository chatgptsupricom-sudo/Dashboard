import { query } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { canViewAdministracion, getAdminUser } from "@/lib/administracion/auth";
import {
  fetchCuentasGasto,
  fetchGastoReal,
  mesAnterior,
  rangoDelMes,
} from "@/lib/administracion/gastos";
import { construirKpi, resumirCategoria } from "@/lib/administracion/kpis";
import {
  AlertaAdmin,
  severidadDesdeDesvio,
} from "@/lib/administracion/alertas";

const CATEGORIA = "Gastos y Presupuesto";
const PUNTOS_CATEGORIA = 15;

export async function GET(request: NextRequest) {
  try {
    const user = await getAdminUser(request);
    if (!canViewAdministracion(user)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const url = new URL(request.url);
    const now = new Date();
    const mes =
      url.searchParams.get("mes") ||
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const companyId = parseInt(url.searchParams.get("company_id") || "9", 10);

    const cuentas = await fetchCuentasGasto(companyId);
    const { desde, hasta } = rangoDelMes(mes);
    const { porCuenta: realMes, detalles } = await fetchGastoReal(
      companyId,
      desde,
      hasta,
      cuentas,
    );

    // Mes anterior (KPI 22) y los 3 meses previos (proxy de "extraordinario").
    const mesPrev = mesAnterior(mes, 1);
    const rangoPrev = rangoDelMes(mesPrev);
    const { porCuenta: realMesPrev } = await fetchGastoReal(
      companyId,
      rangoPrev.desde,
      rangoPrev.hasta,
      cuentas,
    );
    const inicio3m = rangoDelMes(mesAnterior(mes, 3)).desde;
    const { porCuenta: real3mPrevios } = await fetchGastoReal(
      companyId,
      inicio3m,
      rangoPrev.hasta,
      cuentas,
    );

    // Presupuesto cargado para el mes (tabla propia; Odoo no tiene presupuesto).
    let presupuestoPorCuenta: Record<string, number> = {};
    try {
      const rows = await query(
        "SELECT cuenta_codigo, monto FROM presupuesto_gastos WHERE company_id = ? AND mes = ?",
        [companyId, mes],
      );
      (rows.rows as any[]).forEach((r) => {
        const monto = Number(r.monto) || 0;
        if (monto > 0) presupuestoPorCuenta[r.cuenta_codigo] = monto;
      });
    } catch {
      presupuestoPorCuenta = {};
    }

    const totalReal =
      Math.round(
        Object.values(realMes).reduce((s, v) => s + v, 0) * 100,
      ) / 100;
    const totalPresupuesto =
      Math.round(
        Object.values(presupuestoPorCuenta).reduce((s, v) => s + v, 0) * 100,
      ) / 100;
    const totalRealPrev =
      Math.round(
        Object.values(realMesPrev).reduce((s, v) => s + v, 0) * 100,
      ) / 100;

    const hayPresupuesto = totalPresupuesto > 0;
    const hayGasto = totalReal > 0;

    // --- KPI 18: Ejecucion presupuestaria ---
    const ejecucion = hayPresupuesto
      ? Math.round((totalReal / totalPresupuesto) * 1000) / 10
      : null;

    // --- KPI 19: Desviacion de gastos (sobregiro; la subejecucion la cubre el 18) ---
    const desviacion = hayPresupuesto
      ? Math.round(
          ((totalReal - totalPresupuesto) / totalPresupuesto) * 1000,
        ) / 10
      : null;

    // --- KPI 20: Gastos sin presupuesto ---
    const gastoSinPresupuesto = Object.entries(realMes)
      .filter(([codigo]) => !presupuestoPorCuenta[codigo])
      .reduce((s, [, monto]) => s + monto, 0);
    const pctSinPresupuesto =
      hayGasto && hayPresupuesto
        ? Math.round((gastoSinPresupuesto / totalReal) * 1000) / 10
        : null;

    // --- KPI 21: Gastos extraordinarios ---
    // No existe una marca de "extraordinario" en el sistema. Se usa como proxy
    // el gasto en cuentas sin movimiento en los 3 meses previos (gasto no
    // recurrente). Administracion debe validar este criterio.
    const gastoExtraordinario = Object.entries(realMes)
      .filter(([codigo]) => !real3mPrevios[codigo])
      .reduce((s, [, monto]) => s + monto, 0);
    const pctExtraordinario = hayGasto
      ? Math.round((gastoExtraordinario / totalReal) * 1000) / 10
      : null;

    // --- KPI 22: Variacion mensual del gasto ---
    const variacionMensual =
      totalRealPrev > 0
        ? Math.round(((totalReal - totalRealPrev) / totalRealPrev) * 1000) / 10
        : null;

    const kpis = [
      construirKpi(
        {
          id: "ejecucion_presupuestaria",
          numero: 18,
          nombre: "Ejecución presupuestaria",
          formula: "Gasto real / presupuesto acumulado × 100",
          peso: 5,
          metaTexto: "95–100%",
          valor: ejecucion,
          unidad: "%",
          frecuencia: "Mensual",
          responsable: "Administración",
          fuente: "Presupuesto / ERP",
          detalle: hayPresupuesto
            ? `Real $${totalReal.toLocaleString("en-US")} sobre presupuesto $${totalPresupuesto.toLocaleString("en-US")}`
            : "Sin presupuesto cargado para este mes",
        },
        {
          modo: "band",
          verdeMin: 95,
          verdeMax: 100,
          amarilloMin: 0,
          amarilloMax: 105,
        },
      ),
      construirKpi(
        {
          id: "desviacion_gastos",
          numero: 19,
          nombre: "Desviación de gastos",
          formula: "(Real − presupuesto) / presupuesto × 100",
          peso: 4,
          metaTexto: "≤3%",
          valor: desviacion,
          unidad: "%",
          frecuencia: "Mensual",
          responsable: "Administración",
          fuente: "ERP / Presupuesto",
          detalle: hayPresupuesto
            ? `Diferencia de $${(totalReal - totalPresupuesto).toLocaleString("en-US")} contra lo presupuestado`
            : "Sin presupuesto cargado para este mes",
        },
        { modo: "lower_better", verde: 3, amarillo: 7 },
      ),
      construirKpi(
        {
          id: "gastos_sin_presupuesto",
          numero: 20,
          nombre: "Gastos sin presupuesto",
          formula: "Gastos no presupuestados / gasto total × 100",
          peso: 2,
          metaTexto: "≤2%",
          valor: pctSinPresupuesto,
          unidad: "%",
          frecuencia: "Mensual",
          responsable: "Administración",
          fuente: "ERP",
          detalle: hayPresupuesto
            ? `$${gastoSinPresupuesto.toLocaleString("en-US")} en cuentas sin presupuesto asignado`
            : "Sin presupuesto cargado para este mes",
        },
        { modo: "lower_better", verde: 2, amarillo: 5 },
      ),
      construirKpi(
        {
          id: "gastos_extraordinarios",
          numero: 21,
          nombre: "Gastos extraordinarios",
          formula: "Extraordinarios / gasto total × 100",
          peso: 2,
          metaTexto: "≤3%",
          valor: pctExtraordinario,
          unidad: "%",
          frecuencia: "Mensual",
          responsable: "Administración",
          fuente: "ERP",
          detalle:
            "Proxy: gasto en cuentas sin movimiento en los 3 meses previos (pendiente de validar criterio con Administración)",
        },
        { modo: "lower_better", verde: 3, amarillo: 6 },
      ),
      construirKpi(
        {
          id: "variacion_mensual_gasto",
          numero: 22,
          nombre: "Variación mensual del gasto",
          formula: "(Gasto mes − mes anterior) / mes anterior × 100",
          peso: 2,
          metaTexto: "Dentro de tendencia",
          valor: variacionMensual,
          unidad: "%",
          frecuencia: "Mensual",
          responsable: "Administración",
          fuente: "ERP",
          detalle:
            totalRealPrev > 0
              ? `Mes anterior (${mesPrev}): $${totalRealPrev.toLocaleString("en-US")}`
              : "Sin gasto registrado en el mes anterior",
        },
        { modo: "lower_better", verde: 0, amarillo: 5 },
      ),
    ];

    const resumen = resumirCategoria(CATEGORIA, kpis, PUNTOS_CATEGORIA);

    // --- Desglose para drill-down: grupo -> cuenta -> proveedor -> factura ---
    const cuentaMeta: Record<string, { nombre: string; grupo: string }> = {};
    cuentas.forEach((c) => {
      cuentaMeta[c.codigo] = { nombre: c.nombre, grupo: c.grupo };
    });
    const codigosTocados = new Set([
      ...Object.keys(realMes),
      ...Object.keys(presupuestoPorCuenta),
    ]);
    const desglose = Array.from(codigosTocados)
      .map((codigo) => {
        const real = realMes[codigo] || 0;
        const presupuesto = presupuestoPorCuenta[codigo] || 0;
        return {
          cuentaCodigo: codigo,
          cuentaNombre: cuentaMeta[codigo]?.nombre || codigo,
          grupo: cuentaMeta[codigo]?.grupo || "sin-grupo",
          real,
          presupuesto,
          variacionMonto: Math.round((real - presupuesto) * 100) / 100,
          variacionPct:
            presupuesto > 0
              ? Math.round(((real - presupuesto) / presupuesto) * 1000) / 10
              : null,
          proveedores: detalles
            .filter((d) => d.cuentaCodigo === codigo)
            .sort((a, b) => b.monto - a.monto)
            .slice(0, 50),
        };
      })
      .sort((a, b) => b.real - a.real);

    // --- Alertas para el Top 10 ---
    const alertas: AlertaAdmin[] = [];
    kpis.forEach((k) => {
      if (k.semaforo !== "rojo" && k.semaforo !== "amarillo") return;
      alertas.push({
        id: `gastos-${k.id}`,
        area: CATEGORIA,
        titulo: `${k.nombre}: ${k.valor}${k.unidad} (meta ${k.metaTexto})`,
        responsable: k.responsable,
        montoAfectado:
          k.id === "desviacion_gastos"
            ? Math.round((totalReal - totalPresupuesto) * 100) / 100
            : null,
        fechaDeteccion: new Date().toISOString().split("T")[0],
        accion: "Revisar ejecución del gasto contra presupuesto",
        fechaCompromiso: null,
        estatus: "abierta",
        severidad: severidadDesdeDesvio(k.semaforo, k.valor ?? 0),
        enlace: "/administracion/gastos",
      });
    });
    // Cuentas puntuales muy por encima de su presupuesto: son las accionables.
    desglose
      .filter((d) => d.presupuesto > 0 && (d.variacionPct ?? 0) > 10)
      .slice(0, 5)
      .forEach((d) => {
        alertas.push({
          id: `gastos-cuenta-${d.cuentaCodigo}`,
          area: CATEGORIA,
          titulo: `${d.cuentaNombre} ${d.variacionPct}% sobre presupuesto`,
          responsable: "Administración",
          montoAfectado: d.variacionMonto,
          fechaDeteccion: new Date().toISOString().split("T")[0],
          accion: `Revisar gasto de la cuenta ${d.cuentaCodigo}`,
          fechaCompromiso: null,
          estatus: "abierta",
          severidad: severidadDesdeDesvio("rojo", d.variacionPct ?? 0),
          enlace: "/administracion/gastos",
        });
      });

    return NextResponse.json({
      success: true,
      mes,
      companyId,
      resumen,
      kpis,
      totales: {
        real: totalReal,
        presupuesto: totalPresupuesto,
        realMesAnterior: totalRealPrev,
        sinPresupuesto: Math.round(gastoSinPresupuesto * 100) / 100,
        extraordinario: Math.round(gastoExtraordinario * 100) / 100,
      },
      hayPresupuesto,
      desglose,
      alertas,
    });
  } catch (error: any) {
    console.error("Error en API Gastos Administracion:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
