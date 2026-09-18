import { NextRequest, NextResponse } from "next/server";
import { callOdooRPC, OdooUnreachableError } from "@/lib/odoo";
import { canViewAdministracion, getAdminUser } from "@/lib/administracion/auth";
import { cargarMetas } from "@/lib/administracion/metas";
import {
  fetchCxC,
  fetchCxP,
  fetchFacturasSinProcesar,
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
import { companyIdsDeEmpresa } from "@/lib/administracion/empresas";
import { obtenerCobros } from "@/lib/cxc/cobros";
import { calcularEfectividad } from "@/lib/cxc/efectividad";

const SIN_DATOS = {
  promesas_pago:
    "No existe registro de promesas de pago en el sistema; requiere capturarlas.",
  exactitud_proyeccion:
    "Requiere guardar las proyecciones de caja para compararlas contra lo real.",
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
    const empresa = (searchParams.get("empresa") || "").toLowerCase().trim();
    const companyIds = companyIdsDeEmpresa(empresa);
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

    const [cxc, cxp, tes, sinProcesar, clientesConLimiteRaw] = await Promise.all([
      fetchCxC(companyIds),
      fetchCxP(companyIds, desde, hasta, hoy, hasta30),
      fetchTesoreria(companyIds),
      // El plazo interno (24h = 1 dia) ya lo definio Administracion para
      // "documentos procesados a tiempo"; se reusa el mismo parametro en vez
      // de inventar uno nuevo para lo mismo.
      fetchFacturasSinProcesar(companyIds, desde, hasta, metas.plazo_procesamiento_dias ?? 1),
      // "credit_limit" es un campo company_dependent (se ve en Contactos >
      // Contabilidad > Límites de Crédito): no es que falte cargarlo, está
      // bien poblado (>99% de los clientes con credit_limit>0 lo tienen real,
      // no en 0) — solo faltaba conectarlo a este KPI. "credit" es el saldo
      // por cobrar que Odoo ya calcula solo (mismo campo que se ve como
      // "Total por cobrar" en la ficha del contacto).
      callOdooRPC<any[]>(
        "res.partner",
        "search_read",
        [
          [
            ["company_id", "in", companyIds],
            ["customer_rank", ">", 0],
            ["credit_limit", ">", 0],
            ["active", "=", true],
          ],
        ],
        { fields: ["credit_limit", "credit"], limit: 0 },
      ),
    ]);
    const clientesConLimite = clientesConLimiteRaw || [];
    const clientesExcedidos = clientesConLimite.filter(
      (c) => Number(c.credit) > Number(c.credit_limit),
    ).length;
    const pctClientesExcedidos =
      clientesConLimite.length > 0
        ? Math.round((clientesExcedidos / clientesConLimite.length) * 1000) / 10
        : null;

    // Cobros esperados vs realizados = Efectividad de Cuentas por Cobrar
    // (lib/cxc/efectividad.ts): cobrado hasta el cierre del periodo sobre lo que
    // vencia en el. Antes se usaba `amount_total - amount_residual`, que es el
    // saldo de HOY: contaba pagos posteriores al periodo, notas de credito y
    // retenciones como cobro, y no coincidia con el KPI de CxC.
    const ventasRaw =
      (await callOdooRPC<any[]>(
        "account.move",
        "search_read",
        [
          [
            ["company_id", "in", companyIds],
            ["move_type", "in", ["out_invoice", "out_refund"]],
            ["state", "=", "posted"],
            ["invoice_date_due", ">=", desde],
            ["invoice_date_due", "<=", hasta],
          ],
        ],
        { fields: ["id", "partner_id", "move_type", "amount_total", "amount_residual", "invoice_date_due"], limit: 0 },
      )) || [];
    // Mismo filtro de internos que el Dashboard de CxC (nombre mostrado del partner).
    const ventasDelPeriodo = ventasRaw.filter(
      (f: any) => !String(f.partner_id?.[1] || "").toLowerCase().includes("supricom"),
    );
    const [efectividad, cobrosDelPeriodo] = await Promise.all([
      calcularEfectividad(
        companyIds,
        new Date(desde + "T00:00:00"),
        new Date(hasta + "T00:00:00"),
        ventasDelPeriodo.map((f: any) => {
          const signo = f.move_type === "out_refund" ? -1 : 1;
          return {
            id: f.id,
            amountTotal: signo * Math.abs(Number(f.amount_total) || 0),
            amountResidual: signo * Math.abs(Number(f.amount_residual) || 0),
            dueDate: f.invoice_date_due ? new Date(f.invoice_date_due + "T00:00:00") : null,
          };
        }),
        [],
        hoyDate,
      ),
      // Cobranza real del periodo = "Cobrado" de Contado/Credito (lib/cxc/cobros.ts):
      // dinero que entro a banco/caja, por fecha de confirmacion del pago.
      obtenerCobros(companyIds, { desde, hasta }),
    ]);
    const esperado = efectividad.exigibleMes;
    const cobrado = efectividad.cobradoAlCierre;
    const pctCobros = efectividad.value;
    const cobranzaReal = Math.round(cobrosDelPeriodo.reduce((s, c) => s + c.monto, 0) * 100) / 100;

    const pct = (parte: number, total: number) =>
      total > 0 ? Math.round((parte / total) * 1000) / 10 : null;
    const money = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

    // Las facturas de proveedor sin condiciones de pago reciben vencimiento =
    // fecha de factura, por lo que nacen vencidas. Si son una porcion relevante,
    // los indicadores de vencimiento y cobertura se leen inflados y hay que
    // advertirlo explicitamente: el problema es de carga, no de pago tardio.
    const pctSinCondicion = pct(cxp.pendientesSinCondicion, cxp.pendientesTotal);
    const avisoCondiciones =
      pctSinCondicion !== null && pctSinCondicion >= 20
        ? ` Atención: ${cxp.pendientesSinCondicion} de ${cxp.pendientesTotal} facturas pendientes (${money(cxp.montoSinCondicion)}) no tienen condiciones de pago cargadas en Odoo, por lo que figuran vencidas desde su emisión.`
        : "";

    // ───────────────────────────────── Cuentas por cobrar (25 pts)
    const dsoPonderado =
      cxc.vencido > 0
        ? Math.round(
            (cxc.b1_30 * 15 + cxc.b31_60 * 45 + cxc.b61_90 * 75 + cxc.b91mas * 105) /
              cxc.vencido,
          )
        : 0;
    const metaDso = metas.dso ?? 45;
    // Administracion fijo la meta de cobranza como % de lo que vence en el
    // periodo, no como un monto en dolares — ver METAS_DEFAULT.
    const metaCobranzaPct = metas.cumplimiento_cobranza ?? 90;
    const metaFacturasPendientes = metas.facturas_pendientes ?? 5;
    const plazoHoras = (metas.plazo_procesamiento_dias ?? 1) * 24;

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
          formula: "Cobranza real del período / exigible del período × 100", peso: 4,
          metaTexto: `≥${metaCobranzaPct}%`,
          valor: pct(cobranzaReal, esperado),
          unidad: "%", frecuencia: "Diaria/Mensual", responsable: "Cuentas por Cobrar", fuente: "Bancos / ERP",
          // OJO, no confundir con "Cobros esperados vs realizados" (KPI 9):
          // aquel mide, de las facturas que vencian en el periodo, que parte
          // se cobro (tope 100%). Este mide TODO el dinero que entro a
          // banco/caja en el periodo contra ese mismo exigible, asi que
          // incluye cobranza de facturas viejas y puede pasar de 100% — es la
          // lectura de flujo de caja, no la de disciplina de cobro.
          detalle: esperado > 0
            ? `Cobrado ${money(cobranzaReal)} contra ${money(esperado)} que vencían en el período (incluye cobros de facturas de meses anteriores, por eso puede superar el 100%)`
            : "Sin facturas con vencimiento en el período",
        },
        { modo: "higher_better", verde: metaCobranzaPct, amarillo: metaCobranzaPct - 10 },
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
          metaTexto: `≤${metas.clientes_excedidos}%`, valor: pctClientesExcedidos,
          unidad: "%", frecuencia: "Diaria",
          responsable: "Crédito y Cobranzas", fuente: "Odoo / Contactos",
          detalle:
            clientesConLimite.length > 0
              ? `${clientesExcedidos} de ${clientesConLimite.length} clientes con límite cargado están por encima de su límite de crédito`
              : "Ningún cliente tiene un límite de crédito mayor a 0 cargado en Odoo",
        },
        { modo: "lower_better", verde: metas.clientes_excedidos ?? 2, amarillo: 5 },
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
          detalle: `${money(tes.disponible)} disponibles contra ${money(obligaciones30)} de obligaciones.${avisoCondiciones}`,
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
          detalle: `${money(cxp.saldoVencido)} vencidos en ${cxp.vencidas.length} facturas.${avisoCondiciones}`,
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
          formula: "Facturas en borrador > plazo interno / recibidas en el período × 100", peso: 2,
          metaTexto: `≤${metaFacturasPendientes}%`,
          valor: pct(sinProcesar.sinProcesar, sinProcesar.recibidasEnPeriodo),
          unidad: "%", frecuencia: "Semanal",
          responsable: "Cuentas por Pagar", fuente: "ERP / Cuentas por Pagar",
          detalle: sinProcesar.recibidasEnPeriodo > 0
            ? `${sinProcesar.sinProcesar} facturas siguen en borrador pasadas las ${plazoHoras}h por ${money(sinProcesar.montoSinProcesar)}${
                sinProcesar.antiguedadMaximaDias !== null
                  ? `; la más vieja lleva ${sinProcesar.antiguedadMaximaDias} días`
                  : ""
              }. Cuenta los borradores de cualquier fecha, no solo los del mes, porque son justamente los viejos los que importan. NO mide desde que llega la factura: Odoo no guarda la fecha de recepción (verificado), así que arranca cuando la factura entra al sistema.`
            : "Ninguna factura de proveedor entró al sistema en el período",
        },
        {
          modo: "lower_better",
          verde: metaFacturasPendientes,
          amarillo: metaFacturasPendientes * 2,
        },
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
          titulo: `${k.nombre}: ${
            k.unidad === "$" ? money(k.valor ?? 0) : `${k.valor}${k.unidad}`
          } (meta ${k.metaTexto})`,
          responsable: k.responsable,
          montoAfectado:
            k.id === "cartera_vencida" ? cxc.vencido
            : k.id === "cartera_90" ? cxc.b91mas
            : k.id === "obligaciones_vencidas" ? cxp.saldoVencido
            // El flujo proyectado ya es un monto en si mismo (positivo o
            // negativo), no hace falta derivarlo de otra cosa.
            : k.id === "flujo_proyectado_30d" ? flujoProyectado
            // Lo "afectado" en cobros esperados es lo que todavia no se ha
            // cobrado del periodo, no el total esperado ni lo ya cobrado.
            : k.id === "cobros_esperados" ? (esperado > 0 ? Math.round((esperado - cobrado) * 100) / 100 : null)
            // En cumplimiento de cobranza lo afectado es cuanto falto para
            // llegar a la meta del periodo (meta% de lo exigible).
            : k.id === "facturas_pendientes" ? (sinProcesar.montoSinProcesar || null)
            : k.id === "cumplimiento_cobranza"
              ? (esperado > 0
                  ? Math.max(
                      0,
                      Math.round((esperado * (metaCobranzaPct / 100) - cobranzaReal) * 100) / 100,
                    )
                  : null)
            : null,
          fechaDeteccion: hoy,
          accion: k.detalle || "Revisar indicador",
          fechaCompromiso: null,
          estatus: "abierta" as const,
          severidad: severidadDesdeDesvio(k.semaforo, k.desvio ?? 0),
          enlace: "/administracion",
        })),
    );

    return NextResponse.json({
      success: true,
      mes,
      empresa: empresa || "todas",
      indice: { valor: indice, puntos, puntosMax, puntosEvaluables, clasificacion },
      categorias,
      // Se devuelven todas las alertas candidatas ya ordenadas, no solo 10: la
      // pagina las mezcla con las de Gastos y descarta las que Administracion
      // marco como cerradas, y recortar aqui a 10 dejaria el Top final corto.
      alertas: construirTopAlertas(alertasPorArea, 100),
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
    // Distinto de "Error interno": esto significa que Odoo no respondió
    // (caído, sin red, timeout) — sin esto, el frontend no puede
    // distinguirlo de "no hay fuente de datos" (mismo bug ya corregido en
    // login y en gestion-cumplimiento).
    if (error instanceof OdooUnreachableError) {
      return NextResponse.json(
        { success: false, error: "No se pudo conectar con Odoo", odooUnreachable: true },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
