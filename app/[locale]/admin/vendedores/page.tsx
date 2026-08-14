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
import { motion } from "framer-motion";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  FilterX,
  Globe,
  Info,
  TrendingUp,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";

const MAP_CONFIG: Record<string, any> = {
  VE: {
    name: "Venezuela",
    geoUrl:
      "https://raw.githubusercontent.com/apache/superset/master/superset-frontend/plugins/legacy-plugin-chart-country-map/src/countries/venezuela.geojson",
    scale: 2800,
    center: [-66.3, 6.6],
  },
  PA: {
    name: "Panamá",
    geoUrl:
      "https://raw.githubusercontent.com/apache/superset/master/superset-frontend/plugins/legacy-plugin-chart-country-map/src/countries/panama.geojson",
    scale: 8000,
    center: [-80, 8.5],
  },
  US: {
    name: "EE.UU",
    geoUrl:
      "https://raw.githubusercontent.com/apache/superset/master/superset-frontend/plugins/legacy-plugin-chart-country-map/src/countries/usa.geojson",
    scale: 800,
    center: [-96, 40],
  },
};

export default function MapsClientsPage() {
  const [currentCountry, setCurrentCountry] = useState("VE");
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const clientsPerPage = 4;

  const PRIMARY_BLUE = "#2563eb"; // El azul del título

  useEffect(() => {
    setLoading(true);
    fetch(
      `${window.location.origin}/api/superadmin/mapsclients?country=${currentCountry}`,
    )
      .then((res) => res.json())
      .then((d) => {
        setData(d.summary || []);
        setLoading(false);
      });
  }, [currentCountry]);

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

    // Lógica: Si hay selección, los demás se ponen grises
    if (selectedState && normalize(selectedState) !== geoKey) return "#868585";

    if (!stateData || stateData.count === 0) return "#868585";

    const count = stateData.count;
    if (count >= 500) return PRIMARY_BLUE; // Densidad Alta
    if (count >= 100) return "#60a5fa"; // Densidad Media
    return "#bfdbfe"; // Densidad Baja (1-99)
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
      {/* HEADER DINÁMICO */}
      <header className="flex flex-col lg:flex-row justify-between items-center gap-6 bg-white p-8 rounded-[2.5rem] shadow-sm border border-white">
        <div>
          <Title className="text-4xl font-black text-slate-900 tracking-tighter uppercase italic">
            Global <span className="text-blue-600">Intelligence</span>
          </Title>
        </div>

        {/* SELECTOR DE PAÍS */}
        <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
          {Object.entries(MAP_CONFIG).map(([code, config]) => (
            <button
              key={code}
              onClick={() => {
                setCurrentCountry(code);
                setSelectedState(null);
              }}
              className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${currentCountry === code ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
            >
              {config.name}
            </button>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* MAPA GRANDE Y CENTRADO */}
        <div className="lg:col-span-8">
          <Card className="rounded-[3rem] border-none shadow-xl p-0 bg-white overflow-hidden h-[750px] flex flex-col relative">
            <div className="p-8 border-b border-slate-50 flex justify-between items-center z-10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-xl text-blue-600">
                  <Globe size={20} />
                </div>
                <Title className="text-xl font-black text-slate-800 uppercase italic">
                  Mapa de {MAP_CONFIG[currentCountry].name}
                </Title>
              </div>
              {selectedState && (
                <button
                  onClick={() => setSelectedState(null)}
                  className="group flex items-center gap-2 bg-red-50 text-red-600 px-5 py-2.5 rounded-2xl text-xs font-black uppercase shadow-sm"
                >
                  <FilterX size={14} /> Reset Mapa
                </button>
              )}
            </div>

            <div className="flex-1 bg-[#fcfcfc] relative flex items-center justify-center overflow-hidden">
              {loading ? (
                <Text className="font-black text-slate-300 animate-pulse uppercase text-[10px]">
                  Sincronizando...
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

              {/* LEYENDA TÉCNICA REQUERIDA */}
              <div className="absolute top-6 right-6 bg-white/90 backdrop-blur-xl p-6 rounded-[2.5rem] border border-white shadow-2xl space-y-4 z-10">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                  <Info size={16} className="text-blue-600" />
                  <Text className="text-[10px] font-black uppercase text-slate-500 tracking-widest">
                    Cartera por Densidad
                  </Text>
                </div>
                <div className="space-y-3">
                  {[
                    {
                      label: "Densidad Alta",
                      range: "500+",
                      color: PRIMARY_BLUE,
                    },
                    {
                      label: "Densidad Media",
                      range: "100-499",
                      color: "#60a5fa",
                    },
                    { label: "Densidad Baja", range: "1-99", color: "#bfdbfe" },
                    {
                      label: "Sin Clientes",
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
                          {item.label}
                        </span>
                        <span className="text-[9px] font-bold text-slate-400">
                          {item.range} Clientes
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
            <Text className="text-blue-400 font-black text-xs uppercase tracking-[0.3em] mb-3">
              Cartera Total
            </Text>
            <div className="text-7xl font-black tracking-tighter mb-4 tabular-nums">
              {data.reduce((acc, curr) => acc + curr.count, 0)}
            </div>
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-[10px] uppercase bg-emerald-500/10 w-fit px-4 py-1.5 rounded-full border border-emerald-500/20">
              <TrendingUp size={14} /> Expansión en{" "}
              {MAP_CONFIG[currentCountry].name}
            </div>
          </Card>

          <Card className="rounded-[2.5rem] border-none shadow-xl bg-white p-8 h-[420px] flex flex-col">
            <Title className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] mb-6 italic">
              Ranking de Penetración
            </Title>
            <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar flex-1">
              {data
                .sort((a, b) => b.count - a.count)
                .map((state) => {
                  const isActive = selectedState === state.state;
                  return (
                    <motion.div
                      key={state.state}
                      onClick={() => setSelectedState(state.state)}
                      className={`flex justify-between items-center p-4 rounded-2xl cursor-pointer transition-all border ${isActive ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200" : "bg-slate-50 border-transparent hover:border-blue-100"}`}
                    >
                      <span className="text-[10px] font-black tracking-widest uppercase truncate max-w-[150px]">
                        {state.state}
                      </span>
                      <Badge
                        className={`rounded-lg font-mono text-[10px] px-3 border-none ${isActive ? "bg-white text-blue-600" : "bg-blue-600 text-white"}`}
                      >
                        {state.count}
                      </Badge>
                    </motion.div>
                  );
                })}
            </div>
          </Card>
        </aside>

        {/* TABLA PAGINADA Y NUMERADA */}
        <div className="lg:col-span-12">
          <Card className="rounded-[3.5rem] border-none shadow-2xl p-0 overflow-hidden bg-white">
            <div className="p-12 border-b border-slate-50 flex flex-col md:flex-row justify-between items-center gap-6">
              <div>
                <Title className="text-3xl font-black text-slate-900 tracking-tighter italic uppercase underline decoration-blue-600 decoration-4">
                  Directorio Estratégico
                </Title>
                <Text className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.2em] mt-2 italic">
                  {selectedState
                    ? `Region: ${selectedState}`
                    : `Clientes en ${MAP_CONFIG[currentCountry].name}`}
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
                      Razón Social
                    </TableHeaderCell>
                    <TableHeaderCell className="text-[11px] font-black uppercase text-slate-400 tracking-widest text-center">
                      RIF / VAT
                    </TableHeaderCell>
                    <TableHeaderCell className="text-[11px] font-black uppercase text-slate-400 tracking-widest text-center pr-12">
                      Facturación Histórica
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
                        className="group hover:bg-blue-50/40 border-b border-slate-50 last:border-0 transition-all"
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
    </div>
  );
}
