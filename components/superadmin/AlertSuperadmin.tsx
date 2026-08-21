"use client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertCircle,
  ArrowDown,
  Building2,
  ChevronRight,
  Clock,
  DollarSign,
  Download,
  RefreshCw,
  RotateCcw,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react"; // IMPORTANTE: Agregado para controlar la empresa actual
import useSWR from "swr";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { useAuthStore } from "@/lib/stores/auth.store";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function ProductDeclineDetailView({ item }: { item: any }) {
  const t = useTranslations("superadmin.alert");
  return (
    <div className="space-y-4">
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2">
        <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-1">
          {t("caida_ventas")}
        </h4>
        <div className="grid grid-cols-2 gap-y-1 text-sm">
          <span className="text-slate-500">{t("caida_estimada")}</span>
          <span className="font-mono font-bold text-red-600 text-right sm:text-left">
            {item.decline_pct}%
          </span>

          <span className="text-slate-500">{t("periodo_anterior")}</span>
          <span className="font-mono text-right sm:text-left">{item.prior_qty}</span>

          <span className="text-slate-500">{t("periodo_actual")}</span>
          <span className="font-mono text-right sm:text-left">{item.current_qty}</span>

          <span className="text-slate-500">{t("anterior_usd")}</span>
          <span className="font-mono text-right sm:text-left">
            {item.prior_amount?.toLocaleString() || "0"} $
          </span>

          <span className="text-slate-500">{t("actual_usd")}</span>
          <span className="font-mono text-right sm:text-left">
            {item.current_amount?.toLocaleString() || "0"} $
          </span>
        </div>
      </div>

      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2">
        <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-1">
          {t("ultima_venta")}
        </h4>
        <div className="grid grid-cols-2 gap-y-1 text-sm">
          <span className="text-slate-500">{t("fecha")}</span>
          <span className="font-mono font-medium text-right sm:text-left">
            {item.last_sale_date || "—"}
          </span>

          <span className="text-slate-500">{t("cliente_label")}</span>
          <span className="font-medium text-right sm:text-left">
            {item.last_client || "—"}
          </span>

          <span className="text-slate-500">{t("monto_facturado")}</span>
          <span className="font-mono font-bold text-right sm:text-left">
            {item.last_client_amount?.toLocaleString() || "0"} $
          </span>

          <span className="text-slate-500">{t("mejor_vendedor")}</span>
          <span className="font-medium text-right sm:text-left">
            {item.top_seller || "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

function ProductDetailView({ item }: { item: any }) {
  const t = useTranslations("superadmin.alert");
  return (
    <div className="space-y-4">
      <img
        src={`data:image/png;base64,${item.image_1920}`}
        alt={item.name}
        className="rounded-xl w-full h-48 object-cover shadow-sm border"
      />
      <div className="bg-slate-50 p-4 rounded-lg space-y-2">
        <h4 className="font-bold text-slate-800 text-sm uppercase">
          {t("trazabilidad")}
        </h4>
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">{t("stock_actual")}</span>
          <span className="font-mono font-bold">{item.qty_available}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">{t("ultima_caida")}</span>
          <span className="font-mono font-bold">
            {item.last_drop_date || "N/A"}
          </span>
        </div>
      </div>
    </div>
  );
}

function MoraAvanzadaDetailView({ item }: { item: any }) {
  const t = useTranslations("superadmin.alert");
  const diasVencido = item.invoice_date_due
    ? Math.floor((Date.now() - new Date(item.invoice_date_due).getTime()) / (1000 * 60 * 60 * 24))
    : 0;
  return (
    <div className="space-y-4">
      <div className="bg-slate-50 p-4 rounded-xl border border-red-100 space-y-2">
        <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-1">
          {t("mora_avanzada")}
        </h4>
        <div className="grid grid-cols-2 gap-y-1 text-sm">
          <span className="text-slate-500">{t("cliente_label")}</span>
          <span className="font-medium text-right sm:text-left">{item.partner_id?.[1] || "—"}</span>

          <span className="text-slate-500">{t("factura")}</span>
          <span className="font-mono text-right sm:text-left">{item.name || "—"}</span>

          <span className="text-slate-500">{t("vencimiento")}</span>
          <span className="font-mono text-red-600 font-semibold text-right sm:text-left">{item.invoice_date_due}</span>

          <span className="text-slate-500">{t("dias_vencido")}</span>
          <span className="font-mono font-bold text-red-600 text-right sm:text-left">{diasVencido} {t("dias")}</span>

          <span className="text-slate-500">{t("vendedor")}</span>
          <span className="font-medium text-right sm:text-left">{item.invoice_user_id?.[1] || "—"}</span>

          <span className="text-slate-500 font-semibold">{t("monto_adeudado")}</span>
          <span className="font-bold text-slate-900 text-right sm:text-left">{item.amount_total?.toLocaleString() || "0"} $</span>
        </div>
      </div>
      {Array.isArray(item.invoice_line_ids) && item.invoice_line_ids.length > 0 && (
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
          <div className="bg-slate-100/70 px-4 py-2 border-b border-slate-200">
            <h5 className="font-bold text-slate-700 text-xs uppercase">{t("productos_label")}</h5>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b text-slate-400 text-xs font-semibold uppercase">
                  <th className="p-3 pl-4">{t("producto")}</th>
                  <th className="p-3 text-center">{t("cant")}</th>
                  <th className="p-3 text-right pr-4">{t("monto")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {item.invoice_line_ids.map((line: any, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3 pl-4 font-medium max-w-[200px] truncate">
                      {Array.isArray(line.product_id) ? line.product_id[1] : line.name || t("producto")}
                    </td>
                    <td className="p-3 text-center font-mono font-medium">{line.quantity || 0}</td>
                    <td className="p-3 text-right pr-4 font-mono font-bold">{line.price_subtotal?.toFixed(2) || "0.00"} $</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function DevolucionDetailView({ item }: { item: any }) {
  const t = useTranslations("superadmin.alert");
  return (
    <div className="space-y-4">
      <div className="bg-slate-50 p-4 rounded-xl border border-orange-100 space-y-2">
        <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-1">
          {t("nota_credito")}
        </h4>
        <div className="grid grid-cols-2 gap-y-1 text-sm">
          <span className="text-slate-500">{t("cliente_label")}</span>
          <span className="font-medium text-right sm:text-left">{item.partner_id?.[1] || "—"}</span>

          <span className="text-slate-500">{t("documento")}</span>
          <span className="font-mono text-right sm:text-left">{item.name || "—"}</span>

          <span className="text-slate-500">{t("fecha")}</span>
          <span className="font-mono text-right sm:text-left">{item.invoice_date || "—"}</span>

          <span className="text-slate-500">{t("vendedor")}</span>
          <span className="font-medium text-right sm:text-left">{item.invoice_user_id?.[1] || "—"}</span>

          <span className="text-slate-500 font-semibold">{t("monto")}</span>
          <span className="font-bold text-orange-600 text-right sm:text-left">{item.amount_total?.toLocaleString() || "0"} $</span>
        </div>
      </div>
      {Array.isArray(item.invoice_line_ids) && item.invoice_line_ids.length > 0 && (
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
          <div className="bg-slate-100/70 px-4 py-2 border-b border-slate-200">
            <h5 className="font-bold text-slate-700 text-xs uppercase">{t("productos_devueltos")}</h5>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b text-slate-400 text-xs font-semibold uppercase">
                  <th className="p-3 pl-4">{t("producto")}</th>
                  <th className="p-3 text-center">{t("cant")}</th>
                  <th className="p-3 text-right pr-4">{t("monto")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {item.invoice_line_ids.map((line: any, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3 pl-4 font-medium max-w-[200px] truncate">
                      {Array.isArray(line.product_id) ? line.product_id[1] : line.name || t("producto")}
                    </td>
                    <td className="p-3 text-center font-mono font-medium">{line.quantity || 0}</td>
                    <td className="p-3 text-right pr-4 font-mono font-bold">{line.price_subtotal?.toFixed(2) || "0.00"} $</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function VendedorCuotaAlertaDetailView({ item }: { item: any }) {
  const t = useTranslations("superadmin.alert");
  const deficitPct = item.falta_pct || 0;
  const progressPct = item.cuota > 0 ? Math.round((item.facturado / item.expected) * 100) : 0;
  return (
    <div className="space-y-4">
      <div className="bg-slate-50 p-4 rounded-xl border border-red-100 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
            {t("incumplimiento_cuota")}
          </h4>
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
            {t("deficit")} {deficitPct}%
          </span>
        </div>

        <div className="grid grid-cols-2 gap-y-1 text-sm">
          <span className="text-slate-500">{t("vendedor")}</span>
          <span className="font-semibold text-right sm:text-left">{item.name}</span>

          <span className="text-slate-500">{t("sucursal")}</span>
          <span className="font-medium text-right sm:text-left">{item.sucursal}</span>

          <span className="text-slate-500">{t("cuota_mensual")}</span>
          <span className="font-mono font-bold text-right sm:text-left">{item.cuota?.toLocaleString()} $</span>

          <span className="text-slate-500">{t("minimo_diario")}</span>
          <span className="font-mono text-right sm:text-left">{item.daily_min?.toLocaleString()} $/día</span>

          <span className="text-slate-500">{t("esperado_hoy")}</span>
          <span className="font-mono font-semibold text-right sm:text-left">{item.expected?.toLocaleString()} $</span>

          <span className="text-slate-500">{t("facturado_real")}</span>
          <span className="font-mono font-bold text-red-600 text-right sm:text-left">{item.facturado?.toLocaleString()} $</span>

          <span className="text-slate-500">{t("deficit")}</span>
          <span className="font-mono font-bold text-red-600 text-right sm:text-left">-{item.falta?.toLocaleString()} $</span>
        </div>

        <div className="pt-2">
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span>{t("progreso_esperado")}</span>
            <span className="font-bold text-slate-700">{progressPct}%</span>
          </div>
          <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden shadow-inner">
            <div
              className="h-full rounded-full bg-red-500"
              style={{ width: `${Math.min(progressPct, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs mt-1">
            <span className="text-red-500 font-semibold">$ 0</span>
            <span className="text-slate-400">$ {item.expected?.toLocaleString()}</span>
          </div>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
          <p className="text-sm font-bold text-red-700">
            {t("faltan_cuota_diaria", { amount: item.falta?.toLocaleString() || "0" })}
          </p>
          <p className="text-xs text-red-600 mt-0.5">
            {t("necesita_facturar", { amount: item.daily_min?.toLocaleString() || "0" })}
          </p>
        </div>
      </div>
    </div>
  );
}

function InactiveClientDetailView({ item }: { item: any }) {
  const t = useTranslations("superadmin.alert");
  const riskColor =
    item.risk === "Crítico"
      ? "text-red-600 bg-red-50 border-red-200"
      : item.risk === "Alto"
        ? "text-orange-600 bg-orange-50 border-orange-200"
        : item.risk === "Medio"
          ? "text-amber-600 bg-amber-50 border-amber-200"
          : "text-slate-500 bg-slate-50 border-slate-200";

  return (
    <div className="space-y-4">
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2">
        <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-1">
          {t("informacion_cliente")}
        </h4>
        <div className="grid grid-cols-2 gap-y-1 text-sm">
          <span className="text-slate-500">{t("cliente_label")}</span>
          <span className="font-medium text-right sm:text-left">{item.name}</span>

          <span className="text-slate-500">{t("estado")}</span>
          <span className="text-right sm:text-left">
            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold border ${riskColor}`}>
              {item.risk || t("inactivo")}
            </span>
          </span>

          <span className="text-slate-500">{t("dias_sin_comprar")}</span>
          <span className="font-mono font-bold text-right sm:text-left text-red-600">
            {item.days_inactive} {t("dias")}
          </span>
        </div>
      </div>

      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2">
        <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-1">
          {t("ultima_compra")}
        </h4>
        <div className="grid grid-cols-2 gap-y-1 text-sm">
          <span className="text-slate-500">{t("fecha")}</span>
          <span className="font-mono font-medium text-right sm:text-left">
            {item.last_sale_date || "N/A"}
          </span>

          <span className="text-slate-500">{t("factura_ref")}</span>
          <span className="font-mono text-right sm:text-left">
            {item.last_order_ref || "N/A"}
          </span>

          <span className="text-slate-500">{t("vendedor")}</span>
          <span className="font-medium text-right sm:text-left">
            {item.salesperson || t("no_asignado")}
          </span>

          <span className="text-slate-500">{t("producto_detalle")}</span>
          <span className="font-medium text-right sm:text-left">
            {item.top_product || "—"}
          </span>

          <span className="text-slate-500 font-semibold">{t("monto_facturado")}</span>
          <span className="font-bold text-slate-900 text-right sm:text-left">
            {item.last_order_amount?.toLocaleString() || "0"} $
          </span>
        </div>
      </div>

      {!item.single_order && (
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2">
          <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-1">
            {t("historial_general")}
          </h4>
          <div className="grid grid-cols-2 gap-y-1 text-sm">
            <span className="text-slate-500">{t("promedio_compra")}</span>
            <span className="font-mono font-medium text-right sm:text-left">
              {item.avg_order_amount?.toLocaleString() || "—"} $
            </span>

            <span className="text-slate-500">{t("total_facturado_label")}</span>
            <span className="font-mono font-bold text-right sm:text-left">
              {item.total_spent?.toLocaleString() || "0"} $
            </span>

            <span className="text-slate-500">{t("umbral_alerta")}</span>
            <span className="font-mono text-right sm:text-left">
              {item.threshold || "—"} {t("dias")}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function InvoiceDetailView({ item }: { item: any }) {
  const t = useTranslations("superadmin.alert");
  // Aseguramos que las líneas sean un array válido para iterar
  const lineas = Array.isArray(item.invoice_line_ids)
    ? item.invoice_line_ids
    : [];

  return (
    <div className="space-y-4">
      {/* Información General de la Factura */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2">
        <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-1">
          {t("detalles_factura")}
        </h4>
        <div className="grid grid-cols-2 gap-y-1 text-sm">
          <span className="text-slate-500">{t("cliente_label")}</span>
          <span className="font-medium text-right sm:text-left">
            {item.partner_id?.[1] || t("sin_cliente")}
          </span>

          <span className="text-slate-500">{t("vendedor")}</span>
          <span className="font-medium text-slate-700 text-right sm:text-left">
            {item.invoice_user_id?.[1] || t("no_asignado")}
          </span>

          <span className="text-slate-500">{t("vencimiento")}</span>
          <span className="font-mono text-right sm:text-left">
            {item.invoice_date_due}
          </span>

          <span className="text-slate-500 font-semibold">{t("monto_facturado")}</span>
          <span className="font-bold text-slate-900 text-right sm:text-left">
            {item.amount_total} $
          </span>
        </div>
      </div>

      {/* Desglose de Productos */}
      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
        <div className="bg-slate-100/70 px-4 py-2 border-b border-slate-200">
          <h5 className="font-bold text-slate-700 text-xs uppercase tracking-wider">
            {t("productos_facturados_label")}
          </h5>
        </div>

        {lineas.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-150 text-slate-400 text-xs font-semibold uppercase">
                  <th className="p-3 pl-4">{t("producto")}</th>
                  <th className="p-3 text-center">{t("cant")}</th>
                  <th className="p-3 text-right pr-4">{t("monto")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {lineas.map((line: any, idx: number) => (
                  <tr
                    key={idx}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    {/* Odoo suele enviar [id, "Nombre del Producto"] */}
                    <td className="p-3 pl-4 font-medium max-w-[200px] truncate">
                      {Array.isArray(line.product_id)
                        ? line.product_id[1]
                        : line.name || t("producto")}
                    </td>
                    <td className="p-3 text-center font-mono font-medium text-slate-600">
                      {line.quantity || 0}
                    </td>
                    <td className="p-3 text-right pr-4 font-mono font-bold text-slate-900">
                      {line.price_subtotal?.toFixed(2) || "0.00"} $
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-4 text-center text-xs text-slate-400 italic">
            {t("lineas_detalle")}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AlertSuperadmin({ cidsLocked = false }: { cidsLocked?: boolean } = {}) {
  const t = useTranslations("superadmin.alert");
  const { user } = useAuthStore();

  // Controlamos la empresa seleccionada (por defecto 'valencia')
  const [empresa, setEmpresa] = useState("valencia");

  // Pasamos el query param directamente en la key de SWR
  const swrKey = cidsLocked && user?.cids
    ? `/api/superadmin/alert?cids=${user.cids}`
    : `/api/superadmin/alert?empresa=${empresa}`;
  const { data, error, isLoading, mutate } = useSWR(
    swrKey,
    fetcher,
    { refreshInterval: 300000 },
  );

  const empresasDisponibles = [
    { id: "valencia", label: "Valencia" },
    { id: "caracas", label: "Caracas" },
    { id: "panama", label: "Panamá" },
  ];

  const exportCaidaProductos = async (items: any[]) => {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Supricom";
    wb.created = new Date();
    const ws = wb.addWorksheet("Caída de Productos", { views: [{ state: "frozen", ySplit: 1 }] });

    ws.columns = [
      { header: "Producto", key: "name", width: 40 },
      { header: "Caída %", key: "decline_pct", width: 12 },
      { header: "Período Anterior (uds)", key: "prior_qty", width: 20 },
      { header: "Período Actual (uds)", key: "current_qty", width: 20 },
      { header: "Anterior (USD)", key: "prior_amount", width: 18 },
      { header: "Actual (USD)", key: "current_amount", width: 18 },
      { header: "Última Venta", key: "last_sale_date", width: 15 },
      { header: "Último Cliente", key: "last_client", width: 25 },
      { header: "Monto Última Venta", key: "last_client_amount", width: 20 },
      { header: "Mejor Vendedor", key: "top_seller", width: 25 },
    ];

    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF7C3AED" } };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };

    items.forEach((item) => {
      ws.addRow({
        name: item.name || "—",
        decline_pct: item.decline_pct ?? 0,
        prior_qty: item.prior_qty ?? 0,
        current_qty: item.current_qty ?? 0,
        prior_amount: item.prior_amount ?? 0,
        current_amount: item.current_amount ?? 0,
        last_sale_date: item.last_sale_date || "—",
        last_client: item.last_client || "—",
        last_client_amount: item.last_client_amount ?? 0,
        top_seller: item.top_seller || "—",
      });
    });

    ws.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        row.eachCell((cell, colNumber) => {
          cell.border = {
            top: { style: "thin", color: { argb: "FFE5E7EB" } },
            bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
            left: { style: "thin", color: { argb: "FFE5E7EB" } },
            right: { style: "thin", color: { argb: "FFE5E7EB" } },
          };
          if (colNumber === 2) {
            cell.font = { bold: true, color: { argb: "FFDC2626" } };
            cell.numFmt = '0.0"%"';
          }
          if (colNumber === 5 || colNumber === 6 || colNumber === 9) {
            cell.numFmt = '#,##0.00';
          }
          if (colNumber === 3 || colNumber === 4) {
            cell.numFmt = '#,##0';
          }
        });
      }
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const fecha = new Date().toISOString().split("T")[0];
    saveAs(blob, `Caida_Productos_${empresa}_${fecha}.xlsx`);
  };

  const [devolucionesPeriodo, setDevolucionesPeriodo] = useState<string>("24h");

  const devolucionesFiltradas = (() => {
    const raw = data?.alertas?.devoluciones_recientes;
    if (!Array.isArray(raw)) return [];
    const now = new Date();
    if (devolucionesPeriodo === "24h") {
      const hace24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      return raw.filter((d: any) => d.invoice_date && new Date(d.invoice_date) >= hace24h);
    }
    if (devolucionesPeriodo === "7d") {
      const hace7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return raw.filter((d: any) => d.invoice_date && new Date(d.invoice_date) >= hace7d);
    }
    if (devolucionesPeriodo === "30d") {
      return raw;
    }
    if (/^\d{4}-\d{2}$/.test(devolucionesPeriodo)) {
      return raw.filter((d: any) => d.invoice_date?.startsWith(devolucionesPeriodo));
    }
    return raw;
  })();

  const devolucionesDesc = (() => {
    if (devolucionesPeriodo === "24h") return t("horas");
    if (devolucionesPeriodo === "7d") return t("dias_7");
    if (devolucionesPeriodo === "30d") return t("dias_30");
    if (/^\d{4}-\d{2}$/.test(devolucionesPeriodo)) {
      const [y, m] = devolucionesPeriodo.split("-");
      const meses = t.raw("meses") as string[];
      return `${meses[parseInt(m)]} ${y}`;
    }
    return t("filtrado");
  })();

  const devolucionesMeses = (() => {
    const raw = data?.alertas?.devoluciones_recientes;
    if (!Array.isArray(raw)) return [];
    const mesesSet = new Set<string>();
    raw.forEach((d: any) => {
      if (d.invoice_date) mesesSet.add(d.invoice_date.substring(0, 7));
    });
    return Array.from(mesesSet).sort().reverse();
  })();

  return (
    <div className="space-y-6 p-8 bg-slate-50/50 min-h-screen">
      {/* Encabezado Principal */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">
            {t("centro_control")}
          </h2>
          <p className="text-slate-500">
            {t("monitoreo")}
          </p>
        </div>
        <button
          onClick={() => mutate()}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 transition-all font-medium text-sm self-stretch sm:self-auto justify-center"
        >
          <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />{" "}
          {t("actualizar")}
        </button>
      </div>

      {/* FILTRO DE EMPRESAS INDEPENDIENTE */}
      {!cidsLocked && (
      <div className="flex p-1 bg-slate-200/60 rounded-xl max-w-md shadow-inner">
        {empresasDisponibles.map((emp) => (
          <button
            key={emp.id}
            onClick={() => setEmpresa(emp.id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 text-sm font-semibold rounded-lg transition-all ${
              empresa === emp.id
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Building2 size={15} />
            {emp.label}
          </button>
        ))}
      </div>
      )}

      {/* Contenido / Estado de Carga */}
      {isLoading ? (
        <div className="p-20 text-center font-bold text-slate-400 uppercase animate-pulse tracking-wider">
          {t("loading")}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          <AlertCard
            title={t("clientes_inactivos")}
            icon={<Users className="text-blue-500" />}
            data={data?.alertas?.inactividad_clientes}
            desc={t("mas_30_90")}
            gradient="from-blue-50 to-white"
            severity={data?.alertas?.inactividad_clientes?.length}
          />
          <AlertCard
            title={t("facturas_vencer")}
            icon={<Clock className="text-amber-500" />}
            data={data?.alertas?.vencimiento_facturas}
            desc={t("proximos_3")}
            gradient="from-amber-50 to-white"
            severity={data?.alertas?.vencimiento_facturas?.length}
          />
          <AlertCard
            title={t("vendedores_sin_actividad")}
            icon={<AlertCircle className="text-red-500" />}
            data={data?.alertas?.vendedores_inactivos}
            desc={t("sin_facturas_hoy")}
            gradient="from-red-50 to-white"
            severity={data?.alertas?.vendedores_inactivos?.length}
          />
          <AlertCard
            title={t("caida_productos")}
            icon={<TrendingDown className="text-purple-500" />}
            data={data?.alertas?.productos_alerta}
            desc={t("productos_estrella")}
            gradient="from-purple-50 to-white"
            severity={data?.alertas?.productos_alerta?.length}
            onExport={exportCaidaProductos}
          />
          <AlertCard
            title={t("mora_avanzada")}
            icon={<ArrowDown className="text-red-500" />}
            data={data?.alertas?.mora_avanzada}
            desc={t("facturas_30")}
            gradient="from-red-50 to-white"
            severity={data?.alertas?.mora_avanzada?.length}
          />
          <AlertCard
            title={t("devoluciones")}
            icon={<RotateCcw className="text-orange-500" />}
            data={devolucionesFiltradas}
            desc={devolucionesDesc}
            gradient="from-orange-50 to-white"
            severity={devolucionesFiltradas.length}
            filterSlot={
              <div className="flex flex-wrap items-center gap-2">
                {["24h", "7d", "30d"].map((p) => (
                  <button
                    key={p}
                    onClick={() => setDevolucionesPeriodo(p)}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-colors ${
                      devolucionesPeriodo === p
                        ? "bg-orange-500 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {p === "24h" ? "24h" : p === "7d" ? t("dias_7") : t("dias_30")}
                  </button>
                ))}
                <select
                  value={["24h", "7d", "30d"].includes(devolucionesPeriodo) ? "" : devolucionesPeriodo}
                  onChange={(e) => setDevolucionesPeriodo(e.target.value)}
                  className="px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-orange-300 focus:border-orange-400 focus:outline-none transition-colors cursor-pointer"
                >
                  <option value="" disabled>{t("por_mes")}</option>
                  {devolucionesMeses.map((m) => {
                    const [y, mo] = m.split("-");
                    const meses = t.raw("meses") as string[];
                    return <option key={m} value={m}>{meses[parseInt(mo)]} {y}</option>;
                  })}
                </select>
              </div>
            }
          />
          <AlertCard
            title={t("facturas_debajo_minimo")}
            icon={<DollarSign className="text-amber-500" />}
            data={data?.alertas?.facturas_bajo_minimo}
            desc={t("menos_200")}
            gradient="from-amber-50 to-white"
            severity={data?.alertas?.facturas_bajo_minimo?.length}
          />
          <AlertCard
            title={t("vendedores_cuota")}
            icon={<TrendingUp className="text-red-500" />}
            data={data?.alertas?.vendedores_cuota_alerta}
            desc={t("no_alcanzan")}
            gradient="from-red-50 to-white"
            severity={data?.alertas?.vendedores_cuota_alerta?.length}
          />
        </div>
      )}
    </div>
  );
}

// ── Mini gráfico de barras SVG inline ──
function MiniBarChart({ data, color = "#3b82f6" }: { data: number[]; color?: string }) {
  if (!data || data.length === 0) return null;
  const w = 64, h = 24, bars = data.slice(0, 8);
  const max = Math.max(...bars, 1);
  const barW = Math.max(4, Math.floor((w - bars.length + 1) / bars.length));
  const gap = 1;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-16 h-6 shrink-0">
      {bars.map((v, i) => {
        const barH = Math.max(2, (v / max) * (h - 2));
        const x = i * (barW + gap);
        const y = h - 2 - barH;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barW}
            height={barH}
            rx={1}
            fill={color}
            opacity={0.7 + (i / bars.length) * 0.3}
          />
        );
      })}
    </svg>
  );
}

function FacturaBajoMinimoDetailView({ item }: { item: any }) {
  const t = useTranslations("superadmin.alert");
  const lineas = Array.isArray(item.invoice_line_ids) ? item.invoice_line_ids : [];
  return (
    <div className="space-y-4">
      <div className="bg-slate-50 p-4 rounded-xl border border-amber-100 space-y-2">
        <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-1">
          {t("facturas_debajo_minimo")}
        </h4>
        <div className="grid grid-cols-2 gap-y-1 text-sm">
          <span className="text-slate-500">{t("cliente_label")}</span>
          <span className="font-medium text-right sm:text-left">{item.partner_id?.[1] || "—"}</span>

          <span className="text-slate-500">{t("factura")}</span>
          <span className="font-mono text-right sm:text-left">{item.name || "—"}</span>

          <span className="text-slate-500">{t("fecha")}</span>
          <span className="font-mono text-right sm:text-left">{item.invoice_date || "—"}</span>

          <span className="text-slate-500">{t("vendedor")}</span>
          <span className="font-medium text-right sm:text-left">{item.invoice_user_id?.[1] || "—"}</span>

          <span className="text-slate-500 font-semibold">Monto Facturado:</span>
          <span className="font-bold text-amber-600 text-right sm:text-left">{item.amount_total?.toLocaleString() || "0"} $</span>
        </div>
      </div>

      {lineas.length > 0 && (
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
          <div className="bg-slate-100/70 px-4 py-2 border-b border-slate-200">
            <h5 className="font-bold text-slate-700 text-xs uppercase">{t("productos_facturados_label")}</h5>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b text-slate-400 text-xs font-semibold uppercase">
                  <th className="p-3 pl-4">{t("producto")}</th>
                  <th className="p-3 text-center">{t("cant")}</th>
                  <th className="p-3 text-right pr-4">{t("monto")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {lineas.map((line: any, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3 pl-4 font-medium max-w-[200px] truncate">
                      {Array.isArray(line.product_id) ? line.product_id[1] : line.name || t("producto")}
                    </td>
                    <td className="p-3 text-center font-mono font-medium">{line.quantity || 0}</td>
                    <td className="p-3 text-right pr-4 font-mono font-bold">{line.price_subtotal?.toFixed(2) || "0.00"} $</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Detalle vendedor sin actividad ──
function VendedorSinActividadDetailView({ item }: { item: any }) {
  const t = useTranslations("superadmin.alert");
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 bg-white rounded-xl border border-slate-100">
          <p className="text-xs text-slate-500 mb-1">{t("facturado_mes")}</p>
          <p className="text-2xl font-bold text-slate-900">
            {item.amount_this_month?.toLocaleString()} $
          </p>
        </div>
        <div className="p-4 bg-white rounded-xl border border-slate-100">
          <p className="text-xs text-slate-500 mb-1">{t("ultima_factura")}</p>
          <p className="text-sm font-semibold text-slate-700">
            {item.last_invoice_date || "—"}
          </p>
        </div>
      </div>
      <div className="p-4 bg-white rounded-xl border border-slate-100 space-y-3">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          {t("detalles_ultima")}
        </h4>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">{t("cliente")}</span>
          <span className="font-semibold text-slate-700">{item.last_invoice_client || "—"}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">{t("monto")}</span>
          <span className="font-mono font-bold text-slate-700">
            {item.last_invoice_amount?.toLocaleString()} $
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">{t("mejor_cliente")}</span>
          <span className="font-semibold text-slate-700">{item.top_client || "—"}</span>
        </div>
      </div>
      {item.last_sale_lines && item.last_sale_lines.length > 0 && (
        <div className="p-4 bg-white rounded-xl border border-slate-100">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
            {t("productos_facturados")}</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 text-xs">
                  <th className="p-2 pl-0 text-left font-medium">{t("producto")}</th>
                  <th className="p-2 text-center font-medium">{t("cant")}</th>
                  <th className="p-2 pr-0 text-right font-medium">{t("monto")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {item.last_sale_lines.map((line: any, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-50/80">
                    <td className="p-2 pl-0 font-medium text-slate-700 truncate max-w-[180px]">
                      {Array.isArray(line.product_id) ? line.product_id[1] : line.name || t("producto")}
                    </td>
                    <td className="p-2 text-center font-mono text-slate-600">
                      {line.quantity || 0}
                    </td>
                    <td className="p-2 pr-0 text-right font-mono font-bold text-slate-700">
                      {(line.price_subtotal || 0).toFixed(2)} $
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function AlertCard({ title, icon, data, desc, gradient, severity = 0, onExport, filterSlot }: any) {
  const t = useTranslations("superadmin.alert");
  const list = Array.isArray(data) ? data : [];

  const severityLevel = severity > 10 ? "high" : severity > 3 ? "medium" : severity > 0 ? "low" : "none";
  const borderColor =
    severityLevel === "high"
      ? "border-l-red-500 border-t-red-200 border-r-red-200 border-b-red-200"
      : severityLevel === "medium"
        ? "border-l-amber-500 border-t-amber-200 border-r-amber-200 border-b-amber-200"
        : severityLevel === "low"
          ? "border-l-blue-500 border-t-blue-100 border-r-blue-100 border-b-blue-100"
          : "border-l-slate-300";

  return (
    <Dialog>
      <DialogTrigger asChild>
        <div
          className={`group relative p-6 rounded-2xl border-2 ${borderColor} bg-gradient-to-br ${gradient} shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer overflow-hidden`}
        >
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <div className="scale-150">{icon}</div>
          </div>
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-white rounded-xl shadow-sm border border-slate-100">
              {icon}
            </div>
            <span className={`text-4xl font-extrabold tracking-tighter text-slate-900 ${severity > 0 ? "animate-pulse" : ""}`}>
              {list.length}
            </span>
          </div>
          <h3 className="text-sm font-bold text-slate-800 tracking-wide uppercase">
            {title}
          </h3>
          <p className="text-xs text-slate-400 mt-1">{desc}</p>
          <div className="mt-4 flex items-center justify-between">
            <span className="flex items-center text-xs font-semibold text-slate-600 group-hover:translate-x-1 transition-transform">
              {t("ver_detalle")} <ChevronRight size={14} className="ml-1" />
            </span>
            {list.length > 3 && (
              <MiniBarChart
                data={list.slice(0, 8).map((_: any, idx: number) => list.length - idx)}
                color={severityLevel === "high" ? "#ef4444" : severityLevel === "medium" ? "#f59e0b" : "#3b82f6"}
              />
            )}
          </div>
        </div>
      </DialogTrigger>

      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-bold">{title}</DialogTitle>
            {onExport && list.length > 0 && (
              <button
                onClick={() => onExport(list)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors"
              >
                <Download size={14} />
                {t("exportar_excel")}
              </button>
            )}
          </div>
          <DialogDescription className="sr-only">
            {t("detalle_title", { title: title.toLowerCase() })}
          </DialogDescription>
        </DialogHeader>

        {filterSlot && <div className="mb-3">{filterSlot}</div>}

        <div className="max-h-[60vh] overflow-y-auto pr-2 space-y-3 mt-4">
          {list.length > 0 ? (
            list.map((item: any, i: number) => (
              <Dialog key={i}>
                <DialogTrigger asChild>
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center cursor-pointer hover:border-blue-400 transition-all">
                    <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                      <span className="text-sm font-medium truncate">
                        {item.name || item.partner_id?.[1] || "—"}
                      </span>
                      {item.days_inactive !== undefined && (
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <span>{item.days_inactive} {t("dias")}</span>
                          {item.salesperson && <span>• {item.salesperson}</span>}
                          {item.risk && (
                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                              item.risk === "Crítico"
                                ? "text-red-600 bg-red-100"
                                : item.risk === "Alto"
                                  ? "text-orange-600 bg-orange-100"
                                  : item.risk === "Medio"
                                    ? "text-amber-600 bg-amber-100"
                                    : "text-slate-500 bg-slate-100"
                            }`}>
                              {item.risk}
                            </span>
                          )}
                        </div>
                      )}
                      {item.decline_pct !== undefined && (
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <span className="text-red-500 font-semibold">-{item.decline_pct}%</span>
                          {item.last_client && <span>• {item.last_client}</span>}
                          {item.top_seller && <span>• {item.top_seller}</span>}
                        </div>
                      )}
                      {item.invoice_date_due && item.days_inactive === undefined && (
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <span>{t("vence")} {item.invoice_date_due}</span>
                          <span className="text-red-500 font-semibold">
                            {Math.floor((Date.now() - new Date(item.invoice_date_due).getTime()) / (1000 * 60 * 60 * 24)) > 0
                              ? `• ${Math.floor((Date.now() - new Date(item.invoice_date_due).getTime()) / (1000 * 60 * 60 * 24))} ${t("dias_vencido_suffix")}`
                              : ""}
                          </span>
                          {item.invoice_user_id?.[1] && <span>• {item.invoice_user_id[1]}</span>}
                        </div>
                      )}
                      {item.invoice_date && !item.invoice_date_due && (
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <span>{item.invoice_date}</span>
                          {item.amount_total && <span>• {item.amount_total?.toLocaleString()} $</span>}
                          {item.invoice_user_id?.[1] && <span>• {item.invoice_user_id[1]}</span>}
                        </div>
                      )}
                      {item.expected !== undefined && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-red-500 font-semibold">{item.facturado?.toLocaleString()} $</span>
                          <span className="text-slate-300">/</span>
                          <span className="text-slate-500">{item.expected?.toLocaleString()} $</span>
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold text-red-600 bg-red-100">
                            -{item.falta_pct}%
                          </span>
                          <span className="text-slate-400">• {item.sucursal}</span>
                        </div>
                      )}
                      {item._tipo === "sin_actividad" && (
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <span>{t("ult_factura")} {item.last_invoice_date || "—"}</span>
                          <span>• {Math.round(item.last_invoice_amount || 0).toLocaleString()} $</span>
                          {item.last_invoice_client && <span>• {item.last_invoice_client}</span>}
                        </div>
                      )}
                      {item._tipo === "bajo_minimo" && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-medium text-slate-600 truncate max-w-[140px]">
                            {item.partner_id?.[1] || "—"}
                          </span>
                          <span className="text-slate-300">•</span>
                          <span className="font-mono text-amber-600 font-semibold">
                            {item.amount_total?.toLocaleString()} $
                          </span>
                          {item.invoice_user_id?.[1] && (
                            <span className="text-slate-400">• {item.invoice_user_id[1]}</span>
                          )}
                        </div>
                      )}
                    </div>
                    <ChevronRight size={16} className="text-slate-400 shrink-0 ml-2" />
                  </div>
                </DialogTrigger>

                <DialogContent className="sm:max-w-3xl">
                  <DialogHeader>
                    <DialogTitle>{item.name || item.partner_id?.[1] || "—"}</DialogTitle>
                    <DialogDescription className="sr-only">
                      {t("detalle_profundo")}
                    </DialogDescription>
                  </DialogHeader>

                  <div className="mt-4 space-y-4 max-h-[65vh] overflow-y-auto pr-2">
                    {item.qty_available !== undefined ? (
                      <ProductDetailView item={item} />
                    ) : item.days_inactive !== undefined ? (
                      <InactiveClientDetailView item={item} />
                    ) : item._tipo === "sin_actividad" ? (
                      <VendedorSinActividadDetailView item={item} />
                    ) : item.decline_pct !== undefined ? (
                      <ProductDeclineDetailView item={item} />
                    ) : item.expected !== undefined ? (
                      <VendedorCuotaAlertaDetailView item={item} />
                    ) : item._tipo === "bajo_minimo" ? (
                      <FacturaBajoMinimoDetailView item={item} />
                    ) : item.invoice_date_due && (
                      item.invoice_date_due < new Date().toISOString().split("T")[0]
                    ) ? (
                      <MoraAvanzadaDetailView item={item} />
                    ) : item.invoice_date && !item.invoice_date_due ? (
                      <DevolucionDetailView item={item} />
                    ) : item.invoice_date_due ? (
                      <InvoiceDetailView item={item} />
                    ) : item.invoice_line_ids ? (
                      <InvoiceDetailView item={item} />
                    ) : (
                      <InvoiceDetailView item={item} />
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <div className="p-4 bg-slate-100 rounded-full mb-4">
                {icon}
              </div>
              <p className="text-sm font-semibold">{t("todo_orden")}</p>
              <p className="text-xs mt-1">{t("no_datos_title", { title: title.toLowerCase() })}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
