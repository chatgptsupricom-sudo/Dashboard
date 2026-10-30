import { obtenerCobros, esRelacionada, cuadrarCobros, type Cobro } from "@/lib/cxc/cobros";
import { calcularSeriesCxC } from "@/lib/cxc/seriesSemanales";
import { BANDAS } from "@/lib/cxc/bandas";
import { obtenerSemanasDelMes } from "@/lib/feriados";
import { diasPromedio } from "@/lib/inteligencia-negocio/diasPromedio";
import { esICExcluido } from "@/lib/intercompania";
import { hoyCaracas } from "@/lib/compras/datosOdoo";
import { CORTE_ODOO } from "@/lib/smartbit";
import {
  COLOR_SEDE, ESTADO, GRIS, NOMBRE_SEDE, PALETA, bloque, etiquetaMes, finDeMes, mesesHasta, r2, topConOtros, variacion,
  type DatosArea, type Grafica, type Kpi,
} from "./tipos";

/**
 * Cobranza: cobros conciliados por banco/caja (`obtenerCobros`, sin
 * retenciones ni el 25 % de IVA), sin Supricom, SUPER TECHNO ni
 * intercompañía; cartera y antigüedad con las series de CxC
 * (`calcularSeriesCxC`); días de cobro/inventario/pago con Días promedio.
 * La ruta corre dentro de `conSinIntercompaniaBI`, así lib/cxc también deja
 * fuera al grupo.
 */

const MESES_COBROS = 6;

/** Colores de las bandas de antigüedad: corriente en verde y lo vencido de amarillo a rojo oscuro. */
const COLOR_BANDA: Record<string, string> = {
  corriente: ESTADO.bien,
  "1-7": "#f6c445",
  "8-15": "#f4a93c",
  "16-21": "#f08f3a",
  "22-30": "#ea7638",
  "31-45": "#e05c36",
  "46-60": ESTADO.critico,
  "61-90": "#b02e33",
  "91+": "#8c222b",
};

export async function graficasCobranza(cids: number[], sede: string, mes: string): Promise<DatosArea> {
  const avisos: string[] = [];
  const kpis: Kpi[] = [];
  const graficas: Grafica[] = [];
  const hoy = hoyCaracas();
  const enCurso = hoy.slice(0, 7) === mes;
  const mesAnterior = mesesHasta(mes, 2)[0];
  const fin = enCurso ? hoy : finDeMes(mes);

  if (fin < CORTE_ODOO) {
    avisos.push("La cobranza se lee de Odoo, que arranca en abril 2026.");
    return { area: "cobranza", sede, mes, generado: new Date().toISOString(), kpis, graficas, avisos };
  }

  const meses = mesesHasta(mes, MESES_COBROS).filter((m) => finDeMes(m) >= CORTE_ODOO);
  const desde = `${meses[0]}-01` < CORTE_ODOO ? CORTE_ODOO : `${meses[0]}-01`;
  const [a, m] = mes.split("-").map(Number);
  const hoyDate = new Date();
  const corte = enCurso ? hoyDate : new Date(a, m, 0, 23, 59, 59);

  const [cobrosTodos, series, dias] = await Promise.all([
    bloque(avisos, "los cobros", () => obtenerCobros(cids, { desde, hasta: fin })),
    bloque(avisos, "la cartera", () => calcularSeriesCxC(cids, obtenerSemanasDelMes(a, m), hoyDate, corte)),
    bloque(avisos, "los días promedio", () => diasPromedio(cids, mes)),
  ]);

  if (cobrosTodos) {
    const cobros = cobrosTodos.filter((c) => !c.interno && !esRelacionada(c.partnerName) && !esICExcluido(c.partnerId));
    const delMes = (x: string) => cobros.filter((c) => c.fecha.slice(0, 7) === x);
    const total = (xs: Cobro[]) => xs.reduce((s, c) => s + c.monto, 0);
    const cobradoMes = total(delMes(mes));
    const cobradoAnt = total(delMes(mesAnterior));
    kpis.push({ id: "cobrado_mes", etiqueta: "Cobrado en el mes", valor: r2(cobradoMes), formato: "usd", delta: variacion(cobradoMes, cobradoAnt), referencia: "vs mes anterior" });
    kpis.push({ id: "pagos", etiqueta: "Pagos recibidos", valor: new Set(delMes(mes).map((c) => c.pagoMoveId ?? c.reconcileId)).size, formato: "num" });

    graficas.push({
      id: "cobrado_mensual",
      titulo: "Cobrado por mes",
      descripcion: "Conciliado por banco o caja, por fecha de confirmación.",
      tipo: "apiladas",
      formato: "usd",
      datos: meses.map((x) => ({
        etiqueta: etiquetaMes(x),
        ...Object.fromEntries(cids.map((c) => [String(c), r2(total(delMes(x).filter((p) => p.companyId === c)))])),
      })),
      series: cids.map((c) => ({ clave: String(c), etiqueta: NOMBRE_SEDE[c], color: COLOR_SEDE[c] })),
    });

    const porDia = (x: string) => {
      const mapa = new Map<string, number>();
      for (const c of delMes(x)) mapa.set(c.fecha, (mapa.get(c.fecha) || 0) + c.monto);
      return mapa;
    };
    const dActual = porDia(mes);
    const dAnterior = porDia(mesAnterior);
    let acum = 0;
    let acumAnt = 0;
    const ritmo = [];
    for (let d = 1; d <= 31; d++) {
      const dd = String(d).padStart(2, "0");
      acum += dActual.get(`${mes}-${dd}`) || 0;
      acumAnt += dAnterior.get(`${mesAnterior}-${dd}`) || 0;
      ritmo.push({
        etiqueta: String(d),
        actual: d <= Number(finDeMes(mes).slice(8)) && `${mes}-${dd}` <= hoy ? r2(acum) : null,
        anterior: d <= Number(finDeMes(mesAnterior).slice(8)) && `${mesAnterior}-01` >= CORTE_ODOO ? r2(acumAnt) : null,
      });
    }
    graficas.push({
      id: "cobrado_ritmo",
      titulo: "Ritmo de cobranza",
      descripcion: "Cobrado acumulado día a día contra el mes anterior.",
      tipo: "area",
      formato: "usd",
      datos: ritmo,
      series: [
        { clave: "actual", etiqueta: etiquetaMes(mes), color: PALETA[2] },
        { clave: "anterior", etiqueta: etiquetaMes(mesAnterior), color: GRIS, punteada: true },
      ],
    });

    const cuadre = cuadrarCobros(delMes(mes), `${mes}-01`, finDeMes(mes));
    graficas.push({
      id: "cobrado_origen",
      titulo: "¿Qué se cobró?",
      descripcion: "Según cuándo vencía la factura que se pagó.",
      tipo: "barras",
      formato: "usd",
      datos: [
        { etiqueta: "Ya vencidas", valor: cuadre.vencidasAlInicio.monto },
        { etiqueta: "Vencían este mes", valor: cuadre.vencenEnPeriodo.monto },
        { etiqueta: "Por adelantado", valor: cuadre.adelantado.monto },
      ],
      series: [{ clave: "valor", etiqueta: "Cobrado", color: PALETA[0] }],
      colorPorFila: [ESTADO.serio, PALETA[0], ESTADO.bien],
    });

    const porDiario = new Map<string, number>();
    const porCliente = new Map<string, number>();
    for (const c of delMes(mes)) {
      porDiario.set(c.journalName || "Sin diario", (porDiario.get(c.journalName || "Sin diario") || 0) + c.monto);
      porCliente.set(c.partnerName || "(sin cliente)", (porCliente.get(c.partnerName || "(sin cliente)") || 0) + c.monto);
    }
    const filas = (mapa: Map<string, number>) => [...mapa].map(([etiqueta, valor]) => ({ etiqueta, valor }));
    graficas.push({
      id: "cobrado_diario",
      titulo: "Por banco o caja",
      tipo: "barras_h",
      formato: "usd",
      datos: topConOtros(filas(porDiario), 10, "Otros diarios"),
      series: [{ clave: "valor", etiqueta: "Cobrado", color: PALETA[2] }],
    });
    graficas.push({
      id: "cobrado_clientes",
      titulo: "Top 10 clientes que pagaron",
      tipo: "barras_h",
      formato: "usd",
      datos: topConOtros(filas(porCliente), 10).slice(0, 10),
      series: [{ clave: "valor", etiqueta: "Cobrado", color: PALETA[6] }],
    });
  }

  if (series) {
    const c = series.carteraHoy;
    // carteraHoy es la cartera a crédito del KPI de CxC (lib/cxc/seriesSemanales.ts):
    // sin contado, sin lo vencido antes de 2025 y sin SUPER TECHNO.
    kpis.push({ id: "cartera", etiqueta: "Cartera a crédito", valor: r2(c.total), formato: "usd", nota: `${c.facturas} documentos, sin contado` });
    kpis.push({ id: "vencido", etiqueta: "Cartera vencida", valor: r2(c.vencido), formato: "usd", mejor: "baja", nota: `${c.facturasVencidas} vencidas` });
    kpis.push({ id: "pct_vencido", etiqueta: "% vencido", valor: c.pct, formato: "pct", mejor: "baja", nota: "de la cartera a crédito" });
    graficas.push({
      id: "cartera_antiguedad",
      titulo: "Antigüedad de la cartera a crédito",
      descripcion: `Saldo por días vencidos al ${enCurso ? "día de hoy" : "cierre del mes"}, como el KPI de Cartera vencida de CxC: sin ventas de contado, sin lo vencido antes de 2025 ni SUPER TECHNO.`,
      tipo: "barras",
      formato: "usd",
      ancho: 2,
      datos: BANDAS.map((b) => ({ etiqueta: b.label, valor: r2(c.aging[b.key] || 0) })),
      series: [{ clave: "valor", etiqueta: "Saldo", color: PALETA[0] }],
      colorPorFila: BANDAS.map((b) => COLOR_BANDA[b.key]),
    });
    if (cids.length > 1) {
      graficas.push({
        id: "cartera_sede",
        titulo: "Cartera por sede",
        tipo: "apiladas_h",
        formato: "usd",
        datos: cids.map((id) => {
          const s = series.carteraHoyPorSede[id];
          return { etiqueta: NOMBRE_SEDE[id], corriente: r2((s?.total || 0) - (s?.vencido || 0)), vencido: r2(s?.vencido || 0) };
        }),
        series: [
          { clave: "corriente", etiqueta: "Por vencer", color: ESTADO.bien },
          { clave: "vencido", etiqueta: "Vencido", color: ESTADO.critico },
        ],
      });
    }
  }

  if (dias) {
    kpis.push({ id: "dso", etiqueta: "Días de cobro", valor: dias.cobro.dias, formato: "dias", mejor: "baja", nota: dias.cobro.motivo });
    graficas.push({
      id: "ciclo_caja",
      titulo: "Ciclo de caja",
      descripcion: "Días que tarda el dinero en volver: cobro + inventario − pago a proveedores. Sin intercompañía.",
      tipo: "barras",
      formato: "dias",
      datos: [
        { etiqueta: "Cobro", valor: dias.cobro.dias },
        { etiqueta: "Inventario", valor: dias.inventario.dias },
        { etiqueta: "Pago", valor: dias.pago.dias },
        { etiqueta: "Ciclo", valor: dias.ciclo },
      ],
      series: [{ clave: "valor", etiqueta: "Días", color: PALETA[0] }],
      colorPorFila: [PALETA[0], PALETA[2], PALETA[1], PALETA[6]],
    });
  }

  return { area: "cobranza", sede, mes, generado: new Date().toISOString(), kpis, graficas, avisos };
}
