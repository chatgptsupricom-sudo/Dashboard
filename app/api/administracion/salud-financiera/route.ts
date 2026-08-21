import { NextRequest, NextResponse } from "next/server";
import { callOdooRPC } from "@/lib/odoo";
import { canViewAdministracion, getAdminUser } from "@/lib/administracion/auth";
import { cargarMetas } from "@/lib/administracion/metas";
import {
  fetchCxC,
  fetchCxP,
  fetchTesoreria,
} from "@/lib/administracion/saludFinanciera";
import {
  KpiAdmin,
  construirKpi,
  resumirCategoria,
} from "@/lib/administracion/kpis";
import {
  AlertaAdmin,
  construirTopAlertas,
  severidadDesdeDesvio,
} from "@/lib/administracion/alertas";

const COMPANY_MAP: Record<string, number> = {
  valencia: 9,
  caracas: 10,
  panama: 7,
};

const SIN_DATOS = {
  promesas_pago:
    "No existe registro de promesas de pago en el sistema; requiere capturarlas.",
  clientes_excedidos:
    "Requiere límites de crédito por cliente, que no están configurados en Odoo.",
  exactitud_proyeccion:
    "Requiere guardar las proyecciones de caja para compararlas contra lo real.",
  facturas_pendientes:
    "Requiere definir el plazo interno de procesamiento y registrar la fecha de recepción.",
  descuentos_aprovechados:
    "Requiere registrar los descuentos por pronto pago disponibles por proveedor.",
};

function fmtFecha(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAdminUser(request);
    if (!canViewAdministracion(user)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const empresa = (searchParams.get("empresa") || "").toLowerCase();
    const companyIds =
      empresa && COMPANY_MAP[empresa] ? [COMPANY_MAP[empresa]] : [9, 10, 7];
    const metas = await cargarMetas(companyIds[0]);

    const hoyDate = new Date();
    const hoy = fmtFecha(hoyDate);
    const mes =
      searchParams.get("mes") ||
      `${hoyDate.getFullYear()}-${String(hoyDate.getMonth() + 1).padStart(2, "0")}`;
    const [anio, mesNum] = mes.split("-").map(Number);
    const desde = `${anio}-${String(mesNum).padStart(2, "0")}-01`;
    const hasta = fmtFecha(new Date(anio, mesNum, 0));
    const hasta30 = fmtFecha(new Date(hoyDate.getTime() + 30 * 86400000));

    const [cxc, cxp, tes] = await Promise.all([
      fetchCxC(companyIds),
      fetchCxP(companyIds, desde, hasta, hoy, hasta30),
      fetchTesoreria(companyIds),
    ]);

    // Cobros esperados vs realizados: facturas de cliente que vencian en el
    // periodo y que ya fueron cobradas.
    const ventasDelPeriodo =
      (await callOdooRPC<any[]>(
        "account.move",
        "search_read",
        [
          [
            ["company_id", "in", companyIds],
            ["move_type", "=", "out_invoice"],
            ["state", "=", "posted"],
            ["invoice_date_due", ">=", desde],
            ["invoice_date_due", "<=", hasta],
          ],
        ],
        { fields: ["amount_total", "amount_residual", "payment_state"], limit: 0 },
      )) || [];
    const esperado = ventasDelPeriodo.reduce(
      (s, f: any) => s + Math.abs(Number(f.amount_total) || 0),
      0,
    );
    const cobrado = ventasDelPeriodo.reduce(
      (s, f: any) =>
        s +
        (Math.abs(Number(f.amount_total) || 0) -
          Math.abs(Number(f.amount_residual) || 0)),
      0,
    );
    const pctCobros = esperado > 0 ? Math.round((cobrado / esperado) * 1000) / 10 : null;

    const pct = (parte: number, total: number) =>
      total > 0 ? Math.round((parte / total) * 1000) / 10 : null;
    const money = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

    // ───────────────────────────────── Cuentas por cobrar (25 pts)
    const dsoPonderado =
      cxc.vencido > 0
        ? Math.round(
            (cxc.b1_30 * 15 + cxc.b31_60 * 45 + cxc.b61_90 * 75 + cxc.b91mas * 105) /
              cxc.vencido,
          )
        : 0;
    const metaDso = metas.dso ?? 45;

    const kpisCxC: KpiAdmin[] = [
      construirKpi(
        {
          id: "cartera_vencida", numero: 1, nombre: "% cartera vencida",
          formula: "Cartera vencida / cartera total × 100", peso: 6,
          metaTexto: `≤${metas.cartera_vencida}%`, valor: pct(cxc.vencido, cxc.totalCartera),
          unidad: "%", frecuencia: "Diaria", responsable: "Cuentas por Cobrar", fuente: "ERP / CxC",
          detalle: `${money(cxc.vencido)} vencidos de ${money(cxc.totalCartera)} de cartera`,
        },
        { modo: "lower_better", verde: metas.cartera_vencida ?? 10, amarillo: 15 },
      ),
      construirKpi(
        {
          id: "dso", numero: 2, nombre: "DSO (días promedio de cobro)",
          formula: "Ponderado por antigüedad de la cartera vencida", peso: 5,
          metaTexto: `≤${metaDso} días`, valor: cxc.vencido > 0 ? dsoPonderado : null,
          unidad: "", frecuencia: "Semanal", responsable: "CxC / Administración", fuente: "ERP / Ventas",
          detalle: cxc.vencido > 0 ? `Sobre ${money(cxc.vencido)} de cartera vencida` : "Sin cartera vencida",
        },
        { modo: "lower_better", verde: metaDso, amarillo: metaDso * 1.1 },
      ),
      construirKpi(
        {
          id: "cumplimiento_cobranza", numero: 3, nombre: "Cumplimiento meta de cobranza",
          formula: "Cobranza real / meta de cobranza × 100", peso: 4,
          metaTexto: metas.cumplimiento_cobranza ? `≥${metas.cumplimiento_cobranza}%` : "Sin meta definida",
          valor: metas.cumplimiento_cobranza ? pct(cobrado, metas.cumplimiento_cobranza) : null,
          unidad: "%", frecuencia: "Diaria/Mensual", responsable: "Cuentas por Cobrar", fuente: "Bancos / ERP",
          detalle: metas.cumplimiento_cobranza
            ? `Cobrado ${money(cobrado)} en el período`
            : "Falta cargar la meta mensual de cobranza en parámetros",
        },
        { modo: "higher_better", verde: 95, amarillo: 85 },
      ),
      construirKpi(
        {
          id: "cartera_90", numero: 4, nombre: "Cartera +90 días",
          formula: "Saldo +90 / cartera total × 100", peso: 4,
          metaTexto: `≤${metas.cartera_90}%`, valor: pct(cxc.b91mas, cxc.totalCartera),
          unidad: "%", frecuencia: "Semanal", responsable: "Cuentas por Cobrar", fuente: "Aging ERP",
          detalle: `${money(cxc.b91mas)} con más de 90 días`,
        },
        { modo: "lower_better", verde: metas.cartera_90 ?? 3, amarillo: 7 },
      ),
      construirKpi(
        {
          id: "promesas_pago", numero: 5, nombre: "Promesas de pago cumplidas",
          formula: "Promesas cumplidas / vencidas × 100", peso: 3,
          metaTexto: "≥95%", valor: null, unidad: "%", frecuencia: "Semanal",
          responsable: "Cuentas por Cobrar", fuente: "CRM / Gestión cobro",
          detalle: SIN_DATOS.promesas_pago,
        },
        { modo: "higher_better", verde: 95, amarillo: 85 },
      ),
      construirKpi(
        {
          id: "clientes_excedidos", numero: 6, nombre: "Clientes excedidos de límite",
          formula: "Clientes excedidos / clientes con crédito × 100", peso: 3,
          metaTexto: "≤2%", valor: null, unidad: "%", frecuencia: "Diaria",
          responsable: "Crédito y Cobranzas", fuente: "ERP / Crédito",
          detalle: SIN_DATOS.clientes_excedidos,
        },
        { modo: "lower_better", verde: 2, amarillo: 5 },
      ),
    ];

    // ───────────────────────────────── Tesorería (25 pts)
    const obligaciones30 = cxp.montoProximas30 + cxp.saldoVencido;
    const coberturaCaja = obligaciones30 > 0
      ? Math.round((tes.disponible / obligaciones30) * 100) / 100
      : null;
    const cobrosProbables = cxc.corriente;
    const flujoProyectado = Math.round((tes.disponible + cobrosProbables - obligaciones30) * 100) / 100;
    const pctConciliadas = pct(tes.conciliadas, tes.totalExtractos);
    const minimoOperativo = metas.disponibilidad_bancaria;

    const kpisTes: KpiAdmin[] = [
      construirKpi(
        {
          id: "cobertura_caja_30d", numero: 7, nombre: "Cobertura de caja 30 días",
          formula: "Fondos disponibles / obligaciones netas 30 días", peso: 6,
          metaTexto: `≥${metas.cobertura_caja_30d}x`, valor: coberturaCaja,
          unidad: "x", frecuencia: "Diaria", responsable: "Tesorería", fuente: "Bancos / Flujo",
          detalle: `${money(tes.disponible)} disponibles contra ${money(obligaciones30)} de obligaciones`,
        },
        { modo: "higher_better", verde: metas.cobertura_caja_30d ?? 1.5, amarillo: 1 },
      ),
      construirKpi(
        {
          id: "flujo_proyectado_30d", numero: 8, nombre: "Flujo proyectado 30 días",
          formula: "Caja + cobros esperados − pagos comprometidos", peso: 5,
          metaTexto: "Positivo", valor: flujoProyectado, unidad: "$",
          frecuencia: "Diaria", responsable: "Tesorería", fuente: "Flujo de caja",
          detalle: `${money(tes.disponible)} caja + ${money(cobrosProbables)} por cobrar − ${money(obligaciones30)} por pagar`,
        },
        { modo: "higher_better", verde: 0, amarillo: -obligaciones30 * 0.05 },
      ),
      construirKpi(
        {
          id: "cobros_esperados", numero: 9, nombre: "Cobros esperados vs realizados",
          formula: "Cobros reales / cobros proyectados × 100", peso: 4,
          metaTexto: `≥${metas.cobros_esperados}%`, valor: pctCobros,
          unidad: "%", frecuencia: "Semanal", responsable: "Tesorería / CxC", fuente: "Bancos / ERP",
          detalle: esperado > 0
            ? `${money(cobrado)} cobrados de ${money(esperado)} que vencían en el período`
            : "Sin facturas con vencimiento en el período",
        },
        { modo: "higher_better", verde: metas.cobros_esperados ?? 95, amarillo: 85 },
      ),
      construirKpi(
        {
          id: "exactitud_proyeccion", numero: 10, nombre: "Exactitud proyección de caja",
          formula: "1 − |real − proyectado| / proyectado", peso: 4,
          metaTexto: "≥95%", valor: null, unidad: "%", frecuencia: "Semanal",
          responsable: "Tesorería", fuente: "Flujo / Bancos",
          detalle: SIN_DATOS.exactitud_proyeccion,
        },
        { modo: "higher_better", verde: 95, amarillo: 85 },
      ),
      construirKpi(
        {
          id: "disponibilidad_bancaria", numero: 11, nombre: "Disponibilidad bancaria",
          formula: "Saldo disponible vs saldo mínimo operativo", peso: 3,
          metaTexto: minimoOperativo ? `≥${money(minimoOperativo)}` : "Sin mínimo definido",
          valor: minimoOperativo ? Math.round((tes.disponible / minimoOperativo) * 1000) / 10 : null,
          unidad: "%", frecuencia: "Diaria", responsable: "Tesorería", fuente: "Bancos",
          detalle: minimoOperativo
            ? `${money(tes.disponible)} disponibles`
            : `${money(tes.disponible)} disponibles — falta definir el saldo mínimo operativo en parámetros`,
        },
        { modo: "higher_better", verde: 100, amarillo: 90 },
      ),
      construirKpi(
        {
          id: "conciliaciones_dia", numero: 12, nombre: "Conciliaciones bancarias al día",
          formula: "Líneas conciliadas / líneas de extracto × 100", peso: 3,
          metaTexto: "100%", valor: pctConciliadas, unidad: "%",
          frecuencia: "Semanal/Mensual", responsable: "Contabilidad", fuente: "Bancos / Contabilidad",
          detalle: `${tes.conciliadas} de ${tes.totalExtractos} líneas conciliadas` +
            (tes.ultimaConciliacion ? ` · último extracto ${tes.ultimaConciliacion}` : ""),
        },
        { modo: "higher_better", verde: 100, amarillo: 95 },
      ),
    ];

    // ───────────────────────────────── Cuentas por pagar (15 pts)
    const conFechaPago = cxp.facturas.filter((f) => f.fechaPago);
    const puntuales = conFechaPago.filter(
      (f) => f.fechaVencimiento && f.fechaPago! <= f.fechaVencimiento,
    );
    const pctPuntualidad = pct(puntuales.length, conFechaPago.length);
    const coberturaPagos30 = cxp.montoProximas30 > 0
      ? Math.round(((tes.disponible + cobrosProbables) / cxp.montoProximas30) * 100) / 100
      : null;

    const kpisCxP: KpiAdmin[] = [
      construirKpi(
        {
          id: "pagos_a_tiempo", numero: 13, nombre: "Pagos realizados a tiempo",
          formula: "Pagos puntuales / pagos del período × 100", peso: 4,
          metaTexto: `≥${metas.pagos_a_tiempo}%`, valor: pctPuntualidad,
          unidad: "%", frecuencia: "Semanal", responsable: "Cuentas por Pagar", fuente: "ERP / CxP",
          detalle: conFechaPago.length > 0
            ? `${puntuales.length} de ${conFechaPago.length} facturas pagadas en o antes de su vencimiento`
            : "Sin facturas con vencimiento y pago en el período",
        },
        { modo: "higher_better", verde: metas.pagos_a_tiempo ?? 98, amarillo: 90 },
      ),
      construirKpi(
        {
          id: "obligaciones_vencidas", numero: 14, nombre: "Obligaciones vencidas",
          formula: "Saldo vencido / total CxP × 100", peso: 4,
          metaTexto: `≤${metas.obligaciones_vencidas}%`, valor: pct(cxp.saldoVencido, cxp.totalCxP),
          unidad: "%", frecuencia: "Diaria", responsable: "Cuentas por Pagar", fuente: "Aging CxP",
          detalle: `${money(cxp.saldoVencido)} vencidos en ${cxp.vencidas.length} facturas`,
        },
        { modo: "lower_better", verde: metas.obligaciones_vencidas ?? 3, amarillo: 7 },
      ),
      construirKpi(
        {
          id: "cobertura_pagos_30d", numero: 15, nombre: "Cobertura pagos próximos 30 días",
          formula: "(Caja + cobros probables) / pagos 30 días", peso: 3,
          metaTexto: `≥${metas.cobertura_pagos_30d}x`, valor: coberturaPagos30,
          unidad: "x", frecuencia: "Diaria", responsable: "Tesorería / CxP", fuente: "Flujo / CxP",
          detalle: `${money(cxp.montoProximas30)} por pagar en los próximos 30 días`,
        },
        { modo: "higher_better", verde: metas.cobertura_pagos_30d ?? 1.2, amarillo: 1 },
      ),
      construirKpi(
        {
          id: "facturas_pendientes", numero: 16, nombre: "Facturas pendientes de procesar",
          formula: "Facturas > plazo interno / total recibidas × 100", peso: 2,
          metaTexto: "≤5%", valor: null, unidad: "%", frecuencia: "Semanal",
          responsable: "Cuentas por Pagar", fuente: "ERP / Recepción",
          detalle: SIN_DATOS.facturas_pendientes,
        },
        { modo: "lower_better", verde: 5, amarillo: 10 },
      ),
      construirKpi(
        {
          id: "descuentos_aprovechados", numero: 17, nombre: "Descuentos financieros aprovechados",
          formula: "Descuentos tomados / disponibles × 100", peso: 2,
          metaTexto: "≥90%", valor: null, unidad: "%", frecuencia: "Mensual",
          responsable: "CxP / Tesorería", fuente: "ERP / Proveedores",
          detalle: SIN_DATOS.descuentos_aprovechados,
        },
        { modo: "higher_better", verde: 90, amarillo: 75 },
      ),
    ];

    const categorias = [
      resumirCategoria("Cuentas por Cobrar", kpisCxC, 25),
      resumirCategoria("Tesorería y Liquidez", kpisTes, 25),
      resumirCategoria("Cuentas por Pagar", kpisCxP, 15),
    ];

    const puntos = Math.round(categorias.reduce((s, c) => s + c.puntos, 0) * 100) / 100;
    const puntosMax = categorias.reduce((s, c) => s + c.puntosMax, 0);
    const puntosEvaluables = categorias.reduce((s, c) => s + c.puntosMaxEvaluables, 0);
    // El indice se calcula sobre lo que si tiene datos: reportar sobre 65 con
    // 9 puntos sin fuente daria una nota artificialmente baja.
    const indice = puntosEvaluables > 0 ? Math.round((puntos / puntosEvaluables) * 100) : 0;
    const clasificacion = indice >= 90 ? "Excelente" : indice >= 75 ? "Atención" : "Acción inmediata";

    // ───────────────────────────────── Alertas
    const alertasPorArea: AlertaAdmin[][] = categorias.map((cat) =>
      cat.kpis
        .filter((k) => k.semaforo === "rojo" || k.semaforo === "amarillo")
        .map((k) => ({
          id: `sf-${k.id}`,
          area: cat.categoria,
          titulo: `${k.nombre}: ${k.valor}${k.unidad} (meta ${k.metaTexto})`,
          responsable: k.responsable,
          montoAfectado:
            k.id === "cartera_vencida" ? cxc.vencido
            : k.id === "cartera_90" ? cxc.b91mas
            : k.id === "obligaciones_vencidas" ? cxp.saldoVencido
            : null,
          fechaDeteccion: hoy,
          accion: k.detalle || "Revisar indicador",
          fechaCompromiso: null,
          estatus: "abierta" as const,
          severidad: severidadDesdeDesvio(k.semaforo, k.valor ?? 0),
          enlace: "/administracion",
        })),
    );

    return NextResponse.json({
      success: true,
      mes,
      empresa: empresa || "todas",
      indice: { valor: indice, puntos, puntosMax, puntosEvaluables, clasificacion },
      categorias,
      alertas: construirTopAlertas(alertasPorArea, 10),
      detalle: {
        cxc: {
          totalCartera: cxc.totalCartera,
          corriente: cxc.corriente,
          vencido: cxc.vencido,
          bandas: [
            { nombre: "1–30 días", monto: cxc.b1_30 },
            { nombre: "31–60 días", monto: cxc.b31_60 },
            { nombre: "61–90 días", monto: cxc.b61_90 },
            { nombre: "+90 días", monto: cxc.b91mas },
          ],
          topDeudores: cxc.topDeudores,
        },
        tesoreria: {
          disponible: tes.disponible,
          retenciones: tes.retenciones,
          porCuenta: tes.porCuenta,
        },
        cxp: {
          totalCxP: cxp.totalCxP,
          saldoVencido: cxp.saldoVencido,
          montoProximas30: cxp.montoProximas30,
          vencidas: cxp.vencidas
            .sort((a, b) => b.residual - a.residual)
            .slice(0, 20)
            .map((f) => ({
              proveedor: f.proveedor,
              vencimiento: f.fechaVencimiento,
              monto: f.residual,
            })),
        },
      },
    });
  } catch (error: any) {
    console.error("Error salud financiera:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
