"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle,
  ArrowRight,
  DollarSign,
  FileText,
  ShoppingBag,
  Sparkles,
  Target,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import useSWR from "swr";

const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error("Error en la petición");
    return res.json();
  });

export default function SellerReportPage() {
  const t = useTranslations("superadmin.reports_sellers");
  const [selectedSeller, setSelectedSeller] = useState<string>("");
  const [reportData, setReportData] = useState<any>(null);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [loadingAI, setLoadingAI] = useState(false);

  const { data: users } = useSWR("/api/superadmin/users-full", fetcher);
  const sellersList = users || [];

  useEffect(() => {
    if (!selectedSeller) return;

    async function fetchSellerData() {
      setLoadingReport(true);
      setAiAnalysis(null);
      try {
        const res = await fetch(
          `/api/reports/sellers/stats?sellerName=${encodeURIComponent(selectedSeller)}`,
        );
        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
        const rawText = await res.text();
        if (!rawText) throw new Error("Cuerpo de respuesta vacío");
        const data = JSON.parse(rawText);
        setReportData(data.metrics);
      } catch (error) {
        console.error("Error al cargar datos de Odoo:", error);
      } finally {
        setLoadingReport(false);
      }
    }

    fetchSellerData();
  }, [selectedSeller]);

  const handleAIAnalysis = async () => {
    if (!reportData || !selectedSeller) return;
    setLoadingAI(true);
    try {
      const res = await fetch("/api/reports/sellers/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seller: selectedSeller, metrics: reportData }),
      });
      if (!res.ok) throw new Error("Fallo en la pasarela de análisis");
      const data = await res.json();
      setAiAnalysis(data);
    } catch (error: any) {
      console.error("Error en Auditoría:", error);
    } finally {
      setLoadingAI(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="border-b border-slate-100 pb-5">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          {t("title")}
        </h1>
        <p className="text-slate-500 mt-1 text-sm">
          {t("subtitle")}
        </p>
      </div>

      {/* Selector de Asesor */}
      <Card className="border-slate-100 shadow-sm">
        <CardContent className="pt-6">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 block mb-2">
            {t("asesor_comercial")}
          </label>
          <select
            value={selectedSeller}
            onChange={(e) => setSelectedSeller(e.target.value)}
            className="w-full md:w-[400px] bg-slate-50 border border-slate-200 text-slate-900 rounded-lg p-2.5 text-sm focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">{t("seleccionar_vendedor")}</option>
            {sellersList.map((seller: any) => (
              <option key={seller.id} value={seller.name}>
                {seller.name}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      {selectedSeller && reportData && !loadingReport && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Bloque de Métricas Vivas de Ventas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card className="border-slate-100 shadow-sm bg-gradient-to-br from-white to-slate-50/50">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-semibold text-slate-600">
                    {t("debe_hacer_dia")}
                  </CardTitle>
                  <Target className="h-4 w-4 text-blue-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-extrabold text-slate-900">
                    ${reportData.revenueTargetDay} USD
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {t("cuota_diaria")}
                  </p>
                </CardContent>
              </Card>

              <Card
                className={`border-slate-100 shadow-sm ${reportData.revenueActualDay >= reportData.revenueTargetDay ? "bg-emerald-50/10" : "bg-rose-50/10"}`}
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-semibold text-slate-600">
                    {t("hace_real_dia")}
                  </CardTitle>
                  <DollarSign
                    className={`h-4 w-4 ${reportData.revenueActualDay >= reportData.revenueTargetDay ? "text-emerald-600" : "text-rose-600"}`}
                  />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-extrabold text-slate-900">
                    ${reportData.revenueActualDay} USD
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Progress
                      value={Math.min(
                        Number(reportData.performancePercent || 0),
                        100,
                      )}
                      className="h-1.5 flex-1"
                    />
                    <span className="text-xs font-bold text-slate-700">
                      {reportData.revenuePerformancePercent}%
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* TABLA DE PRODUCTOS FACTURADOS EN ODOO */}
            <Card className="border-slate-100 shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-50 flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4 text-slate-500" />
                  <CardTitle className="text-sm font-semibold text-slate-800">
                    {t("volumen_comercial")}
                  </CardTitle>
                </div>
                  <Badge variant="outline" className="text-slate-600 font-medium">
                    {t("este_mes")}
                  </Badge>
              </CardHeader>
              <CardContent className="p-0">
                {reportData.productsArray?.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-600">
                      <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
                        <tr>
                          <th className="px-4 py-3">
                            {t("item_producto")}
                          </th>
                          <th className="px-4 py-3 text-center">
                            {t("unidades_vendidas")}
                          </th>
                          <th className="px-4 py-3 text-right">
                            {t("total_facturado")}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {reportData.productsArray.map(
                          (prod: any, idx: number) => (
                            <tr
                              key={idx}
                              className="hover:bg-slate-50/80 transition-colors"
                            >
                              <td className="px-4 py-3 font-medium text-slate-800 flex items-center gap-2">
                                <span
                                  className={`w-2 h-2 rounded-full ${idx === 0 ? "bg-amber-500" : "bg-slate-300"}`}
                                />
                                {prod.product_name}
                              </td>
                              <td className="px-4 py-3 text-center font-bold text-slate-900">
                                {prod.units_sold}
                              </td>
                              <td className="px-4 py-3 text-right text-emerald-600 font-semibold">
                                $
                                {Number(prod.total_revenue_usd).toLocaleString(
                                  undefined,
                                  { minimumFractionDigits: 2 },
                                )}{" "}
                                USD
                              </td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    {t("sin_facturas")}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Disparador de Auditoría Avanzada */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 p-6 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-sm">
              <div className="space-y-1">
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-blue-600 fill-blue-100" />{" "}
                  {t("despliegue_ia")}
                </h3>
                  <p className="text-xs text-slate-600 max-w-xl leading-relaxed">
                    {t("cruzando_cuota")}
                  </p>
              </div>
              <Button
                onClick={handleAIAnalysis}
                disabled={loadingAI}
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl shrink-0"
              >
                {loadingAI
                  ? t("auditando")
                  : t("iniciar_auditoria")}
              </Button>
            </div>
          </div>

          {/* Bloque Derecho: Diagnóstico del Agente de IA */}
          <div className="lg:col-span-1">
            {aiAnalysis ? (
              <Card
                className={`border-2 ${aiAnalysis.status === "Bajo Rendimiento Alerta" ? "border-amber-200 bg-amber-50/10" : "border-slate-200/60 shadow-md"} rounded-2xl`}
              >
                <CardHeader className="pb-3 border-b border-slate-100/60">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-base font-bold text-slate-900">
                      {t("analisis_asesor")}
                    </CardTitle>
                    <Badge
                      variant={
                        aiAnalysis.status === "Bajo Rendimiento Alerta"
                          ? "destructive"
                          : "default"
                      }
                    >
                      {aiAnalysis.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 text-sm pt-4">
                  <div className="text-slate-700 leading-relaxed bg-white border border-slate-100 p-3 rounded-xl shadow-xs">
                    <span className="font-semibold text-slate-400 block mb-1 text-xs uppercase tracking-wider">
                      {t("causa_raiz")}
                    </span>
                    {aiAnalysis.diagnostic}
                  </div>

                  {aiAnalysis.pointsOfFailure?.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />{" "}
                        {t("alertas_desplome")}
                      </h4>
                      <ul className="space-y-1 bg-white border border-slate-100 rounded-xl p-3 shadow-xs">
                        {aiAnalysis.pointsOfFailure.map(
                          (point: string, i: number) => (
                            <li
                              key={i}
                              className="text-xs text-slate-700 flex items-start gap-1"
                            >
                              <span className="text-amber-500 select-none">
                                •
                              </span>{" "}
                              {point}
                            </li>
                          ),
                        )}
                      </ul>
                    </div>
                  )}

                  {aiAnalysis.recommendations?.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                        <ArrowRight className="h-3.5 w-3.5 text-blue-500" />{" "}
                        {t("cross_selling")}
                      </h4>
                      <ul className="space-y-1.5">
                        {aiAnalysis.recommendations.map(
                          (rec: string, i: number) => (
                            <li
                              key={i}
                              className="text-xs bg-blue-50/50 border border-blue-100/50 text-slate-800 rounded-lg p-2.5"
                            >
                              {rec}
                            </li>
                          ),
                        )}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="h-full border border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center p-8 text-center bg-slate-50/50 min-h-[350px]">
                <FileText className="h-8 w-8 text-slate-300 mb-2" />
                <p className="text-sm font-medium text-slate-400">
                  {t("esperando_auditoria")}
                </p>
                <p className="text-xs text-slate-400 mt-1 max-w-[220px]">
                  Presiona el botón para mapear los picos de facturación, fallas
                  de cuota y productos rezagados del asesor.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {loadingReport && (
        <div className="text-center p-12 text-sm text-slate-500 animate-pulse">
          {t("sincronizando")}
        </div>
      )}
    </div>
  );
}
