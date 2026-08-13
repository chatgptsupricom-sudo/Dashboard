"use client";

import {
  Badge,
  Card,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Text,
  Title,
} from "@tremor/react";
import { format } from "date-fns";
import { motion } from "framer-motion";
import {
  Building2,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  FilterX,
  Globe,
  History,
  Info,
  MapPin,
  Receipt,
  TrendingUp,
  User,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { DateRange } from "react-day-picker";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";

const COMPANY_NAMES: Record<number, string> = {
  9: "Valencia",
  10: "Caracas",
  7: "Panama",
};

const COMPANY_TO_COUNTRY: Record<number, string> = {
  9: "VE",
  10: "VE",
  7: "PA",
};

const MAP_CONFIG: Record<string, any> = {
  VE: {
    name: "venezuela",
    geoUrl: "/geojson/venezuela.geojson",
    scale: 2800,
    center: [-66.3, 6.6],
  },
  PA: {
    name: "panama",
    geoUrl: "/geojson/panama.geojson",
    scale: 3500,
    center: [-80.1, 8.6],
  },
};

export default function MapsClientsPage() {
  const t = useTranslations("mapsClientsPage");
  const [currentCountry, setCurrentCountry] = useState("VE");
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const clientsPerPage = 4;
  const [userCompanyId, setUserCompanyId] = useState<number | null>(null);
  const [isCountryLocked, setIsCountryLocked] = useState(false);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [selSeller, setSelSeller] = useState("all");
  const [availableSellers, setAvailableSellers] = useState<any[]>([]);

  // Estado para el Historial Total
  const [isTotalHistory, setIsTotalHistory] = useState(false);

  // Estado del calendario
  const [date, setDate] = useState<DateRange | undefined>({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    to: new Date(),
  });

  const PRIMARY_BLUE = "#2563eb";

  useEffect(() => {
    async function fetchData() {
      // Previene la ejecución si no hay fecha inicial y no estamos en modo historial total
      if (!isTotalHistory && !date?.from) return;

      setLoading(true);
      try {
        let url = `/api/gerente_venta/mapa_cliente?country=${currentCountry}`;

        if (selSeller !== "all") {
          url += `&vendor_id=${selSeller}`;
        }

        // Si NO está activado el historial total, enviamos las fechas
        if (!isTotalHistory && date?.from) {
          const start = format(date.from, "yyyy-MM-dd");
          const end = date.to ? format(date.to, "yyyy-MM-dd") : start;
          url += `&startDate=${start}&endDate=${end}`;
        }

        const res = await fetch(url, { cache: "no-store" });
        const d = await res.json();
        setData(d.summary || []);
        setAvailableSellers(d.sellers || []);
        // Auto-detect country based on company
        if (d.company_id && COMPANY_TO_COUNTRY[d.company_id]) {
          setCurrentCountry(COMPANY_TO_COUNTRY[d.company_id]);
          setUserCompanyId(d.company_id);
          setIsCountryLocked(true);
        } else {
          // superAdmin with null cids - not locked, can switch countries
          setUserCompanyId(null);
          setIsCountryLocked(false);
        }
        setLoading(false);
      } catch (e) {
        setLoading(false);
      }
    }
    fetchData();
  }, [currentCountry, selSeller, date, isTotalHistory]); // Reacciona también al historial total

  const carteraName = userCompanyId
    ? COMPANY_NAMES[userCompanyId]
    : "Venezuela";

  const normalize = (name: string) => {
    if (!name) return "";
    return name
      .split("(")[0]
      .trim()
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ESTADO /g, "");
  };

  const getMapColor = (geoName: string) => {
    const geoKey = normalize(geoName);
    const stateData = data.find(
      (d) =>
        d.state_key === geoKey ||
        (geoKey === "VARGAS" && d.state_key === "LA GUAIRA"),
    );

    if (selectedState && normalize(selectedState) !== geoKey) return "#868585";

    if (!stateData || stateData.count === 0) return "#868585";

    const count = stateData.count;
    if (count >= 500) return PRIMARY_BLUE;
    if (count >= 100) return "#60a5fa";
    return "#bfdbfe";
  };

  const processedClients = useMemo(() => {
    let clients = selectedState
      ? data.find((d) => normalize(d.state) === normalize(selectedState))
          ?.clients || []
      : data.flatMap((d) => d.clients);
    return [...clients].sort((a, b) => b.value - a.value);
  }, [selectedState, data]);

  const totalPages = Math.ceil(processedClients.length / clientsPerPage);
  const paginatedClients = processedClients.slice(
    (currentPage - 1) * clientsPerPage,
    currentPage * clientsPerPage,
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedState, currentCountry]);

  return (
    <div className="min-h-screen p-6 lg:p-8 space-y-8 font-sans text-slate-900">
      <header className="flex flex-col lg:flex-row justify-between items-center gap-6 bg-white p-8 rounded-[2.5rem] shadow-sm border border-white">
        <div>
          <Title className="text-4xl font-black text-slate-900 tracking-tighter uppercase italic">
            {t("title")} <span className="text-blue-600">{t("title2")}</span>
          </Title>
        </div>

        {/* CONTROLES DERECHOS */}
        <div className="flex flex-col md:flex-row gap-4 items-center">
          {/* BOTÓN HISTORIAL TOTAL */}
          <button
            onClick={() => setIsTotalHistory(!isTotalHistory)}
            className={`px-4 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all shadow-sm flex items-center gap-2 border ${
              isTotalHistory
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-500 border-slate-200 hover:text-slate-900 hover:border-slate-300"
            }`}
          >
            <History size={14} /> Historial Total
          </button>

          {/* SELECTOR DE RANGO DE FECHAS */}
          <div
            className={`bg-white border border-slate-200 rounded-2xl p-2.5 flex items-center gap-2 shadow-sm transition-all duration-300 ${isTotalHistory ? "opacity-30 pointer-events-none grayscale" : ""}`}
          >
            <CalendarIcon size={16} className="text-slate-400 ml-2" />
            <input
              type="date"
              className="text-xs font-bold text-slate-600 border-none focus:ring-0 bg-transparent cursor-pointer"
              value={format(date?.from || new Date(), "yyyy-MM-dd")}
              onChange={(e) =>
                setDate((prev) => ({ ...prev, from: new Date(e.target.value) }))
              }
              disabled={isTotalHistory}
            />
            <span className="text-slate-300 font-bold">-</span>
            <input
              type="date"
              className="text-xs font-bold text-slate-600 border-none focus:ring-0 bg-transparent cursor-pointer"
              value={format(date?.to || new Date(), "yyyy-MM-dd")}
              onChange={(e) =>
                setDate((prev) => ({ ...prev, to: new Date(e.target.value) }))
              }
              disabled={isTotalHistory}
            />
          </div>

          <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200 gap-4">
            <select
              className="bg-white border-none rounded-xl text-[10px] font-bold p-3 outline-none cursor-pointer"
              value={selSeller}
              onChange={(e) => setSelSeller(e.target.value)}
            >
              <option value="all">Todos los Vendedores</option>
              {availableSellers.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            <div className="w-px bg-slate-200 my-1.5" />

            {!isCountryLocked && (
            <div className="flex gap-1.5">
              {Object.entries(MAP_CONFIG).map(([code, config]) => (
                <button
                  key={code}
                  onClick={() => {
                    setCurrentCountry(code);
                    setSelectedState(null);
                  }}
                  className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                    currentCountry === code
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  {config.name}
                </button>
              ))}
            </div>
            )}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* MAPA GRANDE Y CENTRADO */}
        <div className="lg:col-span-8">
          <Card className="rounded-[3rem] border-none shadow-xl p-0 bg-white overflow-hidden h-[900px] flex flex-col relative">
            <div className="p-8 border-b border-slate-50 flex justify-between items-center z-10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-xl text-blue-600">
                  <Globe size={20} />
                </div>
                <Title className="text-xl font-black text-slate-800 uppercase italic">
                  {t("map_of", { country: MAP_CONFIG[currentCountry].name })}
                </Title>
              </div>
              {selectedState && (
                <button
                  onClick={() => setSelectedState(null)}
                  className="group flex items-center gap-2 bg-red-50 text-red-600 px-5 py-2.5 rounded-2xl text-xs font-black uppercase shadow-sm"
                >
                  <FilterX size={14} /> {t("reset_map")}
                </button>
              )}
            </div>

            <div className="flex-1 bg-[#fcfcfc] relative flex items-center justify-center overflow-hidden">
              {loading ? (
                <Text className="font-black text-slate-300 animate-pulse uppercase text-[10px]">
                  {t("loading")}
                </Text>
              ) : (
                <ComposableMap
                  projection="geoMercator"
                  projectionConfig={{
                    scale: MAP_CONFIG[currentCountry].scale,
                    center: MAP_CONFIG[currentCountry].center,
                  }}
                  className="w-full h-full"
                >
                  <Geographies geography={MAP_CONFIG[currentCountry].geoUrl}>
                    {({ geographies }) =>
                      geographies.map((geo) => {
                        const geoName =
                          geo.properties.name ||
                          geo.properties.NAME_1 ||
                          geo.properties.NAME;
                        const fillColor = getMapColor(geoName);
                        const isSelected =
                          selectedState &&
                          normalize(geoName) === normalize(selectedState);
                        return (
                          <Geography
                            key={geo.rsmKey}
                            geography={geo}
                            onClick={() => {
                              const key = normalize(geoName);
                              const sData = data.find(
                                (d) =>
                                  d.state_key === key ||
                                  (key === "VARGAS" &&
                                    d.state_key === "LA GUAIRA"),
                              );
                              if (sData) setSelectedState(sData.state);
                            }}
                            style={{
                              default: {
                                fill: fillColor,
                                outline: "none",
                                transition: "all 0.4s ease",
                              },
                              hover: {
                                fill: PRIMARY_BLUE,
                                outline: "none",
                                cursor: "pointer",
                                opacity: 0.9,
                              },
                            }}
                            className={`stroke-white ${isSelected ? "stroke-[3px] z-20" : "stroke-[1.2px]"}`}
                          />
                        );
                      })
                    }
                  </Geographies>
                </ComposableMap>
              )}

              {/* LEYENDA */}
              <div className="absolute top-6 right-6 bg-white/90 backdrop-blur-xl p-6 rounded-[2.5rem] border border-white shadow-2xl space-y-4 z-10">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                  <Info size={16} className="text-blue-600" />
                  <Text className="text-[10px] font-black uppercase text-slate-500 tracking-widest">
                    {t("density_high")}
                  </Text>
                </div>
                <div className="space-y-3">
                  {[
                    {
                      label: "density_high",
                      range: "500+",
                      color: PRIMARY_BLUE,
                    },
                    {
                      label: "density_med",
                      range: "100-499",
                      color: "#60a5fa",
                    },
                    { label: "density_low", range: "1-99", color: "#bfdbfe" },
                    {
                      label: "no_clients",
                      range: "0",
                      color: "#868585",
                      border: true,
                    },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div
                        className={`h-3 w-3 rounded-full ${item.border ? "border border-slate-200" : ""}`}
                        style={{ backgroundColor: item.color }}
                      />
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-slate-700 uppercase">
                          {t(item.label)}
                        </span>
                        <span className="text-[9px] font-bold text-slate-400">
                          {t("clients", { count: item.range })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* SIDEBAR */}
        <aside className="lg:col-span-4 space-y-8">
          <Card className="rounded-[2.5rem] border-none shadow-xl bg-slate-900 text-white p-10 overflow-hidden relative">
            <Building2 className="absolute -right-12 -bottom-12 text-white/5 w-64 h-64 rotate-12" />
            <Text
              className={`text-blue-400 font-black text-xs uppercase tracking-[0.3em] mb-3 ${loading ? "animate-pulse text-slate-400" : ""}`}
            >
              {t("total_portfolio")}
            </Text>
            <div className="text-7xl font-black tracking-tighter mb-4 tabular-nums">
              {data.reduce((acc, curr) => acc + curr.count, 0)}
            </div>
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-[10px] uppercase bg-emerald-500/10 w-fit px-4 py-1.5 rounded-full border border-emerald-500/20">
              <TrendingUp size={14} />
              {userCompanyId
                ? COMPANY_NAMES[userCompanyId]
                : t("country", { country: MAP_CONFIG[currentCountry].name })}
            </div>
          </Card>

          <Card className="rounded-[2.5rem] border-none shadow-xl bg-white p-8 h-[420px] flex flex-col">
            <Title className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] mb-6 italic">
              {t("penetration_ranking")}
            </Title>

            {loading ? (
              <div className="flex-1 flex items-center justify-center text-slate-300 font-bold animate-pulse uppercase text-[10px]">
                {t("loading")}
              </div>
            ) : (
              <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar flex-1">
                {data
                  .sort((a, b) => b.count - a.count)
                  .map((state) => {
                    const isActive = selectedState === state.state;
                    return (
                      <motion.div
                        key={state.state}
                        onClick={() => setSelectedState(state.state)}
                        className={`flex justify-between items-center p-4 rounded-2xl cursor-pointer transition-all border ${
                          isActive
                            ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200"
                            : "bg-slate-50 border-transparent hover:border-blue-100"
                        }`}
                      >
                        <span className="text-[10px] font-black tracking-widest uppercase truncate max-w-[150px]">
                          {state.state}
                        </span>
                        <Badge
                          className={`rounded-lg font-mono text-[10px] px-3 border-none ${
                            isActive
                              ? "bg-white text-blue-600"
                              : "bg-blue-600 text-white"
                          }`}
                        >
                          {state.count}
                        </Badge>
                      </motion.div>
                    );
                  })}
              </div>
            )}
          </Card>
        </aside>

        {/* TABLA */}
        <div className="lg:col-span-12">
          <Card className="rounded-[3.5rem] border-none shadow-2xl p-0 overflow-hidden bg-white">
            <div className="p-12 border-b border-slate-50 flex flex-col md:flex-row justify-between items-center gap-6">
              <div>
                <Title className="text-3xl font-black text-slate-900 tracking-tighter italic uppercase underline decoration-blue-600 decoration-4">
                  {t("strategic_directory")}
                </Title>
                <Text className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.2em] mt-2 italic">
                  {selectedState
                    ? t("region", { region: selectedState })
                    : t("country", {
                        country: MAP_CONFIG[currentCountry].name,
                      })}
                </Text>
              </div>

              <div className="flex items-center gap-4 bg-slate-100/50 p-2 rounded-2xl border border-slate-200/50">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => p - 1)}
                  className="p-2.5 rounded-xl bg-white shadow-sm text-slate-400 hover:text-blue-600 disabled:opacity-30"
                >
                  <ChevronLeft size={20} />
                </button>
                <div className="flex items-center gap-2 px-4 font-black text-xs text-blue-600">
                  {currentPage} <span className="text-slate-300">/</span>{" "}
                  {totalPages || 1}
                </div>
                <button
                  disabled={currentPage === totalPages || totalPages === 0}
                  onClick={() => setCurrentPage((p) => p + 1)}
                  className="p-2.5 rounded-xl bg-white shadow-sm text-slate-400 hover:text-blue-600 disabled:opacity-30"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHead className="bg-slate-50/50">
                  <TableRow>
                    <TableHeaderCell className="text-[11px] font-black uppercase text-slate-400 tracking-widest py-8 pl-12 w-20 text-center">
                      #
                    </TableHeaderCell>
                    <TableHeaderCell className="text-[11px] font-black uppercase text-slate-400 tracking-widest py-8 text-center">
                      {t("social_reason")}
                    </TableHeaderCell>
                    <TableHeaderCell className="text-[11px] font-black uppercase text-slate-400 tracking-widest text-center">
                      RIF / VAT
                    </TableHeaderCell>
                    <TableHeaderCell className="text-[11px] font-black uppercase text-slate-400 tracking-widest text-center pr-12">
                      {isTotalHistory
                        ? "Facturación Histórica"
                        : "Facturación del Periodo"}
                    </TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paginatedClients.map((client: any, idx: number) => {
                    const absIdx = (currentPage - 1) * clientsPerPage + idx + 1;
                    return (
                      <motion.tr
                        key={client.rif + absIdx}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        onClick={() => setSelectedClient(client)}
                        className="group hover:bg-blue-50/40 border-b border-slate-50 last:border-0 transition-all cursor-pointer"
                      >
                        <TableCell className="pl-12 py-8">
                          <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-slate-100 text-slate-400 font-black text-[10px] group-hover:bg-blue-600 group-hover:text-white transition-all shadow-inner">
                            {absIdx}
                          </div>
                        </TableCell>
                        <TableCell className="font-bold text-slate-800 uppercase tracking-tight text-xs text-center">
                          {client.name}
                        </TableCell>
                        <TableCell className="text-[11px] font-mono font-bold text-slate-400 tracking-widest text-center">
                          {client.rif}
                        </TableCell>
                        <TableCell className="text-center pr-12 font-black text-blue-600 text-sm tabular-nums">
                          $
                          {client.value.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                          })}
                        </TableCell>
                      </motion.tr>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
           </Card>
         </div>
       </div>

       {/* MODAL DETALLE DE CLIENTE */}
       {selectedClient && (
         <div
           className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm"
           onClick={() => setSelectedClient(null)}
         >
           <div
             className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
             onClick={(e) => e.stopPropagation()}
           >
             {/* Header */}
             <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-gradient-to-r from-blue-50 to-white">
               <div className="flex items-center gap-4">
                 <div className="p-3 bg-blue-100 rounded-2xl">
                   <Building2 size={24} className="text-blue-600" />
                 </div>
                 <div>
                   <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">
                     {selectedClient.name}
                   </h2>
                   <p className="text-sm font-mono font-bold text-slate-400 mt-0.5">
                     RIF: {selectedClient.rif}
                   </p>
                 </div>
               </div>
               <button
                 onClick={() => setSelectedClient(null)}
                 className="p-2 rounded-xl hover:bg-slate-100 transition-colors"
               >
                 <X size={20} className="text-slate-400" />
               </button>
             </div>

             {/* Body */}
             <div className="flex-1 overflow-y-auto p-6 space-y-5">
               {/* KPI Cards */}
               <div className="grid grid-cols-2 gap-4">
                 <div className="bg-blue-50 rounded-2xl p-5 border border-blue-100">
                   <div className="flex items-center gap-2 mb-2">
                     <DollarSign size={16} className="text-blue-600" />
                     <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">
                       Monto Facturado
                     </span>
                   </div>
                   <p className="text-2xl font-black text-slate-900">
                     ${selectedClient.value?.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                   </p>
                 </div>
                 <div className="bg-emerald-50 rounded-2xl p-5 border border-emerald-100">
                   <div className="flex items-center gap-2 mb-2">
                     <User size={16} className="text-emerald-600" />
                     <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">
                       Ejecutivo Comercial
                     </span>
                   </div>
                   <p className="text-sm font-bold text-slate-800 uppercase">
                     {selectedClient.seller || "Sin Vendedor Asignado"}
                   </p>
                 </div>
               </div>

               {/* Ubicación */}
               <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
                 <div className="flex items-center gap-2 mb-3">
                   <MapPin size={16} className="text-slate-500" />
                   <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                     Localización Geográfica
                   </span>
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                   <div>
                     <span className="text-[10px] text-slate-400 font-bold uppercase">Ciudad</span>
                     <p className="text-sm font-bold text-slate-800">{selectedClient.city || "N/A"}</p>
                   </div>
                   <div>
                     <span className="text-[10px] text-slate-400 font-bold uppercase">Estado</span>
                     <p className="text-sm font-bold text-slate-800">{selectedState || "Nacional"}</p>
                   </div>
                 </div>
               </div>

               {/* Término de Venta */}
               <div className="bg-amber-50 rounded-2xl p-5 border border-amber-100">
                 <div className="flex items-center gap-2 mb-2">
                   <Receipt size={16} className="text-amber-600" />
                   <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">
                     Término de Venta
                   </span>
                 </div>
                 <span className={`inline-block px-4 py-1.5 rounded-full text-xs font-black uppercase ${
                   selectedClient.value > 25000
                     ? "bg-blue-100 text-blue-700"
                     : "bg-green-100 text-green-700"
                 }`}>
                   {selectedClient.value > 25000 ? "Crédito" : "Contado"}
                 </span>
               </div>
             </div>
           </div>
         </div>
       )}
     </div>
   );
 }
