"use client";

import {
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Plus,
  RotateCcw,
  Search,
  User,
  X,
  Check,
  Calendar,
  TrendingUp,
  ArrowLeft,
  RefreshCw,
} from "lucide-react";
import { BarChart, Bar, ResponsiveContainer, Tooltip } from "recharts";
import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import ComprasDetailModal from "./ComprasDetailModal";
import KpiInfoModal from "./stoplight/KpiInfoModal";
import CxCDetailModal from "./stoplight/CxCDetailModal";
import CxPDetailModal from "./stoplight/CxPDetailModal";
import CuotaDetailModal from "./stoplight/CuotaDetailModal";
import ClientesNuevosModal from "./stoplight/ClientesNuevosModal";
import MargenBrutoModal from "./stoplight/MargenBrutoModal";
import EfectividadCierreModal from "./stoplight/EfectividadCierreModal";
import CoberturaMarcasModal from "./stoplight/CoberturaMarcasModal";
import ActivacionCarteraModal from "./stoplight/ActivacionCarteraModal";
import VisitasSemanalesModal from "./stoplight/VisitasSemanalesModal";
import ModalMonthPicker from "./stoplight/ModalMonthPicker";
import {
  getCellColor,
  getKpiCellColor,
  sinMeta,
  nivelSemaforo,
  puntajeGrupo,
  NIVEL_UI,
  contarNiveles,
} from "@/lib/stoplight/scoring";
import type { Nivel } from "@/lib/stoplight/scoring";
import type { SellerData, KpiData, SellerDetail } from "@/lib/stoplight/types";

export default function StoplightReportSuperadmin({ vendorMode = false, comprasMode = false, gerenteVentaMode = false, isSuperAdmin = false, cxCMode = false, gerenteOpsMode = false, companyId }: { vendorMode?: boolean; comprasMode?: boolean; gerenteVentaMode?: boolean; isSuperAdmin?: boolean; cxCMode?: boolean; gerenteOpsMode?: boolean; companyId?: number } = {}) {
  const t = useTranslations("stoplight");
  const locale = useLocale();
  const [activeTab, setActiveTab] = useState("Weekly");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({ "group-ventas": true, "group-compras": true });
  const [kpiData, setKpiData] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [goalValues, setGoalValues] = useState<Record<string, string>>({});
  const [pesoValues, setPesoValues] = useState<Record<string, string>>({});
  const [selectedCompanyId, setSelectedCompanyId] = useState(companyId ?? 9);
  const [teamDropdownOpen, setTeamDropdownOpen] = useState(false);
  const [selectedMes, setSelectedMes] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
  });
  const [modalMes, setModalMes] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
  });
  const modalFetchRef = useRef<((mes: string) => Promise<void>) | null>(null);

  const onModalMesChange = async (newMes: string) => {
    setModalMes(newMes);
    if (modalFetchRef.current) await modalFetchRef.current(newMes);
  };

  const [customDateRange, setCustomDateRange] = useState<{ start: string; end: string } | null>(null);
  const [dateInputStart, setDateInputStart] = useState("");
  const [dateInputEnd, setDateInputEnd] = useState("");
  const [dateRangeOpen, setDateRangeOpen] = useState(false);
  const [viewByOpen, setViewByOpen] = useState(false);
  const [kpiFiltro, setKpiFiltro] = useState("");
  const [monthlyHistory, setMonthlyHistory] = useState<any[]>([]);
  const [monthlyHistLoading, setMonthlyHistLoading] = useState(false);

  const [clientesModalOpen, setClientesModalOpen] = useState(false);
  const [marketingData, setMarketingData] = useState<any>(null);
  const [marketingLoading, setMarketingLoading] = useState(false);
  const [cxcData, setCxcData] = useState<any>(null);
  const [cxcLoading, setCxcLoading] = useState(false);
  const [cxcError, setCxcError] = useState<string | null>(null);
  const [cppData, setCppData] = useState<any>(null);
  const [cppLoading, setCppLoading] = useState(false);
  const [cxcModalOpen, setCxcModalOpen] = useState(false);
  const [cxcModalKpi, setCxcModalKpi] = useState<string>("");

  const [cppModalOpen, setCppModalOpen] = useState(false);
  const [cppModalKpi, setCppModalKpi] = useState<string>("");
  const [cppSelectedBill, setCppSelectedBill] = useState<any>(null);
  const [kpiInfoModal, setKpiInfoModal] = useState<{ open: boolean; kpiId: string; title: string }>({ open: false, kpiId: "", title: "" });

  const [margenModalOpen, setMargenModalOpen] = useState(false);

  const [efectividadModalOpen, setEfectividadModalOpen] = useState(false);

  const [coberturaModalOpen, setCoberturaModalOpen] = useState(false);

  const [activacionModalOpen, setActivacionModalOpen] = useState(false);

  const [visitasModalOpen, setVisitasModalOpen] = useState(false);

  const apiPrefix = vendorMode ? "/api/vendedores/stoplight" : "/api/superadmin/stoplight";
  // Solo el superadmin y el gerente de operaciones ven todos los grupos
  // (marketing, CxC, CxP incluidos). En los demás modos esas llamadas no
  // aportan nada — se salteaban recién en el render, pero el fetch se disparaba
  // igual y golpeaba Odoo/MySQL sin necesidad.
  const muestraTodosLosGrupos = !vendorMode && !comprasMode && !gerenteVentaMode && !cxCMode;
  const q = (extras: Record<string, string> = {}, mesOverride?: string) => {
    const base: Record<string, string> = { mes: mesOverride || selectedMes, ...extras };
    if (!vendorMode && !gerenteOpsMode) base.company_id = String(selectedCompanyId);
    return new URLSearchParams(base).toString();
  };
  const [comprasModalOpen, setComprasModalOpen] = useState(false);
  const [comprasKpiType, setComprasKpiType] = useState<string>("");
  const [comprasKpiTitle, setComprasKpiTitle] = useState<string>("");

  const now = new Date();

  const empresas = [
    { id: 9, label: "Valencia" },
    { id: 10, label: "Caracas" },
    { id: 7, label: "Panama" },
  ];
  const empresaLabel = empresas.find((e) => e.id === selectedCompanyId)?.label || empresas[0].label;

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const dateExtra = customDateRange ? `&startDate=${customDateRange.start}&endDate=${customDateRange.end}` : "";
      const params = vendorMode ? `mes=${selectedMes}${dateExtra}` : gerenteOpsMode ? `mes=${selectedMes}${dateExtra}` : `mes=${selectedMes}&company_id=${selectedCompanyId}${dateExtra}`;
      const res = await fetch(`${apiPrefix}?${params}`);
      const json = await res.json();
      if (json.success) {
        setKpiData(json.data);
      }
    } catch (e) {
      console.error("Error fetching stoplight data:", e);
    }
    setLoading(false);
  }, [selectedMes, selectedCompanyId, vendorMode, customDateRange]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchMarketingData = useCallback(async () => {
    if (!muestraTodosLosGrupos) return;
    setMarketingLoading(true);
    try {
      const dateExtra = customDateRange ? `&startDate=${customDateRange.start}&endDate=${customDateRange.end}` : "";
      const res = await fetch(`/api/superadmin/stoplight/marketing?mes=${selectedMes}${dateExtra}`);
      const json = await res.json();
      if (json.success) setMarketingData(json);
    } catch (e) {
      console.error("Error fetching marketing data:", e);
    }
    setMarketingLoading(false);
  }, [selectedMes, customDateRange, muestraTodosLosGrupos]);

  useEffect(() => { fetchMarketingData(); }, [fetchMarketingData]);

  const fetchCxCData = useCallback(async () => {
    if (!muestraTodosLosGrupos && !cxCMode) return;
    setCxcLoading(true);
    setCxcError(null);
    try {
      const [mesY, mesM] = selectedMes.split("-").map(Number);
      const empresaMap: Record<number, string> = { 9: "valencia", 10: "caracas", 7: "panama" };
      const empresa = empresaMap[selectedCompanyId] || "valencia";
      const dateExtra = customDateRange ? `&startDate=${customDateRange.start}&endDate=${customDateRange.end}` : "";
      const res = await fetch(`/api/superadmin/cuentas-por-cobrar?empresa=${empresa}&month=${mesM}&year=${mesY}${dateExtra}`);
      const json = await res.json().catch(() => ({}));
      if (json.success) {
        setCxcData(json.data);
      } else {
        // Antes el grupo de CxC desaparecía sin más si esto fallaba: el
        // superadmin no tenía forma de saber por qué. Ahora se guarda el
        // error y el grupo se muestra con un aviso y un botón de reintento.
        setCxcData(null);
        setCxcError(json.error || `Error ${res.status}: no se pudo cargar Cuentas por Cobrar`);
      }
    } catch (e: any) {
      console.error("Error fetching CxC data:", e);
      setCxcData(null);
      setCxcError(e?.message || "No se pudo conectar con Cuentas por Cobrar");
    }
    setCxcLoading(false);
  }, [selectedCompanyId, selectedMes, customDateRange, muestraTodosLosGrupos, cxCMode]);

  useEffect(() => { fetchCxCData(); }, [fetchCxCData]);

  const fetchCppData = useCallback(async () => {
    if (!muestraTodosLosGrupos) return;
    setCppLoading(true);
    try {
      const [mesY, mesM] = selectedMes.split("-").map(Number);
      const empresaMap: Record<number, string> = { 9: "valencia", 10: "caracas", 7: "panama" };
      const empresa = empresaMap[selectedCompanyId] || "valencia";
      const dateExtra = customDateRange ? `&startDate=${customDateRange.start}&endDate=${customDateRange.end}` : "";
      const res = await fetch(`/api/superadmin/stoplight/cuentas-pagar?empresa=${empresa}&month=${mesM}&year=${mesY}${dateExtra}`);
      const json = await res.json();
      if (json.success) setCppData(json.data);
    } catch (e) {
      console.error("Error fetching CPP data:", e);
    }
    setCppLoading(false);
  }, [selectedCompanyId, selectedMes, customDateRange, muestraTodosLosGrupos]);

  useEffect(() => { fetchCppData(); }, [fetchCppData]);

  const fetchMonthlyHistory = useCallback(async (numMonths: number) => {
    setMonthlyHistLoading(true);
    const [y, m] = selectedMes.split("-").map(Number);
    const months: string[] = [];
    for (let i = numMonths - 1; i >= 0; i--) {
      const d = new Date(y, m - 1 - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    const empresaMap: Record<number, string> = { 9: "valencia", 10: "caracas", 7: "panama" };
    const empresa = empresaMap[selectedCompanyId] || "valencia";
    const results = await Promise.all(months.map(async (mes) => {
      const [mesY, mesM] = mes.split("-").map(Number);
      const [ventasRes, cxcRes, cppRes] = await Promise.all([
        fetch(`${apiPrefix}?mes=${mes}&company_id=${selectedCompanyId}`).then(r => r.json()).catch(() => ({ success: false })),
        fetch(`/api/superadmin/cuentas-por-cobrar?empresa=${empresa}&month=${mesM}&year=${mesY}`).then(r => r.json()).catch(() => ({ success: false })),
        fetch(`/api/superadmin/stoplight/cuentas-pagar?empresa=${empresa}&month=${mesM}&year=${mesY}`).then(r => r.json()).catch(() => ({ success: false })),
      ]);
      return {
        mes,
        ventas: ventasRes.success ? ventasRes.data : null,
        cxc: cxcRes.success ? cxcRes.data : null,
        cpp: cppRes.success ? cppRes.data : null,
      };
    }));
    setMonthlyHistory(results);
    setMonthlyHistLoading(false);
  }, [selectedMes, selectedCompanyId, apiPrefix]);

  useEffect(() => {
    if (activeTab === "Monthly" || activeTab === "Quarterly" || activeTab === "Annual") {
      const n = activeTab === "Annual" ? 12 : activeTab === "Quarterly" ? 6 : 3;
      fetchMonthlyHistory(n);
    }
  }, [activeTab, fetchMonthlyHistory]);

  useEffect(() => {
    if (!viewByOpen && !teamDropdownOpen) return;
    const close = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("[data-dropdown-content]")) return;
      setViewByOpen(false);
      setTeamDropdownOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [viewByOpen, teamDropdownOpen]);

  const algunModalAbierto =
    clientesModalOpen || modalOpen || cxcModalOpen || cppModalOpen ||
    margenModalOpen || efectividadModalOpen || coberturaModalOpen ||
    activacionModalOpen || visitasModalOpen || comprasModalOpen ||
    kpiInfoModal.open;
  useEffect(() => {
    document.body.style.overflow = algunModalAbierto ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [algunModalAbierto]);

  const saveMeta = async (kpiKey: string, value: number) => {
    try {
      await fetch(`${apiPrefix}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "save_meta",
          kpi_key: kpiKey,
          company_id: selectedCompanyId,
          meta_mensual: value,
          mes: selectedMes,
        }),
      });
      fetchData(true);
    } catch (e) {
      console.error("Error saving meta:", e);
    }
  };

  const handleGoalChange = (kpiId: string, value: string) => {
    setGoalValues((prev) => ({ ...prev, [kpiId]: value }));
  };

  const handleGoalBlur = (kpiId: string, value: string) => {
    const numVal = parseFloat(value) || 0;
    const currentMeta = kpiData?.metas?.[kpiId];
    if (numVal !== (currentMeta ?? 0)) {
      saveMeta(kpiId, numVal);
    }
  };

  const savePeso = async (kpiKey: string, value: number) => {
    try {
      // Los KPIs de marketing no tienen compañía propia: su route los lee bajo
      // company_id 9 (ver #110). El resto van por la sucursal seleccionada.
      const KPIS_MARKETING = ["usuarios_totales", "sesiones", "paginas_vistas", "tasa_rebote", "clicks_sc", "impresiones_sc", "ctr_sc", "posicion_sc", "email_open_rate"];
      const cid = KPIS_MARKETING.includes(kpiKey) ? 9 : selectedCompanyId;
      await fetch(`${apiPrefix}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "save_peso",
          kpi_key: kpiKey,
          company_id: cid,
          peso: value,
          mes: selectedMes,
        }),
      });
      fetchData(true);
      fetchMarketingData();
      fetchCxCData();
      fetchCppData();
    } catch (e) {
      console.error("Error saving peso:", e);
    }
  };

  const handlePesoChange = (kpiId: string, value: string) => {
    setPesoValues((prev) => ({ ...prev, [kpiId]: value }));
  };

  const handlePesoBlur = (kpiId: string, fallback: number, value: string) => {
    const numVal = Math.max(0, parseFloat(value) || 0);
    if (numVal !== getPesoNum(kpiId, fallback)) {
      savePeso(kpiId, numVal);
    }
  };

  const openCxcModal = (kpiId: string) => {
    setCxcModalKpi(kpiId);
    setCxcModalOpen(true);
  };

  const openCppModal = (kpiId: string) => {
    setCppModalKpi(kpiId);
    setCppModalOpen(true);
  };



  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  if (loading) {
    return (
      <div className="p-6 bg-white min-h-screen flex items-center justify-center">
        <div className="text-slate-500">{t("loading")}</div>
      </div>
    );
  }

  const mesLabel = (mes: string) => {
    const [y, m] = mes.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(locale, { month: "short", year: "2-digit" });
  };

  const getMesOptions = () => {
    const opts: { value: string; label: string }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      opts.push({ value: val, label: d.toLocaleDateString(locale, { month: "long", year: "numeric" }) });
    }
    return opts;
  };

  const getMonthlyValue = (kpiId: string, h: { ventas: any; cxc: any; cpp: any }): string => {
    const d = h.ventas;
    const cxc = h.cxc;
    const cpp = h.cpp;
    switch (kpiId) {
      case "cumplimiento_cuota_ventas": return d ? `${d.avanceMesCuota ?? d.porcentajeCumplimiento ?? d.avgCumplimiento ?? 0}%` : "-";
      case "margen_bruto": return d ? `${d.avgMargen ?? 0}%` : "-";
      case "visitas_semanales": return d ? String(d.avgVisitas ?? 0) : "-";
      case "efectividad_cierre": return d ? `${d.avgEfectividad ?? 0}%` : "-";
      case "activacion_cartera": return d ? `${d.avgActivacion ?? 0}%` : "-";
      case "clientes_nuevos": return d ? `${d.avgClientes ?? 0}%` : "-";
      case "cobertura_marcas": return d ? `${d.avgCobertura ?? 0}%` : "-";
      case "variacion_costo_compra": return d ? `${d.avgVarCosto ?? 0}%` : "-";
      case "rotacion_saludable": return d ? `${d.avgRotacion ?? 0}%` : "-";
      case "quiebre_inventario": return d ? `${d.avgQuiebre ?? 0}%` : "-";
      case "inventario_90_dias": return d ? `${d.avgInv90 ?? 0}%` : "-";
      case "forecast_semanal": return d ? `${d.avgForecast ?? 0}%` : "-";
      case "propuestas_calificadas": return d ? String(d.avgPropuestas ?? 0) : "-";
      case "efectividad_cobranza": return cxc?.kpis?.efectividad?.value != null ? `${cxc.kpis.efectividad.value}%` : "-";
      case "cartera_vencida": return cxc?.kpis?.carteraVencida?.value != null ? `${cxc.kpis.carteraVencida.value}%` : "-";
      case "recuperacion_vencidos": return cxc?.kpis?.recuperacion?.value != null ? `${cxc.kpis.recuperacion.value}%` : "-";
      case "dso": return cxc?.kpis?.dso?.value != null ? `${cxc.kpis.dso.value}` : "-";
      case "pagos_a_tiempo": return cpp ? `${cpp.pagosATiempoPct ?? 0}%` : "-";
      case "cuentas_pagar_vencidas": return cpp ? `${cpp.cuentasVencidasPct ?? 0}%` : "-";
      case "procesamiento_oportuno": return cpp ? `${cpp.procesamientoOportunoPct ?? 0}%` : "-";
      case "dpo": return cpp ? `${cpp.dpo ?? 0}` : "-";
      default: return "-";
    }
  };

  const SparklineBar = ({ values, kpiId, goal }: { values: (string | null)[]; kpiId?: string; goal?: string }) => {
    const nums = values.map(v => {
      if (!v) return 0;
      return parseFloat(v.replace("%", "").replace(" días", "").trim()) || 0;
    });
    const max = Math.max(...nums, 1);
    const w = 16;
    const gap = 4;
    const h = 32;
    // El color de cada barra sale del MISMO semáforo que la celda (contra la
    // meta), no de un umbral relativo al máximo de la serie.
    const colorDe = (raw: string | null): string => {
      if (!raw) return "#e2e8f0";
      const c = kpiId ? getKpiCellColor(kpiId, raw, goal ?? "0") : "";
      if (/green|emerald/.test(c)) return "#34d399";
      if (/yellow|amber/.test(c)) return "#fbbf24";
      if (/red/.test(c)) return "#f87171";
      return "#cbd5e1"; // sin meta / sin dato
    };
    return (
      <svg width={nums.length * (w + gap)} height={h} style={{ display: "block" }}>
        {nums.map((val, i) => {
          const barH = Math.max(2, Math.round((val / max) * (h - 2)));
          return (
            <rect key={i} x={i * (w + gap)} y={h - barH} width={w} height={barH} rx={2} fill={colorDe(values[i])} />
          );
        })}
      </svg>
    );
  };

  const numWeeks = kpiData?.numSemanas || 5;
  const defaultWeeks = Array(numWeeks).fill(null);

  const getGoal = (id: string, defaultVal: string) => goalValues[id] ?? defaultVal;

  // Pesos de los KPIs para el puntaje ponderado del grupo (issue #131). Salen
  // de kpi_targets (por company_id + mes), unificados de las 4 fuentes; el
  // fallback es el valor que estaba hardcodeado. `pesoDe` devuelve el string
  // "NN%" que espera `puntajeGrupo`.
  const pesosMerged: Record<string, number> = {
    ...(kpiData?.pesos || {}),
    ...((marketingData?.data?.pesos as Record<string, number>) || {}),
    ...((cxcData?.pesos as Record<string, number>) || {}),
    ...((cppData?.pesos as Record<string, number>) || {}),
  };
  const getPesoNum = (id: string, fallback: number) => {
    const override = pesoValues[id];
    const n = override !== undefined ? parseFloat(override) : Number(pesosMerged[id]);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  const pesoDe = (id: string, fallback: number) => `${getPesoNum(id, fallback)}%`;

  const ventasKpis = [
    {
      id: "cumplimiento_cuota_ventas",
      title: t("kpi_cuota_ventas"),
      peso: pesoDe("cumplimiento_cuota_ventas", 30),
      // "Avance del mes": facturado ÷ cuota prorrateada a los días hábiles
      // transcurridos. 100% = al día para llegar a la cuota.
      average: kpiData
        ? `${kpiData.avanceMesCuota ?? kpiData.avgCumplimiento}%`
        : "0%",
      hint:
        kpiData?.diasUtilesTranscurridos && kpiData?.totalDiasUtilesMes
          ? t("avance_al_dia", {
              d: kpiData.diasUtilesTranscurridos,
              total: kpiData.totalDiasUtilesMes,
            })
          : undefined,
      weeks: kpiData?.semanaGlobal || defaultWeeks,
      isClickable: true,
      goalDefault: kpiData ? String(Math.round(kpiData.metaMensual)) : "0",
      goalSuffix: "",
      cumple: kpiData ? (kpiData.avanceMesCuota ?? kpiData.avgCumplimiento) >= 100 : false,
    },
    {
      id: "margen_bruto",
      title: t("kpi_margen_bruto"),
      peso: pesoDe("margen_bruto", 15),
      average: kpiData ? `${kpiData.avgMargen}%` : "0%",
      weeks: kpiData?.semanaMargen || defaultWeeks,
      isClickable: true,
      goalDefault: kpiData?.metas?.["margen_bruto"] ? String(kpiData.metas["margen_bruto"]) : "0",
      goalSuffix: "%",
      cumple: kpiData ? kpiData.avgMargen >= 100 : false,
    },
    {
      id: "visitas_semanales",
      title: t("kpi_visitas"),
      peso: pesoDe("visitas_semanales", 10),
      average: kpiData ? String(kpiData.avgVisitas) : "0",
      weeks: kpiData?.semanaVisitas || defaultWeeks,
      isClickable: true,
      goalDefault: kpiData?.metas?.["visitas_semanales"] ? String(kpiData.metas["visitas_semanales"]) : "0",
      goalSuffix: "",
      cumple: kpiData ? kpiData.avgVisitas >= 100 : false,
    },
    {
      id: "efectividad_cierre",
      title: t("kpi_efectividad"),
      peso: pesoDe("efectividad_cierre", 15),
      average: kpiData ? `${kpiData.avgEfectividad}%` : "0%",
      weeks: kpiData?.semanaEfectividad || defaultWeeks,
      isClickable: true,
      goalDefault: kpiData?.metas?.["efectividad_cierre"] ? String(kpiData.metas["efectividad_cierre"]) : "0",
      goalSuffix: "%",
      cumple: kpiData ? kpiData.avgEfectividad >= 100 : false,
    },
    {
      id: "activacion_cartera",
      title: t("kpi_activacion"),
      peso: pesoDe("activacion_cartera", 15),
      average: kpiData ? `${kpiData.avgActivacion}%` : "0%",
      weeks: kpiData?.semanaActivacion || defaultWeeks,
      isClickable: true,
      goalDefault: kpiData?.metas?.["activacion_cartera"] ? String(kpiData.metas["activacion_cartera"]) : "0",
      goalSuffix: "%",
      cumple: kpiData ? kpiData.avgActivacion >= 100 : false,
    },
    {
      id: "clientes_nuevos",
      title: t("kpi_clientes_nuevos"),
      peso: pesoDe("clientes_nuevos", 5),
      average: kpiData ? `${kpiData.avgClientes}%` : "0%",
      weeks: kpiData?.semanaClientes || defaultWeeks,
      isClickable: true,
      goalDefault: kpiData?.metas?.["clientes_nuevos"] ? String(kpiData.metas["clientes_nuevos"]) : "0",
      goalSuffix: "",
      cumple: kpiData ? kpiData.avgClientes >= 100 : false,
    },
    {
      id: "cobertura_marcas",
      title: t("kpi_cobertura"),
      peso: pesoDe("cobertura_marcas", 10),
      average: kpiData ? `${kpiData.avgCobertura}%` : "0%",
      weeks: kpiData?.semanaCobertura || defaultWeeks,
      isClickable: true,
      goalDefault: kpiData?.metas?.["cobertura_marcas"] ? String(kpiData.metas["cobertura_marcas"]) : "0",
      goalSuffix: "%",
      cumple: kpiData ? kpiData.avgCobertura >= 100 : false,
    },
  ];

  const comprasKpis = [
    {
      id: "variacion_costo_compra",
      title: t("kpi_variacion_costo"),
      peso: pesoDe("variacion_costo_compra", 15),
      average: kpiData ? `${kpiData.avgVarCosto}%` : "0%",
      weeks: kpiData?.semanaVarCosto || defaultWeeks,
      goalDefault: kpiData?.metas?.["variacion_costo_compra"] ? String(kpiData.metas["variacion_costo_compra"]) : "0",
      goalSuffix: "%",
      isClickable: true,
      cumple: kpiData ? kpiData.avgVarCosto >= 100 : false,
    },
    {
      id: "rotacion_saludable",
      title: t("kpi_rotacion"),
      peso: pesoDe("rotacion_saludable", 17),
      average: kpiData ? `${kpiData.avgRotacion}%` : "0%",
      weeks: kpiData?.semanaRotacion || defaultWeeks,
      goalDefault: kpiData?.metas?.["rotacion_saludable"] ? String(kpiData.metas["rotacion_saludable"]) : "0",
      goalSuffix: "%",
      isClickable: true,
      cumple: kpiData ? kpiData.avgRotacion >= 100 : false,
    },
    {
      id: "quiebre_inventario",
      title: t("kpi_quiebre"),
      peso: pesoDe("quiebre_inventario", 25),
      average: kpiData ? `${kpiData.avgQuiebre}%` : "0%",
      weeks: kpiData?.semanaQuiebre || defaultWeeks,
      goalDefault: kpiData?.metas?.["quiebre_inventario"] ? String(kpiData.metas["quiebre_inventario"]) : "0",
      goalSuffix: "%",
      isClickable: true,
      cumple: kpiData ? kpiData.avgQuiebre >= 100 : false,
    },
    {
      id: "inventario_90_dias",
      title: t("kpi_inventario_90"),
      peso: pesoDe("inventario_90_dias", 20),
      average: kpiData ? `${kpiData.avgInv90}%` : "0%",
      weeks: kpiData?.semanaInv90 || defaultWeeks,
      goalDefault: kpiData?.metas?.["inventario_90_dias"] ? String(kpiData.metas["inventario_90_dias"]) : "0",
      goalSuffix: "%",
      isClickable: true,
      cumple: kpiData ? kpiData.avgInv90 >= 100 : false,
    },
    {
      id: "forecast_semanal",
      title: t("kpi_forecast"),
      peso: pesoDe("forecast_semanal", 11),
      average: kpiData ? `${kpiData.avgForecast}%` : "0%",
      weeks: kpiData?.semanaForecast || defaultWeeks,
      goalDefault: kpiData?.metas?.["forecast_semanal"] ? String(kpiData.metas["forecast_semanal"]) : "75",
      goalSuffix: "%",
      isClickable: true,
      cumple: kpiData ? kpiData.avgForecast >= 100 : false,
    },
    {
      id: "propuestas_calificadas",
      title: t("kpi_propuestas"),
      peso: pesoDe("propuestas_calificadas", 12),
      average: kpiData ? String(kpiData.avgPropuestas) : "0",
      weeks: kpiData?.semanaPropuestas || defaultWeeks,
      goalDefault: kpiData?.metas?.["propuestas_calificadas"] ? String(kpiData.metas["propuestas_calificadas"]) : "3",
      goalSuffix: "",
      cumple: kpiData ? kpiData.avgPropuestas >= (kpiData?.metas?.["propuestas_calificadas"] || 3) : false,
    },
  ];

  const marketingKpis = marketingData?.connected ? (() => {
    const md = marketingData.data;
    const numSemanas = md?.numSemanas || 5;
    const defWeeks = Array(numSemanas).fill(null);
    const weekClicks = md?.weekly?.clicks || [];
    const weekImpressions = md?.weekly?.impressions || [];
    const ga4W = md?.ga4Weekly;

    // Metas configurables desde kpi_targets (company_id 9). El route ya aplica
    // el fallback hardcodeado, esto es solo por si la respuesta viniera vieja.
    const metasMkt: Record<string, number> = md?.metas || {};
    const metaDe = (id: string, fallback: number) => {
      const n = Number(metasMkt[id]);
      return Number.isFinite(n) && n > 0 ? n : fallback;
    };

    const toWeekly = (arr: (number | null)[] | undefined) => arr && arr.length > 0 ? arr.map(v => v === null ? null : String(v)) : defWeeks;
    const toWeeklyPct = (arr: (number | null)[] | undefined) => arr && arr.length > 0 ? arr.map(v => v === null ? null : `${Math.round(v)}%`) : defWeeks;
    const scWeeksPct = (clicks: (number | null)[], impressions: (number | null)[]) => {
      if (!clicks.length) return defWeeks;
      return clicks.map((c, i) => {
        if (c === null || impressions[i] === null) return null;
        const imp = impressions[i] || 0;
        return imp > 0 ? `${Math.round((c / imp) * 100)}%` : null;
      });
    };

    return [
      {
        id: "usuarios_totales",
        title: t("kpi_usuarios_ga4"),
        peso: pesoDe("usuarios_totales", 13),
        average: String(md?.ga4?.totalUsers || 0),
        weeks: toWeekly(ga4W?.totalUsers),
        goalDefault: String(metaDe("usuarios_totales", 500)),
        goalSuffix: "",
        cumple: (md?.ga4?.totalUsers || 0) >= metaDe("usuarios_totales", 500),
      },
      {
        id: "sesiones",
        title: t("kpi_sesiones_ga4"),
        peso: pesoDe("sesiones", 13),
        average: String(md?.ga4?.sessions || 0),
        weeks: toWeekly(ga4W?.sessions),
        goalDefault: String(metaDe("sesiones", 1000)),
        goalSuffix: "",
        cumple: (md?.ga4?.sessions || 0) >= metaDe("sesiones", 1000),
      },
      {
        id: "paginas_vistas",
        title: t("kpi_paginas_ga4"),
        peso: pesoDe("paginas_vistas", 9),
        average: String(md?.ga4?.pageviews || 0),
        weeks: toWeekly(ga4W?.pageviews),
        goalDefault: String(metaDe("paginas_vistas", 5000)),
        goalSuffix: "",
        cumple: (md?.ga4?.pageviews || 0) >= metaDe("paginas_vistas", 5000),
      },
      {
        id: "tasa_rebote",
        title: t("kpi_rebote_ga4"),
        peso: pesoDe("tasa_rebote", 9),
        average: `${md?.ga4?.bounceRate || 0}%`,
        weeks: toWeeklyPct(ga4W?.bounceRate),
        goalDefault: String(metaDe("tasa_rebote", 40)),
        goalSuffix: "%",
        cumple: (md?.ga4?.bounceRate || 0) <= metaDe("tasa_rebote", 40),
      },
      {
        id: "clicks_sc",
        title: t("kpi_clicks_sc"),
        peso: pesoDe("clicks_sc", 13),
        average: String(md?.totals?.totalClicks || 0),
        weeks: toWeekly(weekClicks),
        goalDefault: String(metaDe("clicks_sc", 500)),
        goalSuffix: "",
        cumple: (md?.totals?.totalClicks || 0) >= metaDe("clicks_sc", 500),
      },
      {
        id: "impresiones_sc",
        title: t("kpi_impresiones_sc"),
        peso: pesoDe("impresiones_sc", 9),
        average: String(md?.totals?.totalImpressions || 0),
        weeks: toWeekly(weekImpressions),
        goalDefault: String(metaDe("impresiones_sc", 10000)),
        goalSuffix: "",
        cumple: (md?.totals?.totalImpressions || 0) >= metaDe("impresiones_sc", 10000),
      },
      {
        id: "ctr_sc",
        title: t("kpi_ctr_sc"),
        peso: pesoDe("ctr_sc", 9),
        average: `${md?.totals?.overallCtr || 0}%`,
        weeks: scWeeksPct(weekClicks, weekImpressions),
        goalDefault: String(metaDe("ctr_sc", 3)),
        goalSuffix: "%",
        cumple: (md?.totals?.overallCtr || 0) >= metaDe("ctr_sc", 3),
      },
      {
        id: "posicion_sc",
        title: t("kpi_posicion_sc"),
        peso: pesoDe("posicion_sc", 13),
        average: String(md?.totals?.avgPosition || 0),
        weeks: toWeekly(md?.weekly?.position),
        goalDefault: String(metaDe("posicion_sc", 5)),
        goalSuffix: "",
        cumple: (md?.totals?.avgPosition || 0) <= metaDe("posicion_sc", 5) && (md?.totals?.avgPosition || 0) > 0,
      },
      {
        id: "email_open_rate",
        title: t("kpi_email"),
        peso: pesoDe("email_open_rate", 12),
        average: md?.emailMarketing?.openRate != null ? `${md.emailMarketing.openRate}%` : "0%",
        weeks: (md?.emailMarketing?.weeklyOpenRate || defWeeks).map((v: number | null) => v != null ? `${v}%` : null),
        goalDefault: String(metaDe("email_open_rate", 20)),
        goalSuffix: "%",
        cumple: (md?.emailMarketing?.openRate || 0) >= metaDe("email_open_rate", 20),
      },
    ];
  })() : [];

  const cxcKpis = cxcData ? (() => {
    const k = cxcData.kpis;

    return [
      {
        id: "efectividad_cobranza",
        title: t("kpi_efectividad_cobranza"),
        peso: pesoDe("efectividad_cobranza", 35),
        average: k.efectividad.value !== null ? `${k.efectividad.value}%` : "N/A",
        weeks: cxcData.semanaEfectividad || Array(5).fill(null),
        goalDefault: String(k.efectividad.meta),
        goalSuffix: "%",
        isClickable: true,
        cumple: k.efectividad.value !== null ? k.efectividad.value >= k.efectividad.meta : false,
      },
      {
        id: "cartera_vencida",
        title: t("kpi_cartera_vencida"),
        peso: pesoDe("cartera_vencida", 30),
        average: k.carteraVencida.value !== null ? `${k.carteraVencida.value}%` : "N/A",
        weeks: [k.carteraVencida.value !== null ? String(k.carteraVencida.value) + "%" : null, null, null, null, null],
        // Foto puntual del % de cartera vencida; no tiene lectura por semana.
        sinSemana: true,
        goalDefault: String(k.carteraVencida.meta),
        goalSuffix: "%",
        isClickable: true,
        cumple: k.carteraVencida.value !== null ? k.carteraVencida.value <= k.carteraVencida.meta : false,
      },
      {
        id: "recuperacion_vencidos",
        title: t("kpi_recuperacion"),
        peso: pesoDe("recuperacion_vencidos", 25),
        // Recuperación del mes contra el saldo vencido al iniciarlo
        // (lib/cxc/recuperacion.ts, issue #189). Sin desglose semanal: el
        // denominador es una foto al inicio del mes, no una serie.
        average: k.recuperacion.value !== null ? `${k.recuperacion.value}%` : "N/A",
        weeks: [k.recuperacion.value !== null ? String(k.recuperacion.value) + "%" : null, null, null, null, null],
        sinSemana: true,
        goalDefault: String(k.recuperacion.meta),
        goalSuffix: "%",
        isClickable: true,
        cumple: k.recuperacion.value !== null ? k.recuperacion.value >= k.recuperacion.meta : false,
      },
      {
        id: "dso",
        title: t("kpi_dso"),
        peso: pesoDe("dso", 10),
        average: k.dso.value !== null ? `${k.dso.value}${t("suffix_dias")}` : "N/A",
        weeks: [k.dso.value !== null ? String(k.dso.value) : null, null, null, null, null],
        // Ventana móvil de 90 días: no es una métrica semanal.
        sinSemana: true,
        goalDefault: String(k.dso.meta),
        goalSuffix: " días",
        isClickable: true,
        cumple: k.dso.value !== null ? k.dso.value <= k.dso.meta : false,
      },
    ];
  })() : [];

  const cppKpis = cppData ? (() => {
    const metas = cppData.metas || {};
    return [
      {
        id: "pagos_a_tiempo",
        title: t("kpi_pagos_tiempo"),
        peso: pesoDe("pagos_a_tiempo", 35),
        average: cppData.pagosATiempoPct == null ? "N/A" : `${cppData.pagosATiempoPct}%`,
        weeks: cppData.semanaPagosATiempo || Array(5).fill(null),
        goalDefault: String(metas["pagos_a_tiempo"] ?? 95),
        goalSuffix: "%",
        isClickable: true,
        subtitle: t("cpp_por_monto", { value: cppData.pagosATiempoPct, value2: cppData.pagosATiempoCantidad }),
        cumple: cppData.pagosATiempoPct >= (metas["pagos_a_tiempo"] ?? 95),
      },
      {
        id: "cuentas_pagar_vencidas",
        title: t("kpi_cxpagar_vencidas"),
        peso: pesoDe("cuentas_pagar_vencidas", 30),
        average: cppData.cuentasVencidasPct == null ? "N/A" : `${cppData.cuentasVencidasPct}%`,
        weeks: cppData.semanaVencidas || Array(5).fill(null),
        goalDefault: String(metas["cuentas_pagar_vencidas"] ?? 5),
        goalSuffix: "%",
        isClickable: true,
        subtitle: t("cpp_vencido", { value: cppData.totalVencido?.toLocaleString(), value2: cppData.totalCxPOpen?.toLocaleString() }),
        cumple: cppData.cuentasVencidasPct <= (metas["cuentas_pagar_vencidas"] ?? 5),
      },
      {
        id: "procesamiento_oportuno",
        title: t("kpi_procesamiento"),
        peso: pesoDe("procesamiento_oportuno", 20),
        average: cppData.procesamientoOportunoPct == null ? "N/A" : `${cppData.procesamientoOportunoPct}%`,
        weeks: cppData.semanaProcesamiento || Array(5).fill(null),
        goalDefault: String(metas["procesamiento_oportuno"] ?? 95),
        goalSuffix: "%",
        isClickable: true,
        subtitle: t("cpp_sla", { value: cppData.avgProcessingDays }),
        cumple: cppData.procesamientoOportunoPct >= (metas["procesamiento_oportuno"] ?? 95),
      },
      {
        id: "dpo",
        title: t("kpi_dpo"),
        peso: pesoDe("dpo", 15),
        average: cppData.dpo == null ? "N/A" : `${cppData.dpo}${t("suffix_dias")}`,
        weeks: cppData.semanaDpo || Array(5).fill(null),
        // El DPO es una ventana móvil de 90 días: no tiene lectura por semana.
        sinSemana: true,
        goalDefault: String(metas["dpo"] ?? 30),
        goalSuffix: " días",
        isClickable: true,
        subtitle: t("cpp_ventana", { value: cppData.dpoCxPTotal?.toLocaleString(), value2: cppData.dpoComprasCredito?.toLocaleString() }),
        cumple: cppData.dpo <= (metas["dpo"] ?? 30),
      },
    ];
  })() : [];

  const weekHeaders = kpiData?.weekHeaders || [];

  const allGroups = [
    { id: "group-ventas", title: t("group_ventas"), count: ventasKpis.length, kpis: ventasKpis, weekHeaders },
    { id: "group-compras", title: t("group_compras"), count: comprasKpis.length, kpis: comprasKpis, weekHeaders },
    // El grupo de CxC va SIEMPRE (para superadmin / CxC / gerente de ops): si
    // la carga falla, se muestra con el aviso de error en vez de esconderse.
    // El filtro `groups` de abajo ya lo excluye de las otras vistas.
    // CxC y CxP muestran la grilla semanal en la pestaña Semanal. Los KPIs que
    // no tienen lectura por semana (DSO, cartera vencida, recuperación en CxC;
    // DPO en CxP) van marcados `sinSemana` a nivel KPI y salen como "métrica
    // mensual". Sólo la efectividad de cobranza de CxC tiene serie semanal real
    // (`semanaEfectividad`, bucketeada por fecha de vencimiento).
    { id: "group-cxc", title: t("group_cxc"), count: cxcKpis.length, kpis: cxcKpis, weekHeaders, estado: { cargando: cxcLoading, error: cxcError } },
    ...(cppKpis.length > 0 ? [{ id: "group-cpp", title: t("group_cpp"), count: cppKpis.length, kpis: cppKpis, weekHeaders }] : []),
    ...(marketingKpis.length > 0 ? [{ id: "group-marketing", title: t("group_marketing"), count: marketingKpis.length, kpis: marketingKpis, weekHeaders }] : []),
  ];
  const gruposBase = comprasMode
    ? allGroups.filter((g) => g.id === "group-compras")
    : cxCMode
    ? allGroups.filter((g) => g.id === "group-cxc")
    : vendorMode || gerenteVentaMode
    ? allGroups
        .filter((g) => g.id === "group-ventas")
        // "Margen Bruto" es visible para Gerencia de Ventas y superadmin,
        // pero no para el rol Vendedor (issue #177) -- se filtra solo acá,
        // sin tocar `ventasKpis` para no afectar a gerenteVentaMode, que
        // comparte el mismo array.
        .map((g) => {
          if (!vendorMode) return g;
          const kpis = g.kpis.filter((k: any) => k.id !== "margen_bruto");
          return { ...g, kpis, count: kpis.length };
        })
    : gerenteOpsMode
    ? allGroups
    : allGroups;

  // El resumen del semáforo se calcula sobre TODOS los KPIs, no sobre el
  // filtro de búsqueda.
  const resumenGlobal = contarNiveles(gruposBase.flatMap((g: any) => g.kpis || []));

  // Puntaje ponderado del mes: promedio de los puntajes de cada grupo visible
  // (cada grupo pondera sus KPIs por su "peso"; entre grupos se promedia).
  const puntajesPorGrupo = gruposBase
    .map((g: any) => puntajeGrupo(g.kpis || []))
    .filter((p): p is NonNullable<typeof p> => p !== null);
  const puntajeMes = puntajesPorGrupo.length
    ? Math.round(puntajesPorGrupo.reduce((s, p) => s + p.valor, 0) / puntajesPorGrupo.length)
    : null;

  // El buscador filtra solo las filas de las tablas (no los conteos ni el
  // resumen).
  const filtroNorm = kpiFiltro.trim().toLowerCase();
  const groups = filtroNorm
    ? gruposBase.map((g: any) => ({
        ...g,
        kpis: (g.kpis || []).filter((k: any) =>
          String(k.title || "").toLowerCase().includes(filtroNorm),
        ),
      }))
    : gruposBase;
  const mesTitulo = mesLabel(selectedMes).charAt(0).toUpperCase() + mesLabel(selectedMes).slice(1);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header & Title */}
      <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            {customDateRange ? t("date_range") : mesTitulo}
          </p>
          <h1 className="text-[26px] leading-tight font-semibold text-slate-900 tracking-tight mt-1">
            {t("page_title")}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t("page_subtitle")}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {marketingData && !marketingData.connected && (
            <a
              href="/api/auth/google"
              className="inline-flex items-center gap-2 px-3 h-9 border border-slate-200 bg-white text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              {t("google_connect")}
            </a>
          )}
          {marketingData?.connected && (
            <span className="inline-flex items-center gap-1.5 px-2.5 h-9 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-lg border border-emerald-200">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
              {t("google_connected")}
            </span>
          )}
        </div>
      </div>

      {/* Resumen del semáforo — cuántos KPIs en meta / cerca / lejos */}
      {resumenGlobal.total > 0 && (
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 animate-in fade-in duration-300">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Estado del mes
                </p>
                <p className="mt-0.5 text-lg font-semibold text-slate-900 tabular-nums">
                  {resumenGlobal.verde}
                  <span className="text-slate-400 font-normal"> / {resumenGlobal.total} </span>
                  <span className="text-sm font-medium text-slate-500">en meta</span>
                </p>
              </div>
              {puntajeMes !== null && (
                <div className="border-l border-slate-200 pl-6">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    {t("cumplimiento_ponderado")}
                  </p>
                  <p className={`mt-0.5 text-lg font-semibold tabular-nums ${getCellColor(String(puntajeMes)).split(" ")[1] || "text-slate-900"}`}>
                    {puntajeMes}%
                  </p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-4 text-sm">
              {([
                ["verde", resumenGlobal.verde, "En meta"],
                ["amarillo", resumenGlobal.amarillo, "Cerca"],
                ["rojo", resumenGlobal.rojo, "Lejos"],
              ] as const).map(([nivel, n, lbl]) => (
                <span key={nivel} className="inline-flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${NIVEL_UI[nivel].punto}`} />
                  <span className="tabular-nums font-semibold text-slate-800">{n}</span>
                  <span className="text-slate-400">{lbl}</span>
                </span>
              ))}
            </div>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100 flex">
            {(["verde", "amarillo", "rojo"] as const).map((nivel) => {
              const n = resumenGlobal[nivel];
              if (!n) return null;
              return (
                <div
                  key={nivel}
                  className={`${NIVEL_UI[nivel].barra} transition-[width] duration-500`}
                  style={{ width: `${(n / resumenGlobal.total) * 100}%` }}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
        {([["Trends", t("tab_trends")], ["Weekly", t("tab_weekly")], ["Monthly", t("tab_monthly")], ["Quarterly", t("tab_quarterly")], ["Annual", t("tab_annual")]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === key
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      {!vendorMode && !cxCMode && !gerenteOpsMode && (
      <div className="mb-6 flex flex-wrap justify-between items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3">
        <div className="flex gap-3">
          {isSuperAdmin ? (
          <div
            onClick={() => setTeamDropdownOpen(!teamDropdownOpen)}
            className="flex items-center gap-2 h-9 px-3 border border-slate-200 bg-white rounded-lg text-sm hover:bg-slate-50 transition-colors relative cursor-pointer"
          >
            {t("team_label")} {empresaLabel} <ChevronDown size={14} />
            {teamDropdownOpen && (
              <div data-dropdown-content className="absolute top-full left-0 mt-1 bg-white border rounded-lg shadow-lg z-50 min-w-[160px]">
                {empresas.map((emp) => (
                  <button
                    key={emp.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedCompanyId(emp.id);
                      setTeamDropdownOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-50 transition-colors ${selectedCompanyId === emp.id ? "bg-slate-100 text-slate-900 font-medium" : "text-slate-700"}`}
                  >
                    {emp.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          ) : (
          <div className="flex items-center gap-2 h-9 px-3 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-600">
            {t("team_label")} {empresaLabel}
          </div>
          )}
          {/* View by */}
          <div className="relative">
            <button
              onClick={() => setViewByOpen(o => !o)}
              className="flex items-center gap-2 h-9 px-3 border border-slate-200 bg-white rounded-lg text-sm hover:bg-slate-50 transition-colors"
            >
              View by: {activeTab === "Monthly" ? t("view_month") : activeTab === "Quarterly" ? t("view_quarter") : activeTab === "Annual" ? t("view_year") : t("view_week")}
              <ChevronDown size={14} />
            </button>
            {viewByOpen && (
              <div data-dropdown-content className="absolute top-full left-0 mt-1 bg-white border rounded-lg shadow-lg z-50 min-w-[140px]">
                {[
                  { label: t("view_week"), tab: "Weekly" },
                  { label: t("view_month"), tab: "Monthly" },
                  { label: t("view_quarter"), tab: "Quarterly" },
                  { label: t("view_year"), tab: "Annual" },
                ].map(opt => (
                  <button
                    key={opt.tab}
                    onClick={() => { setActiveTab(opt.tab); setViewByOpen(false); }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-50 transition-colors ${activeTab === opt.tab ? "bg-slate-100 text-slate-900 font-medium" : "text-slate-700"}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Date Range */}
          <div className="relative">
            <button
              onClick={() => { setDateRangeOpen(o => !o); setViewByOpen(false); }}
              className={`flex items-center gap-2 h-9 px-3 border border-slate-200 bg-white rounded-lg text-sm hover:bg-slate-50 transition-colors ${customDateRange ? "border-indigo-300 bg-indigo-50 text-indigo-700" : ""}`}
            >
              <Calendar size={14} />
              {customDateRange
                ? `${customDateRange.start.slice(8)}/${customDateRange.start.slice(5, 7)} – ${customDateRange.end.slice(8)}/${customDateRange.end.slice(5, 7)}`
                : (mesLabel(selectedMes).charAt(0).toUpperCase() + mesLabel(selectedMes).slice(1))
              }
              <ChevronDown size={14} />
            </button>
            {dateRangeOpen && (
              <div data-dropdown-content className="absolute top-full left-0 mt-2 bg-white border rounded-xl shadow-xl z-50 w-72 p-4">
                <p className="text-xs font-semibold text-slate-500 mb-3 uppercase tracking-wide">{t("date_range")}</p>
                <div className="space-y-2 mb-3">
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">{t("date_from")}</label>
                    <input
                      type="date"
                      value={dateInputStart}
                      onChange={e => setDateInputStart(e.target.value)}
                      className="w-full px-3 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">{t("date_to")}</label>
                    <input
                      type="date"
                      value={dateInputEnd}
                      onChange={e => setDateInputEnd(e.target.value)}
                      className="w-full px-3 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (dateInputStart && dateInputEnd && dateInputStart <= dateInputEnd) {
                        const [y, m] = dateInputStart.split("-").map(Number);
                        setSelectedMes(`${y}-${String(m).padStart(2, "0")}`);
                        setCustomDateRange({ start: dateInputStart, end: dateInputEnd });
                        setDateRangeOpen(false);
                      }
                    }}
                    disabled={!dateInputStart || !dateInputEnd || dateInputStart > dateInputEnd}
                    className="flex-1 bg-slate-900 text-white text-sm py-1.5 rounded-lg font-medium hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {t("apply")}
                  </button>
                  <button
                    onClick={() => {
                      setCustomDateRange(null);
                      setDateInputStart("");
                      setDateInputEnd("");
                      const n = new Date();
                      setSelectedMes(`${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`);
                      setDateRangeOpen(false);
                    }}
                    className="px-3 py-1.5 border rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    {t("clear")}
                  </button>
                </div>
                <div className="mt-3 border-t pt-3">
                  <p className="text-xs font-medium text-slate-500 mb-2">{t("quick_access")}</p>
                  <div className="flex flex-wrap gap-1">
                    {getMesOptions().slice(0, 4).map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => {
                          setSelectedMes(opt.value);
                          setCustomDateRange(null);
                          setDateInputStart("");
                          setDateInputEnd("");
                          setDateRangeOpen(false);
                        }}
                        className={`px-2 py-1 rounded-md text-xs transition-colors capitalize ${selectedMes === opt.value && !customDateRange ? "bg-slate-900 text-white font-medium" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-3 items-center">
          <button
            onClick={() => { fetchData(false); fetchMarketingData(); fetchCxCData(); fetchCppData(); }}
            className="inline-flex items-center justify-center w-9 h-9 border border-slate-200 bg-white rounded-lg text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
            title={t("refresh")}
          >
            <RotateCcw size={16} />
          </button>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text"
              value={kpiFiltro}
              onChange={(e) => setKpiFiltro(e.target.value)}
              placeholder={t("search_placeholder")}
              className="pl-8 pr-8 h-9 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 w-64 transition-shadow"
            />
            {kpiFiltro && (
              <button
                type="button"
                onClick={() => setKpiFiltro("")}
                aria-label={t("clear")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>
      </div>
      )}

      {/* Marketing Not Connected Banner */}
      {marketingData && !marketingData.connected && (
        <div className="mb-4 p-4 bg-white border border-slate-200 rounded-2xl flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-slate-500" viewBox="0 0 24 24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-900">{t("google_banner_title")}</p>
              <p className="text-xs text-slate-500">{t("google_banner_desc")}</p>
            </div>
          </div>
          <a
            href="/api/auth/google"
            className="px-4 h-9 inline-flex items-center bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors"
          >
            {t("google_connect")}
          </a>
        </div>
      )}

      {/* KPI Groups */}
      <div className="space-y-4">
        {groups.map((group) => {
          const r = contarNiveles(group.kpis || []);
          const peor: Nivel = r.rojo > 0 ? "rojo" : r.amarillo > 0 ? "amarillo" : r.verde > 0 ? "verde" : "sin";
          const pg = puntajeGrupo((gruposBase.find((gb: any) => gb.id === group.id) || group).kpis || []);
          return (
          <div key={group.id} className="rounded-2xl border border-slate-200 bg-white overflow-hidden animate-in fade-in-0 duration-300">
            {/* Group Header */}
            <button
              type="button"
              onClick={() => toggleGroup(group.id)}
              className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50/60 transition-colors"
            >
              <span
                className={`h-6 w-1 rounded-full shrink-0 ${peor === "sin" ? "bg-slate-200" : NIVEL_UI[peor].barra}`}
              />
              <span className="font-semibold text-[15px] text-slate-900 tracking-tight">
                {group.title}
              </span>
              <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 text-xs rounded-md font-medium tabular-nums">
                {group.count}
              </span>
              {r.total > 0 && (
                <span className="hidden sm:flex items-center gap-3 ml-2 text-xs text-slate-400">
                  {(["verde", "amarillo", "rojo"] as const).map((n) =>
                    r[n] > 0 ? (
                      <span key={n} className="inline-flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${NIVEL_UI[n].punto}`} />
                        <span className="tabular-nums font-medium text-slate-500">{r[n]}</span>
                      </span>
                    ) : null,
                  )}
                </span>
              )}
              {pg && (
                <span
                  className={`ml-auto shrink-0 text-xs font-semibold tabular-nums px-1.5 py-0.5 rounded-md ${getCellColor(String(pg.valor)) || "text-slate-600"}`}
                  title={t("cumplimiento_ponderado")}
                >
                  {pg.valor}%
                </span>
              )}
              <ChevronDown
                size={16}
                className={`${pg ? "ml-1.5" : "ml-auto"} shrink-0 text-slate-400 transition-transform ${expandedGroups[group.id] ? "rotate-180" : ""}`}
              />
            </button>

            {/* Estado del grupo cuando no llegó ningún KPI (p. ej. CxC no cargó). */}
            {expandedGroups[group.id] && group.kpis.length === 0 && (
              <div className="p-8 text-center text-sm border-t border-slate-100 animate-in fade-in duration-200">
                {filtroNorm ? (
                  <span className="text-slate-400">{t("sin_coincidencias")}</span>
                ) : (group as any).estado?.cargando ? (
                  <span className="inline-flex items-center gap-2 text-slate-500">
                    <RefreshCw size={14} className="animate-spin" />
                    {t("loading")}
                  </span>
                ) : (group as any).estado?.error ? (
                  <div className="space-y-3">
                    <p className="text-slate-500">{(group as any).estado.error}</p>
                    <button
                      onClick={() => fetchCxCData()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-md text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      <RefreshCw size={14} />
                      Reintentar
                    </button>
                  </div>
                ) : (
                  <span className="text-slate-400">{t("no_available_data")}</span>
                )}
              </div>
            )}

            {/* Table / View */}
            {expandedGroups[group.id] && group.kpis.length > 0 && activeTab === "Trends" && (
              <div className="divide-y divide-slate-100 border-t border-slate-100 animate-in fade-in slide-in-from-top-1 duration-200">
                {group.kpis.map((kpi: any) => {
                  const nivel = nivelSemaforo(kpi.id, kpi.average, kpi.goalDefault);
                  return (
                  <div key={kpi.id} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50/70 transition-colors">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${nivel === "sin" ? "bg-slate-300" : NIVEL_UI[nivel].punto}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800 truncate">
                        {kpi.title}
                        {sinMeta(kpi.goalDefault) && (
                          <span className="ml-2 text-[10px] font-normal text-slate-400 bg-slate-100 rounded px-1 py-px align-middle">
                            {t("sin_meta")}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5 tabular-nums">{t("peso")}: {kpi.peso} · {t("meta")}: {kpi.goalDefault}{kpi.goalSuffix}</div>
                    </div>
                    <span className={`text-xs w-16 text-right px-1.5 py-0.5 rounded-md tabular-nums ${sinMeta(kpi.goalDefault) ? "text-slate-300" : getKpiCellColor(kpi.id, kpi.average, kpi.goalDefault) || "text-slate-600 font-medium"}`}>{sinMeta(kpi.goalDefault) ? "–" : kpi.average}</span>
                    <div className="w-[140px] flex items-end justify-start gap-[2px]" title={kpi.sinSemana ? t("metrica_mensual") : kpi.weeks.map((v: string|null, i: number) => `S${i+1}: ${v || "-"}`).join(" | ")}>
                      {kpi.sinSemana ? (
                        <span className="text-[11px] text-slate-300">{t("metrica_mensual")}</span>
                      ) : (
                        <SparklineBar values={kpi.weeks} kpiId={kpi.id} goal={kpi.goalDefault} />
                      )}
                    </div>
                    <div className="text-xs text-slate-400 w-20 text-right tabular-nums">{kpi.sinSemana ? "" : `${(group as any).weekHeaders.length} ${t("semanas_count")}`}</div>
                  </div>
                  );
                })}
              </div>
            )}

            {expandedGroups[group.id] && group.kpis.length > 0 && activeTab === "Weekly" && (
              <div className="overflow-x-auto border-t border-slate-100 animate-in fade-in slide-in-from-top-1 duration-200">
                <table className="w-full text-sm text-left border-collapse min-w-[880px]">
                  <thead>
                    <tr className="bg-slate-50/70 text-[11px] uppercase tracking-wide text-slate-400">
                      <th className="py-2.5 pl-4 pr-2 w-8"></th>
                      <th className="py-2.5 px-2 font-semibold min-w-[260px]">{t("column_title")}</th>
                      <th className="py-2.5 px-2 w-24 text-right font-semibold">{t("column_goal")}</th>
                      <th className="py-2.5 px-2 w-20 text-right font-semibold">{t("column_average")}</th>
                      <th className="py-2.5 px-2 w-14 text-right font-semibold">{t("peso")}</th>
                      {(group as any).weekHeaders.map((week: string, idx: number) => (
                        <th key={idx} className="py-2.5 px-2 w-24 text-center font-medium text-slate-400 normal-case">
                          {week}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {group.kpis.map((kpi: any) => {
                      const nivel = nivelSemaforo(kpi.id, kpi.average, kpi.goalDefault);
                      const kpiSinMeta = sinMeta(kpi.goalDefault);
                      return (
                      <tr
                        key={kpi.id}
                        className={`border-t border-slate-100 group ${kpi.isClickable ? "cursor-pointer hover:bg-slate-50/70" : ""}`}
                        onClick={kpi.isClickable ? (kpi.id === "cumplimiento_cuota_ventas" ? () => setModalOpen(true) : kpi.id === "clientes_nuevos" ? () => setClientesModalOpen(true) : kpi.id === "margen_bruto" ? () => setMargenModalOpen(true) : kpi.id === "efectividad_cierre" ? () => setEfectividadModalOpen(true) : kpi.id === "cobertura_marcas" ? () => setCoberturaModalOpen(true) : kpi.id === "activacion_cartera" ? () => setActivacionModalOpen(true) : kpi.id === "visitas_semanales" ? () => setVisitasModalOpen(true) : ["variacion_costo_compra","rotacion_saludable","quiebre_inventario","inventario_90_dias","forecast_semanal"].includes(kpi.id) ? () => { const map: Record<string,{type:string;title:string}> = {variacion_costo_compra:{type:"variacion_costo",title:"Variación del costo de compra"},rotacion_saludable:{type:"rotacion",title:"Rotación saludable de compras"},quiebre_inventario:{type:"quiebre",title:"Porcentaje de quiebre de inventario"},inventario_90_dias:{type:"inventario_90",title:"Inventario con más de 90 días"},forecast_semanal:{type:"forecast",title:"Revisión semanal de forecast Compras–Ventas"}}; const m = map[kpi.id]; setComprasKpiType(m.type); setComprasKpiTitle(m.title); setModalMes(selectedMes); setComprasModalOpen(true); } : kpi.id.startsWith("efectividad_") || kpi.id === "cartera_vencida" || kpi.id === "recuperacion_vencidos" || kpi.id === "dso" ? () => openCxcModal(kpi.id) : ["pagos_a_tiempo","cuentas_pagar_vencidas","procesamiento_oportuno","dpo"].includes(kpi.id) ? () => openCppModal(kpi.id) : undefined) : undefined}
                      >
                        <td className="py-3 pl-4 pr-2 align-top">
                          <span
                            className={`inline-block w-2 h-2 rounded-full mt-1.5 ${nivel === "sin" ? "bg-slate-300" : NIVEL_UI[nivel].punto}`}
                          />
                        </td>
                        <td className="py-3 px-2 text-slate-800 font-medium align-top">
                          <span className="inline-flex items-center gap-1.5">
                            {kpi.title}
                            <button
                              type="button"
                              aria-label="Info"
                              onClick={(e) => { e.stopPropagation(); setKpiInfoModal({ open: true, kpiId: kpi.id, title: kpi.title }); }}
                              className="shrink-0 text-slate-300 hover:text-slate-500"
                            >
                              <HelpCircle size={13} />
                            </button>
                            {kpiSinMeta && (
                              <span className="shrink-0 text-[10px] font-normal text-slate-400 bg-slate-100 rounded px-1 py-px">
                                {t("sin_meta")}
                              </span>
                            )}
                          </span>
                          {kpi.isClickable && (
                            <span className="ml-2 text-[10px] text-slate-400 font-normal opacity-0 group-hover:opacity-100 transition-opacity">
                              {t("click_detail")}
                            </span>
                          )}
                          {(kpi.hint || kpi.subtitle) && (
                            <div className="text-[10px] font-normal text-slate-400 mt-0.5">{kpi.hint || kpi.subtitle}</div>
                          )}
                        </td>
                        <td className="py-3 px-2 text-right align-top" onClick={(e) => e.stopPropagation()}>
                          {!isSuperAdmin ? (
                            <span className="text-sm font-medium text-slate-600 tabular-nums">{getGoal(kpi.id, kpi.goalDefault)}{kpi.goalSuffix}</span>
                          ) : (
                            <input
                              type="number"
                              value={getGoal(kpi.id, kpi.goalDefault)}
                              onChange={(e) => handleGoalChange(kpi.id, e.target.value)}
                              onBlur={(e) => handleGoalBlur(kpi.id, e.target.value)}
                              className="w-20 text-right text-sm font-medium text-slate-700 tabular-nums bg-slate-50 border border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-slate-300 transition-shadow"
                            />
                          )}
                        </td>
                        <td className="py-3 px-2 text-right align-top">
                          {kpiSinMeta ? (
                            <span className="text-slate-300">–</span>
                          ) : (
                            <span className={`inline-block px-1.5 py-0.5 rounded-md text-xs tabular-nums ${getKpiCellColor(kpi.id, kpi.average, kpi.goalDefault) || "text-slate-600 font-medium"}`}>
                              {kpi.average}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-2 text-right text-slate-400 tabular-nums align-top" onClick={(e) => e.stopPropagation()}>
                          {!isSuperAdmin ? (
                            kpi.peso
                          ) : (
                            <span className="inline-flex items-center gap-0.5">
                              <input
                                type="number"
                                value={pesoValues[kpi.id] ?? String(parseFloat(kpi.peso) || 0)}
                                onChange={(e) => handlePesoChange(kpi.id, e.target.value)}
                                onBlur={(e) => handlePesoBlur(kpi.id, parseFloat(kpi.peso) || 0, e.target.value)}
                                className="w-12 text-right text-xs font-medium text-slate-500 tabular-nums bg-slate-50 border border-slate-200 rounded px-1 py-0.5 focus:outline-none focus:ring-2 focus:ring-slate-300 transition-shadow"
                              />
                              <span className="text-slate-400">%</span>
                            </span>
                          )}
                        </td>
                        {kpi.sinSemana ? (
                          <td colSpan={(group as any).weekHeaders.length || 1} className="py-3 px-2 text-center align-top text-[11px] text-slate-400">
                            {t("metrica_mensual")}
                          </td>
                        ) : kpi.weeks.map((val: string | null, idx: number) => {
                          const c = getKpiCellColor(kpi.id, val, kpi.goalDefault);
                          return (
                            <td key={idx} className="py-3 px-2 text-center align-top">
                              {val && !kpiSinMeta ? (
                                <span className={`inline-block min-w-[3rem] px-1.5 py-1 rounded-md text-xs tabular-nums ${c || "text-slate-600"}`}>
                                  {val}
                                </span>
                              ) : (
                                <span className="text-slate-300">–</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {expandedGroups[group.id] && group.kpis.length > 0 && (activeTab === "Monthly" || activeTab === "Quarterly" || activeTab === "Annual") && (
              monthlyHistLoading ? (
                <div className="p-8 text-center text-slate-500 text-sm">{t("loading_historical")}</div>
              ) : monthlyHistory.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">{t("no_available_data")}</div>
              ) : (
                <div className="overflow-x-auto border-t border-slate-100 animate-in fade-in slide-in-from-top-1 duration-200">
                  <table className="w-full text-sm text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/70 text-[11px] uppercase tracking-wide text-slate-400">
                        <th className="py-2.5 px-4 font-semibold min-w-[260px]">KPI</th>
                        <th className="py-2.5 px-2 w-14 text-right font-semibold">{t("peso")}</th>
                        {monthlyHistory.map(h => (
                          <th key={h.mes} className="py-2.5 px-2 w-24 text-center font-medium text-slate-400 capitalize normal-case">
                            {mesLabel(h.mes)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {group.kpis.map((kpi: any) => (
                        <tr key={kpi.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                          <td className="py-3 px-4 text-slate-800 font-medium">
                            {kpi.title}
                            {sinMeta(kpi.goalDefault) && (
                              <span className="ml-2 text-[10px] font-normal text-slate-400 bg-slate-100 rounded px-1 py-px align-middle">
                                {t("sin_meta")}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-2 text-right text-slate-400 tabular-nums">{kpi.peso}</td>
                          {monthlyHistory.map(h => {
                            const val = getMonthlyValue(kpi.id, h);
                            const c = getKpiCellColor(kpi.id, val, kpi.goalDefault);
                            return (
                              <td key={h.mes} className="py-3 px-2 text-center align-top">
                                {val && val !== "-" && !sinMeta(kpi.goalDefault) ? (
                                  <span className={`inline-block min-w-[3rem] px-1.5 py-1 rounded-md text-xs tabular-nums ${c || "text-slate-600"}`}>
                                    {val}
                                  </span>
                                ) : (
                                  <span className="text-slate-300">–</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>
          );
        })}
      </div>

      {/* MODAL DE CUMPLIMIENTO DE CUOTA */}
      <CuotaDetailModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        apiPrefix={apiPrefix}
        companyId={(!vendorMode && !gerenteOpsMode) ? selectedCompanyId : null}
        defaultMes={selectedMes}
      />

      {/* MODAL DE CLIENTES NUEVOS */}
      <ClientesNuevosModal
        isOpen={clientesModalOpen}
        onClose={() => setClientesModalOpen(false)}
        apiPrefix={apiPrefix}
        companyId={(!vendorMode && !gerenteOpsMode) ? selectedCompanyId : null}
        defaultMes={selectedMes}
      />

      {/* MODAL DE MARGEN BRUTO */}
      <MargenBrutoModal
        isOpen={margenModalOpen}
        onClose={() => setMargenModalOpen(false)}
        apiPrefix={apiPrefix}
        companyId={(!vendorMode && !gerenteOpsMode) ? selectedCompanyId : null}
        defaultMes={selectedMes}
        // Gerencia de Ventas ve margen % pero no costo/ganancia (issue #178).
        ocultarCostoGanancia={gerenteVentaMode}
      />

      {/* MODAL DE EFECTIVIDAD DE CIERRE */}
      <EfectividadCierreModal
        isOpen={efectividadModalOpen}
        onClose={() => setEfectividadModalOpen(false)}
        apiPrefix={apiPrefix}
        companyId={(!vendorMode && !gerenteOpsMode) ? selectedCompanyId : null}
        defaultMes={selectedMes}
      />

      {/* Cobertura Marcas Modal */}
      <CoberturaMarcasModal
        isOpen={coberturaModalOpen}
        onClose={() => setCoberturaModalOpen(false)}
        apiPrefix={apiPrefix}
        companyId={(!vendorMode && !gerenteOpsMode) ? selectedCompanyId : null}
        defaultMes={selectedMes}
      />

      {/* Activacion Cartera Modal */}
      <ActivacionCarteraModal
        isOpen={activacionModalOpen}
        onClose={() => setActivacionModalOpen(false)}
        apiPrefix={apiPrefix}
        companyId={(!vendorMode && !gerenteOpsMode) ? selectedCompanyId : null}
        defaultMes={selectedMes}
      />

      {/* Visitas Semanales Modal */}
      <VisitasSemanalesModal
        isOpen={visitasModalOpen}
        onClose={() => setVisitasModalOpen(false)}
        apiPrefix={apiPrefix}
        queryCompanyId={(!vendorMode && !gerenteOpsMode) ? selectedCompanyId : null}
        postCompanyId={vendorMode ? null : selectedCompanyId}
        gerenteOpsMode={gerenteOpsMode}
        sellers={kpiData?.sellers || []}
        defaultMes={selectedMes}
      />
      {/* MODAL DE COMPRAS KPIs */}
      <ComprasDetailModal
        isOpen={comprasModalOpen}
        onClose={() => setComprasModalOpen(false)}
        kpiType={comprasKpiType}
        kpiTitle={comprasKpiTitle}
        companyId={selectedCompanyId}
        mes={modalMes}
        onMesChange={onModalMesChange}
      />
      <CxCDetailModal
        isOpen={cxcModalOpen}
        onClose={() => { setCxcModalOpen(false); setCxcModalKpi(""); }}
        kpiId={cxcModalKpi}
        companyId={selectedCompanyId}
        empresaLabel={empresaLabel}
        mes={selectedMes}
      />

      <CxPDetailModal
        isOpen={cppModalOpen}
        onClose={() => { setCppModalOpen(false); setCppModalKpi(""); }}
        kpiId={cppModalKpi}
        companyId={selectedCompanyId}
        apiPrefix={apiPrefix}
        empresaLabel={empresaLabel}
        mes={selectedMes}
      />

      <KpiInfoModal
        open={kpiInfoModal.open}
        kpiId={kpiInfoModal.kpiId}
        title={kpiInfoModal.title}
        onClose={() => setKpiInfoModal({ open: false, kpiId: "", title: "" })}
      />
      </div>
    </div>
  );
}
