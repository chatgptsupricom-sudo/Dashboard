import { NextRequest, NextResponse } from "next/server";
import { canViewAdministracion, getAdminUser } from "@/lib/administracion/auth";
import { OdooUnreachableError } from "@/lib/odoo";
import { cargarMetas } from "@/lib/administracion/metas";
import { construirKpi, resumirCategoria } from "@/lib/administracion/kpis";
import {
  AlertaAdmin,
  severidadDesdeDesvio,
} from "@/lib/administracion/alertas";
import { companyIdsDeEmpresa } from "@/lib/administracion/empresas";
import { cargarRefsAdminKpis } from "@/lib/administracion/odooRefs";
import {
  fetchCierreMensual,
  fetchDocumentosATiempo,
  fetchLegalizacionPendiente,
} from "@/lib/administracion/gestionAdministrativa";
import {
  fetchAuditoriaInterna,
  fetchIncidenciasVencidas,
  fetchOperacionesFueraPolitica,
} from "@/lib/administracion/cumplimientoControl";

/**
 * Gestión Administrativa (10 pts) + Cumplimiento y Control (10 pts) —
 * issue #8. Van en un solo endpoint porque comparten la misma configuración
 * de Odoo (`supricom_admin_kpis`) y el mismo problema de fondo: hasta que ese
 * módulo se instale en producción, todo aquí es "sin_datos".
 *
 * "Documentos sin soporte" (Cumplimiento, 2 pts) no se implementa a
 * propósito — ver el módulo cumplimientoControl.ts. Queda declarado como KPI
 * con valor null para que el índice general lo excluya del cálculo en vez de
 * contarlo como incumplido, igual que el resto de indicadores sin fuente.
 *
 * Los pesos (2 pts por KPI) son una distribución PAREJA dentro de cada
 * categoría: el documento da el total por categoría (10+10) pero no el
 * desglose por KPI como sí lo hacía para Gastos y Presupuesto. Pendiente de
 * validar con Administración, igual que la banda de ejecución presupuestaria
 * y el criterio de "gasto extraordinario" en Gastos.
 */

const CATEGORIA_GESTION = "Gestión Administrativa";
const CATEGORIA_CUMPLIMIENTO = "Cumplimiento y Control";
const PUNTOS_POR_CATEGORIA = 10;

const SIN_MODULO =
  "Requiere instalar y configurar el módulo supricom_admin_kpis en Odoo (ver issue #8). Sin eso, Odoo no tiene dónde registrar este dato.";

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
    const mes =
      searchParams.get("mes") ||
      `${hoyDate.getFullYear()}-${String(hoyDate.getMonth() + 1).padStart(2, "0")}`;
    const [anio, mesNum] = mes.split("-").map(Number);
    const desde = `${anio}-${String(mesNum).padStart(2, "0")}-01 00:00:00`;
    const ultimoDia = new Date(anio, mesNum, 0).getDate();
    const hasta = `${anio}-${String(mesNum).padStart(2, "0")}-${ultimoDia} 23:59:59`;

    const refs = await cargarRefsAdminKpis();

    const [docsATiempo, legalizacion, cierreMensual, fueraPolitica, incidencias, auditoria] =
      await Promise.all([
        fetchDocumentosATiempo(refs, companyIds, desde, hasta, metas.plazo_procesamiento_dias),
        fetchLegalizacionPendiente(companyIds, metas.legalizacion_dias ?? 30),
        fetchCierreMensual(refs, companyIds, desde, hasta),
        fetchOperacionesFueraPolitica(refs, companyIds, desde, hasta),
        fetchIncidenciasVencidas(refs, companyIds),
        fetchAuditoriaInterna(refs, companyIds, desde, hasta),
      ]);

    // ───────────────────────────────── Gestión Administrativa (10 pts)
    const kpisGestion = [
      construirKpi(
        {
          id: "documentos_procesados_a_tiempo",
          numero: 23,
          nombre: "Documentos procesados a tiempo",
          formula: "Solicitudes resueltas dentro del plazo / total resueltas × 100",
          peso: 2,
          metaTexto:
            metas.plazo_procesamiento_dias !== null
              ? `≤${metas.plazo_procesamiento_dias} días`
              : "Sin plazo definido",
          valor: docsATiempo?.pctATiempo ?? null,
          unidad: "%",
          frecuencia: "Mensual",
          responsable: "Administración",
          fuente: "Odoo / Approvals",
          detalle: !docsATiempo
            ? SIN_MODULO
            : metas.plazo_procesamiento_dias === null
              ? "Falta definir el plazo interno de procesamiento (pregunta abierta del issue #8)"
              : `${docsATiempo.totalProcesados} solicitudes resueltas en el período; ${docsATiempo.pendientes} pendientes (${docsATiempo.pendientesVencidos} vencidas)`,
        },
        { modo: "higher_better", verde: 90, amarillo: 75 },
      ),
      construirKpi(
        {
          id: "tiempo_promedio_procesamiento",
          numero: 24,
          nombre: "Tiempo promedio de procesamiento",
          formula: "Promedio (fecha resolución − fecha creación) de solicitudes resueltas",
          peso: 2,
          metaTexto:
            metas.plazo_procesamiento_dias !== null
              ? `Referencial (plazo ≤${metas.plazo_procesamiento_dias} días)`
              : "Referencial (sin banda definida)",
          valor: docsATiempo?.tiempoPromedioDias ?? null,
          unidad: "",
          frecuencia: "Mensual",
          responsable: "Administración",
          fuente: "Odoo / Approvals",
          detalle: !docsATiempo
            ? SIN_MODULO
            : "En días. Se mide fecha de creación → última modificación de la solicitud ya resuelta; una edición no relacionada con la decisión puede inflar este número.",
        },
        // Antes de que Administración definiera el plazo (24h = 1 día, issue
        // #8) esta banda era un proxy provisional de 3/7 días para que
        // evaluarSemaforo() no cayera siempre en rojo por falta de umbral.
        // Ya con el plazo real, se mide el promedio contra ese mismo número
        // en vez de un límite inventado: 1x el plazo es verde, 2x es el
        // corte de amarillo. Si Administración vuelve a borrar la meta
        // (null), cae de nuevo al proxy 3/7 para no quedar sin banda.
        metas.plazo_procesamiento_dias !== null
          ? {
              modo: "lower_better",
              verde: metas.plazo_procesamiento_dias,
              amarillo: metas.plazo_procesamiento_dias * 2,
            }
          : { modo: "lower_better", verde: 3, amarillo: 7 },
      ),
      construirKpi(
        {
          id: "legalizacion_pendiente",
          numero: 25,
          nombre: "Anticipos y viáticos pendientes de legalización",
          formula: "Pendientes con +días del umbral / total pendientes × 100",
          peso: 3,
          metaTexto: `≤${metas.pct_legalizacion_vencida}% vencidos (+${metas.legalizacion_dias} días)`,
          valor: legalizacion.pctVencidos,
          unidad: "%",
          frecuencia: "Mensual",
          responsable: "Administración",
          fuente: "Odoo / Gastos (hr.expense)",
          detalle: `${legalizacion.totalPendientes} reportes pendientes de legalizar por $${legalizacion.montoPendiente.toLocaleString("en-US")}; ${legalizacion.pendientesVencidos} con más de ${metas.legalizacion_dias} días. "Anticipos" y "viáticos" se reportan juntos: Odoo no los distingue como estados distintos.`,
        },
        {
          modo: "lower_better",
          verde: metas.pct_legalizacion_vencida ?? 20,
          amarillo: (metas.pct_legalizacion_vencida ?? 20) * 2,
        },
      ),
      construirKpi(
        {
          id: "cumplimiento_cierre_mensual",
          numero: 26,
          nombre: "Cumplimiento de cierre mensual",
          formula: "Ítems de cierre cerrados a tiempo / total con fecha límite × 100",
          peso: 3,
          metaTexto: "100%",
          valor: cierreMensual?.pctATiempo ?? null,
          unidad: "%",
          frecuencia: "Mensual",
          responsable: "Administración",
          fuente: "Odoo / Project",
          detalle: !cierreMensual
            ? SIN_MODULO
            : `${cierreMensual.totalConDeadline} ítems con fecha límite en el período; ${cierreMensual.vencidasSinCerrar} vencidos sin cerrar. El checklist cargado hoy es de EJEMPLO — reemplazar por el real de Administración.`,
        },
        { modo: "higher_better", verde: 95, amarillo: 85 },
      ),
    ];

    // ───────────────────────────────── Cumplimiento y Control (10 pts)
    const kpisCumplimiento = [
      construirKpi(
        {
          id: "documentos_sin_soporte",
          numero: 27,
          nombre: "Documentos sin soporte",
          formula: "Facturas sin adjunto / total facturas × 100",
          peso: 2,
          metaTexto: "≤1%",
          valor: null,
          unidad: "%",
          frecuencia: "Mensual",
          responsable: "Administración",
          fuente: "ERP",
          detalle:
            "No implementado a propósito: solo 1,8% de las facturas de proveedor tienen adjunto (0% en Valencia). Mediría hábitos de carga en el ERP, no cumplimiento — ver comentario del issue #8.",
        },
        { modo: "lower_better", verde: 1, amarillo: 5 },
      ),
      construirKpi(
        {
          id: "operaciones_fuera_politica",
          numero: 28,
          nombre: "Operaciones fuera de política",
          formula: "Excepciones de política registradas en el período",
          peso: 3,
          metaTexto: `≤${metas.operaciones_fuera_politica}`,
          valor: fueraPolitica?.total ?? null,
          unidad: "",
          frecuencia: "Mensual",
          responsable: "Administración",
          fuente: "Odoo / Approvals",
          detalle: !fueraPolitica
            ? SIN_MODULO
            : "Cuenta cualquier solicitud de la categoría 'Excepción de Política', se apruebe o no: el solo hecho de registrarla ya es la excepción.",
        },
        {
          modo: "lower_better",
          verde: metas.operaciones_fuera_politica ?? 0,
          amarillo: (metas.operaciones_fuera_politica ?? 0) + 2,
        },
      ),
      construirKpi(
        {
          id: "incidencias_vencidas",
          numero: 29,
          nombre: "Incidencias abiertas vencidas",
          formula: "Incidencias abiertas con SLA vencido / total abiertas × 100",
          peso: 3,
          metaTexto: `≤${metas.incidencias_vencidas_pct}%`,
          valor: incidencias?.pctVencidas ?? null,
          unidad: "%",
          frecuencia: "Semanal",
          responsable: "Administración",
          fuente: "Odoo / Helpdesk",
          detalle: !incidencias
            ? SIN_MODULO
            : `${incidencias.totalAbiertas} incidencias abiertas; ${incidencias.vencidas} vencidas contra su SLA.`,
        },
        {
          modo: "lower_better",
          verde: metas.incidencias_vencidas_pct ?? 10,
          amarillo: (metas.incidencias_vencidas_pct ?? 10) * 2,
        },
      ),
      construirKpi(
        {
          id: "auditoria_cerrados",
          numero: 30,
          nombre: "Pendientes de auditoría cerrados",
          formula: "Hallazgos cerrados / total hallazgos del período × 100",
          peso: 1,
          metaTexto: `≥${metas.auditoria_cumplimiento_pct}%`,
          valor: auditoria?.pctCerrados ?? null,
          unidad: "%",
          frecuencia: "Mensual",
          responsable: "Administración",
          fuente: "Odoo / Project",
          detalle: !auditoria
            ? SIN_MODULO
            : `${auditoria.totalHallazgos} hallazgos en el período; ${auditoria.cerrados} cerrados.`,
        },
        {
          modo: "higher_better",
          verde: metas.auditoria_cumplimiento_pct ?? 90,
          amarillo: 75,
        },
      ),
      construirKpi(
        {
          id: "reincidencias",
          numero: 31,
          nombre: "Reincidencias",
          formula: "Hallazgos marcados como reincidencia en el período",
          peso: 1,
          metaTexto: `≤${metas.reincidencias}`,
          valor: auditoria?.reincidencias ?? null,
          unidad: "",
          frecuencia: "Mensual",
          responsable: "Administración",
          fuente: "Odoo / Project",
          detalle: !auditoria
            ? SIN_MODULO
            : "Requiere marcar a mano la etiqueta 'Reincidencia' al crear el hallazgo — no hay detección automática de que un problema ya se reportó antes.",
        },
        {
          modo: "lower_better",
          verde: metas.reincidencias ?? 0,
          amarillo: (metas.reincidencias ?? 0) + 2,
        },
      ),
    ];

    const categorias = [
      resumirCategoria(CATEGORIA_GESTION, kpisGestion, PUNTOS_POR_CATEGORIA),
      resumirCategoria(CATEGORIA_CUMPLIMIENTO, kpisCumplimiento, PUNTOS_POR_CATEGORIA),
    ];

    // ───────────────────────────────── Alertas
    const alertas: AlertaAdmin[] = [];
    [...kpisGestion, ...kpisCumplimiento].forEach((k) => {
      if (k.semaforo !== "rojo" && k.semaforo !== "amarillo") return;
      alertas.push({
        id: `admin-${k.id}`,
        area: categorias.find((c) => c.kpis.includes(k))?.categoria || "Administración",
        titulo: `${k.nombre}: ${k.valor}${k.unidad} (meta ${k.metaTexto})`,
        responsable: k.responsable,
        montoAfectado: k.id === "legalizacion_pendiente" ? legalizacion.montoPendiente : null,
        fechaDeteccion: hoyDate.toISOString().split("T")[0],
        accion: k.detalle || "Revisar indicador",
        fechaCompromiso: null,
        estatus: "abierta",
        severidad: severidadDesdeDesvio(k.semaforo, k.desvio ?? 0),
        enlace: "/administracion",
      });
    });

    return NextResponse.json({
      success: true,
      mes,
      empresa: empresa || "todas",
      moduloInstalado: Object.keys(refs.categoriaSolicitudAdministrativaPorEmpresa).length > 0,
      categorias,
      alertas,
    });
  } catch (error: any) {
    console.error("Error en API Gestion/Cumplimiento Administracion:", error.message);
    // Distinto de "Error interno": esto significa que Odoo no respondió (caído,
    // sin red, timeout), no que algo esté mal configurado en este endpoint —
    // sin esto, el frontend no puede distinguirlo de "módulo no instalado".
    if (error instanceof OdooUnreachableError) {
      return NextResponse.json(
        { success: false, error: "No se pudo conectar con Odoo", odooUnreachable: true },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
