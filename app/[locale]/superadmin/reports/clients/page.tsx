"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthStore } from "@/lib/stores/auth.store";
import {
  AlertTriangle,
  Building2,
  Clock,
  LayoutGrid,
  List,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

export default function ClientsReportComponent() {
  const t = useTranslations("superadmin.reports_clients");
  const { user } = useAuthStore();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "chart">("table");

  const [selectedCompany, setSelectedCompany] = useState("all");
  const companies = [
    { id: "9", name: "Valencia" },
    { id: "10", name: "Caracas" },
    { id: "7", name: "Panamá" },
  ];

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState(
    () => new Date().toISOString().split("T")[0],
  );
  const [applyTrigger, setApplyTrigger] = useState(0);
  const [alertPage, setAlertPage] = useState(0);

  function resetFilters() {
    setSelectedCompany("all");
    setStartDate("");
    setEndDate(new Date().toISOString().split("T")[0]);
    setApplyTrigger((n) => n + 1);
  }

  useEffect(() => {
    async function loadReport() {
      if (!user) return;
      try {
        setLoading(true);
        setErrorMsg(null);
        const res = await fetch(
          `/api/reports/clients?userId=${user.uid || user.id}&companyId=${selectedCompany}&startDate=${startDate}&endDate=${endDate}`,
        );
        const resData = await res.json();
        if (res.ok) {
          setData(resData);
          setAlertPage(0);
        } else setErrorMsg(resData.error);
      } catch {
        setErrorMsg("Error de conexión.");
      } finally {
        setLoading(false);
      }
    }
    loadReport();
  }, [user, applyTrigger]);

  if (loading)
    return (
      <div className="flex flex-col items-center justify-center p-24 bg-white rounded-2xl border border-slate-100 min-h-[400px] shadow-sm">
        <RefreshCw className="h-8 w-8 text-blue-500 animate-spin mb-3" />
        <p className="text-slate-500 text-sm font-medium">
          {t("analizando")}
        </p>
      </div>
    );

  if (errorMsg)
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-red-100 text-center min-h-[350px] shadow-sm">
        <AlertTriangle className="h-10 w-10 text-red-400 mb-3" />
        <p className="text-slate-800 font-bold text-sm">
          {t("error_sync")}
        </p>
        <p className="text-slate-500 text-xs mt-1">{errorMsg}</p>
      </div>
    );

  const allClients: any[] = data?.topClients || [];
  // Monto: top 10 por facturación total
  const topClients: any[] = allClients.slice(0, 10);
  // Volumen: top 10 por cantidad de pedidos (pueden ser clientes distintos)
  const topByVolume: any[] = [...allClients]
    .sort((a, b) => b.orders_count - a.orders_count)
    .slice(0, 10);
  const inactiveClients: any[] = data?.inactiveClients || [];
  const getMax = (arr: any[], key: string) =>
    Math.max(...arr.map((i) => i[key]), 1);

  return (
    <div className="space-y-8 w-full text-slate-800">
      {/* FILTROS */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
            <Building2 size={20} />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              {t("segmentacion")}
            </h3>
            <p className="text-sm font-bold text-slate-700">
              {t("cartera_b2b")}
            </p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full xl:w-auto">
          <select
            value={selectedCompany}
            onChange={(e) => setSelectedCompany(e.target.value)}
            className="w-full sm:w-48 h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all cursor-pointer shadow-sm"
          >
            <option value="all">{t("todas_empresas")}</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {t("sede")} {c.name}
              </option>
            ))}
          </select>
          <div className="flex items-center bg-slate-50 border border-slate-200 px-3 h-10 rounded-xl gap-2 shadow-sm">
            <span className="text-[10px] font-bold text-slate-400 uppercase">
              {t("desde")}
            </span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
            />
          </div>
          <div className="flex items-center bg-slate-50 border border-slate-200 px-3 h-10 rounded-xl gap-2 shadow-sm">
            <span className="text-[10px] font-bold text-slate-400 uppercase">
              {t("hasta")}
            </span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
            />
          </div>
          <button
            onClick={resetFilters}
            disabled={loading}
            className="h-10 px-4 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-500 text-xs font-black uppercase rounded-xl transition-all active:scale-95 whitespace-nowrap"
          >
            {t("limpiar")}
          </button>
          <button
            onClick={() => setApplyTrigger((n) => n + 1)}
            disabled={loading}
            className="h-10 px-5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-black uppercase rounded-xl transition-all shadow-sm active:scale-95 whitespace-nowrap"
          >
            {t("aplicar")}
          </button>
        </div>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-start justify-between min-h-[140px]">
          <div className="space-y-2 flex-1 pr-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              {t("key_account")}
            </span>
            <h3 className="text-sm font-bold text-slate-700 leading-snug break-words">
              {topClients[0]?.name || "N/A"}
            </h3>
            <div className="text-2xl font-bold text-slate-900 tracking-tight">
              $
              {(topClients[0]?.total_spent || 0).toLocaleString(undefined, {
                maximumFractionDigits: 0,
              })}
            </div>
            <span className="inline-block text-[10px] font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-100">
              {topClients[0]?.top_brand || "—"}
            </span>
          </div>
          <div className="p-4 bg-purple-50 text-purple-500 rounded-2xl flex-shrink-0">
            <TrendingUp size={22} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-start justify-between min-h-[140px]">
          <div className="space-y-2 flex-1 pr-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              {t("total_clientes_activos")}
            </span>
            <div className="text-2xl font-bold text-slate-900 tracking-tight">
              {allClients.length}
            </div>
            <p className="text-[10px] text-slate-400 font-medium">
              {inactiveClients.length} {t("riesgo_churn")}
            </p>
          </div>
          <div className="p-4 bg-blue-50 text-blue-500 rounded-2xl flex-shrink-0">
            <Users size={22} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-start justify-between min-h-[140px]">
          <div className="space-y-2 flex-1 pr-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              {t("alerta_churn")}
            </span>
            <h3 className="text-sm font-bold text-slate-700 leading-snug break-words">
              {inactiveClients[0]?.name || "Ninguno"}
            </h3>
            <div className="text-2xl font-bold text-slate-900 tracking-tight">
              {inactiveClients[0]?.days_inactive || 0}{" "}
              <span className="text-xs font-medium text-slate-400">
                {t("dias_sin_comprar")}
              </span>
            </div>
          </div>
          <div className="p-4 bg-orange-50 text-orange-500 rounded-2xl flex-shrink-0">
            <Clock size={22} />
          </div>
        </div>
      </div>

      {/* TABLA PRINCIPAL */}
      <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-6">
        <Tabs defaultValue="monto" className="w-full">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                {t("analisis_comercial")}
              </h3>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {t("exploracion_segmentada")}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* View mode toggle */}
              <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/60">
                <button
                  onClick={() => setViewMode("table")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${viewMode === "table" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}
                >
                  <List size={13} /> Tabla
                </button>
                <button
                  onClick={() => setViewMode("chart")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${viewMode === "chart" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}
                >
                  <LayoutGrid size={13} /> Estadística
                </button>
              </div>
              {/* Sub-tabs */}
              <TabsList className="bg-slate-50 border border-slate-100 p-1 rounded-xl grid grid-cols-3 w-[240px] h-10">
                <TabsTrigger
                  value="monto"
                  className="rounded-lg text-xs font-semibold text-slate-500"
                >
                  Monto
                </TabsTrigger>
                <TabsTrigger
                  value="volumen"
                  className="rounded-lg text-xs font-semibold text-slate-500"
                >
                  Volumen
                </TabsTrigger>
                <TabsTrigger
                  value="alertas"
                  className="rounded-lg text-xs font-semibold text-slate-500"
                >
                  Alertas
                </TabsTrigger>
              </TabsList>
            </div>
          </div>

          {/* ── MONTO ── */}
          <TabsContent value="monto" className="mt-4">
            {viewMode === "table" ? (
              <div className="rounded-2xl border border-slate-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <Table className="min-w-[860px]">
                    <TableHeader className="bg-slate-50/70">
                      <TableRow>
                        <TableHead className="pl-6 py-4 w-[4%]">#</TableHead>
                        <TableHead className="py-4 w-[24%]">{t("cliente")}</TableHead>
                        <TableHead className="py-4 w-[13%]">{t("vendedor")}</TableHead>
                        <TableHead className="py-4 w-[13%]">
                          {t("marca_insignia")}
                        </TableHead>
                        <TableHead className="py-4 w-[18%]">
                          {t("producto_insignia")}
                        </TableHead>
                        <TableHead className="text-right py-4 w-[10%]">
                          {t("monto_dolar")}
                        </TableHead>
                        <TableHead className="pl-4 py-4 w-[18%]">
                          <span className="flex items-center gap-1">
                            <Sparkles size={11} className="text-indigo-400" />{" "}
                            {t("ia_upsell")}
                          </span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topClients.map((c: any, i: number) => (
                        <TableRow
                          key={c.id}
                          className="border-b border-slate-50 hover:bg-slate-50/40 transition-colors"
                        >
                          <TableCell className="pl-6 py-4 text-xs font-black text-slate-300">
                            {i + 1}
                          </TableCell>
                          <TableCell className="py-4">
                            <div className="text-xs font-bold text-slate-700">
                              {c.name}
                            </div>
                            {c.ai_insight && (
                              <p className="text-[10px] text-slate-400 mt-1 leading-relaxed whitespace-normal break-words max-w-[220px]">
                                {c.ai_insight}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="py-4">
                            <span className="text-[10px] font-bold text-slate-500 bg-slate-50 px-2 py-1 rounded-lg">
                              {c.vendedor}
                            </span>
                          </TableCell>
                          <TableCell className="py-4">
                            <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-lg uppercase italic">
                              {c.top_brand}
                            </span>
                          </TableCell>
                          <TableCell className="py-4 text-[10px] font-medium text-slate-500 max-w-[160px] truncate">
                            {c.top_product}
                          </TableCell>
                          <TableCell className="text-right py-4 font-black text-xs text-slate-800 pr-4">
                            $
                            {c.total_spent.toLocaleString(undefined, {
                              maximumFractionDigits: 0,
                            })}
                          </TableCell>
                          <TableCell className="py-4 pl-4">
                            {c.upsell_suggestion ? (
                              <span className="inline-block text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-lg max-w-[160px] truncate">
                                {c.upsell_suggestion}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-300">
                                —
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : (
              <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-100 space-y-5">
                {topClients.map((c: any) => (
                  <div key={c.id} className="space-y-1.5">
                    <div className="flex justify-between text-xs font-semibold text-slate-700">
                      <div>
                        <span>{c.name}</span>
                        <span className="ml-2 text-[10px] text-slate-400 font-normal">
                          {c.vendedor}
                        </span>
                      </div>
                      <span className="font-black">
                        $
                        {c.total_spent.toLocaleString(undefined, {
                          maximumFractionDigits: 0,
                        })}
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-white rounded-full overflow-hidden border border-slate-100">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-700"
                        style={{
                          width: `${(c.total_spent / getMax(topClients, "total_spent")) * 100}%`,
                        }}
                      />
                    </div>
                    {c.top_brands?.length > 0 && (
                      <div className="flex gap-1.5 flex-wrap pt-0.5">
                        {c.top_brands.map((b: any) => (
                          <span
                            key={b.name}
                            className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded uppercase italic"
                          >
                            {b.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── VOLUMEN ── */}
          <TabsContent value="volumen" className="mt-4">
            {viewMode === "table" ? (
              <div className="rounded-2xl border border-slate-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <Table className="min-w-[800px]">
                    <TableHeader className="bg-slate-50/70">
                      <TableRow>
                        <TableHead className="pl-6 py-4 w-[4%]">#</TableHead>
                        <TableHead className="py-4 w-[24%]">Cliente</TableHead>
                        <TableHead className="py-4 w-[15%]">Vendedor</TableHead>
                        <TableHead className="py-4 w-[13%]">
                          Marca Insignia
                        </TableHead>
                        <TableHead className="py-4 w-[20%]">
                          Producto Insignia
                        </TableHead>
                        <TableHead className="text-right py-4 pr-6 w-[12%]">
                          {t("facturas")}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topByVolume.map((c: any, i: number) => (
                        <TableRow
                          key={c.id}
                          className="border-b border-slate-50 hover:bg-slate-50/40 transition-colors"
                        >
                          <TableCell className="pl-6 py-4 text-xs font-black text-slate-300">
                            {i + 1}
                          </TableCell>
                          <TableCell className="py-4">
                            <div className="text-xs font-bold text-slate-700">
                              {c.name}
                            </div>
                            {c.ai_insight && (
                              <p className="text-[10px] text-slate-400 mt-1 leading-relaxed whitespace-normal break-words max-w-[220px]">
                                {c.ai_insight}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="py-4">
                            <span className="text-[10px] font-bold text-slate-500 bg-slate-50 px-2 py-1 rounded-lg">
                              {c.vendedor}
                            </span>
                          </TableCell>
                          <TableCell className="py-4">
                            <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-lg uppercase italic">
                              {c.top_brand}
                            </span>
                          </TableCell>
                          <TableCell className="py-4 text-[10px] font-medium text-slate-500 max-w-[180px] truncate">
                            {c.top_product}
                          </TableCell>
                          <TableCell className="text-right font-black text-sm text-slate-800 pr-6">
                            {c.orders_count}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : (
              <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-100 space-y-5">
                {topByVolume.map((c: any) => (
                  <div key={c.id} className="space-y-1.5">
                    <div className="flex justify-between text-xs font-semibold text-slate-700">
                      <div>
                        <span>{c.name}</span>
                        <span className="ml-2 text-[10px] text-slate-400 font-normal">
                          {c.vendedor}
                        </span>
                      </div>
                      <span className="font-black text-slate-800">
                        {c.orders_count} {t("facturas")}
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-white rounded-full overflow-hidden border border-slate-100">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all duration-700"
                        style={{
                          width: `${(c.orders_count / getMax(topByVolume, "orders_count")) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── ALERTAS ── */}
          <TabsContent value="alertas" className="mt-4">
            {inactiveClients.length === 0 ? (
              <div className="rounded-2xl border border-slate-100 p-16 text-center">
                <Clock size={36} className="text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-bold text-slate-500">
                  {t("sin_alertas")}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {t("todos_activos")}
                </p>
              </div>
            ) : viewMode === "table" ? (
              (() => {
                const alertPageSize = 10;
                const alertTotalPages = Math.ceil(
                  inactiveClients.length / alertPageSize,
                );
                const alertSlice = inactiveClients.slice(
                  alertPage * alertPageSize,
                  alertPage * alertPageSize + alertPageSize,
                );
                return (
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-slate-100 overflow-hidden">
                      <div className="overflow-x-auto">
                        <Table className="min-w-[860px]">
                          <TableHeader className="bg-slate-50/70">
                            <TableRow>
                              <TableHead className="pl-6 py-4 w-[22%]">
                                Cliente
                              </TableHead>
                              <TableHead className="py-4 w-[13%]">
                                Vendedor
                              </TableHead>
                              <TableHead className="py-4 w-[13%]">
                                Marca Insignia
                              </TableHead>
                              <TableHead className="py-4 w-[16%]">
                                Producto Insignia
                              </TableHead>
                              <TableHead className="text-center py-4 w-[10%]">
                                {t("inactivo")}
                              </TableHead>
                              <TableHead className="py-4 w-[9%]">
                                {t("riesgo")}
                              </TableHead>
                              <TableHead className="pl-4 py-4 w-[18%]">
                                <span className="flex items-center gap-1">
                                  <Sparkles
                                    size={11}
                                    className="text-indigo-400"
                                  />{" "}
                                  {t("reactivacion_ia")}
                                </span>
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {alertSlice.map((c: any) => {
                              const sizeFactor =
                                c.avg_order_amount > 0
                                  ? c.last_order_amount / c.avg_order_amount
                                  : 1;
                              const adjustedInterval =
                                c.avg_interval > 0
                                  ? c.avg_interval * Math.max(1.5, sizeFactor)
                                  : 60;
                              const ratio = c.days_inactive / adjustedInterval;
                              const risk =
                                ratio >= 2.5
                                  ? "Crítico"
                                  : ratio >= 1.5
                                    ? "Alto"
                                    : "Medio";
                              const riskColor =
                                ratio >= 2.5
                                  ? "bg-red-50 text-red-600 border-red-100"
                                  : ratio >= 1.5
                                    ? "bg-orange-50 text-orange-600 border-orange-100"
                                    : "bg-amber-50 text-amber-600 border-amber-100";
                              return (
                                <TableRow
                                  key={c.id}
                                  className="border-b border-slate-50 hover:bg-slate-50/40 transition-colors"
                                >
                                  <TableCell className="pl-6 py-4">
                                    <div className="text-xs font-bold text-slate-700">
                                      {c.name}
                                    </div>
                                    {c.ai_insight && (
                                      <p className="text-[10px] text-slate-400 mt-1 leading-relaxed whitespace-normal break-words max-w-[200px]">
                                        {c.ai_insight}
                                      </p>
                                    )}
                                  </TableCell>
                                  <TableCell className="py-4">
                                    <span className="text-[10px] font-bold text-slate-500 bg-slate-50 px-2 py-1 rounded-lg">
                                      {c.vendedor}
                                    </span>
                                  </TableCell>
                                  <TableCell className="py-4">
                                    <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-lg uppercase italic">
                                      {c.top_brand}
                                    </span>
                                  </TableCell>
                                  <TableCell className="py-4 text-[10px] font-medium text-slate-500 max-w-[160px] truncate">
                                    {c.top_product}
                                  </TableCell>
                                  <TableCell className="text-center py-4 font-black text-xs text-slate-700">
                                    {c.days_inactive}d
                                  </TableCell>
                                  <TableCell className="py-4">
                                    <span
                                      className={`inline-block px-2 py-0.5 text-[10px] font-black uppercase rounded-md border ${riskColor}`}
                                    >
                                      {risk}
                                    </span>
                                  </TableCell>
                                  <TableCell className="py-4 pl-4">
                                    {c.upsell_suggestion ? (
                                      <span className="inline-block text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-lg max-w-[180px] truncate">
                                        {c.upsell_suggestion}
                                      </span>
                                    ) : (
                                      <span className="text-[10px] text-slate-300">
                                        —
                                      </span>
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                    {alertTotalPages > 1 && (
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[11px] text-slate-400 font-medium">
                          {t("pagina")} {alertPage + 1} de {alertTotalPages} ·{" "}
                          {inactiveClients.length} alertas
                        </span>
                        <div className="flex gap-2">
                          <button
                            onClick={() =>
                              setAlertPage((p) => Math.max(0, p - 1))
                            }
                            disabled={alertPage === 0}
                            className="h-8 px-4 text-xs font-bold bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-xl transition-all"
                          >
                            {t("anterior")}
                          </button>
                          <button
                            onClick={() =>
                              setAlertPage((p) =>
                                Math.min(alertTotalPages - 1, p + 1),
                              )
                            }
                            disabled={alertPage >= alertTotalPages - 1}
                            className="h-8 px-4 text-xs font-bold bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-xl transition-all"
                          >
                            {t("siguiente")}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()
            ) : (
              <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-100 space-y-5">
                {inactiveClients.map((c: any) => {
                  const barColor =
                    c.days_inactive > 90
                      ? "bg-red-500"
                      : c.days_inactive > 60
                        ? "bg-orange-500"
                        : "bg-amber-500";
                  return (
                    <div key={c.id} className="space-y-1.5">
                      <div className="flex justify-between text-xs font-semibold text-slate-700">
                        <div>
                          <span>{c.name}</span>
                          <span className="ml-2 text-[10px] text-slate-400">
                            {c.vendedor}
                          </span>
                        </div>
                        <span
                          className={`font-black ${c.days_inactive > 90 ? "text-red-500" : c.days_inactive > 60 ? "text-orange-500" : "text-amber-500"}`}
                        >
                          {c.days_inactive} {t("dias")}
                        </span>
                      </div>
                      <div className="w-full h-2.5 bg-white rounded-full overflow-hidden border border-slate-100">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                          style={{
                            width: `${(c.days_inactive / getMax(inactiveClients, "days_inactive")) * 100}%`,
                          }}
                        />
                      </div>
                      {c.upsell_suggestion && (
                        <p className="text-[9px] text-emerald-600 font-bold">
                          {t("ia_sugiere")} {c.upsell_suggestion}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
