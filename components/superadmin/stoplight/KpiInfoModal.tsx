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
              <p><strong>{t("info_que_mide")}</strong> Cuánto se cobró de todo lo que era exigible durante el período.</p>
              <p><strong>{t("info_formula")}</strong> Monto cobrado ÷ Monto exigible × 100</p>
              <p><strong>{t("info_monto_exigible")}</strong> Saldo total de facturas cuya fecha de vencimiento es anterior o igual al final del período, incluyendo saldos vencidos anteriores que permanecían abiertos.</p>
              <p><strong>{t("info_monto_cobrado")}</strong> Pagos efectivamente conciliados contra facturas incluidas en el monto exigible.</p>
              <p><strong>{t("info_semaforo")}</strong> Verde ≥95% | Amarillo 85%–94.99% | Rojo &lt;85%</p>
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
              <p><strong>{t("info_que_mide")}</strong> Cuántos días tarda la empresa en convertir sus ventas a crédito en efectivo.</p>
              <p><strong>{t("info_formula")}</strong> Cartera abierta a la fecha de corte ÷ Ventas netas a crédito del período × Días del período</p>
              <p><strong>Ventas netas a crédito:</strong> Total de facturas tipo "out_invoice" (excluyendo notas de crédito) de los últimos 90 días.</p>
              <p><strong>Período:</strong> Se usa ventana móvil de 90 días para reducir volatilidad.</p>
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
          {!["efectividad_cobranza", "cartera_vencida", "recuperacion_vencidos", "dso", "cumplimiento_cuota_ventas", "clientes_nuevos", "ciclo_reposicion"].includes(kpiId) && (
            <p>{t("info_default")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
