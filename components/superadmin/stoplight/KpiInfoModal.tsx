"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";

interface KpiInfoModalProps {
  open: boolean;
  kpiId: string;
  title: string;
  onClose: () => void;
}

// Modal de "¿qué mide este KPI?" — solo texto, sin fetch ni estado propio.
// Extraído de StoplightReport.tsx (audit #23).
export default function KpiInfoModal({ open, kpiId, title, onClose }: KpiInfoModalProps) {
  const t = useTranslations("stoplight");
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-150" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 transition-colors"
          >
            <X size={18} className="text-slate-700" />
          </button>
        </div>
        <div className="text-sm text-slate-600 leading-relaxed space-y-3">
          {kpiId === "efectividad_cobranza" && (
            <>
              <p><strong>{t("info_que_mide")}</strong> Índice de Efectividad de Cobranza (CEI): qué parte de lo que se podía cobrar en el mes se cobró.</p>
              <p><strong>{t("info_formula")}</strong> (CxC inicial + Ventas a crédito − CxC final) ÷ (CxC inicial + Ventas a crédito − CxC final no vencida) × 100</p>
              <p><strong>Solo crédito:</strong> Facturas cuyo plazo de pago tiene días (7, 15, 30…); las de contado quedan fuera de los tres términos. Las notas de crédito siguen el plazo de la factura que revierten.</p>
              <p><strong>Numerador (recuperado):</strong> Lo que salió de la cartera en el mes: pagos (aunque todavía no estén aplicados a una factura), retenciones y descuentos.</p>
              <p><strong>CxC inicial / final no vencida:</strong> Saldo contable de la cuenta de clientes al empezar el mes, y lo que deben al cierre (o hoy, en el mes en curso) que todavía no vence y por eso no era exigible. Sin las facturas vencidas antes de 2025, sin Supricom y sin la empresa relacionada SUPER TECHNO LLC (su saldo se muestra aparte).</p>
              <p><strong>Ventas a crédito:</strong> Facturas a crédito menos sus notas de crédito emitidas en el período, con IVA.</p>
              <p><strong>{t("info_semaforo")}</strong> Verde ≥85% | Amarillo 75%–84.99% | Rojo &lt;75%</p>
            </>
          )}
          {kpiId === "cartera_vencida" && (
            <>
              <p><strong>{t("info_que_mide")}</strong> La proporción de cuentas por cobrar que ya superaron su fecha de vencimiento.</p>
              <p><strong>{t("info_formula")}</strong> Saldo vencido a la fecha de corte ÷ Cartera total abierta × 100</p>
              <p><strong>Saldo vencido:</strong> Suma de saldos residuales de facturas con fecha de vencimiento anterior a hoy.</p>
              <p><strong>Cartera total:</strong> Suma de todos los saldos residuales de facturas abiertas (con y sin vencer).</p>
              <p><strong>{t("info_semaforo")}</strong> Verde ≤10% | Amarillo 10.01%–20% | Rojo &gt;20%</p>
            </>
          )}
          {kpiId === "recuperacion_vencidos" && (
            <>
              <p><strong>{t("info_que_mide")}</strong> Cuánto de la deuda vencida que existía al inicio del mes se logró recuperar.</p>
              <p><strong>{t("info_formula")}</strong> Vencido recuperado ÷ Vencido inicial del mes × 100</p>
              <p><strong>Cohorte (vencido inicial):</strong> Fotografía de las facturas vencidas y sus saldos al inicio del mes. Las facturas que se vencen durante el mes no se incluyen en el denominador.</p>
              <p><strong>Vencido recuperado:</strong> Diferencia entre el saldo inicial de la cohorte y el saldo restante actual (pagos conciliados + notas de crédito).</p>
              <p><strong>{t("info_semaforo")}</strong> Verde ≥60% | Amarillo 30%–59.99% | Rojo &lt;30%</p>
            </>
          )}
          {kpiId === "dso" && (
            <>
              <p><strong>{t("info_que_mide")}</strong> Cuántos días tarda, en promedio, cada cliente en pagar lo que se le factura.</p>
              <p><strong>{t("info_formula")}</strong> DSO = CxC a crédito al cierre del mes ÷ Ventas a crédito del mes × Días del mes</p>
              <p><strong>Mismo período:</strong> los tres términos son del mes elegido; en el mes en curso, al día de hoy.</p>
              <p><strong>CxC y ventas:</strong> Las mismas de Efectividad (CEI): saldo contable a crédito sin Incobrables, Supricom ni SUPER TECHNO, y facturas a crédito menos notas de crédito, con IVA.</p>
              <p><strong>{t("info_semaforo")}</strong> Verde ≤45 días | Amarillo 46–60 días | Rojo &gt;60 días</p>
            </>
          )}
          {kpiId === "cumplimiento_cuota_ventas" && (
            <>
              <p><strong>{t("info_que_mide")}</strong> Avance del mes: cuánto se ha facturado frente a lo que se debería llevar a esta altura del mes. <strong>100% = al día</strong> para llegar a la cuota.</p>
              <p><strong>{t("info_formula")}</strong> Facturado del mes ÷ (Cuota mensual × días hábiles transcurridos ÷ días hábiles del mes) × 100</p>
              <p><strong>{t("info_semaforo")}</strong> Verde ≥100% (al día o adelantado) | Amarillo 70%–99.99% | Rojo &lt;70%</p>
            </>
          )}
          {kpiId === "clientes_nuevos" && (
            <>
              <p><strong>{t("info_que_mide")}</strong> Cantidad de clientes nuevos captados por los vendedores en el mes.</p>
              <p><strong>Definición:</strong> Cliente nuevo = partner cuya primera factura en Odoo es del mes actual.</p>
              <p><strong>Meta:</strong> Cada vendedor debe captar la cantidad asignada de clientes nuevos al mes.</p>
            </>
          )}
          {kpiId === "ciclo_reposicion" && (
            <>
              <p><strong>{t("info_que_mide")}</strong> Cada cuánto vuelve a comprar, en promedio, un cliente. Un ciclo que se alarga es una señal temprana de que un cliente se está yendo, antes de que deje de comprar del todo.</p>
              <p><strong>{t("info_formula")}</strong> Para cada cliente con 2 o más compras en los últimos 12 meses: promedio de días entre una factura y la siguiente. El KPI es el promedio de esos promedios entre todos los clientes.</p>
              <p><strong>Ventana:</strong> 12 meses hacia atrás, no el mes en curso — la mayoría de los clientes no compra todos los meses, así que un solo mes no alcanza para medir un ciclo.</p>
              <p>KPI informativo por ahora (sin peso ni meta por defecto): sirve para ver la tendencia antes de fijarle un objetivo.</p>
            </>
          )}
          {/* KPIs de Compras: lib/compras/kpis.ts. Cada semana se mide a su
              cierre (o hoy), con el stock de ese día. */}
          {kpiId === "variacion_costo_compra" && (
            <>
              <p><strong>{t("info_que_mide")}</strong> Si se está comprando más barato o más caro que antes.</p>
              <p><strong>{t("info_formula")}</strong> (Precio base − precio pagado) ÷ precio base × 100, ponderado por las unidades compradas en la semana. Positivo = se compró más barato.</p>
              <p><strong>Precio base:</strong> promedio ponderado de lo que se pagó por cada producto en los 90 días anteriores al mes. Solo cuentan los productos que se compraron en los dos períodos.</p>
              <p><strong>Compras:</strong> órdenes confirmadas de la sede, por fecha de confirmación, sin servicios. La cantidad es lo recibido más lo que falta por recibir: una orden recibida y devuelta al proveedor no cuenta.</p>
            </>
          )}
          {kpiId === "rotacion_saludable" && (
            <>
              <p><strong>{t("info_que_mide")}</strong> Qué parte del inventario disponible se vendió (sell-through a 90 días).</p>
              <p><strong>{t("info_formula")}</strong> Unidades vendidas en los 90 días al cierre de la semana ÷ (esas unidades + stock al cierre) × 100.</p>
              <p><strong>Ventas:</strong> facturas a clientes menos notas de crédito, sin intercompañía. <strong>Stock:</strong> almacén principal de la sede ese día (con la zona de Entrada), reconstruido desde los movimientos de Odoo.</p>
            </>
          )}
          {kpiId === "quiebre_inventario" && (
            <>
              <p><strong>{t("info_que_mide")}</strong> Cuántos días estuvieron sin stock los productos que se venden.</p>
              <p><strong>{t("info_formula")}</strong> Días sin stock ÷ días de productos elegibles × 100, día por día con el stock al cierre de cada día.</p>
              <p><strong>Elegibles:</strong> productos almacenables con venta en los 90 días anteriores al cierre de la semana.</p>
            </>
          )}
          {kpiId === "inventario_90_dias" && (
            <>
              <p><strong>{t("info_que_mide")}</strong> Qué parte del valor del inventario tiene más de 90 días en el almacén.</p>
              <p><strong>{t("info_formula")}</strong> Valor del stock que no entró en los últimos 90 días ÷ valor del stock × 100, a costo de Odoo.</p>
              <p><strong>Antigüedad:</strong> FIFO por recepción de compra: lo que queda en el almacén es lo último que se recibió; lo que no alcanzan a cubrir las recepciones de los últimos 90 días tiene más de 90 días. Lo devuelto al proveedor se descuenta de la recepción.</p>
            </>
          )}
          {!["efectividad_cobranza", "cartera_vencida", "recuperacion_vencidos", "dso", "cumplimiento_cuota_ventas", "clientes_nuevos", "ciclo_reposicion", "variacion_costo_compra", "rotacion_saludable", "quiebre_inventario", "inventario_90_dias"].includes(kpiId) && (
            <p>{t("info_default")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
