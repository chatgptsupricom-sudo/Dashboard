"use client";

import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  HelpCircle,
  Maximize2,
  MoreHorizontal,
  Package,
  Plus,
  RotateCcw,
  Search,
  Settings,
  User,
  UserCheck,
  X,
  Check,
  Calendar,
  TrendingUp,
  ArrowLeft,
  RefreshCw,
} from "lucide-react";
import { BarChart, Bar, ResponsiveContainer, Tooltip } from "recharts";
import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import ComprasDetailModal from "./ComprasDetailModal";

const getCellColor = (value: string) => {
  if (!value) return "";
  const numValue = parseInt(value);
  if (isNaN(numValue)) return "";
  if (numValue < 60) return "bg-red-100 text-red-800 font-medium";
  if (numValue >= 100) return "bg-green-100 text-green-800 font-medium";
  return "bg-yellow-100 text-yellow-800 font-medium";
};

const getKpiCellColor = (kpiId: string, value: string | null, goal: string) => {
  if (!value) return "";
  const numVal = parseFloat(value.replace("%", "").replace(" días", "").trim());
  const numGoal = parseFloat(goal);
  if (isNaN(numVal) || isNaN(numGoal)) return getCellColor(value);

  const higherBetter = ["efectividad_cobranza", "recuperacion_vencidos", "pagos_a_tiempo", "procesamiento_oportuno",
    "usuarios_totales", "sesiones", "paginas_vistas", "clicks_sc", "impresiones_sc", "ctr_sc", "email_open_rate"];
  const lowerBetter = ["cartera_vencida", "dso", "cuentas_pagar_vencidas", "dpo", "tasa_rebote", "posicion_sc"];

  if (higherBetter.includes(kpiId)) {
    if (numVal >= numGoal) return "bg-emerald-100 text-emerald-800 font-medium";
    if (numVal >= numGoal * 0.85) return "bg-amber-100 text-amber-800 font-medium";
    return "bg-red-100 text-red-800 font-medium";
  }

  if (lowerBetter.includes(kpiId)) {
    if (numVal <= numGoal) return "bg-emerald-100 text-emerald-800 font-medium";
    if (numVal <= numGoal * 1.2) return "bg-amber-100 text-amber-800 font-medium";
    return "bg-red-100 text-red-800 font-medium";
  }

  return getCellColor(value);
};

interface SellerData {
  nombre: string;
  cuotaMensual: number;
  facturadoMensual: number;
  semanas: { facturado: number; cuotaSemanal: number }[];
}

interface KpiData {
  metaMensual: number;
  totalCuotaMensual: number;
  totalFacturadoMensual: number;
  porcentajeCumplimiento: number;
  numSemanas: number;
  weekHeaders: string[];
  sellers: SellerData[];
  semanaGlobal: string[];
  trend: string;
  metas: Record<string, number>;
  semanaVarCosto: (string | null)[];
  semanaRotacion: (string | null)[];
  semanaQuiebre: (string | null)[];
  semanaInv90: (string | null)[];
  semanaForecast: (string | null)[];
  semanaPropuestas: (string | null)[];
  avgVarCosto: number;
  avgRotacion: number;
  avgQuiebre: number;
  avgInv90: number;
  avgForecast: number;
  avgPropuestas: number;
}

interface SellerDetail {
  sellerId: number;
  nombre: string;
  cuotaMensual: number;
  cuotaDiaria: number;
  totalFacturado: number;
  porcentajeMensual: number;
  cumple: boolean;
  dias: { fecha: string; diaSemana: string; esFeriado: boolean; esDiaUtil: boolean; facturado: number; cuotaDiaria: number; cumple: boolean }[];
  semanas: { numero: number; inicio: string; fin: string; facturado: number; cuotaSemanal: number; diasUtiles: number; porcentaje: number }[];
}

export default function StoplightReportSuperadmin({ vendorMode = false, comprasMode = false, gerenteVentaMode = false, isSuperAdmin = false, cxCMode = false, companyId }: { vendorMode?: boolean; comprasMode?: boolean; gerenteVentaMode?: boolean; isSuperAdmin?: boolean; cxCMode?: boolean; companyId?: number } = {}) {
  const t = useTranslations("stoplight");
  const [activeTab, setActiveTab] = useState("Weekly");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({ "group-ventas": true, "group-compras": true });
  const [kpiData, setKpiData] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingMeta, setEditingMeta] = useState(false);
  const [metaInput, setMetaInput] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalData, setModalData] = useState<{ mes: string; totalDiasUtiles: number; sellers: SellerDetail[] } | null>(null);
  const [selectedSeller, setSelectedSeller] = useState<SellerDetail | null>(null);
  const [modalTab, setModalTab] = useState<"resumen" | "diario" | "semanal">("resumen");
  const [goalValues, setGoalValues] = useState<Record<string, string>>({});
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

  const openModalWith = async (fetchFn: (mes: string) => Promise<void>, mes: string) => {
    modalFetchRef.current = fetchFn;
    setModalMes(mes);
    await fetchFn(mes);
  };

  const onModalMesChange = async (newMes: string) => {
    setModalMes(newMes);
    if (modalFetchRef.current) await modalFetchRef.current(newMes);
  };

  const [customDateRange, setCustomDateRange] = useState<{ start: string; end: string } | null>(null);
  const [dateInputStart, setDateInputStart] = useState("");
  const [dateInputEnd, setDateInputEnd] = useState("");
  const [dateRangeOpen, setDateRangeOpen] = useState(false);
  const [viewByOpen, setViewByOpen] = useState(false);
  const [monthlyHistory, setMonthlyHistory] = useState<any[]>([]);
  const [monthlyHistLoading, setMonthlyHistLoading] = useState(false);

  const [clientesModalOpen, setClientesModalOpen] = useState(false);
  const [clientesModalLoading, setClientesModalLoading] = useState(false);
  const [clientesModalData, setClientesModalData] = useState<any>(null);
  const [clientesModalTab, setClientesModalTab] = useState<"resumen" | "semanal">("resumen");
  const [selectedClientesSeller, setSelectedClientesSeller] = useState<any>(null);
  const [selectedClientesClient, setSelectedClientesClient] = useState<any>(null);
  const [clientesSellerDetail, setClientesSellerDetail] = useState<any>(null);
  const [clientesSellerLoading, setClientesSellerLoading] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [invoiceDetail, setInvoiceDetail] = useState<any>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [marketingData, setMarketingData] = useState<any>(null);
  const [marketingLoading, setMarketingLoading] = useState(false);
  const [cxcData, setCxcData] = useState<any>(null);
  const [cxcLoading, setCxcLoading] = useState(false);
  const [cppData, setCppData] = useState<any>(null);
  const [cppLoading, setCppLoading] = useState(false);
  const [cxcModalOpen, setCxcModalOpen] = useState(false);
  const [cxcModalLoading, setCxcModalLoading] = useState(false);
  const [cxcModalData, setCxcModalData] = useState<any>(null);
  const [cxcModalKpi, setCxcModalKpi] = useState<string>("");
  const [cxcSelectedInvoice, setCxcSelectedInvoice] = useState<any>(null);
  const [cxcInvoiceDetail, setCxcInvoiceDetail] = useState<any>(null);
  const [cxcInvoiceLoading, setCxcInvoiceLoading] = useState(false);

  const [cppModalOpen, setCppModalOpen] = useState(false);
  const [cppModalLoading, setCppModalLoading] = useState(false);
  const [cppModalData, setCppModalData] = useState<any>(null);
  const [cppModalKpi, setCppModalKpi] = useState<string>("");
  const [cppPagosFilter, setCppPagosFilter] = useState<"all" | "pagado" | "no_pagado">("all");
  const [cppSelectedBill, setCppSelectedBill] = useState<any>(null);
  const [kpiInfoModal, setKpiInfoModal] = useState<{ open: boolean; kpiId: string; title: string }>({ open: false, kpiId: "", title: "" });

  const [margenModalOpen, setMargenModalOpen] = useState(false);
  const [margenModalLoading, setMargenModalLoading] = useState(false);
  const [margenModalData, setMargenModalData] = useState<any>(null);
  const [selectedMargenSeller, setSelectedMargenSeller] = useState<any>(null);
  const [margenModalTab, setMargenModalTab] = useState<"vendedor" | "producto" | "semanal">("vendedor");

  const [efectividadModalOpen, setEfectividadModalOpen] = useState(false);
  const [efectividadModalLoading, setEfectividadModalLoading] = useState(false);
  const [efectividadModalData, setEfectividadModalData] = useState<any>(null);
  const [selectedEfectividadSeller, setSelectedEfectividadSeller] = useState<any>(null);
  const [efectividadModalTab, setEfectividadModalTab] = useState<"vendedor" | "semanal">("vendedor");
  const [efectividadPeriodo, setEfectividadPeriodo] = useState<"mes" | "trimestre" | "anio" | "todo">("mes");

  const [coberturaModalOpen, setCoberturaModalOpen] = useState(false);
  const [coberturaModalLoading, setCoberturaModalLoading] = useState(false);
  const [coberturaModalData, setCoberturaModalData] = useState<any>(null);
  const [selectedCoberturaSeller, setSelectedCoberturaSeller] = useState<any>(null);
  const [coberturaModalTab, setCoberturaModalTab] = useState<"vendedor" | "semanal">("vendedor");
  const [coberturaPeriodo, setCoberturaPeriodo] = useState<"mes" | "trimestre" | "anio" | "todo">("mes");

  const [activacionModalOpen, setActivacionModalOpen] = useState(false);
  const [activacionModalLoading, setActivacionModalLoading] = useState(false);
  const [activacionModalData, setActivacionModalData] = useState<any>(null);
  const [selectedActivacionSeller, setSelectedActivacionSeller] = useState<any>(null);
  const [activacionModalTab, setActivacionModalTab] = useState<"vendedor" | "semanal">("vendedor");
  const [activacionPeriodo, setActivacionPeriodo] = useState<"mes" | "trimestre" | "anio" | "todo">("mes");

  const [visitasModalOpen, setVisitasModalOpen] = useState(false);
  const [visitasModalLoading, setVisitasModalLoading] = useState(false);
  const [visitasData, setVisitasData] = useState<any[]>([]);
  const [visitasVendedores, setVisitasVendedores] = useState<any[]>([]);
  const [visitasClientes, setVisitasClientes] = useState<any[]>([]);
  const [visitasClientesLoading, setVisitasClientesLoading] = useState(false);
  const [visitaClientSearch, setVisitaClientSearch] = useState("");
  const [visitaClientDropdownOpen, setVisitaClientDropdownOpen] = useState(false);
  const [visitaForm, setVisitaForm] = useState({
    seller_name: "",
    seller_user_id: "",
    client_name: "",
    is_prospect: false,
    visit_date: new Date().toISOString().split("T")[0],
  });
  const [visitaFormPhoto, setVisitaFormPhoto] = useState<File | null>(null);
  const [visitaFormPhotoPreview, setVisitaFormPhotoPreview] = useState<string>("");
  const [visitaFormLoading, setVisitaFormLoading] = useState(false);

  const apiPrefix = vendorMode ? "/api/vendedores/stoplight" : "/api/superadmin/stoplight";
  const q = (extras: Record<string, string> = {}, mesOverride?: string) => {
    const base: Record<string, string> = { mes: mesOverride || selectedMes, ...extras };
    if (!vendorMode) base.company_id = String(selectedCompanyId);
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
  const empresaLabel = empresas.find((e) => e.id === selectedCompanyId)?.label || "Caracas";

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const dateExtra = customDateRange ? `&startDate=${customDateRange.start}&endDate=${customDateRange.end}` : "";
      const params = vendorMode ? `mes=${selectedMes}${dateExtra}` : `mes=${selectedMes}&company_id=${selectedCompanyId}${dateExtra}`;
      const res = await fetch(`${apiPrefix}?${params}`);
      const json = await res.json();
      if (json.success) {
        setKpiData(json.data);
        setMetaInput(json.data.metaMensual > 0 ? String(json.data.metaMensual) : "");
      }
    } catch (e) {
      console.error("Error fetching stoplight data:", e);
    }
    setLoading(false);
  }, [selectedMes, selectedCompanyId, vendorMode, customDateRange]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchMarketingData = useCallback(async () => {
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
  }, [selectedMes, customDateRange]);

  useEffect(() => { fetchMarketingData(); }, [fetchMarketingData]);

  const fetchCxCData = useCallback(async () => {
    setCxcLoading(true);
    try {
      const [mesY, mesM] = selectedMes.split("-").map(Number);
      const empresaMap: Record<number, string> = { 9: "valencia", 10: "caracas", 7: "panama" };
      const empresa = empresaMap[selectedCompanyId] || "valencia";
      const dateExtra = customDateRange ? `&startDate=${customDateRange.start}&endDate=${customDateRange.end}` : "";
      const res = await fetch(`/api/superadmin/cuentas-por-cobrar?empresa=${empresa}&month=${mesM}&year=${mesY}${dateExtra}`);
      const json = await res.json();
      if (json.success) setCxcData(json.data);
    } catch (e) {
      console.error("Error fetching CxC data:", e);
    }
    setCxcLoading(false);
  }, [selectedCompanyId, selectedMes, customDateRange]);

  useEffect(() => { fetchCxCData(); }, [fetchCxCData]);

  const fetchCppData = useCallback(async () => {
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
  }, [selectedCompanyId, selectedMes, customDateRange]);

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

  useEffect(() => {
    if (clientesModalOpen || modalOpen || cxcModalOpen || cppModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [clientesModalOpen, modalOpen, cxcModalOpen]);

  useEffect(() => {
    if (!visitaClientDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-client-dropdown]")) {
        setVisitaClientDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [visitaClientDropdownOpen]);

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

  const openCuotaModalWithMes = async (mes: string) => {
    modalFetchRef.current = openCuotaModalWithMes;
    setModalOpen(true);
    setModalLoading(true);
    setSelectedSeller(null);
    setModalTab("resumen");
    try {
      const res = await fetch(`${apiPrefix}/cuota-detail?${q({}, mes)}`);
      const json = await res.json();
      if (json.success) setModalData(json.data);
    } catch (e) {
      console.error("Error fetching cuota detail:", e);
    }
    setModalLoading(false);
  };

  const openCuotaModal = async () => {
    await openCuotaModalWithMes(selectedMes);
  };

  const openClientesModalWithMes = async (mes: string) => {
    modalFetchRef.current = openClientesModalWithMes;
    setClientesModalOpen(true);
    setClientesModalLoading(true);
    setClientesModalTab("resumen");
    setSelectedClientesSeller(null);
    setSelectedClientesClient(null);
    setClientesSellerDetail(null);
    try {
      const res = await fetch(`${apiPrefix}/clientes-nuevos-detail?${q({}, mes)}`);
      const json = await res.json();
      if (json.success) setClientesModalData(json.data);
    } catch (e) {
      console.error("Error fetching clientes nuevos detail:", e);
    }
    setClientesModalLoading(false);
  };

  const openClientesModal = async () => {
    await openClientesModalWithMes(selectedMes);
  };

  const openClientesSellerDetail = async (seller: any) => {
    setSelectedClientesSeller(seller);
    setSelectedClientesClient(null);
    setClientesSellerLoading(true);
    setClientesSellerDetail(null);
    try {
      const res = await fetch(`${apiPrefix}/clientes-nuevos-seller-detail?${q({ seller_name: encodeURIComponent(seller.nombre) })}`);
      const json = await res.json();
      if (json.success) setClientesSellerDetail(json.data);
    } catch (e) {
      console.error("Error fetching seller detail:", e);
    }
    setClientesSellerLoading(false);
  };

  const openInvoiceDetail = async (invoice: any) => {
    setSelectedInvoice(invoice);
    setInvoiceLoading(true);
    setInvoiceDetail(null);
    try {
      const res = await fetch(`${apiPrefix}/invoice-detail?${q({ invoice_id: String(invoice.id) })}`);
      const json = await res.json();
      if (json.success) setInvoiceDetail(json.data);
    } catch (e) {
      console.error("Error fetching invoice detail:", e);
    }
    setInvoiceLoading(false);
  };

  const openCxcModal = async (kpiId: string) => {
    setCxcModalKpi(kpiId);
    setCxcModalOpen(true);
    setCxcModalLoading(true);
    try {
      const empresaMap: Record<number, string> = { 9: "valencia", 10: "caracas", 7: "panama" };
      const empresa = empresaMap[selectedCompanyId] || "valencia";
      let url = `/api/superadmin/cuentas-por-cobrar/detail?empresa=${empresa}`;
      if (kpiId === "cartera_vencida") {
        const bandMap: Record<string, string> = {
          "1-15": "1-15", "16-30": "16-30", "31-60": "31-60", "61-90": "61-90", "90+": "90+"
        };
        url += `&aging_band=${encodeURIComponent("1-15")}`;
      }
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) setCxcModalData(json.data);
    } catch (e) {
      console.error("Error fetching CxC detail:", e);
    }
    setCxcModalLoading(false);
  };

  const openCxcInvoiceDetail = async (inv: any) => {
    setCxcSelectedInvoice(inv);
    setCxcInvoiceLoading(true);
    try {
      const res = await fetch(`/api/superadmin/stoplight/invoice-detail?invoice_id=${inv.id}&company_id=${inv.companyId}`);
      const json = await res.json();
      if (json.success) setCxcInvoiceDetail(json.data);
    } catch (e) {
      console.error("Error fetching invoice detail:", e);
    }
    setCxcInvoiceLoading(false);
  };

  const openCppModal = async (kpiId: string) => {
    setCppModalKpi(kpiId);
    setCppModalOpen(true);
    setCppModalLoading(true);
    try {
      const empresaMap: Record<number, string> = { 9: "valencia", 10: "caracas", 7: "panama" };
      const empresa = empresaMap[selectedCompanyId] || "valencia";
      let url = `${apiPrefix}/cuentas-pagar/detail?empresa=${empresa}&kpi_id=${kpiId}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) setCppModalData(json.data);
    } catch (e) {
      console.error("Error fetching CPP detail:", e);
    }
    setCppModalLoading(false);
  };

  const openMargenModalWithMes = async (mes: string) => {
    modalFetchRef.current = openMargenModalWithMes;
    setMargenModalOpen(true);
    setMargenModalLoading(true);
    setSelectedMargenSeller(null);
    setMargenModalTab("vendedor");
    try {
      const res = await fetch(`${apiPrefix}/margen-detail?${q({}, mes)}`);
      const json = await res.json();
      if (json.success) setMargenModalData(json.data);
    } catch (e) {
      console.error("Error fetching margen detail:", e);
    }
    setMargenModalLoading(false);
  };

  const openMargenModal = async () => {
    await openMargenModalWithMes(selectedMes);
  };

  const openEfectividadModalWithMes = async (mes: string, periodo: string = "mes") => {
    modalFetchRef.current = (m: string) => openEfectividadModalWithMes(m, efectividadPeriodo);
    setEfectividadModalOpen(true);
    setEfectividadModalLoading(true);
    setSelectedEfectividadSeller(null);
    setEfectividadModalTab("vendedor");
    setEfectividadPeriodo(periodo as any);
    try {
      const res = await fetch(`${apiPrefix}/efectividad-detail?${q({ periodo }, mes)}`);
      const json = await res.json();
      if (json.success) setEfectividadModalData(json.data);
    } catch (e) {
      console.error("Error fetching efectividad detail:", e);
    }
    setEfectividadModalLoading(false);
  };

  const openEfectividadModal = async (periodo: string = "mes") => {
    await openEfectividadModalWithMes(selectedMes, periodo);
  };

  const openCoberturaModalWithMes = async (mes: string, periodo: string = "mes") => {
    modalFetchRef.current = (m: string) => openCoberturaModalWithMes(m, coberturaPeriodo);
    setCoberturaModalOpen(true);
    setCoberturaModalLoading(true);
    setSelectedCoberturaSeller(null);
    setCoberturaModalTab("vendedor");
    setCoberturaPeriodo(periodo as any);
    try {
      const res = await fetch(`${apiPrefix}/cobertura-detail?${q({ periodo }, mes)}`);
      const json = await res.json();
      if (json.success) setCoberturaModalData(json.data);
    } catch (e) {
      console.error("Error fetching cobertura detail:", e);
    }
    setCoberturaModalLoading(false);
  };

  const openCoberturaModal = async (periodo: string = "mes") => {
    await openCoberturaModalWithMes(selectedMes, periodo);
  };

  const openActivacionModalWithMes = async (mes: string, periodo: string = "mes") => {
    modalFetchRef.current = (m: string) => openActivacionModalWithMes(m, activacionPeriodo);
    setActivacionModalOpen(true);
    setActivacionModalLoading(true);
    setSelectedActivacionSeller(null);
    setActivacionModalTab("vendedor");
    setActivacionPeriodo(periodo as any);
    try {
      const res = await fetch(`${apiPrefix}/activacion-detail?${q({ periodo }, mes)}`);
      const json = await res.json();
      if (json.success) setActivacionModalData(json.data);
    } catch (e) {
      console.error("Error fetching activacion detail:", e);
    }
    setActivacionModalLoading(false);
  };

  const openActivacionModal = async (periodo: string = "mes") => {
    await openActivacionModalWithMes(selectedMes, periodo);
  };

  const openVisitasModalWithMes = async (mes: string) => {
    modalFetchRef.current = openVisitasModalWithMes;
    setVisitasModalOpen(true);
    setVisitasModalLoading(true);
    setVisitaForm({
      seller_name: "",
      client_name: "",
      is_prospect: false,
      visit_date: new Date().toISOString().split("T")[0],
    });
    try {
      const resVisits = await fetch(`${apiPrefix}/weekly-visits?${q({}, mes)}`);
      const jsonVisits = await resVisits.json();
      if (jsonVisits.success) setVisitasData(jsonVisits.data);
      if (kpiData?.sellers) {
        setVisitasVendedores(kpiData.sellers);
      }
    } catch (e) {
      console.error("Error fetching visitas:", e);
    }
    setVisitasModalLoading(false);
  };

  const openVisitasModal = async () => {
    await openVisitasModalWithMes(selectedMes);
  };

  const fetchVisitasClientes = async (sellerName: string) => {
    try {
      setVisitasClientesLoading(true);
      const seller = visitasVendedores.find((s: any) => s.nombre === sellerName);
      if (!seller) { setVisitasClientes([]); return; }
      const res = await fetch(
        `${apiPrefix}/seller-clients?${q({ seller_user_id: String(seller.user_id) })}`
      );
      const data = await res.json();
      if (data.success) setVisitasClientes(data.data);
    } catch (e) {
      console.error("Error fetching clients:", e);
    } finally {
      setVisitasClientesLoading(false);
    }
  };

  const submitVisita = async () => {
    if (!visitaForm.seller_name || !visitaForm.client_name || !visitaForm.visit_date) {
      alert("Completa todos los campos obligatorios");
      return;
    }
    setVisitaFormLoading(true);
    try {
      const fd = new FormData();
      fd.append("seller_name", visitaForm.seller_name);
      fd.append("client_name", visitaForm.client_name);
      fd.append("is_prospect", String(visitaForm.is_prospect));
      fd.append("visit_date", visitaForm.visit_date);
      if (!vendorMode) fd.append("company_id", String(selectedCompanyId));
      if (visitaFormPhoto) fd.append("photo", visitaFormPhoto);

      const res = await fetch(`${apiPrefix}/weekly-visits`, {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (json.success) {
        const resVisits = await fetch(`${apiPrefix}/weekly-visits?${q()}`);
        const jsonVisits = await resVisits.json();
        if (jsonVisits.success) setVisitasData(jsonVisits.data);
        setVisitaForm({
          seller_name: "",
          seller_user_id: "",
          client_name: "",
          is_prospect: false,
          visit_date: new Date().toISOString().split("T")[0],
        });
        setVisitaFormPhoto(null);
        setVisitaFormPhotoPreview("");
      }
    } catch (e) {
      console.error("Error saving visit:", e);
    }
    setVisitaFormLoading(false);
  };

  const deleteVisita = async (id: number) => {
    try {
      const res = await fetch(`${apiPrefix}/weekly-visits?id=${id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        setVisitasData((prev) => prev.filter((v) => v.id !== id));
      }
    } catch (e) {
      console.error("Error deleting visit:", e);
    }
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  if (loading) {
    return (
      <div className="p-6 bg-white min-h-screen flex items-center justify-center">
        <div className="text-slate-500">Cargando datos...</div>
      </div>
    );
  }

  const mesLabel = (mes: string) => {
    const [y, m] = mes.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("es-VE", { month: "short", year: "2-digit" });
  };

  const getMesOptions = () => {
    const opts: { value: string; label: string }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      opts.push({ value: val, label: d.toLocaleDateString("es-VE", { month: "long", year: "numeric" }) });
    }
    return opts;
  };

  const ModalMonthPicker = ({ value, onChange }: { value: string; onChange: (mes: string) => void }) => {
    const goMonth = (delta: number) => {
      const [y, m] = value.split("-").map(Number);
      const d = new Date(y, m - 1 + delta, 1);
      onChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    };
    return (
      <div className="flex items-center gap-1 border rounded-lg px-2 py-1">
        <button onClick={() => goMonth(-1)} className="p-0.5 rounded hover:bg-slate-100 transition-colors">
          <ChevronLeft size={14} />
        </button>
        <span className="text-xs font-medium min-w-[80px] text-center capitalize">
          {mesLabel(value)}
        </span>
        <button onClick={() => goMonth(1)} className="p-0.5 rounded hover:bg-slate-100 transition-colors">
          <ChevronRight size={14} />
        </button>
      </div>
    );
  };

  const getMonthlyValue = (kpiId: string, h: { ventas: any; cxc: any; cpp: any }): string => {
    const d = h.ventas;
    const cxc = h.cxc;
    const cpp = h.cpp;
    switch (kpiId) {
      case "cumplimiento_cuota_ventas": return d ? `${d.avgCumplimiento ?? 0}%` : "-";
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

  const SparklineBar = ({ values }: { values: (string | null)[] }) => {
    const nums = values.map(v => {
      if (!v) return 0;
      return parseFloat(v.replace("%", "").replace(" días", "").trim()) || 0;
    });
    const max = Math.max(...nums, 1);
    const w = 16;
    const gap = 4;
    const h = 32;
    return (
      <svg width={nums.length * (w + gap)} height={h} style={{ display: "block" }}>
        {nums.map((val, i) => {
          const barH = Math.max(2, Math.round((val / max) * (h - 2)));
          const color = val === 0 ? "#e2e8f0" : val >= max * 0.85 ? "#34d399" : val >= max * 0.6 ? "#fbbf24" : "#f87171";
          return (
            <rect key={i} x={i * (w + gap)} y={h - barH} width={w} height={barH} rx={2} fill={color} />
          );
        })}
      </svg>
    );
  };

  const numWeeks = kpiData?.numSemanas || 5;
  const defaultWeeks = Array(numWeeks).fill(null);

  const getGoal = (id: string, defaultVal: string) => goalValues[id] ?? defaultVal;

  const ventasKpis = [
    {
      id: "cumplimiento_cuota_ventas",
      trend: kpiData ? (kpiData.porcentajeCumplimiento >= 100 ? "help" : kpiData.porcentajeCumplimiento >= 75 ? "warning" : "alert") : "help",
      title: t("kpi_cuota_ventas"),
      peso: "30%",
      average: kpiData ? `${kpiData.avgCumplimiento}%` : "0%",
      weeks: kpiData?.semanaGlobal || defaultWeeks,
      isClickable: true,
      goalDefault: kpiData ? String(Math.round(kpiData.metaMensual)) : "0",
      goalSuffix: "",
      cumple: kpiData ? kpiData.avgCumplimiento >= 100 : false,
    },
    {
      id: "margen_bruto",
      trend: "help",
      title: t("kpi_margen_bruto"),
      peso: "15%",
      average: kpiData ? `${kpiData.avgMargen}%` : "0%",
      weeks: kpiData?.semanaMargen || defaultWeeks,
      isClickable: true,
      goalDefault: kpiData?.metas?.["margen_bruto"] ? String(kpiData.metas["margen_bruto"]) : "0",
      goalSuffix: "%",
      cumple: kpiData ? kpiData.avgMargen >= 100 : false,
    },
    {
      id: "visitas_semanales",
      trend: "help",
      title: t("kpi_visitas"),
      peso: "10%",
      average: kpiData ? String(kpiData.avgVisitas) : "0",
      weeks: kpiData?.semanaVisitas || defaultWeeks,
      isClickable: true,
      goalDefault: kpiData?.metas?.["visitas_semanales"] ? String(kpiData.metas["visitas_semanales"]) : "0",
      goalSuffix: "",
      cumple: kpiData ? kpiData.avgVisitas >= 100 : false,
    },
    {
      id: "efectividad_cierre",
      trend: "help",
      title: t("kpi_efectividad"),
      peso: "15%",
      average: kpiData ? `${kpiData.avgEfectividad}%` : "0%",
      weeks: kpiData?.semanaEfectividad || defaultWeeks,
      isClickable: true,
      goalDefault: kpiData?.metas?.["efectividad_cierre"] ? String(kpiData.metas["efectividad_cierre"]) : "0",
      goalSuffix: "%",
      cumple: kpiData ? kpiData.avgEfectividad >= 100 : false,
    },
    {
      id: "activacion_cartera",
      trend: "help",
      title: t("kpi_activacion"),
      peso: "15%",
      average: kpiData ? `${kpiData.avgActivacion}%` : "0%",
      weeks: kpiData?.semanaActivacion || defaultWeeks,
      isClickable: true,
      goalDefault: kpiData?.metas?.["activacion_cartera"] ? String(kpiData.metas["activacion_cartera"]) : "0",
      goalSuffix: "%",
      cumple: kpiData ? kpiData.avgActivacion >= 100 : false,
    },
    {
      id: "clientes_nuevos",
      trend: "help",
      title: t("kpi_clientes_nuevos"),
      peso: "5%",
      average: kpiData ? `${kpiData.avgClientes}%` : "0%",
      weeks: kpiData?.semanaClientes || defaultWeeks,
      isClickable: true,
      goalDefault: kpiData?.metas?.["clientes_nuevos"] ? String(kpiData.metas["clientes_nuevos"]) : "0",
      goalSuffix: "",
      cumple: kpiData ? kpiData.avgClientes >= 100 : false,
    },
    {
      id: "cobertura_marcas",
      trend: "help",
      title: t("kpi_cobertura"),
      peso: "10%",
      average: kpiData ? `${kpiData.avgCobertura}%` : "0%",
      weeks: kpiData?.semanaCobertura || defaultWeeks,
      isClickable: true,
      goalDefault: kpiData?.metas?.["cobertura_marcas"] ? String(kpiData.metas["cobertura_marcas"]) : "0",
      goalSuffix: "%",
      cumple: kpiData ? kpiData.avgCobertura >= 100 : false,
    },
  ];

  const logisticaKpis = [
    {
      id: "envio_reporte_inv",
      trend: "help",
      title: "Cumplimiento de Envío de Reporte de Antig├╝edad de Inventario",
      peso: "25%",
      average: "0%",
      weeks: [null, null, null, null, null],
      goalDefault: "75",
      goalSuffix: "%",
    },
    {
      id: "nuevos_productos",
      trend: "help",
      title: "Identificación de Nuevos Productos y Oportunidades de Mercado",
      peso: "25%",
      average: "0%",
      weeks: [null, null, null, null, null],
      goalDefault: "75",
      goalSuffix: "%",
    },
    {
      id: "antiguedad_inv",
      trend: "help",
      title: "Antig├╝edad de inventario (Costo)",
      peso: "25%",
      average: "0%",
      weeks: [null, null, null, null, null],
      goalDefault: "25",
      goalSuffix: "%",
    },
    {
      id: "activacion_sku",
      trend: "alert",
      title: "Tasa de Activación de Portafolio de productos (SKU Activos)",
      peso: "25%",
      average: "60%",
      weeks: ["50%", "70%", null, null, null],
      goalDefault: "61",
      goalSuffix: "%",
    },
  ];

  const comprasKpis = [
    {
      id: "variacion_costo_compra",
      trend: "help",
      title: t("kpi_variacion_costo"),
      peso: "15%",
      average: kpiData ? `${kpiData.avgVarCosto}%` : "0%",
      weeks: kpiData?.semanaVarCosto || defaultWeeks,
      goalDefault: kpiData?.metas?.["variacion_costo_compra"] ? String(kpiData.metas["variacion_costo_compra"]) : "0",
      goalSuffix: "%",
      isClickable: true,
      cumple: kpiData ? kpiData.avgVarCosto >= 100 : false,
    },
    {
      id: "rotacion_saludable",
      trend: "help",
      title: t("kpi_rotacion"),
      peso: "17%",
      average: kpiData ? `${kpiData.avgRotacion}%` : "0%",
      weeks: kpiData?.semanaRotacion || defaultWeeks,
      goalDefault: kpiData?.metas?.["rotacion_saludable"] ? String(kpiData.metas["rotacion_saludable"]) : "0",
      goalSuffix: "%",
      isClickable: true,
      cumple: kpiData ? kpiData.avgRotacion >= 100 : false,
    },
    {
      id: "quiebre_inventario",
      trend: "help",
      title: t("kpi_quiebre"),
      peso: "25%",
      average: kpiData ? `${kpiData.avgQuiebre}%` : "0%",
      weeks: kpiData?.semanaQuiebre || defaultWeeks,
      goalDefault: kpiData?.metas?.["quiebre_inventario"] ? String(kpiData.metas["quiebre_inventario"]) : "0",
      goalSuffix: "%",
      isClickable: true,
      cumple: kpiData ? kpiData.avgQuiebre >= 100 : false,
    },
    {
      id: "inventario_90_dias",
      trend: "help",
      title: t("kpi_inventario_90"),
      peso: "20%",
      average: kpiData ? `${kpiData.avgInv90}%` : "0%",
      weeks: kpiData?.semanaInv90 || defaultWeeks,
      goalDefault: kpiData?.metas?.["inventario_90_dias"] ? String(kpiData.metas["inventario_90_dias"]) : "0",
      goalSuffix: "%",
      isClickable: true,
      cumple: kpiData ? kpiData.avgInv90 >= 100 : false,
    },
    {
      id: "forecast_semanal",
      trend: "help",
      title: t("kpi_forecast"),
      peso: "11%",
      average: kpiData ? `${kpiData.avgForecast}%` : "0%",
      weeks: kpiData?.semanaForecast || defaultWeeks,
      goalDefault: kpiData?.metas?.["forecast_semanal"] ? String(kpiData.metas["forecast_semanal"]) : "75",
      goalSuffix: "%",
      isClickable: true,
      cumple: kpiData ? kpiData.avgForecast >= 100 : false,
    },
    {
      id: "propuestas_calificadas",
      trend: "help",
      title: t("kpi_propuestas"),
      peso: "12%",
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
        trend: "help",
        title: t("kpi_usuarios_ga4"),
        peso: "13%",
        average: String(md?.ga4?.totalUsers || 0),
        weeks: toWeekly(ga4W?.totalUsers),
        goalDefault: "500",
        goalSuffix: "",
        cumple: (md?.ga4?.totalUsers || 0) >= 500,
      },
      {
        id: "sesiones",
        trend: "help",
        title: t("kpi_sesiones_ga4"),
        peso: "13%",
        average: String(md?.ga4?.sessions || 0),
        weeks: toWeekly(ga4W?.sessions),
        goalDefault: "1000",
        goalSuffix: "",
        cumple: (md?.ga4?.sessions || 0) >= 1000,
      },
      {
        id: "paginas_vistas",
        trend: "help",
        title: t("kpi_paginas_ga4"),
        peso: "9%",
        average: String(md?.ga4?.pageviews || 0),
        weeks: toWeekly(ga4W?.pageviews),
        goalDefault: "5000",
        goalSuffix: "",
        cumple: (md?.ga4?.pageviews || 0) >= 5000,
      },
      {
        id: "tasa_rebote",
        trend: (md?.ga4?.bounceRate || 0) > 50 ? "alert" : "help",
        title: t("kpi_rebote_ga4"),
        peso: "9%",
        average: `${md?.ga4?.bounceRate || 0}%`,
        weeks: toWeeklyPct(ga4W?.bounceRate),
        goalDefault: "40",
        goalSuffix: "%",
        cumple: (md?.ga4?.bounceRate || 0) <= 40,
      },
      {
        id: "clicks_sc",
        trend: "help",
        title: t("kpi_clicks_sc"),
        peso: "13%",
        average: String(md?.totals?.totalClicks || 0),
        weeks: toWeekly(weekClicks),
        goalDefault: "500",
        goalSuffix: "",
        cumple: (md?.totals?.totalClicks || 0) >= 500,
      },
      {
        id: "impresiones_sc",
        trend: "help",
        title: t("kpi_impresiones_sc"),
        peso: "9%",
        average: String(md?.totals?.totalImpressions || 0),
        weeks: toWeekly(weekImpressions),
        goalDefault: "10000",
        goalSuffix: "",
        cumple: (md?.totals?.totalImpressions || 0) >= 10000,
      },
      {
        id: "ctr_sc",
        trend: "help",
        title: t("kpi_ctr_sc"),
        peso: "9%",
        average: `${md?.totals?.overallCtr || 0}%`,
        weeks: scWeeksPct(weekClicks, weekImpressions),
        goalDefault: "3",
        goalSuffix: "%",
        cumple: (md?.totals?.overallCtr || 0) >= 3,
      },
      {
        id: "posicion_sc",
        trend: (md?.totals?.avgPosition || 0) > 10 ? "alert" : "help",
        title: t("kpi_posicion_sc"),
        peso: "13%",
        average: String(md?.totals?.avgPosition || 0),
        weeks: toWeekly(md?.weekly?.position),
        goalDefault: "5",
        goalSuffix: "",
        cumple: (md?.totals?.avgPosition || 0) <= 5 && (md?.totals?.avgPosition || 0) > 0,
      },
      {
        id: "email_open_rate",
        trend: (md?.emailMarketing?.openRate || 0) >= 20 ? "help" : (md?.emailMarketing?.openRate || 0) >= 10 ? "warning" : "alert",
        title: t("kpi_email"),
        peso: "12%",
        average: md?.emailMarketing?.openRate != null ? `${md.emailMarketing.openRate}%` : "0%",
        weeks: (md?.emailMarketing?.weeklyOpenRate || defWeeks).map((v: number | null) => v != null ? `${v}%` : null),
        goalDefault: "20",
        goalSuffix: "%",
        cumple: (md?.emailMarketing?.openRate || 0) >= 20,
      },
    ];
  })() : [];

  const cxcKpis = cxcData ? (() => {
    const k = cxcData.kpis;
    const aging = cxcData.agingDistribution || {};
    const agingTotal = Object.values(aging).reduce((a: number, b: any) => a + (b as number), 0) as number;
    const agingPcts = Object.entries(aging).map(([band, val]) => {
      const v = val as number;
      return agingTotal > 0 ? Math.round((v / agingTotal) * 100) : 0;
    });
    const agingLabels = ["corriente", "1-15", "16-30", "31-60", "61-90", "90+"];
    const semana1 = k.carteraVencida.carteraTotal > 0 ? Math.round(k.carteraVencida.saldoVencido / k.carteraVencida.carteraTotal * 100) : 0;

    return [
      {
        id: "efectividad_cobranza",
        trend: k.efectividad.value === null ? "help" : k.efectividad.value >= 95 ? "success" : k.efectividad.value >= 85 ? "warning" : "alert",
        title: t("kpi_efectividad_cobranza"),
        peso: "35%",
        average: k.efectividad.value !== null ? `${k.efectividad.value}%` : "N/A",
        weeks: [k.efectividad.value !== null ? String(k.efectividad.value) + "%" : null, null, null, null, null],
        goalDefault: String(k.efectividad.meta),
        goalSuffix: "%",
        isClickable: true,
        cumple: k.efectividad.value !== null ? k.efectividad.value >= k.efectividad.meta : false,
      },
      {
        id: "cartera_vencida",
        trend: k.carteraVencida.value === null ? "help" : k.carteraVencida.value <= 10 ? "success" : k.carteraVencida.value <= 20 ? "warning" : "alert",
        title: t("kpi_cartera_vencida"),
        peso: "30%",
        average: k.carteraVencida.value !== null ? `${k.carteraVencida.value}%` : "N/A",
        weeks: [k.carteraVencida.value !== null ? String(k.carteraVencida.value) + "%" : null, null, null, null, null],
        goalDefault: String(k.carteraVencida.meta),
        goalSuffix: "%",
        isClickable: true,
        cumple: k.carteraVencida.value !== null ? k.carteraVencida.value <= k.carteraVencida.meta : false,
      },
      {
        id: "recuperacion_vencidos",
        trend: k.recuperacion.value === null ? "help" : k.recuperacion.value >= 60 ? "success" : k.recuperacion.value >= 30 ? "warning" : "alert",
        title: t("kpi_recuperacion"),
        peso: "25%",
        average: k.recuperacion.value !== null ? `${k.recuperacion.value}%` : "N/A",
        weeks: [k.recuperacion.value !== null ? String(k.recuperacion.value) + "%" : null, null, null, null, null],
        goalDefault: String(k.recuperacion.meta),
        goalSuffix: "%",
        isClickable: true,
        cumple: k.recuperacion.value !== null ? k.recuperacion.value >= k.recuperacion.meta : false,
      },
      {
        id: "dso",
        trend: k.dso.value === null ? "help" : k.dso.value <= 45 ? "success" : k.dso.value <= 60 ? "warning" : "alert",
        title: t("kpi_dso"),
        peso: "10%",
        average: k.dso.value !== null ? `${k.dso.value} días` : "N/A",
        weeks: [k.dso.value !== null ? String(k.dso.value) : null, null, null, null, null],
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
        trend: cppData.pagosATiempoPct >= 95 ? "success" : cppData.pagosATiempoPct >= 85 ? "warning" : "alert",
        title: t("kpi_pagos_tiempo"),
        peso: "35%",
        average: `${cppData.pagosATiempoPct}%`,
        weeks: cppData.semanaPagosATiempo || Array(5).fill(null),
        goalDefault: String(metas["pagos_a_tiempo"] ?? 95),
        goalSuffix: "%",
        isClickable: true,
        subtitle: `Por monto: ${cppData.pagosATiempoPct}% | Por cantidad: ${cppData.pagosATiempoCantidad}%`,
        cumple: cppData.pagosATiempoPct >= (metas["pagos_a_tiempo"] ?? 95),
      },
      {
        id: "cuentas_pagar_vencidas",
        trend: cppData.cuentasVencidasPct <= 5 ? "success" : cppData.cuentasVencidasPct <= 10 ? "warning" : "alert",
        title: t("kpi_cxpagar_vencidas"),
        peso: "30%",
        average: `${cppData.cuentasVencidasPct}%`,
        weeks: cppData.semanaVencidas || Array(5).fill(null),
        goalDefault: String(metas["cuentas_pagar_vencidas"] ?? 5),
        goalSuffix: "%",
        isClickable: true,
        subtitle: `Vencido: $${cppData.totalVencido?.toLocaleString()} / Total abierto: $${cppData.totalCxPOpen?.toLocaleString()}`,
        cumple: cppData.cuentasVencidasPct <= (metas["cuentas_pagar_vencidas"] ?? 5),
      },
      {
        id: "procesamiento_oportuno",
        trend: cppData.procesamientoOportunoPct >= 95 ? "success" : cppData.procesamientoOportunoPct >= 85 ? "warning" : "alert",
        title: t("kpi_procesamiento"),
        peso: "20%",
        average: `${cppData.procesamientoOportunoPct}%`,
        weeks: cppData.semanaProcesamiento || Array(5).fill(null),
        goalDefault: String(metas["procesamiento_oportuno"] ?? 95),
        goalSuffix: "%",
        isClickable: true,
        subtitle: `SLA: ≤3 días con OC, ≤5 días sin OC | Promedio: ${cppData.avgProcessingDays} días`,
        cumple: cppData.procesamientoOportunoPct >= (metas["procesamiento_oportuno"] ?? 95),
      },
      {
        id: "dpo",
        trend: cppData.dpo <= 30 ? "success" : cppData.dpo <= 45 ? "warning" : "alert",
        title: t("kpi_dpo"),
        peso: "15%",
        average: `${cppData.dpo} días`,
        weeks: cppData.semanaDpo || Array(5).fill(null),
        goalDefault: String(metas["dpo"] ?? 30),
        goalSuffix: " días",
        isClickable: true,
        subtitle: `Ventana: 90 días | CxP: $${cppData.dpoCxPTotal?.toLocaleString()} | Compras crédito: $${cppData.dpoComprasCredito?.toLocaleString()}`,
        cumple: cppData.dpo <= (metas["dpo"] ?? 30),
      },
    ];
  })() : [];

  const weekHeaders = kpiData?.weekHeaders || ["Jul 13 - Jul 19", "Jul 6 - Jul 12", "Jun 29 - Jul 5", "Jun 22 - Jun 28", "Jun 15 - Jun 21"];

  const allGroups = [
    { id: "group-ventas", title: t("group_ventas"), count: ventasKpis.length, kpis: ventasKpis, weekHeaders },
    { id: "group-compras", title: t("group_compras"), count: comprasKpis.length, kpis: comprasKpis, weekHeaders },
    //{ id: "group-logistica", title: "Logística e Inventario", count: logisticaKpis.length, kpis: logisticaKpis, weekHeaders },
    ...(cxcKpis.length > 0 ? [{ id: "group-cxc", title: t("group_cxc"), count: cxcKpis.length, kpis: cxcKpis, weekHeaders }] : []),
    ...(cppKpis.length > 0 ? [{ id: "group-cpp", title: t("group_cpp"), count: cppKpis.length, kpis: cppKpis, weekHeaders }] : []),
    ...(marketingKpis.length > 0 ? [{ id: "group-marketing", title: t("group_marketing"), count: marketingKpis.length, kpis: marketingKpis, weekHeaders }] : []),
  ];
  const groups = comprasMode ? allGroups.filter((g) => g.id === "group-compras") : cxCMode ? allGroups.filter((g) => g.id === "group-cxc") : vendorMode || gerenteVentaMode ? allGroups.filter((g) => g.id === "group-ventas") : allGroups;

  return (
    <div className="p-6 bg-white min-h-screen font-sans text-slate-800">
      {/* Header & Title */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("page_title")}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {t("page_subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {marketingData && !marketingData.connected && (
            <a
              href="/api/auth/google"
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 text-white text-sm font-medium rounded-md hover:bg-blue-600 transition-colors shadow-sm"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              {t("google_connect")}
            </a>
          )}
          {marketingData?.connected && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 text-xs font-medium rounded-md border border-green-200">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              {t("google_connected")}
            </span>
          )}
          <button className="p-2 border rounded-md hover:bg-slate-50 transition-colors">
            <Settings size={16} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-6 border-b mb-6 text-sm font-medium text-slate-500">
        {([["Trends", t("tab_trends")], ["Weekly", t("tab_weekly")], ["Monthly", t("tab_monthly")], ["Quarterly", t("tab_quarterly")], ["Annual", t("tab_annual")]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`pb-3 transition-colors ${activeTab === key ? "text-amber-500 border-b-2 border-amber-500" : "hover:text-slate-800"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      {!vendorMode && !cxCMode && (
      <div className="flex justify-between items-center mb-6">
        <div className="flex gap-3">
          {isSuperAdmin ? (
          <div
            onClick={() => setTeamDropdownOpen(!teamDropdownOpen)}
            className="flex items-center gap-2 px-3 py-1.5 border rounded-md text-sm hover:bg-slate-50 transition-colors relative cursor-pointer"
          >
            Team: {empresaLabel} <ChevronDown size={14} />
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
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-50 transition-colors ${selectedCompanyId === emp.id ? "bg-blue-50 text-blue-600 font-medium" : "text-slate-700"}`}
                  >
                    {emp.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          ) : (
          <div className="flex items-center gap-2 px-3 py-1.5 border rounded-md text-sm bg-slate-50 text-slate-600">
            Team: {empresaLabel}
          </div>
          )}
          {/* View by */}
          <div className="relative">
            <button
              onClick={() => setViewByOpen(o => !o)}
              className="flex items-center gap-2 px-3 py-1.5 border rounded-md text-sm hover:bg-slate-50 transition-colors"
            >
              View by: {activeTab === "Monthly" ? "Month" : activeTab === "Quarterly" ? "Quarter" : activeTab === "Annual" ? "Year" : "Week"}
              <ChevronDown size={14} />
            </button>
            {viewByOpen && (
              <div data-dropdown-content className="absolute top-full left-0 mt-1 bg-white border rounded-lg shadow-lg z-50 min-w-[140px]">
                {[
                  { label: "Week", tab: "Weekly" },
                  { label: "Month", tab: "Monthly" },
                  { label: "Quarter", tab: "Quarterly" },
                  { label: "Year", tab: "Annual" },
                ].map(opt => (
                  <button
                    key={opt.tab}
                    onClick={() => { setActiveTab(opt.tab); setViewByOpen(false); }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-50 transition-colors ${activeTab === opt.tab ? "bg-blue-50 text-blue-600 font-medium" : "text-slate-700"}`}
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
              className={`flex items-center gap-2 px-3 py-1.5 border rounded-md text-sm hover:bg-slate-50 transition-colors ${customDateRange ? "border-amber-400 bg-amber-50 text-amber-700" : ""}`}
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
                <p className="text-xs font-semibold text-slate-500 mb-3 uppercase tracking-wide">Rango de fechas</p>
                <div className="space-y-2 mb-3">
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Desde</label>
                    <input
                      type="date"
                      value={dateInputStart}
                      onChange={e => setDateInputStart(e.target.value)}
                      className="w-full px-3 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Hasta</label>
                    <input
                      type="date"
                      value={dateInputEnd}
                      onChange={e => setDateInputEnd(e.target.value)}
                      className="w-full px-3 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
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
                    className="flex-1 bg-amber-500 text-white text-sm py-1.5 rounded-lg font-medium hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Aplicar
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
                    Limpiar
                  </button>
                </div>
                <div className="mt-3 border-t pt-3">
                  <p className="text-xs font-medium text-slate-500 mb-2">Acceso rápido</p>
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
                        className={`px-2 py-1 rounded-md text-xs transition-colors capitalize ${selectedMes === opt.value && !customDateRange ? "bg-amber-100 text-amber-700 font-medium" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
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
            className="p-1.5 border rounded-md hover:bg-slate-50 transition-colors"
            title="Refrescar datos"
          >
            <RotateCcw size={16} />
          </button>
          <button className="p-1.5 border rounded-md hover:bg-slate-50 transition-colors">
            <MoreHorizontal size={16} />
          </button>
          <div className="relative">
            <Search className="absolute left-2.5 top-2 text-slate-400" size={14} />
            <input
              type="text"
              placeholder="Search KPIs..."
              className="pl-8 pr-3 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 w-64 transition-shadow"
            />
          </div>
        </div>
      </div>
      )}

      {/* Marketing Not Connected Banner */}
      {marketingData && !marketingData.connected && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-600" viewBox="0 0 24 24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            </div>
            <div>
              <p className="text-sm font-medium text-blue-900">Conecta Google Analytics y Search Console</p>
              <p className="text-xs text-blue-600">Para ver los KPIs de Marketing y SEO de tus sitios web</p>
            </div>
          </div>
          <a
            href="/api/auth/google"
            className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors shadow-sm"
          >
            Conectar Google
          </a>
        </div>
      )}

      {/* KPI Groups */}
      <div className="space-y-6">
        {groups.map((group) => (
          <div key={group.id} className="border rounded-lg overflow-hidden bg-white shadow-sm transition-all">
            {/* Group Header */}
            <div className="flex items-center justify-between p-4 bg-slate-50 border-b">
              <div
                className="flex items-center gap-3 cursor-pointer select-none"
                onClick={() => toggleGroup(group.id)}
              >
                <span className="font-semibold text-lg text-slate-800">{group.title}</span>
                <span className="px-2 py-0.5 bg-slate-200 text-slate-600 text-xs rounded-full font-medium">
                  {group.count}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button className="p-1 text-slate-400 hover:text-slate-600 transition-colors">
                  <MoreHorizontal size={16} />
                </button>
                <button className="p-1 text-slate-400 hover:text-slate-600 transition-colors">
                  <Maximize2 size={14} />
                </button>
                <button
                  className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
                  onClick={() => toggleGroup(group.id)}
                >
                  {expandedGroups[group.id] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              </div>
            </div>

            {/* Table / View */}
            {expandedGroups[group.id] && activeTab === "Trends" && (
              <div className="divide-y">
                {group.kpis.map((kpi: any) => (
                  <div key={kpi.id} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-700 truncate">{kpi.title}</div>
                      <div className="text-xs text-slate-400 mt-0.5">Peso: {kpi.peso} · Meta: {kpi.goalDefault}{kpi.goalSuffix}</div>
                    </div>
                    <div className={`text-sm font-bold w-20 text-right px-2 py-1 rounded ${getCellColor(kpi.average)}`}>{kpi.average}</div>
                    <div className="w-[140px] flex items-end justify-start gap-[2px]" title={kpi.weeks.map((v: string|null, i: number) => `S${i+1}: ${v || "-"}`).join(" | ")}>
                      <SparklineBar values={kpi.weeks} />
                    </div>
                    <div className="text-xs text-slate-400 w-20 text-right">{(group as any).weekHeaders.length} semanas</div>
                  </div>
                ))}
              </div>
            )}

            {expandedGroups[group.id] && activeTab === "Weekly" && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse min-w-[1200px]">
                  <thead>
                    <tr className="bg-white border-b text-slate-500">
                      <th className="p-3 w-10 text-center border-r">
                        <input type="checkbox" className="rounded border-slate-300" />
                      </th>
                      <th className="p-3 w-16 text-center border-r text-xs font-normal">{t("column_trend")}</th>
                      <th className="p-3 border-r font-medium min-w-[300px]">{t("column_title")}</th>
                      <th className="p-3 w-16 text-center border-r font-medium">{t("column_owner")}</th>
                      <th className="p-3 w-24 text-center border-r font-medium">{t("column_goal")}</th>
                      <th className="p-3 w-24 text-center border-r font-medium">{t("column_average")}</th>
                      <th className="p-3 w-20 text-center border-r font-medium border-r-blue-400 border-r-2">{t("peso")}</th>
                      {(group as any).weekHeaders.map((week: string, idx: number) => (
                        <th key={idx} className="p-3 w-28 text-center border-r font-normal text-xs text-slate-400">
                          <div className="flex flex-col">
                            <span>{week.split(" - ")[0]} -</span>
                            <span>{week.split(" - ")[1]}</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {group.kpis.map((kpi: any) => (
                      <tr
                        key={kpi.id}
                        className={`border-b group ${kpi.isClickable ? "cursor-pointer hover:bg-blue-50/40" : ""}`}
                        onClick={kpi.isClickable ? (kpi.id === "cumplimiento_cuota_ventas" ? openCuotaModal : kpi.id === "clientes_nuevos" ? openClientesModal : kpi.id === "margen_bruto" ? openMargenModal : kpi.id === "efectividad_cierre" ? openEfectividadModal : kpi.id === "cobertura_marcas" ? openCoberturaModal : kpi.id === "activacion_cartera" ? openActivacionModal : kpi.id === "visitas_semanales" ? openVisitasModal : ["variacion_costo_compra","rotacion_saludable","quiebre_inventario","inventario_90_dias","forecast_semanal"].includes(kpi.id) ? () => { const map: Record<string,{type:string;title:string}> = {variacion_costo_compra:{type:"variacion_costo",title:"Variación del costo de compra"},rotacion_saludable:{type:"rotacion",title:"Rotación saludable de compras"},quiebre_inventario:{type:"quiebre",title:"Porcentaje de quiebre de inventario"},inventario_90_dias:{type:"inventario_90",title:"Inventario con más de 90 días"},forecast_semanal:{type:"forecast",title:"Revisión semanal de forecast Compras–Ventas"}}; const m = map[kpi.id]; setComprasKpiType(m.type); setComprasKpiTitle(m.title); setModalMes(selectedMes); setComprasModalOpen(true); } : kpi.id.startsWith("efectividad_") || kpi.id === "cartera_vencida" || kpi.id === "recuperacion_vencidos" || kpi.id === "dso" ? () => openCxcModal(kpi.id) : ["pagos_a_tiempo","cuentas_pagar_vencidas","procesamiento_oportuno","dpo"].includes(kpi.id) ? () => openCppModal(kpi.id) : undefined) : undefined}
                      >
                        <td className="p-3 text-center border-r bg-white" onClick={(e) => e.stopPropagation()}>
                          {kpi.cumple ? (
                            <div className="w-5 h-5 bg-blue-600 rounded flex items-center justify-center mx-auto">
                              <Check size={14} className="text-white" />
                            </div>
                          ) : (
                            <div className="w-5 h-5 border-2 border-slate-300 rounded mx-auto" />
                          )}
                        </td>
                        <td className="p-3 text-center border-r bg-white">
                          {kpi.trend === "alert" ? (
                            <AlertTriangle
                              size={16}
                              className="text-red-500 mx-auto cursor-pointer hover:text-red-600"
                              onClick={(e) => { e.stopPropagation(); setKpiInfoModal({ open: true, kpiId: kpi.id, title: kpi.title }); }}
                            />
                          ) : (
                            <HelpCircle
                              size={16}
                              className="text-slate-400 mx-auto cursor-pointer hover:text-slate-600"
                              onClick={(e) => { e.stopPropagation(); setKpiInfoModal({ open: true, kpiId: kpi.id, title: kpi.title }); }}
                            />
                          )}
                        </td>
                        <td className="p-3 border-r text-slate-700 bg-white font-medium">
                          {kpi.title}
                          {kpi.isClickable && (
                            <span className="ml-2 text-[10px] text-blue-500 font-normal">(Click para ver detalle)</span>
                          )}
                        </td>
                        <td className="p-3 border-r text-center bg-white">
                          <div className="w-6 h-6 bg-slate-200 rounded-full flex items-center justify-center mx-auto text-slate-500 cursor-pointer hover:bg-slate-300 transition-colors">
                            <User size={14} />
                          </div>
                        </td>
                        <td className="p-3 border-r text-center bg-white" onClick={(e) => e.stopPropagation()}>
                          {!isSuperAdmin ? (
                            <span className="text-sm font-semibold text-slate-700">{getGoal(kpi.id, kpi.goalDefault)}{kpi.goalSuffix}</span>
                          ) : (
                            <input
                              type="number"
                              value={getGoal(kpi.id, kpi.goalDefault)}
                              onChange={(e) => handleGoalChange(kpi.id, e.target.value)}
                              onBlur={(e) => handleGoalBlur(kpi.id, e.target.value)}
                              className="w-28 text-center text-sm font-semibold text-slate-700 bg-blue-50 border border-blue-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-shadow"
                            />
                          )}
                        </td>
                        <td className="p-3 border-r text-center text-slate-600 bg-white font-bold">{kpi.average}</td>
                        <td className="p-3 border-r text-center text-slate-600 border-r-blue-400 border-r-2 bg-slate-50/50 font-bold">{kpi.peso}</td>
                        {kpi.weeks.map((val: string | null, idx: number) => (
                          <td
                            key={idx}
                            className={`border-r text-center p-3 transition-colors ${
                              ["efectividad_cobranza", "cartera_vencida", "recuperacion_vencidos", "dso", "pagos_a_tiempo", "cuentas_pagar_vencidas", "procesamiento_oportuno", "dpo",
                                "usuarios_totales", "sesiones", "paginas_vistas", "clicks_sc", "impresiones_sc", "ctr_sc", "email_open_rate", "tasa_rebote", "posicion_sc"].includes(kpi.id)
                                ? getKpiCellColor(kpi.id, val, kpi.goalDefault)
                                : getCellColor(val || "")
                            }`}
                          >
                            {val || "-"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {expandedGroups[group.id] && (activeTab === "Monthly" || activeTab === "Quarterly" || activeTab === "Annual") && (
              monthlyHistLoading ? (
                <div className="p-8 text-center text-slate-500 text-sm">Cargando datos históricos...</div>
              ) : monthlyHistory.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">Sin datos</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left border-collapse">
                    <thead>
                      <tr className="bg-white border-b text-slate-500">
                        <th className="p-3 border-r font-medium min-w-[260px]">KPI</th>
                        <th className="p-3 w-20 text-center border-r font-medium border-r-blue-400 border-r-2">Peso</th>
                        {monthlyHistory.map(h => (
                          <th key={h.mes} className="p-3 w-28 text-center border-r font-normal text-xs text-slate-500 capitalize">
                            {mesLabel(h.mes)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {group.kpis.map((kpi: any) => (
                        <tr key={kpi.id} className="border-b hover:bg-slate-50">
                          <td className="p-3 border-r text-slate-700 font-medium">{kpi.title}</td>
                          <td className="p-3 border-r text-center text-slate-600 border-r-blue-400 border-r-2 font-bold">{kpi.peso}</td>
                          {monthlyHistory.map(h => {
                            const val = getMonthlyValue(kpi.id, h);
                            return (
                              <td
                                key={h.mes}
                                className={`border-r text-center p-3 transition-colors ${
                                  ["efectividad_cobranza","cartera_vencida","recuperacion_vencidos","dso","pagos_a_tiempo","cuentas_pagar_vencidas","procesamiento_oportuno","dpo"].includes(kpi.id)
                                    ? getKpiCellColor(kpi.id, val, kpi.goalDefault)
                                    : getCellColor(val)
                                }`}
                              >
                                {val}
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
        ))}
      </div>

      {/* MODAL DE CUMPLIMIENTO DE CUOTA */}
      {modalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b bg-gradient-to-r from-slate-50 to-white">
              <div className="flex items-center gap-3">
                {selectedSeller && (
                  <button
                    onClick={() => setSelectedSeller(null)}
                    className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 transition-colors"
                  >
                    <ArrowLeft size={16} /> Volver
                  </button>
                )}
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Cumplimiento de Cuota de Ventas</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Detalle por vendedor - {modalData?.mes || modalMes} | Dias utiles: {modalData?.totalDiasUtiles || 0}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <ModalMonthPicker value={modalMes} onChange={onModalMesChange} />
                <button
                  onClick={() => { setModalOpen(false); setSelectedSeller(null); }}
                  className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <X size={20} className="text-slate-500" />
                </button>
              </div>
            </div>

            {/* Modal Tabs */}
            <div className="flex gap-4 px-5 pt-4 border-b">
              {(["resumen", "diario", "semanal"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setModalTab(tab)}
                  className={`pb-3 text-sm font-medium capitalize transition-colors ${
                    modalTab === tab ? "text-amber-500 border-b-2 border-amber-500" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {tab === "resumen" ? "Resumen Vendedores" : tab === "diario" ? "Detalle Diario" : "Detalle Semanal"}
                </button>
              ))}
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-auto p-5">
              {modalLoading ? (
                <div className="flex items-center justify-center py-20 text-slate-400">
                  Cargando datos...
                </div>
              ) : !modalData ? (
                <div className="flex items-center justify-center py-20 text-slate-400">
                  No hay datos disponibles
                </div>
              ) : (
                <>
                  {/* Resumen Tab */}
                  {modalTab === "resumen" && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-4 gap-4 mb-6">
                        <div className="bg-blue-50 rounded-xl p-4">
                          <p className="text-xs text-blue-600 font-medium">Total Vendedores</p>
                          <p className="text-2xl font-bold text-blue-700">{modalData.sellers.length}</p>
                        </div>
                        <div className="bg-green-50 rounded-xl p-4">
                          <p className="text-xs text-green-600 font-medium">Cumplieron</p>
                          <p className="text-2xl font-bold text-green-700">
                            {modalData.sellers.filter((s) => s.cumple).length}
                          </p>
                        </div>
                        <div className="bg-red-50 rounded-xl p-4">
                          <p className="text-xs text-red-600 font-medium">No Cumplieron</p>
                          <p className="text-2xl font-bold text-red-700">
                            {modalData.sellers.filter((s) => !s.cumple).length}
                          </p>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-4">
                          <p className="text-xs text-slate-600 font-medium">Dias Utiles Mes</p>
                          <p className="text-2xl font-bold text-slate-700">{modalData.totalDiasUtiles}</p>
                        </div>
                      </div>

                      <div className="border rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-50 border-b">
                              <th className="p-3 text-left font-medium text-slate-600">Vendedor</th>
                              <th className="p-3 text-center font-medium text-slate-600">Cuota Mensual</th>
                              <th className="p-3 text-center font-medium text-slate-600">Facturado</th>
                              <th className="p-3 text-center font-medium text-slate-600">Porcentaje</th>
                              <th className="p-3 text-center font-medium text-slate-600">Estado</th>
                              <th className="p-3 text-center font-medium text-slate-600">Accion</th>
                            </tr>
                          </thead>
                          <tbody>
                            {modalData.sellers.map((seller) => (
                              <tr key={seller.sellerId} className="border-b hover:bg-slate-50/50 transition-colors cursor-pointer" onClick={() => { setSelectedSeller(seller); setModalTab("diario"); }}>
                                <td className="p-3 font-medium text-slate-800">{seller.nombre}</td>
                                <td className="p-3 text-center">${seller.cuotaMensual.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</td>
                                <td className="p-3 text-center">${seller.totalFacturado.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</td>
                                <td className="p-3 text-center">
                                  <span className={`font-bold ${seller.porcentajeMensual >= 100 ? "text-green-600" : seller.porcentajeMensual >= 75 ? "text-yellow-600" : "text-red-600"}`}>
                                    {seller.porcentajeMensual}%
                                  </span>
                                </td>
                                <td className="p-3 text-center">
                                  {seller.cumple ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                                      <Check size={12} /> Cumple
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                                      <X size={12} /> No cumple
                                    </span>
                                  )}
                                </td>
                                <td className="p-3 text-center">
                                  <span className="text-xs text-blue-600 hover:text-blue-800 underline">
                                    Ver detalle
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Detalle Diario Tab */}
                  {modalTab === "diario" && (
                    <div>
                      {!selectedSeller ? (
                        <div className="space-y-3">
                          <p className="text-sm text-slate-500 mb-3">Selecciona un vendedor para ver su detalle diario:</p>
                          <div className="grid grid-cols-2 gap-3">
                            {modalData.sellers.map((seller) => (
                              <button
                                key={seller.sellerId}
                                onClick={() => setSelectedSeller(seller)}
                                className="flex items-center justify-between p-3 border rounded-xl hover:bg-slate-50 transition-colors text-left"
                              >
                                <span className="font-medium text-slate-800">{seller.nombre}</span>
                                <span className={`text-sm font-bold ${seller.porcentajeMensual >= 100 ? "text-green-600" : "text-red-600"}`}>
                                  {seller.porcentajeMensual}%
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <button onClick={() => setSelectedSeller(null)} className="text-sm text-slate-500 hover:text-slate-800">
                                Volver
                              </button>
                              <h3 className="font-bold text-slate-800">{selectedSeller.nombre}</h3>
                              <span className={`text-sm font-bold ${selectedSeller.porcentajeMensual >= 100 ? "text-green-600" : "text-red-600"}`}>
                                {selectedSeller.porcentajeMensual}%
                              </span>
                            </div>
                            <span className="text-xs text-slate-400">
                              Cuota diaria: ${selectedSeller.cuotaDiaria.toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          <div className="border rounded-xl overflow-hidden">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-slate-50 border-b">
                                  <th className="p-2 text-left font-medium text-slate-600">Fecha</th>
                                  <th className="p-2 text-center font-medium text-slate-600">Dia</th>
                                  <th className="p-2 text-center font-medium text-slate-600">Cuota</th>
                                  <th className="p-2 text-center font-medium text-slate-600">Facturado</th>
                                  <th className="p-2 text-center font-medium text-slate-600">Estado</th>
                                </tr>
                              </thead>
                              <tbody>
                                {selectedSeller.dias.map((dia) => (
                                  <tr
                                    key={dia.fecha}
                                    className={`border-b ${
                                      !dia.esDiaUtil
                                        ? "bg-slate-50 text-slate-400"
                                        : dia.cumple
                                          ? "bg-green-50/30"
                                          : dia.facturado > 0
                                            ? "bg-yellow-50/30"
                                            : ""
                                    }`}
                                  >
                                    <td className="p-2">{dia.fecha}</td>
                                    <td className="p-2 text-center">{dia.diaSemana}</td>
                                    <td className="p-2 text-center">
                                      {dia.esDiaUtil
                                        ? `$${dia.cuotaDiaria.toLocaleString("es-VE", { minimumFractionDigits: 2 })}`
                                        : dia.esFeriado
                                          ? "Feriado"
                                          : "Descanso"}
                                    </td>
                                    <td className="p-2 text-center font-medium">
                                      {dia.facturado > 0
                                        ? `$${dia.facturado.toLocaleString("es-VE", { minimumFractionDigits: 2 })}`
                                        : "-"}
                                    </td>
                                    <td className="p-2 text-center">
                                      {!dia.esDiaUtil ? (
                                        <span className="text-xs text-slate-400">-</span>
                                      ) : dia.cumple ? (
                                        <span className="inline-flex items-center gap-0.5 text-xs text-green-600 font-medium">
                                          <Check size={12} /> OK
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-0.5 text-xs text-red-600 font-medium">
                                          <X size={12} /> Falta
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Detalle Semanal Tab */}
                  {modalTab === "semanal" && (
                    <div>
                      {!selectedSeller ? (
                        <div className="space-y-3">
                          <p className="text-sm text-slate-500 mb-3">Selecciona un vendedor para ver su detalle semanal:</p>
                          <div className="grid grid-cols-2 gap-3">
                            {modalData.sellers.map((seller) => (
                              <button
                                key={seller.sellerId}
                                onClick={() => setSelectedSeller(seller)}
                                className="flex items-center justify-between p-3 border rounded-xl hover:bg-slate-50 transition-colors text-left"
                              >
                                <span className="font-medium text-slate-800">{seller.nombre}</span>
                                <span className={`text-sm font-bold ${seller.porcentajeMensual >= 100 ? "text-green-600" : "text-red-600"}`}>
                                  {seller.porcentajeMensual}%
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center gap-3 mb-4">
                            <button onClick={() => setSelectedSeller(null)} className="text-sm text-slate-500 hover:text-slate-800">
                              Volver
                            </button>
                            <h3 className="font-bold text-slate-800">{selectedSeller.nombre}</h3>
                            <span className={`text-sm font-bold ${selectedSeller.porcentajeMensual >= 100 ? "text-green-600" : "text-red-600"}`}>
                              {selectedSeller.porcentajeMensual}%
                            </span>
                          </div>
                          <div className="border rounded-xl overflow-hidden">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-slate-50 border-b">
                                  <th className="p-3 text-left font-medium text-slate-600">Semana</th>
                                  <th className="p-3 text-center font-medium text-slate-600">Periodo</th>
                                  <th className="p-3 text-center font-medium text-slate-600">Dias Utiles</th>
                                  <th className="p-3 text-center font-medium text-slate-600">Cuota Semanal</th>
                                  <th className="p-3 text-center font-medium text-slate-600">Facturado</th>
                                  <th className="p-3 text-center font-medium text-slate-600">Porcentaje</th>
                                  <th className="p-3 text-center font-medium text-slate-600">Estado</th>
                                </tr>
                              </thead>
                              <tbody>
                                {selectedSeller.semanas.map((sem) => (
                                  <tr key={sem.numero} className={`border-b ${sem.porcentaje != null && sem.porcentaje >= 100 ? "bg-green-50/30" : ""}`}>
                                    <td className="p-3 font-medium">Semana {sem.numero}</td>
                                    <td className="p-3 text-center text-slate-600">{sem.inicio} - {sem.fin}</td>
                                    <td className="p-3 text-center">{sem.diasUtiles}</td>
                                    <td className="p-3 text-center">${sem.cuotaSemanal.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</td>
                                    <td className="p-3 text-center font-medium">${sem.facturado.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</td>
                                    <td className="p-3 text-center">
                                      {sem.porcentaje != null ? (
                                        <span className={`font-bold ${sem.porcentaje >= 100 ? "text-green-600" : sem.porcentaje >= 75 ? "text-yellow-600" : "text-red-600"}`}>
                                          {sem.porcentaje}%
                                        </span>
                                      ) : (
                                        <span className="text-slate-400">-</span>
                                      )}
                                    </td>
                                    <td className="p-3 text-center">
                                      {sem.porcentaje != null ? (
                                        sem.porcentaje >= 100 ? (
                                          <span className="inline-flex items-center gap-0.5 text-xs text-green-600 font-medium">
                                            <Check size={12} /> Cumple
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center gap-0.5 text-xs text-red-600 font-medium">
                                            <X size={12} /> No cumple
                                          </span>
                                        )
                                      ) : (
                                        <span className="text-slate-400">-</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CLIENTES NUEVOS */}
      {clientesModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b bg-gradient-to-r from-emerald-50 to-white">
              <div className="flex items-center gap-3">
                {(selectedInvoice || selectedClientesClient || selectedClientesSeller) && (
                  <button
                    onClick={() => {
                      if (selectedInvoice) {
                        setSelectedInvoice(null);
                        setInvoiceDetail(null);
                      } else if (selectedClientesClient) {
                        setSelectedClientesClient(null);
                      } else if (selectedClientesSeller) {
                        setSelectedClientesSeller(null);
                        setClientesSellerDetail(null);
                      }
                    }}
                    className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 transition-colors"
                  >
                    <ArrowLeft size={16} /> Volver
                  </button>
                )}
                <div>
                  <h2 className="text-xl font-bold text-slate-900">
                    {selectedInvoice
                      ? `${selectedInvoice.type === "Nota de credito" ? "Nota de Credito" : "Factura"} ${selectedInvoice.reference}`
                      : selectedClientesSeller
                        ? selectedClientesClient
                          ? `Facturas de ${selectedClientesClient.partnerName}`
                          : `Clientes Nuevos - ${selectedClientesSeller.nombre}`
                        : "Clientes Nuevos Captados"}
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">
                    {selectedInvoice
                      ? `${selectedInvoice.date} | Total: $${Math.abs(selectedInvoice.amount || 0).toLocaleString("es-VE", { minimumFractionDigits: 2 })}`
                      : selectedClientesSeller
                        ? selectedClientesClient
                          ? `${selectedMes} | Total: $${(selectedClientesClient.totalFacturado || 0).toLocaleString("es-VE", { minimumFractionDigits: 2 })}`
                          : `${selectedMes} | Nuevos: ${clientesSellerDetail?.totalNuevos || 0}`
                        : `Detalle por vendedor - ${clientesModalData?.mes || selectedMes} | Meta por vendedor: ${clientesModalData?.metaPerSeller || 0}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {!selectedInvoice && !selectedClientesClient && !selectedClientesSeller && (
                  <ModalMonthPicker value={modalMes} onChange={onModalMesChange} />
                )}
                <button
                  onClick={() => {
                    setClientesModalOpen(false);
                    setClientesModalData(null);
                    setSelectedClientesSeller(null);
                    setSelectedClientesClient(null);
                    setSelectedInvoice(null);
                    setInvoiceDetail(null);
                    setClientesSellerDetail(null);
                  }}
                  className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <X size={20} className="text-slate-500" />
                </button>
              </div>
            </div>

            {/* Tabs - only show when not in drill-down */}
            {!selectedClientesSeller && (
              <div className="flex gap-4 px-5 pt-4 border-b">
                {(["resumen", "semanal"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setClientesModalTab(tab)}
                    className={`pb-3 text-sm font-medium capitalize transition-colors ${
                      clientesModalTab === tab ? "text-amber-500 border-b-2 border-amber-500" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    {tab === "resumen" ? "Resumen Vendedores" : "Detalle Semanal por Vendedor"}
                  </button>
                ))}
              </div>
            )}

            {/* Breadcrumb when drill-down */}
            {selectedClientesSeller && (
              <div className="flex gap-2 px-5 pt-3 text-xs text-slate-500">
                <button onClick={() => { setSelectedClientesSeller(null); setSelectedClientesClient(null); setSelectedInvoice(null); setInvoiceDetail(null); setClientesSellerDetail(null); }} className="hover:text-amber-600 transition-colors">
                  Resumen
                </button>
                <span>/</span>
                <button onClick={() => { setSelectedClientesClient(null); setSelectedInvoice(null); setInvoiceDetail(null); }} className="hover:text-amber-600 transition-colors">
                  {selectedClientesSeller.nombre}
                </button>
                {selectedClientesClient && (
                  <>
                    <span>/</span>
                    <button onClick={() => { setSelectedInvoice(null); setInvoiceDetail(null); }} className="hover:text-amber-600 transition-colors">
                      {selectedClientesClient.partnerName}
                    </button>
                  </>
                )}
                {selectedInvoice && (
                  <>
                    <span>/</span>
                    <span className="text-slate-800 font-medium">{selectedInvoice.reference}</span>
                  </>
                )}
              </div>
            )}

            {/* Body */}
            <div className="flex-1 overflow-auto p-5">
              {clientesModalLoading ? (
                <div className="flex items-center justify-center py-20 text-slate-400">Cargando datos...</div>
              ) : !clientesModalData ? (
                <div className="flex items-center justify-center py-20 text-slate-400">No hay datos disponibles</div>
              ) : (
                <>
                  {/* RESUMEN TAB */}
                  {clientesModalTab === "resumen" && !selectedClientesSeller && (
                    <div className="space-y-4">
                      {/* Summary cards */}
                      <div className="grid grid-cols-4 gap-4 mb-6">
                        <div className="bg-emerald-50 rounded-xl p-4">
                          <p className="text-xs text-emerald-600 font-medium">Total Clientes Nuevos</p>
                          <p className="text-2xl font-bold text-emerald-700">{clientesModalData.totalNuevos}</p>
                        </div>
                        <div className="bg-blue-50 rounded-xl p-4">
                          <p className="text-xs text-blue-600 font-medium">Vendedores</p>
                          <p className="text-2xl font-bold text-blue-700">{clientesModalData.numSellers}</p>
                        </div>
                        <div className="bg-amber-50 rounded-xl p-4">
                          <p className="text-xs text-amber-600 font-medium">Meta por Vendedor</p>
                          <p className="text-2xl font-bold text-amber-700">{clientesModalData.metaPerSeller}</p>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-4">
                          <p className="text-xs text-slate-600 font-medium">Promedio por Vendedor</p>
                          <p className="text-2xl font-bold text-slate-700">
                            {clientesModalData.numSellers > 0
                              ? Math.round((clientesModalData.totalNuevos / clientesModalData.numSellers) * 10) / 10
                              : 0}
                          </p>
                        </div>
                      </div>

                      {/* Seller table */}
                      <div className="border rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-50 border-b">
                              <th className="p-3 text-left font-medium text-slate-600">Vendedor</th>
                              <th className="p-3 text-center font-medium text-slate-600">Clientes Nuevos</th>
                              <th className="p-3 text-center font-medium text-slate-600">Meta</th>
                              <th className="p-3 text-center font-medium text-slate-600">Porcentaje</th>
                              <th className="p-3 text-center font-medium text-slate-600">Estado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {clientesModalData.sellers.map((seller: any) => {
                              const meta = clientesModalData.metaPerSeller || 0;
                              const pct = meta > 0 ? Math.round((seller.nuevosMes / meta) * 100) : 0;
                              const cumple = pct >= 100;
                              return (
                                <tr
                                  key={seller.sellerId}
                                  className="border-b hover:bg-blue-50/40 transition-colors cursor-pointer"
                                  onClick={() => openClientesSellerDetail(seller)}
                                >
                                  <td className="p-3 font-medium text-slate-800">{seller.nombre}</td>
                                  <td className="p-3 text-center font-bold text-lg">{seller.nuevosMes}</td>
                                  <td className="p-3 text-center text-slate-600">{meta}</td>
                                  <td className="p-3 text-center">
                                    <span className={`font-bold ${pct >= 100 ? "text-green-600" : pct >= 75 ? "text-yellow-600" : "text-red-600"}`}>
                                      {meta > 0 ? `${pct}%` : "-"}
                                    </span>
                                  </td>
                                  <td className="p-3 text-center">
                                    {meta > 0 ? (
                                      cumple ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                                          <Check size={12} /> Cumple
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                                          <X size={12} /> No cumple
                                        </span>
                                      )
                                    ) : (
                                      <span className="text-xs text-slate-400">Sin meta</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* SEMANAL TAB */}
                  {clientesModalTab === "semanal" && !selectedClientesSeller && (
                    <div className="border rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-b">
                            <th className="p-3 text-left font-medium text-slate-600">Vendedor</th>
                            <th className="p-3 text-center font-medium text-slate-600">Total</th>
                            {clientesModalData.weekHeaders?.map((_: string, i: number) => (
                              <th key={i} className="p-3 text-center font-medium text-slate-600">Sem {i + 1}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {clientesModalData.sellers.map((seller: any) => (
                            <tr key={seller.sellerId} className="border-b hover:bg-slate-50/50 transition-colors">
                              <td className="p-3 font-medium text-slate-800">{seller.nombre}</td>
                              <td className="p-3 text-center font-bold">{seller.nuevosMes}</td>
                              {seller.semanas.map((sem: any, i: number) => (
                                <td key={i} className="p-3 text-center">
                                  <div className="flex flex-col items-center">
                                    <span className={`font-medium ${sem.porcentaje >= 100 ? "text-green-600" : sem.porcentaje >= 75 ? "text-yellow-600" : "text-red-600"}`}>
                                      {sem.nuevos} / {sem.meta}
                                    </span>
                                    <span className={`text-xs ${sem.porcentaje >= 100 ? "text-green-500" : "text-red-500"}`}>
                                      {sem.meta > 0 ? `${sem.porcentaje}%` : "-"}
                                    </span>
                                  </div>
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* SELLER DRILL-DOWN: List of new clients */}
                  {selectedClientesSeller && !selectedClientesClient && (
                    <div className="space-y-4">
                      {clientesSellerLoading ? (
                        <div className="flex items-center justify-center py-20 text-slate-400">Cargando clientes...</div>
                      ) : !clientesSellerDetail || clientesSellerDetail.clients.length === 0 ? (
                        <div className="flex items-center justify-center py-20 text-slate-400">No hay clientes nuevos para este vendedor</div>
                      ) : (
                        <>
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-sm font-medium text-slate-600">Clientes nuevos de {selectedClientesSeller.nombre}:</span>
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">{clientesSellerDetail.totalNuevos}</span>
                          </div>
                          <div className="border rounded-xl overflow-hidden">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-slate-50 border-b">
                                  <th className="p-3 text-left font-medium text-slate-600">Cliente</th>
                                  <th className="p-3 text-center font-medium text-slate-600">Facturado</th>
                                  <th className="p-3 text-center font-medium text-slate-600">Facturas</th>
                                  <th className="p-3 text-center font-medium text-slate-600">Accion</th>
                                </tr>
                              </thead>
                              <tbody>
                                {clientesSellerDetail.clients.map((client: any) => (
                                  <tr key={client.partnerId} className="border-b hover:bg-blue-50/40 transition-colors cursor-pointer" onClick={() => setSelectedClientesClient(client)}>
                                    <td className="p-3 font-medium text-slate-800">{client.partnerName}</td>
                                    <td className="p-3 text-center font-bold">${client.totalFacturado.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</td>
                                    <td className="p-3 text-center text-slate-600">{client.invoices.length}</td>
                                    <td className="p-3 text-center">
                                      <span className="text-xs text-blue-600 underline">Ver facturas</span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* CLIENT DRILL-DOWN: Invoice list */}
                  {selectedClientesClient && !selectedInvoice && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-sm font-medium text-slate-600">Facturas de {selectedClientesClient.partnerName}:</span>
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">
                          Total: ${selectedClientesClient.totalFacturado.toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="border rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-50 border-b">
                              <th className="p-3 text-left font-medium text-slate-600">Referencia</th>
                              <th className="p-3 text-center font-medium text-slate-600">Fecha</th>
                              <th className="p-3 text-center font-medium text-slate-600">Tipo</th>
                              <th className="p-3 text-center font-medium text-slate-600">Monto</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedClientesClient.invoices.map((inv: any) => (
                              <tr
                                key={inv.id}
                                className={`border-b hover:bg-blue-50/40 transition-colors cursor-pointer ${inv.type === "Nota de credito" ? "bg-red-50/30" : ""}`}
                                onClick={() => openInvoiceDetail(inv)}
                              >
                                <td className="p-3 font-medium text-slate-800">{inv.reference}</td>
                                <td className="p-3 text-center text-slate-600">{inv.date}</td>
                                <td className="p-3 text-center">
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                    inv.type === "Nota de credito" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                                  }`}>
                                    {inv.type === "Nota de credito" ? <X size={10} /> : <Check size={10} />}
                                    {inv.type}
                                  </span>
                                </td>
                                <td className={`p-3 text-center font-bold ${inv.amount >= 0 ? "text-slate-800" : "text-red-600"}`}>
                                  ${Math.abs(inv.amount).toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* INVOICE DETAIL: Products */}
                  {selectedInvoice && (
                    <div className="space-y-4">
                      {invoiceLoading ? (
                        <div className="flex items-center justify-center py-20 text-slate-400">Cargando detalle...</div>
                      ) : !invoiceDetail ? (
                        <div className="flex items-center justify-center py-20 text-slate-400">No se pudo cargar el detalle</div>
                      ) : (
                        <>
                          {/* Invoice summary */}
                          <div className="grid grid-cols-3 gap-4 mb-4">
                            <div className="bg-slate-50 rounded-xl p-4">
                              <p className="text-xs text-slate-500 font-medium">Subtotal</p>
                              <p className="text-lg font-bold text-slate-800">${invoiceDetail.subtotal.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</p>
                            </div>
                            <div className="bg-slate-50 rounded-xl p-4">
                              <p className="text-xs text-slate-500 font-medium">Impuestos</p>
                              <p className="text-lg font-bold text-slate-800">${invoiceDetail.tax.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</p>
                            </div>
                            <div className={`rounded-xl p-4 ${invoiceDetail.moveType === "Nota de credito" ? "bg-red-50" : "bg-green-50"}`}>
                              <p className={`text-xs font-medium ${invoiceDetail.moveType === "Nota de credito" ? "text-red-600" : "text-green-600"}`}>Total</p>
                              <p className={`text-lg font-bold ${invoiceDetail.moveType === "Nota de credito" ? "text-red-700" : "text-green-700"}`}>
                                ${Math.abs(invoiceDetail.total).toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                              </p>
                            </div>
                          </div>

                          {/* Products table */}
                          <div className="border rounded-xl overflow-hidden">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-slate-50 border-b">
                                  <th className="p-3 text-left font-medium text-slate-600">Producto</th>
                                  <th className="p-3 text-center font-medium text-slate-600">Cantidad</th>
                                  <th className="p-3 text-center font-medium text-slate-600">Precio Unitario</th>
                                  <th className="p-3 text-right font-medium text-slate-600">Subtotal</th>
                                </tr>
                              </thead>
                              <tbody>
                                {invoiceDetail.lines.map((line: any, idx: number) => (
                                  <tr key={idx} className="border-b hover:bg-slate-50/50 transition-colors">
                                    <td className="p-3">
                                      <div className="font-medium text-slate-800">{line.productName}</div>
                                      {line.description && line.description !== line.productName && (
                                        <div className="text-xs text-slate-500 mt-0.5">{line.description}</div>
                                      )}
                                    </td>
                                    <td className="p-3 text-center">{line.quantity}</td>
                                    <td className="p-3 text-center">${line.priceUnit.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</td>
                                    <td className="p-3 text-right font-bold">${line.subtotal.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</td>
                                  </tr>
                                ))}
                                {invoiceDetail.lines.length === 0 && (
                                  <tr>
                                    <td colSpan={4} className="p-6 text-center text-slate-400">Sin lineas de producto</td>
                                  </tr>
                                )}
                              </tbody>
                              <tfoot>
                                <tr className="bg-slate-50 border-t-2">
                                  <td colSpan={3} className="p-3 text-right font-medium text-slate-600">Subtotal</td>
                                  <td className="p-3 text-right font-bold">${invoiceDetail.subtotal.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</td>
                                </tr>
                                <tr className="bg-slate-50">
                                  <td colSpan={3} className="p-3 text-right font-medium text-slate-600">Impuestos</td>
                                  <td className="p-3 text-right font-bold">${invoiceDetail.tax.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</td>
                                </tr>
                                <tr className={`border-t-2 ${invoiceDetail.moveType === "Nota de credito" ? "bg-red-50" : "bg-green-50"}`}>
                                  <td colSpan={3} className="p-3 text-right font-bold text-slate-700">Total</td>
                                  <td className={`p-3 text-right font-bold text-lg ${invoiceDetail.moveType === "Nota de credito" ? "text-red-700" : "text-green-700"}`}>
                                    ${Math.abs(invoiceDetail.total).toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE MARGEN BRUTO */}
      {margenModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b bg-gradient-to-r from-purple-50 to-white">
              <div className="flex items-center gap-3">
                {selectedMargenSeller && (
                  <button
                    onClick={() => setSelectedMargenSeller(null)}
                    className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 transition-colors"
                  >
                    <ArrowLeft size={16} /> Volver
                  </button>
                )}
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Margen Bruto</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Detalle por vendedor y producto - {margenModalData?.mes || modalMes}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <ModalMonthPicker value={modalMes} onChange={onModalMesChange} />
                <button
                  onClick={() => { setMargenModalOpen(false); setSelectedMargenSeller(null); setMargenModalData(null); }}
                  className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <X size={20} className="text-slate-500" />
                </button>
              </div>
            </div>

            {/* Modal Tabs */}
            <div className="flex gap-4 px-5 pt-4 border-b">
              {(["vendedor", "producto", "semanal"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => { setMargenModalTab(tab as any); setSelectedMargenSeller(null); }}
                  className={`pb-3 text-sm font-medium capitalize transition-colors ${
                    margenModalTab === tab ? "text-amber-500 border-b-2 border-amber-500" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {tab === "vendedor" ? "Por Vendedor" : tab === "producto" ? "Por Producto" : "Detalle Semanal"}
                </button>
              ))}
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-auto p-5">
              {margenModalLoading ? (
                <div className="flex items-center justify-center py-20 text-slate-400">
                  Cargando datos...
                </div>
              ) : !margenModalData ? (
                <div className="flex items-center justify-center py-20 text-slate-400">
                  No hay datos disponibles
                </div>
              ) : (
                <>
                  {/* POR VENDEDOR Tab */}
                  {margenModalTab === "vendedor" && (
                    <div className="space-y-4">
                      {/* Summary cards */}
                      {(() => {
                        const totalRevenue = margenModalData.sellers.reduce((sum: number, s: any) => sum + s.revenue, 0);
                        const totalCosto = margenModalData.sellers.reduce((sum: number, s: any) => sum + s.costo, 0);
                        const totalGanancia = totalRevenue - totalCosto;
                        const margenPromedio = margenModalData.sellers.length > 0
                          ? Math.round(margenModalData.sellers.reduce((sum: number, s: any) => sum + s.margenMensual, 0) / margenModalData.sellers.length)
                          : 0;
                        return (
                          <div className="grid grid-cols-4 gap-4 mb-6">
                            <div className="bg-purple-50 rounded-xl p-4">
                              <p className="text-xs text-purple-600 font-medium">Revenue Total</p>
                              <p className="text-2xl font-bold text-purple-700">
                                ${totalRevenue.toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                              </p>
                            </div>
                            <div className="bg-red-50 rounded-xl p-4">
                              <p className="text-xs text-red-600 font-medium">Costo Total</p>
                              <p className="text-2xl font-bold text-red-700">
                                ${totalCosto.toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                              </p>
                            </div>
                            <div className="bg-green-50 rounded-xl p-4">
                              <p className="text-xs text-green-600 font-medium">Ganancia Total</p>
                              <p className={`text-2xl font-bold ${totalGanancia >= 0 ? "text-green-700" : "text-red-700"}`}>
                                ${totalGanancia.toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                              </p>
                            </div>
                            <div className="bg-amber-50 rounded-xl p-4">
                              <p className="text-xs text-amber-600 font-medium">Margen Promedio</p>
                              <p className="text-2xl font-bold text-amber-700">{margenPromedio}%</p>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Seller table */}
                      <div className="border rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-50 border-b">
                              <th className="p-3 text-left font-medium text-slate-600">Vendedor</th>
                              <th className="p-3 text-center font-medium text-slate-600">Revenue</th>
                              <th className="p-3 text-center font-medium text-slate-600">Costo</th>
                              <th className="p-3 text-center font-medium text-slate-600">Ganancia</th>
                              <th className="p-3 text-center font-medium text-slate-600">Margen %</th>
                              <th className="p-3 text-center font-medium text-slate-600">Estado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {margenModalData.sellers.map((seller: any) => {
                              const ganancia = seller.revenue - seller.costo;
                              const cumple = seller.margenMensual >= 15;
                              return (
                                <tr
                                  key={seller.nombre}
                                  className="border-b hover:bg-purple-50/40 transition-colors cursor-pointer"
                                  onClick={() => setSelectedMargenSeller(seller)}
                                >
                                  <td className="p-3 font-medium text-slate-800">{seller.nombre}</td>
                                  <td className="p-3 text-center">${seller.revenue.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</td>
                                  <td className="p-3 text-center text-red-600">${seller.costo.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</td>
                                  <td className={`p-3 text-center font-bold ${ganancia >= 0 ? "text-green-600" : "text-red-600"}`}>
                                    ${ganancia.toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                                  </td>
                                  <td className="p-3 text-center">
                                    <span className={`font-bold ${seller.margenMensual >= 15 ? "text-green-600" : seller.margenMensual >= 0 ? "text-yellow-600" : "text-red-600"}`}>
                                      {seller.margenMensual}%
                                    </span>
                                  </td>
                                  <td className="p-3 text-center">
                                    {cumple ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                                        <Check size={12} /> Cumple
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                                        <X size={12} /> No cumple
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* POR PRODUCTO Tab */}
                  {margenModalTab === "producto" && (
                    <div className="space-y-4">
                      {/* Summary cards */}
                      {(() => {
                        const totalRevenue = margenModalData.products.reduce((sum: number, p: any) => sum + p.revenue, 0);
                        const totalCosto = margenModalData.products.reduce((sum: number, p: any) => sum + p.costo, 0);
                        const totalGanancia = totalRevenue - totalCosto;
                        const totalProductos = margenModalData.products.length;
                        return (
                          <div className="grid grid-cols-4 gap-4 mb-6">
                            <div className="bg-purple-50 rounded-xl p-4">
                              <p className="text-xs text-purple-600 font-medium">Revenue Total</p>
                              <p className="text-2xl font-bold text-purple-700">
                                ${totalRevenue.toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                              </p>
                            </div>
                            <div className="bg-red-50 rounded-xl p-4">
                              <p className="text-xs text-red-600 font-medium">Costo Total</p>
                              <p className="text-2xl font-bold text-red-700">
                                ${totalCosto.toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                              </p>
                            </div>
                            <div className="bg-green-50 rounded-xl p-4">
                              <p className="text-xs text-green-600 font-medium">Ganancia Total</p>
                              <p className={`text-2xl font-bold ${totalGanancia >= 0 ? "text-green-700" : "text-red-700"}`}>
                                ${totalGanancia.toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                              </p>
                            </div>
                            <div className="bg-slate-50 rounded-xl p-4">
                              <p className="text-xs text-slate-600 font-medium">Total Productos</p>
                              <p className="text-2xl font-bold text-slate-700">{totalProductos}</p>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Product table */}
                      <div className="border rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-50 border-b">
                              <th className="p-3 text-left font-medium text-slate-600">Producto</th>
                              <th className="p-3 text-center font-medium text-slate-600">Cant. Vendida</th>
                              <th className="p-3 text-center font-medium text-slate-600">Revenue</th>
                              <th className="p-3 text-center font-medium text-slate-600">Costo</th>
                              <th className="p-3 text-center font-medium text-slate-600">Ganancia</th>
                              <th className="p-3 text-center font-medium text-slate-600">Margen %</th>
                            </tr>
                          </thead>
                          <tbody>
                            {margenModalData.products.map((product: any) => (
                              <tr key={product.productId} className="border-b hover:bg-purple-50/40 transition-colors">
                                <td className="p-3 font-medium text-slate-800 max-w-[300px] truncate" title={product.nombre}>
                                  {product.nombre}
                                </td>
                                <td className="p-3 text-center">{product.cantidadVendida}</td>
                                <td className="p-3 text-center">${product.revenue.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</td>
                                <td className="p-3 text-center text-red-600">${product.costo.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</td>
                                <td className={`p-3 text-center font-bold ${product.ganancia >= 0 ? "text-green-600" : "text-red-600"}`}>
                                  ${product.ganancia.toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                                </td>
                                <td className="p-3 text-center">
                                  <span className={`font-bold ${product.margen >= 15 ? "text-green-600" : product.margen >= 0 ? "text-yellow-600" : "text-red-600"}`}>
                                    {product.margen}%
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* DETALLE SEMANAL Tab */}
                  {margenModalTab === "semanal" && (
                    <div>
                      {!selectedMargenSeller ? (
                        <div className="space-y-3">
                          <p className="text-sm text-slate-500 mb-3">Selecciona un vendedor para ver su detalle semanal:</p>
                          <div className="grid grid-cols-2 gap-3">
                            {margenModalData.sellers.map((seller: any) => (
                              <button
                                key={seller.nombre}
                                onClick={() => setSelectedMargenSeller(seller)}
                                className="flex items-center justify-between p-3 border rounded-xl hover:bg-slate-50 transition-colors text-left"
                              >
                                <span className="font-medium text-slate-800">{seller.nombre}</span>
                                <span className={`text-sm font-bold ${seller.margenMensual >= 15 ? "text-green-600" : "text-red-600"}`}>
                                  {seller.margenMensual}%
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center gap-3 mb-4">
                            <button onClick={() => setSelectedMargenSeller(null)} className="text-sm text-slate-500 hover:text-slate-800">
                              Volver
                            </button>
                            <h3 className="font-bold text-slate-800">{selectedMargenSeller.nombre}</h3>
                            <span className={`text-sm font-bold ${selectedMargenSeller.margenMensual >= 15 ? "text-green-600" : "text-red-600"}`}>
                              {selectedMargenSeller.margenMensual}%
                            </span>
                          </div>
                          <div className="border rounded-xl overflow-hidden">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-slate-50 border-b">
                                  <th className="p-3 text-left font-medium text-slate-600">Semana</th>
                                  <th className="p-3 text-center font-medium text-slate-600">Revenue</th>
                                  <th className="p-3 text-center font-medium text-slate-600">Costo</th>
                                  <th className="p-3 text-center font-medium text-slate-600">Ganancia</th>
                                  <th className="p-3 text-center font-medium text-slate-600">Margen %</th>
                                  <th className="p-3 text-center font-medium text-slate-600">Estado</th>
                                </tr>
                              </thead>
                              <tbody>
                                {selectedMargenSeller.semanas.map((sem: any) => {
                                  const ganancia = sem.revenue - sem.costo;
                                  return (
                                    <tr key={sem.numero} className={`border-b ${sem.margen != null && sem.margen >= 15 ? "bg-green-50/30" : ""}`}>
                                      <td className="p-3 font-medium">Semana {sem.numero}</td>
                                      <td className="p-3 text-center">${sem.revenue.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</td>
                                      <td className="p-3 text-center text-red-600">${sem.costo.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</td>
                                      <td className={`p-3 text-center font-medium ${ganancia >= 0 ? "text-green-600" : "text-red-600"}`}>
                                        ${ganancia.toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                                      </td>
                                      <td className="p-3 text-center">
                                        {sem.margen != null ? (
                                          <span className={`font-bold ${sem.margen >= 15 ? "text-green-600" : sem.margen >= 0 ? "text-yellow-600" : "text-red-600"}`}>
                                            {sem.margen}%
                                          </span>
                                        ) : (
                                          <span className="text-slate-400">-</span>
                                        )}
                                      </td>
                                      <td className="p-3 text-center">
                                        {sem.margen != null ? (
                                          sem.margen >= 15 ? (
                                            <span className="inline-flex items-center gap-0.5 text-xs text-green-600 font-medium">
                                              <Check size={12} /> OK
                                            </span>
                                          ) : (
                                            <span className="inline-flex items-center gap-0.5 text-xs text-red-600 font-medium">
                                              <X size={12} /> Bajo
                                            </span>
                                          )
                                        ) : (
                                          <span className="text-slate-400">-</span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE EFECTIVIDAD DE CIERRE */}
      {efectividadModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b bg-gradient-to-r from-blue-50 to-white">
              <div className="flex items-center gap-3">
                {selectedEfectividadSeller && (
                  <button
                    onClick={() => setSelectedEfectividadSeller(null)}
                    className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 transition-colors"
                  >
                    <ArrowLeft size={16} /> Volver
                  </button>
                )}
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Tasa de Efectividad de Cierre</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    {efectividadModalData?.periodoLabel || "Detalle por vendedor"}
                  </p>
                </div>
              </div>
              {/* Period Selector */}
              <div className="flex items-center gap-2">
                <ModalMonthPicker value={modalMes} onChange={onModalMesChange} />
                {(["mes", "trimestre", "anio", "todo"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => openEfectividadModalWithMes(modalMes, p)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      efectividadPeriodo === p
                        ? "bg-amber-500 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {p === "mes" ? "Mes" : p === "trimestre" ? "Trimestre" : p === "anio" ? "Año" : "Todo"}
                  </button>
                ))}
              </div>
              <button
                onClick={() => { setEfectividadModalOpen(false); setSelectedEfectividadSeller(null); setEfectividadModalData(null); }}
                className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X size={20} className="text-slate-500" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex gap-4 px-5 pt-4 border-b">
              {(["vendedor", "semanal"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => { setEfectividadModalTab(tab); setSelectedEfectividadSeller(null); }}
                  className={`pb-3 text-sm font-medium capitalize transition-colors ${
                    efectividadModalTab === tab ? "text-amber-500 border-b-2 border-amber-500" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {tab === "vendedor" ? "Por Vendedor" : "Detalle Semanal"}
                </button>
              ))}
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-auto p-5">
              {efectividadModalLoading ? (
                <div className="flex items-center justify-center py-20 text-slate-400">
                  Cargando datos...
                </div>
              ) : !efectividadModalData ? (
                <div className="flex items-center justify-center py-20 text-slate-400">
                  No hay datos disponibles
                </div>
              ) : (
                <>
                  {/* POR VENDEDOR Tab */}
                  {efectividadModalTab === "vendedor" && (
                    <div className="space-y-6">
                       {/* Global Funnel */}
                      {efectividadModalData.global && (
                        <div className="bg-gradient-to-r from-slate-50 to-white rounded-xl p-6 border">
                          <h3 className="text-sm font-semibold text-slate-700 mb-4">Embbudo Global - {efectividadModalData?.periodoLabel || "Mes"}</h3>
                          <div className="flex items-center justify-between gap-4">
                            {/* Ordenes */}
                            <div className="flex-1 text-center">
                              <div className="bg-amber-100 rounded-xl p-4 mb-2">
                                <p className="text-3xl font-bold text-amber-700">{efectividadModalData.global.ordenes}</p>
                              </div>
                              <p className="text-xs font-medium text-amber-600">├ôrdenes</p>
                              <p className="text-[10px] text-slate-400">sale+done (confirmadas)</p>
                            </div>
                            {/* Arrow */}
                            <div className="flex flex-col items-center">
                              <span className="text-2xl text-slate-300">→</span>
                            </div>
                            {/* Facturacion */}
                            <div className="flex-1 text-center">
                              <div className="bg-green-100 rounded-xl p-4 mb-2">
                                <p className="text-3xl font-bold text-green-700">{efectividadModalData.global.facturadas}</p>
                              </div>
                              <p className="text-xs font-medium text-green-600">Facturadas por completo</p>
                              <p className="text-[10px] text-slate-400">invoice_status = invoiced</p>
                            </div>
                            {/* Efectividad */}
                            <div className="flex flex-col items-center ml-4">
                              <div className="bg-purple-100 rounded-xl px-6 py-4 mb-2">
                                <p className="text-3xl font-bold text-purple-700">{efectividadModalData.global.efectividad}%</p>
                              </div>
                              <p className="text-xs font-medium text-purple-600">Efectividad</p>
                              <p className="text-[10px] text-slate-400">facturadas / ordenes</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Seller table */}
                      <div className="border rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-50 border-b">
                              <th className="p-3 text-left font-medium text-slate-600">Vendedor</th>
                              <th className="p-3 text-center font-medium text-amber-600">├ôrdenes</th>
                              <th className="p-3 text-center font-medium text-green-600">Facturadas</th>
                              <th className="p-3 text-center font-medium text-purple-600">Efectividad %</th>
                              <th className="p-3 text-center font-medium text-slate-600">Estado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {efectividadModalData.sellers.map((seller: any) => {
                              const cumple = seller.efectividad >= 60;
                              return (
                                <tr
                                  key={seller.nombre}
                                  className="border-b hover:bg-blue-50/40 transition-colors"
                                >
                                  <td className="p-3 font-medium text-slate-800">{seller.nombre}</td>
                                  <td className="p-3 text-center text-amber-600 font-bold">{seller.ordenes}</td>
                                  <td className="p-3 text-center text-green-600 font-bold">{seller.facturadas}</td>
                                  <td className="p-3 text-center">
                                    <span className={`font-bold ${seller.efectividad >= 60 ? "text-green-600" : seller.efectividad >= 40 ? "text-yellow-600" : "text-red-600"}`}>
                                      {seller.efectividad}%
                                    </span>
                                  </td>
                                  <td className="p-3 text-center">
                                    {cumple ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                                        <Check size={12} /> Cumple
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                                        <X size={12} /> No cumple
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* DETALLE SEMANAL Tab */}
                  {efectividadModalTab === "semanal" && (
                    <div>
                      {!selectedEfectividadSeller ? (
                        <div className="space-y-3">
                          <p className="text-sm text-slate-500 mb-3">Selecciona un vendedor para ver su detalle semanal:</p>
                          <div className="grid grid-cols-2 gap-3">
                            {efectividadModalData.sellers.map((seller: any) => (
                              <button
                                key={seller.nombre}
                                onClick={() => setSelectedEfectividadSeller(seller)}
                                className="flex items-center justify-between p-3 border rounded-xl hover:bg-slate-50 transition-colors text-left"
                              >
                                <span className="font-medium text-slate-800">{seller.nombre}</span>
                                <span className={`text-sm font-bold ${seller.efectividad >= 60 ? "text-green-600" : "text-red-600"}`}>
                                  {seller.efectividad}%
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center gap-3 mb-4">
                            <button onClick={() => setSelectedEfectividadSeller(null)} className="text-sm text-slate-500 hover:text-slate-800">
                              Volver
                            </button>
                            <h3 className="font-bold text-slate-800">{selectedEfectividadSeller.nombre}</h3>
                            <span className={`text-sm font-bold ${selectedEfectividadSeller.efectividad >= 60 ? "text-green-600" : "text-red-600"}`}>
                              {selectedEfectividadSeller.efectividad}%
                            </span>
                          </div>
                          <div className="border rounded-xl overflow-hidden">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-slate-50 border-b">
                                  <th className="p-3 text-left font-medium text-slate-600">Semana</th>
                                  <th className="p-3 text-center font-medium text-amber-600">├ôrdenes</th>
                                  <th className="p-3 text-center font-medium text-green-600">Facturadas</th>
                                  <th className="p-3 text-center font-medium text-purple-600">Efectividad %</th>
                                  <th className="p-3 text-center font-medium text-slate-600">Estado</th>
                                </tr>
                              </thead>
                              <tbody>
                                {selectedEfectividadSeller.semanas.map((sem: any) => (
                                  <tr key={sem.numero} className={`border-b ${sem.efectividad != null && sem.efectividad >= 60 ? "bg-green-50/30" : ""}`}>
                                    <td className="p-3 font-medium text-sm">{sem.label || `Semana ${sem.numero}`}</td>
                                    <td className="p-3 text-center text-amber-600 font-bold">{sem.efectividad != null ? sem.ordenes : "-"}</td>
                                    <td className="p-3 text-center text-green-600 font-bold">{sem.efectividad != null ? sem.facturadas : "-"}</td>
                                    <td className="p-3 text-center">
                                      {sem.efectividad != null ? (
                                        <span className={`font-bold ${sem.efectividad >= 60 ? "text-green-600" : sem.efectividad >= 40 ? "text-yellow-600" : "text-red-600"}`}>
                                          {sem.efectividad}%
                                        </span>
                                      ) : (
                                        <span className="text-slate-400">-</span>
                                      )}
                                    </td>
                                    <td className="p-3 text-center">
                                      {sem.efectividad != null ? (
                                        sem.efectividad >= 60 ? (
                                          <span className="inline-flex items-center gap-0.5 text-xs text-green-600 font-medium">
                                            <Check size={12} /> OK
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center gap-0.5 text-xs text-red-600 font-medium">
                                            <X size={12} /> Bajo
                                          </span>
                                        )
                                      ) : (
                                        <span className="text-slate-400">-</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cobertura Marcas Modal */}
      {coberturaModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => { setCoberturaModalOpen(false); setSelectedCoberturaSeller(null); setCoberturaModalData(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-cyan-100 rounded-lg">
                  <Package size={20} className="text-cyan-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Desempeño por Marca</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    {coberturaModalData?.periodoLabel || "Detalle de marcas"}
                  </p>
                </div>
              </div>
              {/* Period Selector */}
              <div className="flex items-center gap-2">
                <ModalMonthPicker value={modalMes} onChange={onModalMesChange} />
                {(["mes", "trimestre", "anio", "todo"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => openCoberturaModalWithMes(modalMes, p)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      coberturaPeriodo === p
                        ? "bg-cyan-500 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {p === "mes" ? "Mes" : p === "trimestre" ? "Trimestre" : p === "anio" ? "Año" : "Todo"}
                  </button>
                ))}
              </div>
              <button
                onClick={() => { setCoberturaModalOpen(false); setSelectedCoberturaSeller(null); setCoberturaModalData(null); }}
                className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X size={20} className="text-slate-500" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex gap-4 px-5 pt-4 border-b">
              {(["vendedor", "semanal"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => { setCoberturaModalTab(tab); setSelectedCoberturaSeller(null); }}
                  className={`pb-3 text-sm font-medium capitalize transition-colors ${
                    coberturaModalTab === tab ? "text-cyan-500 border-b-2 border-cyan-500" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {tab === "vendedor" ? "Por Marca" : "Detalle Semanal"}
                </button>
              ))}
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-auto p-5">
              {coberturaModalLoading ? (
                <div className="flex items-center justify-center py-20 text-slate-400">
                  Cargando datos...
                </div>
              ) : !coberturaModalData ? (
                <div className="flex items-center justify-center py-20 text-slate-400">
                  No hay datos disponibles
                </div>
              ) : (
                <>
                  {/* POR MARCA Tab */}
                  {coberturaModalTab === "vendedor" && (
                    <div className="space-y-6">
                      {/* Global Summary */}
                      {coberturaModalData.global && (
                        <div className="bg-gradient-to-r from-cyan-50 to-white rounded-xl p-6 border">
                          <h3 className="text-sm font-semibold text-slate-700 mb-4">Resumen Global - {coberturaModalData.periodoLabel}</h3>
                          <div className="grid grid-cols-5 gap-4">
                            <div className="text-center">
                              <div className="bg-cyan-100 rounded-xl p-3 mb-2">
                                <p className="text-2xl font-bold text-cyan-700">{coberturaModalData.global.totalMarcas}</p>
                              </div>
                              <p className="text-xs font-medium text-cyan-600">Marcas</p>
                            </div>
                            <div className="text-center">
                              <div className="bg-green-100 rounded-xl p-3 mb-2">
                                <p className="text-2xl font-bold text-green-700">${coberturaModalData.global.revenue?.toLocaleString()}</p>
                              </div>
                              <p className="text-xs font-medium text-green-600">Revenue Total</p>
                            </div>
                            <div className="text-center">
                              <div className="bg-red-100 rounded-xl p-3 mb-2">
                                <p className="text-2xl font-bold text-red-700">${coberturaModalData.global.costo?.toLocaleString()}</p>
                              </div>
                              <p className="text-xs font-medium text-red-600">Costo Total</p>
                            </div>
                            <div className="text-center">
                              <div className="bg-purple-100 rounded-xl p-3 mb-2">
                                <p className="text-2xl font-bold text-purple-700">{coberturaModalData.global.margen}%</p>
                              </div>
                              <p className="text-xs font-medium text-purple-600">Margen Promedio</p>
                            </div>
                            <div className="text-center">
                              <div className="bg-amber-100 rounded-xl p-3 mb-2">
                                <p className="text-2xl font-bold text-amber-700">{coberturaModalData.global.totalVendedores}</p>
                              </div>
                              <p className="text-xs font-medium text-amber-600">Vendedores</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Brands table */}
                      <div className="border rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-50 border-b">
                              <th className="p-3 text-left font-medium text-slate-600">Marca</th>
                              <th className="p-3 text-right font-medium text-green-600">Revenue</th>
                              <th className="p-3 text-right font-medium text-red-600">Costo</th>
                              <th className="p-3 text-right font-medium text-emerald-600">Ganancia</th>
                              <th className="p-3 text-right font-medium text-amber-600">Cantidad</th>
                              <th className="p-3 text-right font-medium text-cyan-600">P. Vendidos</th>
                              <th className="p-3 text-right font-medium text-slate-600">Vendedores</th>
                            </tr>
                          </thead>
                          <tbody>
                            {coberturaModalData.marcas.map((marca: any) => (
                              <tr
                                key={marca.marca}
                                className="border-b hover:bg-cyan-50/40 transition-colors cursor-pointer"
                                onClick={() => setSelectedCoberturaSeller(marca)}
                              >
                                <td className="p-3 font-medium text-slate-800">{marca.marca}</td>
                                <td className="p-3 text-right text-green-600 font-bold">${marca.revenue?.toLocaleString()}</td>
                                <td className="p-3 text-right text-red-600">${marca.costo?.toLocaleString()}</td>
                                <td className={`p-3 text-right font-bold ${marca.ganancia >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                                  ${marca.ganancia?.toLocaleString()}
                                </td>
                                <td className="p-3 text-right text-amber-600">{marca.cantidad}</td>
                                <td className="p-3 text-right text-cyan-600">{marca.productosVendidos}</td>
                                <td className="p-3 text-right text-slate-600">{marca.vendedores}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* DETALLE SEMANAL Tab */}
                  {coberturaModalTab === "semanal" && (
                    <div>
                      {!selectedCoberturaSeller ? (
                        <div className="space-y-3">
                          <p className="text-sm text-slate-500 mb-3">Selecciona una marca para ver su detalle semanal:</p>
                          <div className="grid grid-cols-3 gap-3">
                            {coberturaModalData.marcas.map((marca: any) => (
                              <button
                                key={marca.marca}
                                onClick={() => setSelectedCoberturaSeller(marca)}
                                className="flex items-center justify-between p-3 border rounded-xl hover:bg-slate-50 transition-colors text-left"
                              >
                                <div>
                                  <span className="font-medium text-slate-800">{marca.marca}</span>
                                  <p className="text-xs text-slate-500">${marca.revenue?.toLocaleString()} revenue</p>
                                </div>
                                <span className={`text-sm font-bold ${marca.ganancia >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                                  ${marca.ganancia?.toLocaleString()}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center gap-3 mb-4">
                            <button onClick={() => setSelectedCoberturaSeller(null)} className="text-sm text-slate-500 hover:text-slate-800">
                              Volver
                            </button>
                            <h3 className="font-bold text-slate-800">{selectedCoberturaSeller.marca}</h3>
                            <span className={`text-sm font-bold ${selectedCoberturaSeller.ganancia >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                              ${selectedCoberturaSeller.ganancia?.toLocaleString()} ganancia
                            </span>
                          </div>
                          {/* Vendedores que venden esta marca */}
                          {selectedCoberturaSeller.vendedoresLista && selectedCoberturaSeller.vendedoresLista.length > 0 && (
                            <div className="mb-4 p-4 bg-cyan-50 rounded-xl border">
                              <p className="text-xs font-medium text-cyan-700 mb-2">Vendedores ({selectedCoberturaSeller.vendedores}):</p>
                              <div className="flex flex-wrap gap-2">
                                {selectedCoberturaSeller.vendedoresLista.map((v: string) => (
                                  <span key={v} className="px-2 py-1 bg-white text-cyan-700 rounded text-xs font-medium border border-cyan-200">
                                    {v}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="border rounded-xl overflow-hidden">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-slate-50 border-b">
                                  <th className="p-3 text-left font-medium text-slate-600">Semana</th>
                                  <th className="p-3 text-right font-medium text-green-600">Revenue</th>
                                  <th className="p-3 text-right font-medium text-red-600">Costo</th>
                                  <th className="p-3 text-right font-medium text-emerald-600">Ganancia</th>
                                  <th className="p-3 text-right font-medium text-amber-600">Cantidad</th>
                                </tr>
                              </thead>
                              <tbody>
                                {selectedCoberturaSeller.semanas.map((sem: any) => (
                                  <tr key={sem.numero} className={`border-b ${sem.cantidadPct != null && sem.cantidadPct >= 100 ? "bg-green-50/30" : ""}`}>
                                    <td className="p-3 font-medium text-sm">{sem.label || `Semana ${sem.numero}`}</td>
                                    <td className="p-3 text-right text-green-600 font-bold">${sem.revenue?.toLocaleString()}</td>
                                    <td className="p-3 text-right text-red-600">${sem.costo?.toLocaleString()}</td>
                                    <td className={`p-3 text-right font-bold ${sem.ganancia >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                                      ${sem.ganancia?.toLocaleString()}
                                    </td>
                                    <td className="p-3 text-right text-amber-600 font-bold">{sem.cantidad}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Activacion Cartera Modal */}
      {activacionModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => { setActivacionModalOpen(false); setSelectedActivacionSeller(null); setActivacionModalData(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <UserCheck size={20} className="text-orange-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Activación de Cartera</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    {activacionModalData?.periodoLabel || "Detalle por vendedor"}
                  </p>
                </div>
              </div>
              {/* Period Selector */}
              <div className="flex items-center gap-2">
                <ModalMonthPicker value={modalMes} onChange={onModalMesChange} />
                {(["mes", "trimestre", "anio", "todo"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => openActivacionModalWithMes(modalMes, p)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      activacionPeriodo === p
                        ? "bg-orange-500 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {p === "mes" ? "Mes" : p === "trimestre" ? "Trimestre" : p === "anio" ? "Año" : "Todo"}
                  </button>
                ))}
              </div>
              <button
                onClick={() => { setActivacionModalOpen(false); setSelectedActivacionSeller(null); setActivacionModalData(null); }}
                className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X size={20} className="text-slate-500" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex gap-4 px-5 pt-4 border-b">
              {(["vendedor", "semanal"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => { setActivacionModalTab(tab); setSelectedActivacionSeller(null); }}
                  className={`pb-3 text-sm font-medium capitalize transition-colors ${
                    activacionModalTab === tab ? "text-orange-500 border-b-2 border-orange-500" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {tab === "vendedor" ? "Por Vendedor" : "Detalle Semanal"}
                </button>
              ))}
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-auto p-5">
              {activacionModalLoading ? (
                <div className="flex items-center justify-center py-20 text-slate-400">
                  Cargando datos...
                </div>
              ) : !activacionModalData ? (
                <div className="flex items-center justify-center py-20 text-slate-400">
                  No hay datos disponibles
                </div>
              ) : (
                <>
                  {/* POR VENDEDOR Tab */}
                  {activacionModalTab === "vendedor" && (
                    <div className="space-y-6">
                      {/* Global Summary */}
                      {activacionModalData.global && (
                        <div className="bg-gradient-to-r from-orange-50 to-white rounded-xl p-6 border">
                          <h3 className="text-sm font-semibold text-slate-700 mb-4">Resumen Global - {activacionModalData.periodoLabel}</h3>
                          <div className="grid grid-cols-3 gap-4">
                            <div className="text-center">
                              <div className="bg-orange-100 rounded-xl p-3 mb-2">
                                <p className="text-2xl font-bold text-orange-700">{activacionModalData.global.totalClientes}</p>
                              </div>
                              <p className="text-xs font-medium text-orange-600">Total Clientes</p>
                            </div>
                            <div className="text-center">
                              <div className="bg-green-100 rounded-xl p-3 mb-2">
                                <p className="text-2xl font-bold text-green-700">{activacionModalData.global.clientesActivos}</p>
                              </div>
                              <p className="text-xs font-medium text-green-600">Clientes Activos</p>
                            </div>
                            <div className="text-center">
                              <div className="bg-purple-100 rounded-xl p-3 mb-2">
                                <p className="text-2xl font-bold text-purple-700">{activacionModalData.global.activacion}%</p>
                              </div>
                              <p className="text-xs font-medium text-purple-600">Activación Global</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Seller table */}
                      <div className="border rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-50 border-b">
                              <th className="p-3 text-left font-medium text-slate-600">Vendedor</th>
                              <th className="p-3 text-center font-medium text-orange-600">Total Clientes</th>
                              <th className="p-3 text-center font-medium text-green-600">Clientes Activos</th>
                              <th className="p-3 text-center font-medium text-purple-600">Activación %</th>
                              <th className="p-3 text-center font-medium text-slate-600">Estado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {activacionModalData.sellers.map((seller: any) => {
                              const cumple = seller.activacion >= 60;
                              return (
                                <tr
                                  key={seller.nombre}
                                  className="border-b hover:bg-orange-50/40 transition-colors"
                                >
                                  <td className="p-3 font-medium text-slate-800">{seller.nombre}</td>
                                  <td className="p-3 text-center text-orange-600 font-bold">{seller.totalClientes}</td>
                                  <td className="p-3 text-center text-green-600 font-bold">{seller.clientesActivos}</td>
                                  <td className="p-3 text-center">
                                    <span className={`font-bold ${seller.activacion >= 60 ? "text-green-600" : seller.activacion >= 40 ? "text-yellow-600" : "text-red-600"}`}>
                                      {seller.activacion}%
                                    </span>
                                  </td>
                                  <td className="p-3 text-center">
                                    {cumple ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                                        <Check size={12} /> Cumple
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                                        <X size={12} /> No cumple
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* DETALLE SEMANAL Tab */}
                  {activacionModalTab === "semanal" && (
                    <div>
                      {!selectedActivacionSeller ? (
                        <div className="space-y-3">
                          <p className="text-sm text-slate-500 mb-3">Selecciona un vendedor para ver su detalle semanal:</p>
                          <div className="grid grid-cols-2 gap-3">
                            {activacionModalData.sellers.map((seller: any) => (
                              <button
                                key={seller.nombre}
                                onClick={() => setSelectedActivacionSeller(seller)}
                                className="flex items-center justify-between p-3 border rounded-xl hover:bg-slate-50 transition-colors text-left"
                              >
                                <div>
                                  <span className="font-medium text-slate-800">{seller.nombre}</span>
                                  <p className="text-xs text-slate-500">{seller.clientesActivos}/{seller.totalClientes} clientes activos</p>
                                </div>
                                <span className={`text-sm font-bold ${seller.activacion >= 60 ? "text-green-600" : "text-red-600"}`}>
                                  {seller.activacion}%
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center gap-3 mb-4">
                            <button onClick={() => setSelectedActivacionSeller(null)} className="text-sm text-slate-500 hover:text-slate-800">
                              Volver
                            </button>
                            <h3 className="font-bold text-slate-800">{selectedActivacionSeller.nombre}</h3>
                            <span className={`text-sm font-bold ${selectedActivacionSeller.activacion >= 60 ? "text-green-600" : "text-red-600"}`}>
                              {selectedActivacionSeller.activacion}% activación
                            </span>
                          </div>
                          <div className="border rounded-xl overflow-hidden">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-slate-50 border-b">
                                  <th className="p-3 text-left font-medium text-slate-600">Semana</th>
                                  <th className="p-3 text-center font-medium text-green-600">Clientes Activos</th>
                                  <th className="p-3 text-center font-medium text-orange-600">Total Clientes</th>
                                  <th className="p-3 text-center font-medium text-purple-600">Activación %</th>
                                  <th className="p-3 text-center font-medium text-slate-600">Estado</th>
                                </tr>
                              </thead>
                              <tbody>
                                {selectedActivacionSeller.semanas.map((sem: any) => (
                                  <tr key={sem.numero} className={`border-b ${sem.activacion != null && sem.activacion >= 60 ? "bg-green-50/30" : ""}`}>
                                    <td className="p-3 font-medium text-sm">{sem.label || `Semana ${sem.numero}`}</td>
                                    <td className="p-3 text-center text-green-600 font-bold">{sem.activos}</td>
                                    <td className="p-3 text-center text-orange-600 font-bold">{sem.total}</td>
                                    <td className="p-3 text-center">
                                      {sem.activacion != null ? (
                                        <span className={`font-bold ${sem.activacion >= 60 ? "text-green-600" : sem.activacion >= 40 ? "text-yellow-600" : "text-red-600"}`}>
                                          {sem.activacion}%
                                        </span>
                                      ) : (
                                        <span className="text-slate-400">-</span>
                                      )}
                                    </td>
                                    <td className="p-3 text-center">
                                      {sem.activacion != null ? (
                                        sem.activacion >= 60 ? (
                                          <span className="inline-flex items-center gap-0.5 text-xs text-green-600 font-medium">
                                            <Check size={12} /> OK
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center gap-0.5 text-xs text-red-600 font-medium">
                                            <X size={12} /> Bajo
                                          </span>
                                        )
                                      ) : (
                                        <span className="text-slate-400">-</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Visitas Semanales Modal */}
      {visitasModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setVisitasModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 rounded-lg">
                  <Calendar size={20} className="text-indigo-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Visitas Semanales</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    {kpiData?.sellers?.length || 0} vendedores - {modalMes}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <ModalMonthPicker value={modalMes} onChange={onModalMesChange} />
                <button
                  onClick={() => setVisitasModalOpen(false)}
                  className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <X size={20} className="text-slate-500" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-auto p-5">
              {visitasModalLoading ? (
                <div className="flex items-center justify-center py-20 text-slate-400">
                  Cargando datos...
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Formulario Nueva Visita */}
                  <div className="bg-gradient-to-r from-indigo-50 to-white rounded-xl p-6 border">
                    <h3 className="text-sm font-semibold text-slate-700 mb-4">{t("registrar_visita")}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Selector de Vendedor */}
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Vendedor *</label>
                        <select
                          value={visitaForm.seller_name}
                          onChange={(e) => {
                            const name = e.target.value;
                            const seller = visitasVendedores.find((s: any) => s.nombre === name);
                            setVisitaForm({ ...visitaForm, seller_name: name, seller_user_id: seller?.user_id || "", client_name: "" });
                            setVisitaClientSearch("");
                            setVisitaClientDropdownOpen(false);
                            if (name) fetchVisitasClientes(name);
                            else setVisitasClientes([]);
                          }}
                          className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        >
                          <option value="">Seleccionar vendedor...</option>
                          {visitasVendedores.map((s: any, i: number) => (
                            <option key={`${s.id}-${i}`} value={s.nombre}>{s.nombre}</option>
                          ))}
                        </select>
                      </div>

                      {/* Selector de Cliente / Prospecto */}
                      <div className="relative" data-client-dropdown>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Cliente *</label>
                        {visitaForm.is_prospect ? (
                          <input
                            type="text"
                            value={visitaForm.client_name}
                            onChange={(e) => setVisitaForm({ ...visitaForm, client_name: e.target.value })}
                            placeholder="Nombre del prospecto..."
                            className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                          />
                        ) : (
                          <>
                            <input
                              type="text"
                              value={visitaClientSearch || visitaForm.client_name}
                              onChange={(e) => {
                                setVisitaClientSearch(e.target.value);
                                setVisitaForm({ ...visitaForm, client_name: "" });
                                setVisitaClientDropdownOpen(true);
                              }}
                              onFocus={() => { if (visitaForm.seller_name) setVisitaClientDropdownOpen(true); }}
                              placeholder={
                                !visitaForm.seller_name
                                  ? "Selecciona un vendedor primero"
                                  : visitasClientesLoading
                                    ? "Cargando clientes..."
                                    : "Buscar cliente..."
                              }
                              disabled={!visitaForm.seller_name || visitasClientesLoading}
                              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
                            />
                            {visitaClientDropdownOpen && visitaForm.seller_name && !visitasClientesLoading && (
                              <div className="absolute z-50 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-56 overflow-y-auto">
                                {visitasClientes.filter((c: any) =>
                                  c.name.toLowerCase().includes(visitaClientSearch.toLowerCase())
                                ).length === 0 ? (
                                  <div className="px-3 py-2 text-xs text-slate-400">No se encontraron clientes</div>
                                ) : (
                                  visitasClientes
                                    .filter((c: any) => c.name.toLowerCase().includes(visitaClientSearch.toLowerCase()))
                                    .map((c: any, i: number) => (
                                      <button
                                        key={`${c.id}-${i}`}
                                        type="button"
                                        onClick={() => {
                                          setVisitaForm({ ...visitaForm, client_name: c.name });
                                          setVisitaClientSearch("");
                                          setVisitaClientDropdownOpen(false);
                                        }}
                                        className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 transition-colors truncate"
                                      >
                                        {c.name}
                                      </button>
                                    ))
                                )}
                              </div>
                            )}
                          </>
                        )}
                        <label className="flex items-center gap-2 mt-2 text-xs text-slate-600">
                          <input
                            type="checkbox"
                            checked={visitaForm.is_prospect}
                            onChange={(e) => {
                              setVisitaForm({ ...visitaForm, is_prospect: e.target.checked, client_name: "" });
                              setVisitaClientSearch("");
                              setVisitaClientDropdownOpen(false);
                            }}
                            className="rounded border-slate-300"
                          />
                          Prospecto de cliente (no existe en sistema)
                        </label>
                      </div>

                      {/* Fecha de Visita */}
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Fecha de Visita *</label>
                        <input
                          type="date"
                          value={visitaForm.visit_date}
                          onChange={(e) => setVisitaForm({ ...visitaForm, visit_date: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                      </div>

                      {/* Foto (opcional) */}
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Foto (opcional)</label>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0] || null;
                            setVisitaFormPhoto(file);
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = (ev) => setVisitaFormPhotoPreview(ev.target?.result as string);
                              reader.readAsDataURL(file);
                            } else {
                              setVisitaFormPhotoPreview("");
                            }
                          }}
                          className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                        />
                        {visitaFormPhotoPreview && (
                          <div className="mt-2 relative inline-block">
                            <img src={visitaFormPhotoPreview} alt="Preview" className="h-20 rounded-lg border object-cover" />
                            <button
                              onClick={() => { setVisitaFormPhoto(null); setVisitaFormPhotoPreview(""); }}
                              className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600"
                            >├ù</button>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="mt-4 flex justify-end">
                      <button
                        onClick={submitVisita}
                        disabled={visitaFormLoading || !visitaForm.seller_name || !visitaForm.client_name || !visitaForm.visit_date}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {visitaFormLoading ? "Guardando..." : "Guardar Visita"}
                      </button>
                    </div>
                  </div>

                  {/* Lista de Visitas */}
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700 mb-4">{t("visitas_registradas", { count: visitasData.length })}</h3>
                    {visitasData.length === 0 ? (
                      <div className="text-center py-10 text-slate-400 text-sm">
                        No hay visitas registradas este mes
                      </div>
                    ) : (
                      <div className="border rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-50 border-b">
                              <th className="p-3 text-left font-medium text-slate-600">Fecha</th>
                              <th className="p-3 text-left font-medium text-slate-600">Vendedor</th>
                              <th className="p-3 text-left font-medium text-slate-600">Cliente</th>
                              <th className="p-3 text-center font-medium text-slate-600">Tipo</th>
                              <th className="p-3 text-center font-medium text-slate-600">Foto</th>
                              <th className="p-3 text-center font-medium text-slate-600">Acciones</th>
                            </tr>
                          </thead>
                          <tbody>
                            {visitasData.map((visita: any) => (
                              <tr key={visita.id} className="border-b hover:bg-indigo-50/40 transition-colors">
                                <td className="p-3 text-slate-800">
                                  {new Date(visita.visit_date).toLocaleDateString("es-VE")}
                                </td>
                                <td className="p-3 font-medium text-slate-800">{visita.seller_name}</td>
                                <td className="p-3 text-slate-800">{visita.client_name}</td>
                                <td className="p-3 text-center">
                                  {visita.is_prospect ? (
                                    <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium">
                                      Prospecto
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">
                                      Cliente
                                    </span>
                                  )}
                                </td>
                                <td className="p-3 text-center">
                                  {visita.photo_url ? (
                                    <a href={visita.photo_url} target="_blank" rel="noopener noreferrer">
                                      <img src={visita.photo_url} alt="Foto" className="h-10 w-10 rounded-lg border object-cover mx-auto hover:scale-150 transition-transform" />
                                    </a>
                                  ) : (
                                    <span className="text-slate-400 text-xs">-</span>
                                  )}
                                </td>
                                <td className="p-3 text-center">
                                  <button
                                    onClick={() => deleteVisita(visita.id)}
                                    className="text-red-500 hover:text-red-700 text-xs"
                                  >
                                    Eliminar
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
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
      {cxcModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-5 border-b bg-gradient-to-r from-slate-50 to-white">
              <div className="flex items-center gap-3">
                {cxcSelectedInvoice && (
                  <button
                    onClick={() => { setCxcSelectedInvoice(null); setCxcInvoiceDetail(null); }}
                    className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 transition-colors"
                  >
                    <ArrowLeft size={16} /> Volver
                  </button>
                )}
                <div>
                  <h2 className="text-xl font-bold text-slate-900">
                    {cxcSelectedInvoice
                      ? `${cxcSelectedInvoice.name} — ${cxcSelectedInvoice.partnerName}`
                      : cxcModalKpi === "efectividad_cobranza" ? "Efectividad de Cobranza — Detalle"
                      : cxcModalKpi === "cartera_vencida" ? "Cartera Vencida — Detalle"
                      : cxcModalKpi === "recuperacion_vencidos" ? "Recuperación de Cartera Vencida — Detalle"
                      : "Días Promedio de Cobro (DSO) — Detalle"}
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">
                    {cxcSelectedInvoice
                      ? `Factura ${cxcSelectedInvoice.invoiceDate || ""} — ${cxcSelectedInvoice.companyName}`
                      : `Facturas con saldo abierto — ${empresaLabel} | ${selectedMes}`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setCxcModalOpen(false); setCxcModalData(null); setCxcModalKpi(""); setCxcSelectedInvoice(null); setCxcInvoiceDetail(null); }}
                className="p-2 rounded-lg bg-slate-200 hover:bg-slate-300 transition-colors"
              >
                <X size={20} className="text-slate-700" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-5">
              {cxcModalLoading ? (
                <div className="flex items-center justify-center py-20 text-slate-400">
                  <RefreshCw size={24} className="animate-spin mr-2" /> Cargando detalle...
                </div>
              ) : !cxcModalData ? (
                <div className="flex items-center justify-center py-20 text-slate-400">No hay datos disponibles</div>
              ) : cxcSelectedInvoice ? (
                <>
                  {cxcInvoiceLoading ? (
                    <div className="flex items-center justify-center py-20 text-slate-400">
                      <RefreshCw size={24} className="animate-spin mr-2" /> Cargando detalle...
                    </div>
                  ) : !cxcInvoiceDetail ? (
                    <div className="flex items-center justify-center py-20 text-slate-400">No se pudo cargar el detalle</div>
                  ) : (
                    <>
                      {cxcInvoiceDetail.lines.some((l: any) => l.productName.includes("SAL_INI") || l.productName.includes("Saldo Inicial")) && (
                        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                          <strong>Saldo Inicial:</strong> Esta factura fue creada como asiento de apertura al migrar a Odoo. No es una venta real, sino el saldo deudor que la empresa ya tenía antes de la migración.
                        </div>
                      )}
                      <div className="grid grid-cols-3 gap-4 mb-6">
                        <div className="bg-slate-50 rounded-xl p-4">
                          <p className="text-xs text-slate-500 font-medium">Subtotal</p>
                          <p className="text-lg font-bold text-slate-800">${cxcInvoiceDetail.subtotal.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</p>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-4">
                          <p className="text-xs text-slate-500 font-medium">Impuestos</p>
                          <p className="text-lg font-bold text-slate-800">${cxcInvoiceDetail.tax.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</p>
                        </div>
                        <div className={`rounded-xl p-4 ${cxcInvoiceDetail.moveType === "Nota de credito" ? "bg-red-50" : "bg-green-50"}`}>
                          <p className={`text-xs font-medium ${cxcInvoiceDetail.moveType === "Nota de credito" ? "text-red-600" : "text-green-600"}`}>Total</p>
                          <p className={`text-lg font-bold ${cxcInvoiceDetail.moveType === "Nota de credito" ? "text-red-700" : "text-green-700"}`}>
                            ${Math.abs(cxcInvoiceDetail.total).toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                      </div>

                      <div className="border rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-50 border-b">
                              <th className="p-3 text-left font-medium text-slate-600">Producto</th>
                              <th className="p-3 text-right font-medium text-slate-600">Cantidad</th>
                              <th className="p-3 text-right font-medium text-slate-600">P. Unitario</th>
                              <th className="p-3 text-right font-medium text-slate-600">Subtotal</th>
                            </tr>
                          </thead>
                          <tbody>
                            {cxcInvoiceDetail.lines.map((line: any, idx: number) => {
                              const isSaldoInicial = line.productName.includes("SAL_INI") || line.productName.includes("Saldo Inicial");
                              return (
                                <tr key={idx} className={`border-b hover:bg-blue-50/40 transition-colors ${isSaldoInicial ? "bg-amber-50/30" : ""}`}>
                                  <td className="p-3 font-medium text-slate-800">
                                    {line.productName}
                                    {isSaldoInicial && (
                                      <span className="ml-2 inline-block px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-medium">
                                        Saldo de migración a Odoo
                                      </span>
                                    )}
                                  </td>
                                <td className="p-3 text-right text-slate-600">{line.quantity}</td>
                                <td className="p-3 text-right text-slate-600">${line.priceUnit.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</td>
                                <td className="p-3 text-right font-medium text-slate-800">${line.subtotal.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</td>
                              </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="bg-slate-50">
                              <td colSpan={3} className="p-3 text-right font-medium text-slate-600">Subtotal</td>
                              <td className="p-3 text-right font-bold">${cxcInvoiceDetail.subtotal.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</td>
                            </tr>
                            <tr className="bg-slate-50">
                              <td colSpan={3} className="p-3 text-right font-medium text-slate-600">Impuestos</td>
                              <td className="p-3 text-right font-bold">${cxcInvoiceDetail.tax.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</td>
                            </tr>
                            <tr className={`border-t-2 ${cxcInvoiceDetail.moveType === "Nota de credito" ? "bg-red-50" : "bg-green-50"}`}>
                              <td colSpan={3} className="p-3 text-right font-bold text-slate-700">Total</td>
                              <td className={`p-3 text-right font-bold text-lg ${cxcInvoiceDetail.moveType === "Nota de credito" ? "text-red-700" : "text-green-700"}`}>
                                ${Math.abs(cxcInvoiceDetail.total).toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-slate-50 rounded-xl p-4">
                      <p className="text-xs text-slate-500 font-medium">Total cartera abierta</p>
                      <p className="text-lg font-bold text-slate-800">${cxcModalData.total.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-4">
                      <p className="text-xs text-slate-500 font-medium">Facturas con saldo</p>
                      <p className="text-lg font-bold text-slate-800">{cxcModalData.count}</p>
                    </div>
                  </div>

                  <div className="border rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b">
                          <th className="p-3 text-left font-medium text-slate-600">Factura</th>
                          <th className="p-3 text-left font-medium text-slate-600">Cliente</th>
                          <th className="p-3 text-center font-medium text-slate-600">Sede</th>
                          <th className="p-3 text-center font-medium text-slate-600">Fecha factura</th>
                          <th className="p-3 text-center font-medium text-slate-600">Vencimiento</th>
                          <th className="p-3 text-center font-medium text-slate-600">Estado</th>
                          <th className="p-3 text-center font-medium text-slate-600">Días vencido</th>
                          <th className="p-3 text-right font-medium text-slate-600">Monto</th>
                          <th className="p-3 text-right font-medium text-slate-600">Saldo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cxcModalData.invoices.map((inv: any) => (
                          <tr
                            key={inv.id}
                            className="border-b hover:bg-blue-50/40 transition-colors cursor-pointer"
                            onClick={() => openCxcInvoiceDetail(inv)}
                          >
                            <td className="p-3 font-medium text-slate-800">{inv.name}</td>
                            <td className="p-3 text-slate-700 max-w-[200px] truncate">{inv.partnerName}</td>
                            <td className="p-3 text-center text-slate-600">{inv.companyName}</td>
                            <td className="p-3 text-center text-slate-600">{inv.invoiceDate || "—"}</td>
                            <td className="p-3 text-center text-slate-600">{inv.invoiceDateDue || "—"}</td>
                            <td className="p-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                inv.paymentState === "paid" || inv.paymentState === "reconciled" || inv.paymentState === "in_payment" ? "bg-emerald-100 text-emerald-700" :
                                inv.paymentState === "partial" ? "bg-amber-100 text-amber-700" :
                                "bg-red-100 text-red-700"
                              }`}>
                                {inv.paymentState === "paid" || inv.paymentState === "reconciled" ? "Pagada" :
                                 inv.paymentState === "in_payment" ? "En pago" :
                                 inv.paymentState === "partial" ? "Parcial" : "Pendiente"}
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              <span className={`font-medium ${
                                inv.agingDays > 60 ? "text-red-600" : inv.agingDays > 30 ? "text-amber-600" : inv.agingDays > 0 ? "text-orange-500" : "text-emerald-600"
                              }`}>
                                {inv.agingDays > 0 ? inv.agingDays : "—"}
                              </span>
                            </td>
                            <td className="p-3 text-right text-slate-600">${Math.abs(inv.amountUntaxed).toLocaleString("es-VE", { minimumFractionDigits: 2 })}</td>
                            <td className="p-3 text-right font-bold">
                              <span className={inv.amountResidual > 0 ? "text-red-600" : "text-emerald-600"}>
                                ${Math.abs(inv.amountResidual).toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {cppModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-5 border-b bg-gradient-to-r from-slate-50 to-white">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  {cppModalKpi === "pagos_a_tiempo" ? "Pagos realizados a tiempo — Detalle"
                    : cppModalKpi === "cuentas_pagar_vencidas" ? "Cuentas por pagar vencidas — Detalle"
                    : cppModalKpi === "procesamiento_oportuno" ? "Procesamiento oportuno — Detalle"
                    : "Días promedio de pago (DPO) — Detalle"}
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  {empresaLabel} | {selectedMes}
                </p>
              </div>
              <button
                onClick={() => { setCppModalOpen(false); setCppModalData(null); setCppModalKpi(""); setCppPagosFilter("all"); }}
                className="p-2 rounded-lg bg-slate-200 hover:bg-slate-300 transition-colors"
              >
                <X size={20} className="text-slate-700" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-5">
              {cppModalLoading ? (
                <div className="flex items-center justify-center py-20 text-slate-400">
                  <RefreshCw size={24} className="animate-spin mr-2" /> Cargando detalle...
                </div>
              ) : !cppModalData ? (
                <div className="flex items-center justify-center py-20 text-slate-400">No hay datos disponibles</div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    {cppModalKpi === "pagos_a_tiempo" && (
                      <>
                        <div className="bg-slate-50 rounded-xl p-4">
                          <p className="text-xs text-slate-500 font-medium">Total facturas</p>
                          <p className="text-lg font-bold text-slate-800">{cppModalData.count}</p>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-4">
                          <p className="text-xs text-slate-500 font-medium">Monto residual</p>
                          <p className="text-lg font-bold text-slate-800">${cppModalData.totalResidual?.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</p>
                        </div>
                        <div className="col-span-2 flex gap-2">
                          {(["all", "pagado", "no_pagado"] as const).map((f) => (
                            <button
                              key={f}
                              onClick={() => setCppPagosFilter(f)}
                              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                                cppPagosFilter === f
                                  ? f === "pagado" ? "bg-emerald-500 text-white" : f === "no_pagado" ? "bg-red-500 text-white" : "bg-slate-700 text-white"
                                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                              }`}
                            >
                              {f === "all" ? "Todos" : f === "pagado" ? "Pagado" : "No pagado"}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    {cppModalKpi === "cuentas_pagar_vencidas" && (
                      <>
                        <div className="bg-slate-50 rounded-xl p-4">
                          <p className="text-xs text-slate-500 font-medium">Facturas con saldo</p>
                          <p className="text-lg font-bold text-slate-800">{cppModalData.count}</p>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-4">
                          <p className="text-xs text-slate-500 font-medium">Monto vencido</p>
                          <p className="text-lg font-bold text-red-600">${cppModalData.totalResidual?.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</p>
                        </div>
                        {cppModalData.agingBuckets && (
                          <div className="col-span-2 grid grid-cols-6 gap-2">
                            {Object.entries(cppModalData.agingBuckets).map(([band, info]: [string, any]) => (
                              <div key={band} className={`rounded-lg p-2 text-center ${band === "corriente" ? "bg-emerald-50" : band === "90+" ? "bg-red-50" : "bg-amber-50"}`}>
                                <p className="text-[10px] font-medium text-slate-500">{band === "corriente" ? "Corriente" : band}</p>
                                <p className="text-sm font-bold text-slate-800">${info.amount?.toLocaleString("es-VE", { maximumFractionDigits: 0 })}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                    {cppModalKpi === "procesamiento_oportuno" && (
                      <>
                        <div className="bg-slate-50 rounded-xl p-4">
                          <p className="text-xs text-slate-500 font-medium">Facturas recibidas</p>
                          <p className="text-lg font-bold text-slate-800">{cppModalData.count}</p>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-4">
                          <p className="text-xs text-slate-500 font-medium">Monto total</p>
                          <p className="text-lg font-bold text-slate-800">${cppModalData.totalAmount?.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</p>
                        </div>
                      </>
                    )}
                    {cppModalKpi === "dpo" && (
                      <>
                        <div className="bg-slate-50 rounded-xl p-4">
                          <p className="text-xs text-slate-500 font-medium">CxP abierta (90 días)</p>
                          <p className="text-lg font-bold text-slate-800">${cppModalData.totalResidual?.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</p>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-4">
                          <p className="text-xs text-slate-500 font-medium">Compras a crédito (90 días)</p>
                          <p className="text-lg font-bold text-slate-800">${cppModalData.totalAmount?.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</p>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="border rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b">
                          <th className="p-3 text-left font-medium text-slate-600">Factura</th>
                          <th className="p-3 text-left font-medium text-slate-600">Proveedor</th>
                          <th className="p-3 text-center font-medium text-slate-600">Fecha factura</th>
                          <th className="p-3 text-center font-medium text-slate-600">Vencimiento</th>
                          <th className="p-3 text-center font-medium text-slate-600">Estado</th>
                          {cppModalKpi === "procesamiento_oportuno" ? (
                            <>
                              <th className="p-3 text-center font-medium text-slate-600">Días proc.</th>
                              <th className="p-3 text-center font-medium text-slate-600">SLA</th>
                            </>
                          ) : (
                            <>
                              <th className="p-3 text-center font-medium text-slate-600">Días vencido</th>
                              <th className="p-3 text-center font-medium text-slate-600">Banda aging</th>
                            </>
                          )}
                          <th className="p-3 text-right font-medium text-slate-600">Monto</th>
                          <th className="p-3 text-right font-medium text-slate-600">Saldo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(cppModalKpi === "pagos_a_tiempo"
                          ? cppModalData.bills.filter((b: any) => {
                              const isPaid = b.paymentState === "paid" || b.paymentState === "reconciled" || b.paymentState === "in_payment";
                              if (cppPagosFilter === "pagado") return isPaid;
                              if (cppPagosFilter === "no_pagado") return !isPaid;
                              return true;
                            })
                          : cppModalData.bills
                        ).map((bill: any) => (
                          <tr key={bill.id} className="border-b hover:bg-blue-50/40 transition-colors">
                            <td className="p-3 font-medium text-slate-800">{bill.name}</td>
                            <td className="p-3 text-slate-700 max-w-[200px] truncate">{bill.partnerName}</td>
                            <td className="p-3 text-center text-slate-600">{bill.invoiceDate || "—"}</td>
                            <td className="p-3 text-center text-slate-600">{bill.invoiceDateDue || "—"}</td>
                            <td className="p-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                bill.paymentState === "paid" || bill.paymentState === "reconciled" || bill.paymentState === "in_payment" ? "bg-emerald-100 text-emerald-700" :
                                bill.paymentState === "partial" ? "bg-amber-100 text-amber-700" :
                                bill.paymentState === "nota_credito" || bill.isRefund ? "bg-purple-100 text-purple-700" :
                                "bg-red-100 text-red-700"
                              }`}>
                                {bill.paymentState === "paid" || bill.paymentState === "reconciled" ? "Pagada" :
                                 bill.paymentState === "in_payment" ? "En pago" :
                                 bill.paymentState === "partial" ? "Parcial" :
                                 bill.paymentState === "nota_credito" || bill.isRefund ? "N. Crédito" : "Pendiente"}
                              </span>
                            </td>
                            {cppModalKpi === "procesamiento_oportuno" ? (
                              <>
                                <td className="p-3 text-center font-medium text-slate-700">{bill.processingDays ?? "—"}</td>
                                <td className="p-3 text-center">
                                  {bill.slaOk === null ? <span className="text-slate-400">—</span> : (
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${bill.slaOk ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                                      {bill.slaOk ? `≤${bill.sla}d ✓` : `>${bill.sla}d ✗`}
                                    </span>
                                  )}
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="p-3 text-center">
                                  <span className={`font-medium ${
                                    bill.daysOverdue > 60 ? "text-red-600" : bill.daysOverdue > 30 ? "text-amber-600" : bill.daysOverdue > 0 ? "text-orange-500" : "text-emerald-600"
                                  }`}>
                                    {bill.daysOverdue > 0 ? bill.daysOverdue : "—"}
                                  </span>
                                </td>
                                <td className="p-3 text-center">
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                    bill.agingBand === "corriente" ? "bg-emerald-100 text-emerald-700" :
                                    bill.agingBand === "90+" ? "bg-red-100 text-red-700" :
                                    "bg-amber-100 text-amber-700"
                                  }`}>
                                    {bill.agingBand === "corriente" ? "Corriente" : bill.agingBand}
                                  </span>
                                </td>
                              </>
                            )}
                            <td className="p-3 text-right text-slate-600">${bill.amountUntaxed.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</td>
                            <td className="p-3 text-right font-bold">
                              <span className={bill.amountResidual > 0 ? "text-red-600" : "text-emerald-600"}>
                                ${bill.amountResidual.toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {kpiInfoModal.open && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setKpiInfoModal({ open: false, kpiId: "", title: "" })}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">{kpiInfoModal.title}</h2>
              <button
                onClick={() => setKpiInfoModal({ open: false, kpiId: "", title: "" })}
                className="p-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 transition-colors"
              >
                <X size={18} className="text-slate-700" />
              </button>
            </div>
            <div className="text-sm text-slate-600 leading-relaxed space-y-3">
              {kpiInfoModal.kpiId === "efectividad_cobranza" && (
                <>
                  <p><strong>Qué mide:</strong> Cuánto se cobró de todo lo que era exigible durante el período.</p>
                  <p><strong>Fórmula:</strong> Monto cobrado ÷ Monto exigible × 100</p>
                  <p><strong>Monto exigible:</strong> Saldo total de facturas cuya fecha de vencimiento es anterior o igual al final del período, incluyendo saldos vencidos anteriores que permanecían abiertos.</p>
                  <p><strong>Monto cobrado:</strong> Pagos efectivamente conciliados contra facturas incluidas en el monto exigible.</p>
                  <p><strong>Semáforo:</strong> Verde ≥95% | Amarillo 85%–94.99% | Rojo &lt;85%</p>
                </>
              )}
              {kpiInfoModal.kpiId === "cartera_vencida" && (
                <>
                  <p><strong>Qué mide:</strong> La proporción de cuentas por cobrar que ya superaron su fecha de vencimiento.</p>
                  <p><strong>Fórmula:</strong> Saldo vencido a la fecha de corte ÷ Cartera total abierta × 100</p>
                  <p><strong>Saldo vencido:</strong> Suma de saldos residuales de facturas con fecha de vencimiento anterior a hoy.</p>
                  <p><strong>Cartera total:</strong> Suma de todos los saldos residuales de facturas abiertas (con y sin vencer).</p>
                  <p><strong>Semáforo:</strong> Verde ≤10% | Amarillo 10.01%–20% | Rojo &gt;20%</p>
                </>
              )}
              {kpiInfoModal.kpiId === "recuperacion_vencidos" && (
                <>
                  <p><strong>Qué mide:</strong> Cuánto de la deuda vencida que existía al inicio del mes se logró recuperar.</p>
                  <p><strong>Fórmula:</strong> Vencido recuperado ÷ Vencido inicial del mes × 100</p>
                  <p><strong>Cohorte (vencido inicial):</strong> Fotografía de las facturas vencidas y sus saldos al inicio del mes. Las facturas que se vencen durante el mes no se incluyen en el denominador.</p>
                  <p><strong>Vencido recuperado:</strong> Diferencia entre el saldo inicial de la cohorte y el saldo restante actual (pagos conciliados + notas de crédito).</p>
                  <p><strong>Semáforo:</strong> Verde ≥60% | Amarillo 30%–59.99% | Rojo &lt;30%</p>
                </>
              )}
              {kpiInfoModal.kpiId === "dso" && (
                <>
                  <p><strong>Qué mide:</strong> Cuántos días tarda la empresa en convertir sus ventas a crédito en efectivo.</p>
                  <p><strong>Fórmula:</strong> Cartera abierta a la fecha de corte ÷ Ventas netas a crédito del período × Días del período</p>
                  <p><strong>Ventas netas a crédito:</strong> Total de facturas tipo "out_invoice" (excluyendo notas de crédito) de los últimos 90 días.</p>
                  <p><strong>Período:</strong> Se usa ventana móvil de 90 días para reducir volatilidad.</p>
                  <p><strong>Semáforo:</strong> Verde ≤45 días | Amarillo 46–60 días | Rojo &gt;60 días</p>
                </>
              )}
              {kpiInfoModal.kpiId === "cumplimiento_cuota_ventas" && (
                <>
                  <p><strong>Qué mide:</strong> Porcentaje de facturado contra la cuota mensual asignada a cada vendedor.</p>
                  <p><strong>Fórmula:</strong> Facturado del vendedor ÷ Cuota asignada × 100</p>
                  <p><strong>Semáforo:</strong> Verde ≥100% | Amarillo 70%–99.99% | Rojo &lt;70%</p>
                </>
              )}
              {kpiInfoModal.kpiId === "clientes_nuevos" && (
                <>
                  <p><strong>Qué mide:</strong> Cantidad de clientes nuevos captados por los vendedores en el mes.</p>
                  <p><strong>Definición:</strong> Cliente nuevo = partner cuya primera factura en Odoo es del mes actual.</p>
                  <p><strong>Meta:</strong> Cada vendedor debe captar la cantidad asignada de clientes nuevos al mes.</p>
                </>
              )}
              {!["efectividad_cobranza", "cartera_vencida", "recuperacion_vencidos", "dso", "cumplimiento_cuota_ventas", "clientes_nuevos"].includes(kpiInfoModal.kpiId) && (
                <p>Este KPI se calcula automáticamente a partir de los datos de Odoo. Consulte la definición completa en la documentación del dashboard.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
