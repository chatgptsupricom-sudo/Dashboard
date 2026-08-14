// // // // // "use client";

// // // // // import {
// // // // //   Badge,
// // // // //   Card,
// // // // //   Table,
// // // // //   TableBody,
// // // // //   TableCell,
// // // // //   TableHead,
// // // // //   TableHeaderCell,
// // // // //   TableRow,
// // // // //   Text,
// // // // //   Title,
// // // // // } from "@tremor/react";
// // // // // import { motion } from "framer-motion";
// // // // // import {
// // // // //   Building2,
// // // // //   ChevronLeft,
// // // // //   ChevronRight,
// // // // //   FilterX,
// // // // //   Globe,
// // // // //   Info,
// // // // //   TrendingUp,
// // // // // } from "lucide-react";
// // // // // import { useTranslations } from "next-intl";
// // // // // import { useEffect, useMemo, useState } from "react";
// // // // // import { ComposableMap, Geographies, Geography } from "react-simple-maps";

// // // // // const MAP_CONFIG: Record<string, any> = {
// // // // //   VE: {
// // // // //     name: "venezuela",
// // // // //     geoUrl:
// // // // //       "https://raw.githubusercontent.com/apache/superset/master/superset-frontend/plugins/legacy-plugin-chart-country-map/src/countries/venezuela.geojson",
// // // // //     scale: 2800,
// // // // //     center: [-66.3, 6.6],
// // // // //   },
// // // // //   PA: {
// // // // //     name: "panama",
// // // // //     geoUrl:
// // // // //       "https://raw.githubusercontent.com/apache/superset/master/superset-frontend/plugins/legacy-plugin-chart-country-map/src/countries/panama.geojson",
// // // // //     scale: 8000,
// // // // //     center: [-80, 8.5],
// // // // //   },
// // // // // };

// // // // // export default function MapsClientsPage() {
// // // // //   const t = useTranslations("mapsClientsPage");
// // // // //   const [currentCountry, setCurrentCountry] = useState("VE");

// // // // //   // NUEVO ESTADO: Controla si se visualiza por "Cliente" o por "Monto"
// // // // //   const [viewType, setViewType] = useState<"CLIENTS" | "AMOUNT">("CLIENTS");

// // // // //   const [data, setData] = useState<any[]>([]);
// // // // //   const [loading, setLoading] = useState(true);
// // // // //   const [selectedState, setSelectedState] = useState<string | null>(null);
// // // // //   const [currentPage, setCurrentPage] = useState(1);
// // // // //   const clientsPerPage = 4;

// // // // //   const PRIMARY_BLUE = "#2563eb";

// // // // //   useEffect(() => {
// // // // //     let ignore = false;
// // // // //     setLoading(true);

// // // // //     // 1. Limpiamos los datos del país anterior para evitar cruces visuales
// // // // //     setData([]);

// // // // //     fetch(`/api/superadmin/mapsclients?country=${currentCountry}`)
// // // // //       .then((res) => res.json())
// // // // //       .then((d) => {
// // // // //         // 2. Si el usuario ya cambió de país mientras cargaba, ignoramos esta respuesta vieja
// // // // //         if (!ignore) {
// // // // //           setData(d.summary || []);
// // // // //           setLoading(false);
// // // // //         }
// // // // //       })
// // // // //       .catch((err) => {
// // // // //         if (!ignore) setLoading(false);
// // // // //         console.error(err);
// // // // //       });

// // // // //     return () => {
// // // // //       // Esto se ejecuta si currentCountry cambia antes de que termine el fetch actual
// // // // //       ignore = true;
// // // // //     };
// // // // //   }, [currentCountry]);

// // // // //   const normalize = (name: string) => {
// // // // //     if (!name) return "";
// // // // //     return name
// // // // //       .split("(")[0]
// // // // //       .trim()
// // // // //       .toUpperCase()
// // // // //       .normalize("NFD")
// // // // //       .replace(/[\u0300-\u036f]/g, "")
// // // // //       .replace(/ESTADO /g, "");
// // // // //   };

// // // // //   // FUNCIÓN AUXILIAR: Suma la propiedad 'value' (facturación) de todos los clientes de un estado
// // // // //   const getStateTotalAmount = (stateData: any) => {
// // // // //     if (!stateData || !stateData.clients) return 0;
// // // // //     return stateData.clients.reduce(
// // // // //       (acc: number, c: any) => acc + (c.value || 0),
// // // // //       0,
// // // // //     );
// // // // //   };

// // // // //   const getMapColor = (geoName: string) => {
// // // // //     const geoKey = normalize(geoName);
// // // // //     const stateData = data.find(
// // // // //       (d) =>
// // // // //         d.state_key === geoKey ||
// // // // //         (geoKey === "VARGAS" && d.state_key === "LA GUAIRA"),
// // // // //     );

// // // // //     if (selectedState && normalize(selectedState) !== geoKey) return "#868585";
// // // // //     if (!stateData) return "#868585";

// // // // //     // Pestaña CLIENTE seleccionada
// // // // //     if (viewType === "CLIENTS") {
// // // // //       const count = stateData.count || 0;
// // // // //       if (count === 0) return "#868585";
// // // // //       if (count >= 500) return PRIMARY_BLUE; // Densidad Alta
// // // // //       if (count >= 100) return "#60a5fa"; // Densidad Media
// // // // //       return "#bfdbfe"; // Densidad Baja
// // // // //     }

// // // // //     // Pestaña MONTO seleccionada (puedes ajustar estos rangos de dinero según tu conveniencia)
// // // // //     else {
// // // // //       const amount = getStateTotalAmount(stateData);
// // // // //       if (amount === 0) return "#868585";
// // // // //       if (amount >= 50000) return PRIMARY_BLUE; // Facturación Alta ($50k+)
// // // // //       if (amount >= 10000) return "#60a5fa"; // Facturación Media ($10k - $49k)
// // // // //       return "#bfdbfe"; // Facturación Baja (Menor a $10k)
// // // // //     }
// // // // //   };

// // // // //   const processedClients = useMemo(() => {
// // // // //     let clients = selectedState
// // // // //       ? data.find((d) => normalize(d.state) === normalize(selectedState))
// // // // //           ?.clients || []
// // // // //       : data.flatMap((d) => d.clients);
// // // // //     return [...clients].sort((a, b) => b.value - a.value);
// // // // //   }, [selectedState, data]);

// // // // //   const totalPages = Math.ceil(processedClients.length / clientsPerPage);
// // // // //   const paginatedClients = processedClients.slice(
// // // // //     (currentPage - 1) * clientsPerPage,
// // // // //     currentPage * clientsPerPage,
// // // // //   );

// // // // //   useEffect(() => {
// // // // //     setCurrentPage(1);
// // // // //   }, [selectedState, currentCountry, viewType]);

// // // // //   return (
// // // // //     <div className="min-h-screen p-6 lg:p-8 space-y-8 font-sans text-slate-900">
// // // // //       {/* HEADER DINÁMICO */}
// // // // //       <header className="flex flex-col lg:flex-row justify-between items-center gap-6 bg-white p-8 rounded-[2.5rem] shadow-sm border border-white">
// // // // //         <div>
// // // // //           <Title className="text-4xl font-black text-slate-900 tracking-tighter uppercase italic">
// // // // //             {t("title")} <span className="text-blue-600">{t("title2")}</span>
// // // // //           </Title>
// // // // //         </div>

// // // // //         {/* SELECTORES EN LÍNEA: TABS DE VISTA Y TABS DE PAÍSES */}
// // // // //         <div className="flex flex-col sm:flex-row items-center gap-4">
// // // // //           {/* NUEVO TABS: CLIENTE / MONTO */}
// // // // //           <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
// // // // //             <button
// // // // //               onClick={() => setViewType("CLIENTS")}
// // // // //               className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
// // // // //                 viewType === "CLIENTS"
// // // // //                   ? "bg-white text-blue-600 shadow-sm"
// // // // //                   : "text-slate-400 hover:text-slate-600"
// // // // //               }`}
// // // // //             >
// // // // //               Cliente
// // // // //             </button>
// // // // //             <button
// // // // //               onClick={() => setViewType("AMOUNT")}
// // // // //               className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
// // // // //                 viewType === "AMOUNT"
// // // // //                   ? "bg-white text-blue-600 shadow-sm"
// // // // //                   : "text-slate-400 hover:text-slate-600"
// // // // //               }`}
// // // // //             >
// // // // //               Monto
// // // // //             </button>
// // // // //           </div>

// // // // //           {/* TABS DE PAÍSES */}
// // // // //           <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
// // // // //             {Object.entries(MAP_CONFIG).map(([code, config]) => (
// // // // //               <button
// // // // //                 key={code}
// // // // //                 onClick={() => {
// // // // //                   setCurrentCountry(code);
// // // // //                   setSelectedState(null);
// // // // //                 }}
// // // // //                 className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
// // // // //                   currentCountry === code
// // // // //                     ? "bg-white text-blue-600 shadow-sm"
// // // // //                     : "text-slate-400 hover:text-slate-600"
// // // // //                 }`}
// // // // //               >
// // // // //                 {config.name}
// // // // //               </button>
// // // // //             ))}
// // // // //           </div>
// // // // //         </div>
// // // // //       </header>

// // // // //       <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
// // // // //         {/* MAPA GRANDE Y CENTRADO */}
// // // // //         <div className="lg:col-span-8">
// // // // //           <Card className="rounded-[3rem] border-none shadow-xl p-0 bg-white overflow-hidden h-[750px] flex flex-col relative">
// // // // //             <div className="p-8 border-b border-slate-50 flex justify-between items-center z-10">
// // // // //               <div className="flex items-center gap-3">
// // // // //                 <div className="p-2 bg-blue-50 rounded-xl text-blue-600">
// // // // //                   <Globe size={20} />
// // // // //                 </div>
// // // // //                 <Title className="text-xl font-black text-slate-800 uppercase italic flex items-center gap-2">
// // // // //                   {t("map_of", { country: MAP_CONFIG[currentCountry].name })}
// // // // //                   <span className="text-xs bg-slate-100 text-slate-500 rounded-lg px-2.5 py-1 font-bold normal-case italic">
// // // // //                     por{" "}
// // // // //                     {viewType === "CLIENTS" ? "clientes" : "monto facturado"}
// // // // //                   </span>
// // // // //                 </Title>
// // // // //               </div>
// // // // //               {selectedState && (
// // // // //                 <button
// // // // //                   onClick={() => setSelectedState(null)}
// // // // //                   className="group flex items-center gap-2 bg-red-50 text-red-600 px-5 py-2.5 rounded-2xl text-xs font-black uppercase shadow-sm"
// // // // //                 >
// // // // //                   <FilterX size={14} /> {t("reset_map")}
// // // // //                 </button>
// // // // //               )}
// // // // //             </div>

// // // // //             <div className="flex-1 bg-[#fcfcfc] relative flex items-center justify-center overflow-hidden">
// // // // //               {loading ? (
// // // // //                 <Text className="font-black text-slate-300 animate-pulse uppercase text-[10px]">
// // // // //                   {t("loading")}
// // // // //                 </Text>
// // // // //               ) : (
// // // // //                 <ComposableMap
// // // // //                   projection="geoMercator"
// // // // //                   projectionConfig={{
// // // // //                     scale: MAP_CONFIG[currentCountry].scale,
// // // // //                     center: MAP_CONFIG[currentCountry].center,
// // // // //                   }}
// // // // //                   className="w-full h-full"
// // // // //                 >
// // // // //                   <Geographies geography={MAP_CONFIG[currentCountry].geoUrl}>
// // // // //                     {({ geographies }) =>
// // // // //                       geographies.map((geo) => {
// // // // //                         const geoName =
// // // // //                           geo.properties.name ||
// // // // //                           geo.properties.NAME_1 ||
// // // // //                           geo.properties.NAME;
// // // // //                         const fillColor = getMapColor(geoName);
// // // // //                         const isSelected =
// // // // //                           selectedState &&
// // // // //                           normalize(geoName) === normalize(selectedState);
// // // // //                         return (
// // // // //                           <Geography
// // // // //                             key={geo.rsmKey}
// // // // //                             geography={geo}
// // // // //                             onClick={() => {
// // // // //                               const key = normalize(geoName);
// // // // //                               const sData = data.find(
// // // // //                                 (d) =>
// // // // //                                   d.state_key === key ||
// // // // //                                   (key === "VARGAS" &&
// // // // //                                     d.state_key === "LA GUAIRA"),
// // // // //                               );
// // // // //                               if (sData) setSelectedState(sData.state);
// // // // //                             }}
// // // // //                             style={{
// // // // //                               default: {
// // // // //                                 fill: fillColor,
// // // // //                                 outline: "none",
// // // // //                                 transition: "all 0.4s ease",
// // // // //                               },
// // // // //                               hover: {
// // // // //                                 fill: PRIMARY_BLUE,
// // // // //                                 outline: "none",
// // // // //                                 cursor: "pointer",
// // // // //                                 opacity: 0.9,
// // // // //                               },
// // // // //                             }}
// // // // //                             className={`stroke-white ${isSelected ? "stroke-[3px] z-20" : "stroke-[1.2px]"}`}
// // // // //                           />
// // // // //                         );
// // // // //                       })
// // // // //                     }
// // // // //                   </Geographies>
// // // // //                 </ComposableMap>
// // // // //               )}

// // // // //               {/* LEYENDA DINÁMICA SEGÚN EL FILTRO */}
// // // // //               <div className="absolute top-6 right-6 bg-white/90 backdrop-blur-xl p-6 rounded-[2.5rem] border border-white shadow-2xl space-y-4 z-10">
// // // // //                 <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
// // // // //                   <Info size={16} className="text-blue-600" />
// // // // //                   <Text className="text-[10px] font-black uppercase text-slate-500 tracking-widest">
// // // // //                     Métricas por {viewType === "CLIENTS" ? "Clientes" : "Monto"}
// // // // //                   </Text>
// // // // //                 </div>
// // // // //                 <div className="space-y-3">
// // // // //                   {(viewType === "CLIENTS"
// // // // //                     ? [
// // // // //                         {
// // // // //                           label: "Alta Densidad",
// // // // //                           range: "500+",
// // // // //                           color: PRIMARY_BLUE,
// // // // //                         },
// // // // //                         {
// // // // //                           label: "Media Densidad",
// // // // //                           range: "100-499",
// // // // //                           color: "#60a5fa",
// // // // //                         },
// // // // //                         {
// // // // //                           label: "Baja Densidad",
// // // // //                           range: "1-99",
// // // // //                           color: "#bfdbfe",
// // // // //                         },
// // // // //                         {
// // // // //                           label: "Sin Clientes",
// // // // //                           range: "0",
// // // // //                           color: "#868585",
// // // // //                           border: true,
// // // // //                         },
// // // // //                       ]
// // // // //                     : [
// // // // //                         {
// // // // //                           label: "Facturación Alta",
// // // // //                           range: "$50,000+",
// // // // //                           color: PRIMARY_BLUE,
// // // // //                         },
// // // // //                         {
// // // // //                           label: "Facturación Media",
// // // // //                           range: "$10,000 - $49,999",
// // // // //                           color: "#60a5fa",
// // // // //                         },
// // // // //                         {
// // // // //                           label: "Facturación Baja",
// // // // //                           range: "Menos de $10,000",
// // // // //                           color: "#bfdbfe",
// // // // //                         },
// // // // //                         {
// // // // //                           label: "Sin Facturación",
// // // // //                           range: "$0",
// // // // //                           color: "#868585",
// // // // //                           border: true,
// // // // //                         },
// // // // //                       ]
// // // // //                   ).map((item, i) => (
// // // // //                     <div key={i} className="flex items-center gap-3">
// // // // //                       <div
// // // // //                         className={`h-3 w-3 rounded-full ${item.border ? "border border-slate-200" : ""}`}
// // // // //                         style={{ backgroundColor: item.color }}
// // // // //                       />
// // // // //                       <div className="flex flex-col">
// // // // //                         <span className="text-[10px] font-black text-slate-700 uppercase">
// // // // //                           {item.label}
// // // // //                         </span>
// // // // //                         <span className="text-[9px] font-bold text-slate-400">
// // // // //                           {item.range}
// // // // //                         </span>
// // // // //                       </div>
// // // // //                     </div>
// // // // //                   ))}
// // // // //                 </div>
// // // // //               </div>
// // // // //             </div>
// // // // //           </Card>
// // // // //         </div>

// // // // //         {/* SIDEBAR */}
// // // // //         <aside className="lg:col-span-4 space-y-8">
// // // // //           <Card className="rounded-[2.5rem] border-none shadow-xl bg-slate-900 text-white p-10 overflow-hidden relative">
// // // // //             <Building2 className="absolute -right-12 -bottom-12 text-white/5 w-64 h-64 rotate-12" />
// // // // //             <Text
// // // // //               className={`text-blue-400 font-black text-xs uppercase tracking-[0.3em] mb-3 ${loading ? "animate-pulse text-slate-400" : ""}`}
// // // // //             >
// // // // //               {viewType === "CLIENTS"
// // // // //                 ? t("total_portfolio")
// // // // //                 : "TOTAL FACTURADO"}
// // // // //             </Text>
// // // // //             <div className="text-5xl font-black tracking-tighter mb-4 tabular-nums truncate">
// // // // //               {viewType === "CLIENTS"
// // // // //                 ? data.reduce((acc, curr) => acc + curr.count, 0)
// // // // //                 : `$${data.reduce((acc, curr) => acc + getStateTotalAmount(curr), 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
// // // // //             </div>
// // // // //             <div className="flex items-center gap-2 text-emerald-400 font-bold text-[10px] uppercase bg-emerald-500/10 w-fit px-4 py-1.5 rounded-full border border-emerald-500/20">
// // // // //               <TrendingUp size={14} />
// // // // //               {t("country", { country: MAP_CONFIG[currentCountry].name })}
// // // // //             </div>
// // // // //           </Card>

// // // // //           <Card className="rounded-[2.5rem] border-none shadow-xl bg-white p-8 h-[420px] flex flex-col">
// // // // //             <Title className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] mb-6 italic">
// // // // //               {viewType === "CLIENTS"
// // // // //                 ? t("penetration_ranking")
// // // // //                 : "RANKING DE FACTURACIÓN"}
// // // // //             </Title>

// // // // //             {loading ? (
// // // // //               <div className="flex-1 flex items-center justify-center text-slate-300 font-bold animate-pulse uppercase text-[10px]">
// // // // //                 {t("loading")}
// // // // //               </div>
// // // // //             ) : (
// // // // //               <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar flex-1">
// // // // //                 {data
// // // // //                   .sort((a, b) =>
// // // // //                     viewType === "CLIENTS"
// // // // //                       ? b.count - a.count
// // // // //                       : getStateTotalAmount(b) - getStateTotalAmount(a),
// // // // //                   )
// // // // //                   .map((state) => {
// // // // //                     const isActive = selectedState === state.state;
// // // // //                     return (
// // // // //                       <motion.div
// // // // //                         key={state.state}
// // // // //                         onClick={() => setSelectedState(state.state)}
// // // // //                         className={`flex justify-between items-center p-4 rounded-2xl cursor-pointer transition-all border ${
// // // // //                           isActive
// // // // //                             ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200"
// // // // //                             : "bg-slate-50 border-transparent hover:border-blue-100"
// // // // //                         }`}
// // // // //                       >
// // // // //                         <span className="text-[10px] font-black tracking-widest uppercase truncate max-w-[150px]">
// // // // //                           {state.state}
// // // // //                         </span>
// // // // //                         <Badge
// // // // //                           className={`rounded-lg font-mono text-[10px] px-3 border-none ${
// // // // //                             isActive
// // // // //                               ? "bg-white text-blue-600"
// // // // //                               : "bg-blue-600 text-white"
// // // // //                           }`}
// // // // //                         >
// // // // //                           {viewType === "CLIENTS"
// // // // //                             ? state.count
// // // // //                             : `$${getStateTotalAmount(state).toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
// // // // //                         </Badge>
// // // // //                       </motion.div>
// // // // //                     );
// // // // //                   })}
// // // // //               </div>
// // // // //             )}
// // // // //           </Card>
// // // // //         </aside>

// // // // //         {/* TABLA PAGINADA Y NUMERADA */}
// // // // //         <div className="lg:col-span-12">
// // // // //           <Card className="rounded-[3.5rem] border-none shadow-2xl p-0 overflow-hidden bg-white">
// // // // //             <div className="p-12 border-b border-slate-50 flex flex-col md:flex-row justify-between items-center gap-6">
// // // // //               <div>
// // // // //                 <Title className="text-3xl font-black text-slate-900 tracking-tighter italic uppercase underline decoration-blue-600 decoration-4">
// // // // //                   {t("strategic_directory")}
// // // // //                 </Title>
// // // // //                 <Text className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.2em] mt-2 italic">
// // // // //                   {selectedState
// // // // //                     ? t("region", { region: selectedState })
// // // // //                     : t("country", {
// // // // //                         country: MAP_CONFIG[currentCountry].name,
// // // // //                       })}
// // // // //                 </Text>
// // // // //               </div>

// // // // //               <div className="flex items-center gap-4 bg-slate-100/50 p-2 rounded-2xl border border-slate-200/50">
// // // // //                 <button
// // // // //                   disabled={currentPage === 1}
// // // // //                   onClick={() => setCurrentPage((p) => p - 1)}
// // // // //                   className="p-2.5 rounded-xl bg-white shadow-sm text-slate-400 hover:text-blue-600 disabled:opacity-30"
// // // // //                 >
// // // // //                   <ChevronLeft size={20} />
// // // // //                 </button>
// // // // //                 <div className="flex items-center gap-2 px-4 font-black text-xs text-blue-600">
// // // // //                   {currentPage} <span className="text-slate-300">/</span>{" "}
// // // // //                   {totalPages || 1}
// // // // //                 </div>
// // // // //                 <button
// // // // //                   disabled={currentPage === totalPages || totalPages === 0}
// // // // //                   onClick={() => setCurrentPage((p) => p + 1)}
// // // // //                   className="p-2.5 rounded-xl bg-white shadow-sm text-slate-400 hover:text-blue-600 disabled:opacity-30"
// // // // //                 >
// // // // //                   <ChevronRight size={20} />
// // // // //                 </button>
// // // // //               </div>
// // // // //             </div>

// // // // //             <div className="overflow-x-auto">
// // // // //               <Table>
// // // // //                 <TableHead className="bg-slate-50/50">
// // // // //                   <TableRow>
// // // // //                     <TableHeaderCell className="text-[11px] font-black uppercase text-slate-400 tracking-widest py-8 pl-12 w-20 text-center">
// // // // //                       #
// // // // //                     </TableHeaderCell>
// // // // //                     <TableHeaderCell className="text-[11px] font-black uppercase text-slate-400 tracking-widest py-8 text-center">
// // // // //                       {t("social_reason")}
// // // // //                     </TableHeaderCell>
// // // // //                     <TableHeaderCell className="text-[11px] font-black uppercase text-slate-400 tracking-widest text-center">
// // // // //                       RIF / VAT
// // // // //                     </TableHeaderCell>
// // // // //                     <TableHeaderCell className="text-[11px] font-black uppercase text-slate-400 tracking-widest text-center pr-12">
// // // // //                       {t("billing_history")}
// // // // //                     </TableHeaderCell>
// // // // //                   </TableRow>
// // // // //                 </TableHead>
// // // // //                 <TableBody>
// // // // //                   {paginatedClients.map((client: any, idx: number) => {
// // // // //                     const absIdx = (currentPage - 1) * clientsPerPage + idx + 1;
// // // // //                     return (
// // // // //                       <motion.tr
// // // // //                         key={client.rif + absIdx}
// // // // //                         initial={{ opacity: 0 }}
// // // // //                         animate={{ opacity: 1 }}
// // // // //                         className="group hover:bg-blue-50/40 border-b border-slate-50 last:border-0 transition-all"
// // // // //                       >
// // // // //                         <TableCell className="pl-12 py-8">
// // // // //                           <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-slate-100 text-slate-400 font-black text-[10px] group-hover:bg-blue-600 group-hover:text-white transition-all shadow-inner">
// // // // //                             {absIdx}
// // // // //                           </div>
// // // // //                         </TableCell>
// // // // //                         <TableCell className="font-bold text-slate-800 uppercase tracking-tight text-xs text-center">
// // // // //                           {client.name}
// // // // //                         </TableCell>
// // // // //                         <TableCell className="text-[11px] font-mono font-bold text-slate-400 tracking-widest text-center">
// // // // //                           {client.rif}
// // // // //                         </TableCell>
// // // // //                         <TableCell className="text-center pr-12 font-black text-blue-600 text-sm tabular-nums">
// // // // //                           $
// // // // //                           {client.value.toLocaleString("en-US", {
// // // // //                             minimumFractionDigits: 2,
// // // // //                           })}
// // // // //                         </TableCell>
// // // // //                       </motion.tr>
// // // // //                     );
// // // // //                   })}
// // // // //                 </TableBody>
// // // // //               </Table>
// // // // //             </div>
// // // // //           </Card>
// // // // //         </div>
// // // // //       </div>
// // // // //     </div>
// // // // //   );
// // // // // }
// // // // "use client";

// // // // import {
// // // //   Badge,
// // // //   Card,
// // // //   Table,
// // // //   TableBody,
// // // //   TableCell,
// // // //   TableHead,
// // // //   TableHeaderCell,
// // // //   TableRow,
// // // //   Text,
// // // //   Title,
// // // // } from "@tremor/react";
// // // // import { format } from "date-fns";
// // // // import { motion } from "framer-motion";
// // // // import {
// // // //   Building2,
// // // //   Calendar as CalendarIcon,
// // // //   ChevronLeft,
// // // //   ChevronRight,
// // // //   FilterX,
// // // //   Globe,
// // // //   History,
// // // //   Info,
// // // //   TrendingUp,
// // // // } from "lucide-react";
// // // // import { useTranslations } from "next-intl";
// // // // import { useEffect, useMemo, useState } from "react";
// // // // import { DateRange } from "react-day-picker";
// // // // import { ComposableMap, Geographies, Geography } from "react-simple-maps";

// // // // const COMPANY_NAMES: Record<number, string> = {
// // // //   9: "Valencia",
// // // //   10: "Caracas",
// // // //   7: "Panama",
// // // // };

// // // // const MAP_CONFIG: Record<string, any> = {
// // // //   VE: {
// // // //     name: "venezuela",
// // // //     geoUrl:
// // // //       "https://raw.githubusercontent.com/apache/superset/master/superset-frontend/plugins/legacy-plugin-chart-country-map/src/countries/venezuela.geojson",
// // // //     scale: 2800,
// // // //     center: [-66.3, 6.6],
// // // //   },
// // // //   PA: {
// // // //     name: "panama",
// // // //     geoUrl:
// // // //       "https://raw.githubusercontent.com/apache/superset/master/superset-frontend/plugins/legacy-plugin-chart-country-map/src/countries/panama.geojson",
// // // //     scale: 8000,
// // // //     center: [-80, 8.5],
// // // //   },
// // // // };

// // // // export default function MapsClientsPage() {
// // // //   const t = useTranslations("mapsClientsPage");
// // // //   const [currentCountry, setCurrentCountry] = useState("VE");

// // // //   // CONTROL DE VISTA: "Cliente" o "Monto"
// // // //   const [viewType, setViewType] = useState<"CLIENTS" | "AMOUNT">("CLIENTS");

// // // //   const [data, setData] = useState<any[]>([]);
// // // //   const [loading, setLoading] = useState(true);
// // // //   const [selectedState, setSelectedState] = useState<string | null>(null);
// // // //   const [currentPage, setCurrentPage] = useState(1);
// // // //   const clientsPerPage = 4;
// // // //   const [userCompanyId, setUserCompanyId] = useState<number | null>(null);
// // // //   const [selSeller, setSelSeller] = useState("all");
// // // //   const [availableSellers, setAvailableSellers] = useState<any[]>([]);

// // // //   // Estado para el Historial Total
// // // //   const [isTotalHistory, setIsTotalHistory] = useState(false);

// // // //   // Estado del calendario nativo
// // // //   const [date, setDate] = useState<DateRange | undefined>({
// // // //     from: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
// // // //     to: new Date(),
// // // //   });

// // // //   const PRIMARY_BLUE = "#2563eb";

// // // //   useEffect(() => {
// // // //     let ignore = false;
// // // //     if (!isTotalHistory && !date?.from) return;

// // // //     setLoading(true);
// // // //     setData([]);

// // // //     async function fetchData() {
// // // //       try {
// // // //         // CORRECCIÓN DE RUTA: Cambiado de /api/gerente_venta a /api/superadmin/mapsclients
// // // //         let url = `/api/superadmin/mapsclients?country=${currentCountry}`;

// // // //         if (selSeller !== "all") {
// // // //           url += `&vendor_id=${selSeller}`;
// // // //         }

// // // //         if (!isTotalHistory && date?.from) {
// // // //           const start = format(date.from, "yyyy-MM-dd");
// // // //           const end = date.to ? format(date.to, "yyyy-MM-dd") : start;
// // // //           url += `&startDate=${start}&endDate=${end}`;
// // // //         }

// // // //         const res = await fetch(url, { cache: "no-store" });
// // // //         const d = await res.json();

// // // //         if (!ignore) {
// // // //           setData(d.summary || []);
// // // //           setUserCompanyId(d.company_id);
// // // //           setAvailableSellers(d.sellers || []); // Esto llenará tu select de vendedores de inmediato
// // // //           setLoading(false);
// // // //         }
// // // //       } catch (e) {
// // // //         if (!ignore) setLoading(false);
// // // //       }
// // // //     }

// // // //     fetchData();

// // // //     return () => {
// // // //       ignore = true;
// // // //     };
// // // //   }, [currentCountry, selSeller, date, isTotalHistory]);

// // // //   const carteraName = userCompanyId
// // // //     ? COMPANY_NAMES[userCompanyId]
// // // //     : "Venezuela";

// // // //   const normalize = (name: string) => {
// // // //     if (!name) return "";
// // // //     return name
// // // //       .split("(")[0]
// // // //       .trim()
// // // //       .toUpperCase()
// // // //       .normalize("NFD")
// // // //       .replace(/[\u0300-\u036f]/g, "")
// // // //       .replace(/ESTADO /g, "");
// // // //   };

// // // //   // FUNCIÓN AUXILIAR: Suma el valor ('value') de facturación de todos los clientes de un estado
// // // //   const getStateTotalAmount = (stateData: any) => {
// // // //     if (!stateData || !stateData.clients) return 0;
// // // //     return stateData.clients.reduce(
// // // //       (acc: number, c: any) => acc + (c.value || 0),
// // // //       0,
// // // //     );
// // // //   };

// // // //   const getMapColor = (geoName: string) => {
// // // //     const geoKey = normalize(geoName);
// // // //     const stateData = data.find(
// // // //       (d) =>
// // // //         d.state_key === geoKey ||
// // // //         (geoKey === "VARGAS" && d.state_key === "LA GUAIRA"),
// // // //     );

// // // //     if (selectedState && normalize(selectedState) !== geoKey) return "#868585";
// // // //     if (!stateData) return "#868585";

// // // //     // Pestaña CLIENTE seleccionada
// // // //     if (viewType === "CLIENTS") {
// // // //       const count = stateData.count || 0;
// // // //       if (count === 0) return "#868585";
// // // //       if (count >= 500) return PRIMARY_BLUE;
// // // //       if (count >= 100) return "#60a5fa";
// // // //       return "#bfdbfe";
// // // //     }
// // // //     // Pestaña MONTO seleccionada
// // // //     else {
// // // //       const amount = getStateTotalAmount(stateData);
// // // //       if (amount === 0) return "#868585";
// // // //       if (amount >= 50000) return PRIMARY_BLUE; // Facturación Alta ($50k+)
// // // //       if (amount >= 10000) return "#60a5fa"; // Facturación Media ($10k - $49k)
// // // //       return "#bfdbfe"; // Facturación Baja (<$10k)
// // // //     }
// // // //   };

// // // //   const processedClients = useMemo(() => {
// // // //     let clients = selectedState
// // // //       ? data.find((d) => normalize(d.state) === normalize(selectedState))
// // // //           ?.clients || []
// // // //       : data.flatMap((d) => d.clients);
// // // //     return [...clients].sort((a, b) => b.value - a.value);
// // // //   }, [selectedState, data]);

// // // //   const totalPages = Math.ceil(processedClients.length / clientsPerPage);
// // // //   const paginatedClients = processedClients.slice(
// // // //     (currentPage - 1) * clientsPerPage,
// // // //     currentPage * clientsPerPage,
// // // //   );

// // // //   useEffect(() => {
// // // //     setCurrentPage(1);
// // // //   }, [selectedState, currentCountry, viewType]);

// // // //   return (
// // // //     <div className="min-h-screen p-6 lg:p-8 space-y-8 font-sans text-slate-900">
// // // //       <header className="flex flex-col lg:flex-row justify-between items-center gap-6 bg-white p-8 rounded-[2.5rem] shadow-sm border border-white">
// // // //         <div>
// // // //           <Title className="text-4xl font-black text-slate-900 tracking-tighter uppercase italic">
// // // //             {t("title")} <span className="text-blue-600">{t("title2")}</span>
// // // //           </Title>
// // // //         </div>

// // // //         {/* CONTROLES DERECHOS */}
// // // //         <div className="flex flex-col xl:flex-row gap-4 items-center flex-wrap justify-end">
// // // //           {/* VISTA CONTROLES TABS: CLIENTE / MONTO */}
// // // //           <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
// // // //             <button
// // // //               onClick={() => setViewType("CLIENTS")}
// // // //               className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
// // // //                 viewType === "CLIENTS"
// // // //                   ? "bg-white text-blue-600 shadow-sm"
// // // //                   : "text-slate-400 hover:text-slate-600"
// // // //               }`}
// // // //             >
// // // //               Cliente
// // // //             </button>
// // // //             <button
// // // //               onClick={() => setViewType("AMOUNT")}
// // // //               className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
// // // //                 viewType === "AMOUNT"
// // // //                   ? "bg-white text-blue-600 shadow-sm"
// // // //                   : "text-slate-400 hover:text-slate-600"
// // // //               }`}
// // // //             >
// // // //               Monto
// // // //             </button>
// // // //           </div>

// // // //           {/* BOTÓN HISTORIAL TOTAL */}
// // // //           <button
// // // //             onClick={() => setIsTotalHistory(!isTotalHistory)}
// // // //             className={`px-4 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all shadow-sm flex items-center gap-2 border ${
// // // //               isTotalHistory
// // // //                 ? "bg-slate-900 text-white border-slate-900"
// // // //                 : "bg-white text-slate-500 border-slate-200 hover:text-slate-900 hover:border-slate-300"
// // // //             }`}
// // // //           >
// // // //             <History size={14} /> Historial Total
// // // //           </button>

// // // //           {/* SELECTOR DE RANGO DE FECHAS */}
// // // //           <div
// // // //             className={`bg-white border border-slate-200 rounded-2xl p-2.5 flex items-center gap-2 shadow-sm transition-all duration-300 ${isTotalHistory ? "opacity-30 pointer-events-none grayscale" : ""}`}
// // // //           >
// // // //             <CalendarIcon size={16} className="text-slate-400 ml-2" />
// // // //             <input
// // // //               type="date"
// // // //               className="text-xs font-bold text-slate-600 border-none focus:ring-0 bg-transparent cursor-pointer"
// // // //               value={date?.from ? format(date.from, "yyyy-MM-dd") : ""}
// // // //               onChange={(e) =>
// // // //                 setDate((prev) => ({
// // // //                   ...prev,
// // // //                   from: e.target.value ? new Date(e.target.value) : undefined,
// // // //                 }))
// // // //               }
// // // //               disabled={isTotalHistory}
// // // //             />
// // // //             <span className="text-slate-300 font-bold">-</span>
// // // //             <input
// // // //               type="date"
// // // //               className="text-xs font-bold text-slate-600 border-none focus:ring-0 bg-transparent cursor-pointer"
// // // //               value={date?.to ? format(date.to, "yyyy-MM-dd") : ""}
// // // //               onChange={(e) =>
// // // //                 setDate((prev) => ({
// // // //                   ...prev,
// // // //                   to: e.target.value ? new Date(e.target.value) : undefined,
// // // //                 }))
// // // //               }
// // // //               disabled={isTotalHistory}
// // // //             />
// // // //           </div>

// // // //           <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200 gap-4">
// // // //             <select
// // // //               className="bg-white border-none rounded-xl text-[10px] font-bold p-3 outline-none cursor-pointer"
// // // //               value={selSeller}
// // // //               onChange={(e) => setSelSeller(e.target.value)}
// // // //             >
// // // //               <option value="all">Todos los Vendedores</option>
// // // //               {availableSellers.map((s: any) => (
// // // //                 <option key={s.id} value={s.id}>
// // // //                   {s.name}
// // // //                 </option>
// // // //               ))}
// // // //             </select>

// // // //             <div className="w-px bg-slate-200 my-1.5" />

// // // //             <div className="flex gap-1.5">
// // // //               {Object.entries(MAP_CONFIG).map(([code, config]) => (
// // // //                 <button
// // // //                   key={code}
// // // //                   onClick={() => {
// // // //                     setCurrentCountry(code);
// // // //                     setSelectedState(null);
// // // //                   }}
// // // //                   className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
// // // //                     currentCountry === code
// // // //                       ? "bg-white text-blue-600 shadow-sm"
// // // //                       : "text-slate-400 hover:text-slate-600"
// // // //                   }`}
// // // //                 >
// // // //                   {config.name}
// // // //                 </button>
// // // //               ))}
// // // //             </div>
// // // //           </div>
// // // //         </div>
// // // //       </header>

// // // //       <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
// // // //         {/* MAPA GRANDE Y CENTRADO */}
// // // //         <div className="lg:col-span-8">
// // // //           <Card className="rounded-[3rem] border-none shadow-xl p-0 bg-white overflow-hidden h-[750px] flex flex-col relative">
// // // //             <div className="p-8 border-b border-slate-50 flex justify-between items-center z-10">
// // // //               <div className="flex items-center gap-3">
// // // //                 <div className="p-2 bg-blue-50 rounded-xl text-blue-600">
// // // //                   <Globe size={20} />
// // // //                 </div>
// // // //                 <Title className="text-xl font-black text-slate-800 uppercase italic flex items-center gap-2">
// // // //                   {t("map_of", { country: MAP_CONFIG[currentCountry].name })}
// // // //                   <span className="text-xs bg-slate-100 text-slate-500 rounded-lg px-2.5 py-1 font-bold normal-case italic">
// // // //                     por{" "}
// // // //                     {viewType === "CLIENTS" ? "clientes" : "monto facturado"}
// // // //                   </span>
// // // //                 </Title>
// // // //               </div>
// // // //               {selectedState && (
// // // //                 <button
// // // //                   onClick={() => setSelectedState(null)}
// // // //                   className="group flex items-center gap-2 bg-red-50 text-red-600 px-5 py-2.5 rounded-2xl text-xs font-black uppercase shadow-sm"
// // // //                 >
// // // //                   <FilterX size={14} /> {t("reset_map")}
// // // //                 </button>
// // // //               )}
// // // //             </div>

// // // //             <div className="flex-1 bg-[#fcfcfc] relative flex items-center justify-center overflow-hidden">
// // // //               {loading ? (
// // // //                 <Text className="font-black text-slate-300 animate-pulse uppercase text-[10px]">
// // // //                   {t("loading")}
// // // //                 </Text>
// // // //               ) : (
// // // //                 <ComposableMap
// // // //                   projection="geoMercator"
// // // //                   projectionConfig={{
// // // //                     scale: MAP_CONFIG[currentCountry].scale,
// // // //                     center: MAP_CONFIG[currentCountry].center,
// // // //                   }}
// // // //                   className="w-full h-full"
// // // //                 >
// // // //                   <Geographies geography={MAP_CONFIG[currentCountry].geoUrl}>
// // // //                     {({ geographies }) =>
// // // //                       geographies.map((geo) => {
// // // //                         const geoName =
// // // //                           geo.properties.name ||
// // // //                           geo.properties.NAME_1 ||
// // // //                           geo.properties.NAME;
// // // //                         const fillColor = getMapColor(geoName);
// // // //                         const isSelected =
// // // //                           selectedState &&
// // // //                           normalize(geoName) === normalize(selectedState);
// // // //                         return (
// // // //                           <Geography
// // // //                             key={geo.rsmKey}
// // // //                             geography={geo}
// // // //                             onClick={() => {
// // // //                               const key = normalize(geoName);
// // // //                               const sData = data.find(
// // // //                                 (d) =>
// // // //                                   d.state_key === key ||
// // // //                                   (key === "VARGAS" &&
// // // //                                     d.state_key === "LA GUAIRA"),
// // // //                               );
// // // //                               if (sData) setSelectedState(sData.state);
// // // //                             }}
// // // //                             style={{
// // // //                               default: {
// // // //                                 fill: fillColor,
// // // //                                 outline: "none",
// // // //                                 transition: "all 0.4s ease",
// // // //                               },
// // // //                               hover: {
// // // //                                 fill: PRIMARY_BLUE,
// // // //                                 outline: "none",
// // // //                                 cursor: "pointer",
// // // //                                 opacity: 0.9,
// // // //                               },
// // // //                             }}
// // // //                             className={`stroke-white ${isSelected ? "stroke-[3px] z-20" : "stroke-[1.2px]"}`}
// // // //                           />
// // // //                         );
// // // //                       })
// // // //                     }
// // // //                   </Geographies>
// // // //                 </ComposableMap>
// // // //               )}

// // // //               {/* LEYENDA DINÁMICA SEGÚN VISTA */}
// // // //               <div className="absolute top-6 right-6 bg-white/90 backdrop-blur-xl p-6 rounded-[2.5rem] border border-white shadow-2xl space-y-4 z-10">
// // // //                 <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
// // // //                   <Info size={16} className="text-blue-600" />
// // // //                   <Text className="text-[10px] font-black uppercase text-slate-500 tracking-widest">
// // // //                     Métricas por {viewType === "CLIENTS" ? "Clientes" : "Monto"}
// // // //                   </Text>
// // // //                 </div>
// // // //                 <div className="space-y-3">
// // // //                   {(viewType === "CLIENTS"
// // // //                     ? [
// // // //                         {
// // // //                           label: "Alta Densidad",
// // // //                           range: "500+",
// // // //                           color: PRIMARY_BLUE,
// // // //                         },
// // // //                         {
// // // //                           label: "Media Densidad",
// // // //                           range: "100-499",
// // // //                           color: "#60a5fa",
// // // //                         },
// // // //                         {
// // // //                           label: "Baja Densidad",
// // // //                           range: "1-99",
// // // //                           color: "#bfdbfe",
// // // //                         },
// // // //                         {
// // // //                           label: "Sin Clientes",
// // // //                           range: "0",
// // // //                           color: "#868585",
// // // //                           border: true,
// // // //                         },
// // // //                       ]
// // // //                     : [
// // // //                         {
// // // //                           label: "Facturación Alta",
// // // //                           range: "$50,000+",
// // // //                           color: PRIMARY_BLUE,
// // // //                         },
// // // //                         {
// // // //                           label: "Facturación Media",
// // // //                           range: "$10,000 - $49,999",
// // // //                           color: "#60a5fa",
// // // //                         },
// // // //                         {
// // // //                           label: "Facturación Baja",
// // // //                           range: "Menos de $10,000",
// // // //                           color: "#bfdbfe",
// // // //                         },
// // // //                         {
// // // //                           label: "Sin Facturación",
// // // //                           range: "$0",
// // // //                           color: "#868585",
// // // //                           border: true,
// // // //                         },
// // // //                       ]
// // // //                   ).map((item, i) => (
// // // //                     <div key={i} className="flex items-center gap-3">
// // // //                       <div
// // // //                         className={`h-3 w-3 rounded-full ${item.border ? "border border-slate-200" : ""}`}
// // // //                         style={{ backgroundColor: item.color }}
// // // //                       />
// // // //                       <div className="flex flex-col">
// // // //                         <span className="text-[10px] font-black text-slate-700 uppercase">
// // // //                           {item.label}
// // // //                         </span>
// // // //                         <span className="text-[9px] font-bold text-slate-400">
// // // //                           {item.range}
// // // //                         </span>
// // // //                       </div>
// // // //                     </div>
// // // //                   ))}
// // // //                 </div>
// // // //               </div>
// // // //             </div>
// // // //           </Card>
// // // //         </div>

// // // //         {/* SIDEBAR */}
// // // //         <aside className="lg:col-span-4 space-y-8">
// // // //           <Card className="rounded-[2.5rem] border-none shadow-xl bg-slate-900 text-white p-10 overflow-hidden relative">
// // // //             <Building2 className="absolute -right-12 -bottom-12 text-white/5 w-64 h-64 rotate-12" />
// // // //             <Text
// // // //               className={`text-blue-400 font-black text-xs uppercase tracking-[0.3em] mb-3 ${loading ? "animate-pulse text-slate-400" : ""}`}
// // // //             >
// // // //               {viewType === "CLIENTS"
// // // //                 ? t("total_portfolio")
// // // //                 : "TOTAL FACTURADO"}
// // // //             </Text>
// // // //             <div className="text-5xl font-black tracking-tighter mb-4 tabular-nums truncate">
// // // //               {viewType === "CLIENTS"
// // // //                 ? data.reduce((acc, curr) => acc + curr.count, 0)
// // // //                 : `$${data.reduce((acc, curr) => acc + getStateTotalAmount(curr), 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
// // // //             </div>
// // // //             <div className="flex items-center gap-2 text-emerald-400 font-bold text-[10px] uppercase bg-emerald-500/10 w-fit px-4 py-1.5 rounded-full border border-emerald-500/20">
// // // //               <TrendingUp size={14} />
// // // //               {carteraName}
// // // //             </div>
// // // //           </Card>

// // // //           <Card className="rounded-[2.5rem] border-none shadow-xl bg-white p-8 h-[420px] flex flex-col">
// // // //             <Title className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] mb-6 italic">
// // // //               {viewType === "CLIENTS"
// // // //                 ? t("penetration_ranking")
// // // //                 : "RANKING DE FACTURACIÓN"}
// // // //             </Title>

// // // //             {loading ? (
// // // //               <div className="flex-1 flex items-center justify-center text-slate-300 font-bold animate-pulse uppercase text-[10px]">
// // // //                 {t("loading")}
// // // //               </div>
// // // //             ) : (
// // // //               <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar flex-1">
// // // //                 {data
// // // //                   .sort((a, b) =>
// // // //                     viewType === "CLIENTS"
// // // //                       ? b.count - a.count
// // // //                       : getStateTotalAmount(b) - getStateTotalAmount(a),
// // // //                   )
// // // //                   .map((state) => {
// // // //                     const isActive = selectedState === state.state;
// // // //                     return (
// // // //                       <motion.div
// // // //                         key={state.state}
// // // //                         onClick={() => setSelectedState(state.state)}
// // // //                         className={`flex justify-between items-center p-4 rounded-2xl cursor-pointer transition-all border ${
// // // //                           isActive
// // // //                             ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200"
// // // //                             : "bg-slate-50 border-transparent hover:border-blue-100"
// // // //                         }`}
// // // //                       >
// // // //                         <span className="text-[10px] font-black tracking-widest uppercase truncate max-w-[150px]">
// // // //                           {state.state}
// // // //                         </span>
// // // //                         <Badge
// // // //                           className={`rounded-lg font-mono text-[10px] px-3 border-none ${
// // // //                             isActive
// // // //                               ? "bg-white text-blue-600"
// // // //                               : "bg-blue-600 text-white"
// // // //                           }`}
// // // //                         >
// // // //                           {viewType === "CLIENTS"
// // // //                             ? state.count
// // // //                             : `$${getStateTotalAmount(state).toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
// // // //                         </Badge>
// // // //                       </motion.div>
// // // //                     );
// // // //                   })}
// // // //               </div>
// // // //             )}
// // // //           </Card>
// // // //         </aside>

// // // //         {/* TABLA PAGINADA */}
// // // //         <div className="lg:col-span-12">
// // // //           <Card className="rounded-[3.5rem] border-none shadow-2xl p-0 overflow-hidden bg-white">
// // // //             <div className="p-12 border-b border-slate-50 flex flex-col md:flex-row justify-between items-center gap-6">
// // // //               <div>
// // // //                 <Title className="text-3xl font-black text-slate-900 tracking-tighter italic uppercase underline decoration-blue-600 decoration-4">
// // // //                   {t("strategic_directory")}
// // // //                 </Title>
// // // //                 <Text className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.2em] mt-2 italic">
// // // //                   {selectedState
// // // //                     ? t("region", { region: selectedState })
// // // //                     : t("country", {
// // // //                         country: MAP_CONFIG[currentCountry].name,
// // // //                       })}
// // // //                 </Text>
// // // //               </div>

// // // //               <div className="flex items-center gap-4 bg-slate-100/50 p-2 rounded-2xl border border-slate-200/50">
// // // //                 <button
// // // //                   disabled={currentPage === 1}
// // // //                   onClick={() => setCurrentPage((p) => p - 1)}
// // // //                   className="p-2.5 rounded-xl bg-white shadow-sm text-slate-400 hover:text-blue-600 disabled:opacity-30"
// // // //                 >
// // // //                   <ChevronLeft size={20} />
// // // //                 </button>
// // // //                 <div className="flex items-center gap-2 px-4 font-black text-xs text-blue-600">
// // // //                   {currentPage} <span className="text-slate-300">/</span>{" "}
// // // //                   {totalPages || 1}
// // // //                 </div>
// // // //                 <button
// // // //                   disabled={currentPage === totalPages || totalPages === 0}
// // // //                   onClick={() => setCurrentPage((p) => p + 1)}
// // // //                   className="p-2.5 rounded-xl bg-white shadow-sm text-slate-400 hover:text-blue-600 disabled:opacity-30"
// // // //                 >
// // // //                   <ChevronRight size={20} />
// // // //                 </button>
// // // //               </div>
// // // //             </div>

// // // //             <div className="overflow-x-auto">
// // // //               <Table>
// // // //                 <TableHead className="bg-slate-50/50">
// // // //                   <TableRow>
// // // //                     <TableHeaderCell className="text-[11px] font-black uppercase text-slate-400 tracking-widest py-8 pl-12 w-20 text-center">
// // // //                       #
// // // //                     </TableHeaderCell>
// // // //                     <TableHeaderCell className="text-[11px] font-black uppercase text-slate-400 tracking-widest py-8 text-center">
// // // //                       {t("social_reason")}
// // // //                     </TableHeaderCell>
// // // //                     <TableHeaderCell className="text-[11px] font-black uppercase text-slate-400 tracking-widest text-center">
// // // //                       RIF / VAT
// // // //                     </TableHeaderCell>
// // // //                     <TableHeaderCell className="text-[11px] font-black uppercase text-slate-400 tracking-widest text-center pr-12">
// // // //                       {isTotalHistory
// // // //                         ? "Facturación Histórica"
// // // //                         : "Facturación del Periodo"}
// // // //                     </TableHeaderCell>
// // // //                   </TableRow>
// // // //                 </TableHead>
// // // //                 <TableBody>
// // // //                   {paginatedClients.map((client: any, idx: number) => {
// // // //                     const absIdx = (currentPage - 1) * clientsPerPage + idx + 1;
// // // //                     return (
// // // //                       <motion.tr
// // // //                         key={client.rif + absIdx}
// // // //                         initial={{ opacity: 0 }}
// // // //                         animate={{ opacity: 1 }}
// // // //                         className="group hover:bg-blue-50/40 border-b border-slate-50 last:border-0 transition-all"
// // // //                       >
// // // //                         <TableCell className="pl-12 py-8">
// // // //                           <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-slate-100 text-slate-400 font-black text-[10px] group-hover:bg-blue-600 group-hover:text-white transition-all shadow-inner">
// // // //                             {absIdx}
// // // //                           </div>
// // // //                         </TableCell>
// // // //                         <TableCell className="font-bold text-slate-800 uppercase tracking-tight text-xs text-center">
// // // //                           {client.name}
// // // //                         </TableCell>
// // // //                         <TableCell className="text-[11px] font-mono font-bold text-slate-400 tracking-widest text-center">
// // // //                           {client.rif}
// // // //                         </TableCell>
// // // //                         <TableCell className="text-center pr-12 font-black text-blue-600 text-sm tabular-nums">
// // // //                           ${" "}
// // // //                           {client.value.toLocaleString("en-US", {
// // // //                             minimumFractionDigits: 2,
// // // //                           })}
// // // //                         </TableCell>
// // // //                       </motion.tr>
// // // //                     );
// // // //                   })}
// // // //                 </TableBody>
// // // //               </Table>
// // // //             </div>
// // // //           </Card>
// // // //         </div>
// // // //       </div>
// // // //     </div>
// // // //   );
// // // // }
// // // "use client";

// // // import {
// // //   Badge,
// // //   Card,
// // //   Table,
// // //   TableBody,
// // //   TableCell,
// // //   TableHead,
// // //   TableHeaderCell,
// // //   TableRow,
// // //   Text,
// // //   Title,
// // // } from "@tremor/react";
// // // import { format } from "date-fns";
// // // import { AnimatePresence, motion } from "framer-motion";
// // // import {
// // //   Building2,
// // //   Calendar as CalendarIcon,
// // //   ChevronLeft,
// // //   ChevronRight,
// // //   CreditCard,
// // //   FilterX,
// // //   Globe,
// // //   History,
// // //   Info,
// // //   MapPin,
// // //   Receipt,
// // //   TrendingUp,
// // //   User,
// // //   X,
// // // } from "lucide-react";
// // // import { useTranslations } from "next-intl";
// // // import { useEffect, useMemo, useState } from "react";
// // // import { DateRange } from "react-day-picker";
// // // import { ComposableMap, Geographies, Geography } from "react-simple-maps";

// // // const COMPANY_NAMES: Record<number, string> = {
// // //   9: "Valencia",
// // //   10: "Caracas",
// // //   7: "Panama",
// // // };

// // // const MAP_CONFIG: Record<string, any> = {
// // //   VE: {
// // //     name: "venezuela",
// // //     geoUrl:
// // //       "https://raw.githubusercontent.com/apache/superset/master/superset-frontend/plugins/legacy-plugin-chart-country-map/src/countries/venezuela.geojson",
// // //     scale: 2800,
// // //     center: [-66.3, 6.6],
// // //   },
// // //   PA: {
// // //     name: "panama",
// // //     geoUrl:
// // //       "https://raw.githubusercontent.com/apache/superset/master/superset-frontend/plugins/legacy-plugin-chart-country-map/src/countries/panama.geojson",
// // //     scale: 8000,
// // //     center: [-80, 8.5],
// // //   },
// // // };

// // // export default function MapsClientsPage() {
// // //   const t = useTranslations("mapsClientsPage");
// // //   const [currentCountry, setCurrentCountry] = useState("VE");

// // //   // CONTROL DE VISTA: "Cliente" o "Monto"
// // //   const [viewType, setViewType] = useState<"CLIENTS" | "AMOUNT">("CLIENTS");

// // //   const [data, setData] = useState<any[]>([]);
// // //   const [loading, setLoading] = useState(true);
// // //   const [selectedState, setSelectedState] = useState<string | null>(null);
// // //   const [currentPage, setCurrentPage] = useState(1);
// // //   const clientsPerPage = 4;
// // //   const [userCompanyId, setUserCompanyId] = useState<number | null>(null);
// // //   const [selSeller, setSelSeller] = useState("all");
// // //   const [availableSellers, setAvailableSellers] = useState<any[]>([]);

// // //   // NUEVO ESTADO: Controla el cliente seleccionado para el Modal de detalles
// // //   const [selectedClient, setSelectedClient] = useState<any | null>(null);

// // //   // Estado para el Historial Total
// // //   const [isTotalHistory, setIsTotalHistory] = useState(false);

// // //   // Estado del calendario nativo
// // //   const [date, setDate] = useState<DateRange | undefined>({
// // //     from: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
// // //     to: new Date(),
// // //   });

// // //   const PRIMARY_BLUE = "#2563eb";

// // //   useEffect(() => {
// // //     let ignore = false;
// // //     if (!isTotalHistory && !date?.from) return;

// // //     setLoading(true);
// // //     setData([]);

// // //     async function fetchData() {
// // //       try {
// // //         let url = `/api/superadmin/mapsclients?country=${currentCountry}`;

// // //         if (selSeller !== "all") {
// // //           url += `&vendor_id=${selSeller}`;
// // //         }

// // //         if (!isTotalHistory && date?.from) {
// // //           const start = format(date.from, "yyyy-MM-dd");
// // //           const end = date.to ? format(date.to, "yyyy-MM-dd") : start;
// // //           url += `&startDate=${start}&endDate=${end}`;
// // //         }

// // //         const res = await fetch(url, { cache: "no-store" });
// // //         const d = await res.json();

// // //         if (!ignore) {
// // //           setData(d.summary || []);
// // //           setUserCompanyId(d.company_id);
// // //           setAvailableSellers(d.sellers || []);
// // //           setLoading(false);
// // //         }
// // //       } catch (e) {
// // //         if (!ignore) setLoading(false);
// // //       }
// // //     }

// // //     fetchData();

// // //     return () => {
// // //       ignore = true;
// // //     };
// // //   }, [currentCountry, selSeller, date, isTotalHistory]);

// // //   const carteraName = userCompanyId
// // //     ? COMPANY_NAMES[userCompanyId]
// // //     : "Venezuela";

// // //   const normalize = (name: string) => {
// // //     if (!name) return "";
// // //     return name
// // //       .split("(")[0]
// // //       .trim()
// // //       .toUpperCase()
// // //       .normalize("NFD")
// // //       .replace(/[\u0300-\u036f]/g, "")
// // //       .replace(/ESTADO /g, "");
// // //   };

// // //   const getStateTotalAmount = (stateData: any) => {
// // //     if (!stateData || !stateData.clients) return 0;
// // //     return stateData.clients.reduce(
// // //       (acc: number, c: any) => acc + (c.value || 0),
// // //       0,
// // //     );
// // //   };

// // //   const getMapColor = (geoName: string) => {
// // //     const geoKey = normalize(geoName);
// // //     const stateData = data.find(
// // //       (d) =>
// // //         d.state_key === geoKey ||
// // //         (geoKey === "VARGAS" && d.state_key === "LA GUAIRA"),
// // //     );

// // //     if (selectedState && normalize(selectedState) !== geoKey) return "#868585";
// // //     if (!stateData) return "#868585";

// // //     if (viewType === "CLIENTS") {
// // //       const count = stateData.count || 0;
// // //       if (count === 0) return "#868585";
// // //       if (count >= 500) return PRIMARY_BLUE;
// // //       if (count >= 100) return "#60a5fa";
// // //       return "#bfdbfe";
// // //     } else {
// // //       const amount = getStateTotalAmount(stateData);
// // //       if (amount === 0) return "#868585";
// // //       if (amount >= 50000) return PRIMARY_BLUE;
// // //       if (amount >= 10000) return "#60a5fa";
// // //       return "#bfdbfe";
// // //     }
// // //   };

// // //   const processedClients = useMemo(() => {
// // //     let clients = selectedState
// // //       ? data.find((d) => normalize(d.state) === normalize(selectedState))
// // //           ?.clients || []
// // //       : data.flatMap((d) => d.clients);
// // //     return [...clients].sort((a, b) => b.value - a.value);
// // //   }, [selectedState, data]);

// // //   const totalPages = Math.ceil(processedClients.length / clientsPerPage);
// // //   const paginatedClients = processedClients.slice(
// // //     (currentPage - 1) * clientsPerPage,
// // //     currentPage * clientsPerPage,
// // //   );

// // //   useEffect(() => {
// // //     setCurrentPage(1);
// // //   }, [selectedState, currentCountry, viewType]);

// // //   return (
// // //     <div className="min-h-screen p-6 lg:p-8 space-y-8 font-sans text-slate-900 relative">
// // //       {/* HEADER DINÁMICO */}
// // //       <header className="flex flex-col lg:flex-row justify-between items-center gap-6 bg-white p-8 rounded-[2.5rem] shadow-sm border border-white">
// // //         <div>
// // //           <Title className="text-4xl font-black text-slate-900 tracking-tighter uppercase italic">
// // //             {t("title")} <span className="text-blue-600">{t("title2")}</span>
// // //           </Title>
// // //         </div>

// // //         <div className="flex flex-col xl:flex-row gap-4 items-center flex-wrap justify-end">
// // //           <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
// // //             <button
// // //               onClick={() => setViewType("CLIENTS")}
// // //               className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewType === "CLIENTS" ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
// // //             >
// // //               Cliente
// // //             </button>
// // //             <button
// // //               onClick={() => setViewType("AMOUNT")}
// // //               className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewType === "AMOUNT" ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
// // //             >
// // //               Monto
// // //             </button>
// // //           </div>

// // //           <button
// // //             onClick={() => setIsTotalHistory(!isTotalHistory)}
// // //             className={`px-4 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all shadow-sm flex items-center gap-2 border ${isTotalHistory ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-500 border-slate-200 hover:text-slate-900 hover:border-slate-300"}`}
// // //           >
// // //             <History size={14} /> Historial Total
// // //           </button>

// // //           <div
// // //             className={`bg-white border border-slate-200 rounded-2xl p-2.5 flex items-center gap-2 shadow-sm transition-all duration-300 ${isTotalHistory ? "opacity-30 pointer-events-none grayscale" : ""}`}
// // //           >
// // //             <CalendarIcon size={16} className="text-slate-400 ml-2" />
// // //             <input
// // //               type="date"
// // //               className="text-xs font-bold text-slate-600 border-none focus:ring-0 bg-transparent cursor-pointer"
// // //               value={date?.from ? format(date.from, "yyyy-MM-dd") : ""}
// // //               onChange={(e) =>
// // //                 setDate((prev) => ({
// // //                   ...prev,
// // //                   from: e.target.value ? new Date(e.target.value) : undefined,
// // //                 }))
// // //               }
// // //               disabled={isTotalHistory}
// // //             />
// // //             <span className="text-slate-300 font-bold">-</span>
// // //             <input
// // //               type="date"
// // //               className="text-xs font-bold text-slate-600 border-none focus:ring-0 bg-transparent cursor-pointer"
// // //               value={date?.to ? format(date.to, "yyyy-MM-dd") : ""}
// // //               onChange={(e) =>
// // //                 setDate((prev) => ({
// // //                   ...prev,
// // //                   to: e.target.value ? new Date(e.target.value) : undefined,
// // //                 }))
// // //               }
// // //               disabled={isTotalHistory}
// // //             />
// // //           </div>

// // //           <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200 gap-4">
// // //             <select
// // //               className="bg-white border-none rounded-xl text-[10px] font-bold p-3 outline-none cursor-pointer"
// // //               value={selSeller}
// // //               onChange={(e) => setSelSeller(e.target.value)}
// // //             >
// // //               <option value="all">Todos los Vendedores</option>
// // //               {availableSellers.map((s: any) => (
// // //                 <option key={s.id} value={s.id}>
// // //                   {s.name}
// // //                 </option>
// // //               ))}
// // //             </select>

// // //             <div className="w-px bg-slate-200 my-1.5" />

// // //             <div className="flex gap-1.5">
// // //               {Object.entries(MAP_CONFIG).map(([code, config]) => (
// // //                 <button
// // //                   key={code}
// // //                   onClick={() => {
// // //                     setCurrentCountry(code);
// // //                     setSelectedState(null);
// // //                   }}
// // //                   className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${currentCountry === code ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
// // //                 >
// // //                   {config.name}
// // //                 </button>
// // //               ))}
// // //             </div>
// // //           </div>
// // //         </div>
// // //       </header>

// // //       <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
// // //         {/* MAPA */}
// // //         <div className="lg:col-span-8">
// // //           <Card className="rounded-[3rem] border-none shadow-xl p-0 bg-white overflow-hidden h-[750px] flex flex-col relative">
// // //             <div className="p-8 border-b border-slate-50 flex justify-between items-center z-10">
// // //               <div className="flex items-center gap-3">
// // //                 <div className="p-2 bg-blue-50 rounded-xl text-blue-600">
// // //                   <Globe size={20} />
// // //                 </div>
// // //                 <Title className="text-xl font-black text-slate-800 uppercase italic flex items-center gap-2">
// // //                   {t("map_of", { country: MAP_CONFIG[currentCountry].name })}
// // //                   <span className="text-xs bg-slate-100 text-slate-500 rounded-lg px-2.5 py-1 font-bold normal-case italic">
// // //                     por{" "}
// // //                     {viewType === "CLIENTS" ? "clientes" : "monto facturado"}
// // //                   </span>
// // //                 </Title>
// // //               </div>
// // //               {selectedState && (
// // //                 <button
// // //                   onClick={() => setSelectedState(null)}
// // //                   className="group flex items-center gap-2 bg-red-50 text-red-600 px-5 py-2.5 rounded-2xl text-xs font-black uppercase shadow-sm"
// // //                 >
// // //                   <FilterX size={14} /> {t("reset_map")}
// // //                 </button>
// // //               )}
// // //             </div>

// // //             <div className="flex-1 bg-[#fcfcfc] relative flex items-center justify-center overflow-hidden">
// // //               {loading ? (
// // //                 <Text className="font-black text-slate-300 animate-pulse uppercase text-[10px]">
// // //                   {t("loading")}
// // //                 </Text>
// // //               ) : (
// // //                 <ComposableMap
// // //                   projection="geoMercator"
// // //                   projectionConfig={{
// // //                     scale: MAP_CONFIG[currentCountry].scale,
// // //                     center: MAP_CONFIG[currentCountry].center,
// // //                   }}
// // //                   className="w-full h-full"
// // //                 >
// // //                   <Geographies geography={MAP_CONFIG[currentCountry].geoUrl}>
// // //                     {({ geographies }) =>
// // //                       geographies.map((geo) => {
// // //                         const geoName =
// // //                           geo.properties.name ||
// // //                           geo.properties.NAME_1 ||
// // //                           geo.properties.NAME;
// // //                         const fillColor = getMapColor(geoName);
// // //                         const isSelected =
// // //                           selectedState &&
// // //                           normalize(geoName) === normalize(selectedState);
// // //                         return (
// // //                           <Geography
// // //                             key={geo.rsmKey}
// // //                             geography={geo}
// // //                             onClick={() => {
// // //                               const key = normalize(geoName);
// // //                               const sData = data.find(
// // //                                 (d) =>
// // //                                   d.state_key === key ||
// // //                                   (key === "VARGAS" &&
// // //                                     d.state_key === "LA GUAIRA"),
// // //                               );
// // //                               if (sData) setSelectedState(sData.state);
// // //                             }}
// // //                             style={{
// // //                               default: {
// // //                                 fill: fillColor,
// // //                                 outline: "none",
// // //                                 transition: "all 0.4s ease",
// // //                               },
// // //                               hover: {
// // //                                 fill: PRIMARY_BLUE,
// // //                                 outline: "none",
// // //                                 cursor: "pointer",
// // //                                 opacity: 0.9,
// // //                               },
// // //                             }}
// // //                             className={`stroke-white ${isSelected ? "stroke-[3px] z-20" : "stroke-[1.2px]"}`}
// // //                           />
// // //                         );
// // //                       })
// // //                     }
// // //                   </Geographies>
// // //                 </ComposableMap>
// // //               )}

// // //               {/* LEYENDA */}
// // //               <div className="absolute top-6 right-6 bg-white/90 backdrop-blur-xl p-6 rounded-[2.5rem] border border-white shadow-2xl space-y-4 z-10">
// // //                 <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
// // //                   <Info size={16} className="text-blue-600" />
// // //                   <Text className="text-[10px] font-black uppercase text-slate-500 tracking-widest">
// // //                     Métricas por {viewType === "CLIENTS" ? "Clientes" : "Monto"}
// // //                   </Text>
// // //                 </div>
// // //                 <div className="space-y-3">
// // //                   {(viewType === "CLIENTS"
// // //                     ? [
// // //                         {
// // //                           label: "Alta Densidad",
// // //                           range: "500+",
// // //                           color: PRIMARY_BLUE,
// // //                         },
// // //                         {
// // //                           label: "Media Densidad",
// // //                           range: "100-499",
// // //                           color: "#60a5fa",
// // //                         },
// // //                         {
// // //                           label: "Baja Densidad",
// // //                           range: "1-99",
// // //                           color: "#bfdbfe",
// // //                         },
// // //                         {
// // //                           label: "Sin Clientes",
// // //                           range: "0",
// // //                           color: "#868585",
// // //                           border: true,
// // //                         },
// // //                       ]
// // //                     : [
// // //                         {
// // //                           label: "Facturación Alta",
// // //                           range: "$50,000+",
// // //                           color: PRIMARY_BLUE,
// // //                         },
// // //                         {
// // //                           label: "Facturación Media",
// // //                           range: "$10,000 - $49,999",
// // //                           color: "#60a5fa",
// // //                         },
// // //                         {
// // //                           label: "Facturación Baja",
// // //                           range: "Menos de $10,000",
// // //                           color: "#bfdbfe",
// // //                         },
// // //                         {
// // //                           label: "Sin Facturación",
// // //                           range: "$0",
// // //                           color: "#868585",
// // //                           border: true,
// // //                         },
// // //                       ]
// // //                   ).map((item, i) => (
// // //                     <div key={i} className="flex items-center gap-3">
// // //                       <div
// // //                         className={`h-3 w-3 rounded-full ${item.border ? "border border-slate-200" : ""}`}
// // //                         style={{ backgroundColor: item.color }}
// // //                       />
// // //                       <div className="flex flex-col">
// // //                         <span className="text-[10px] font-black text-slate-700 uppercase">
// // //                           {item.label}
// // //                         </span>
// // //                         <span className="text-[9px] font-bold text-slate-400">
// // //                           {item.range}
// // //                         </span>
// // //                       </div>
// // //                     </div>
// // //                   ))}
// // //                 </div>
// // //               </div>
// // //             </div>
// // //           </Card>
// // //         </div>

// // //         {/* SIDEBAR */}
// // //         <aside className="lg:col-span-4 space-y-8">
// // //           <Card className="rounded-[2.5rem] border-none shadow-xl bg-slate-900 text-white p-10 overflow-hidden relative">
// // //             <Building2 className="absolute -right-12 -bottom-12 text-white/5 w-64 h-64 rotate-12" />
// // //             <Text
// // //               className={`text-blue-400 font-black text-xs uppercase tracking-[0.3em] mb-3 ${loading ? "animate-pulse text-slate-400" : ""}`}
// // //             >
// // //               {viewType === "CLIENTS"
// // //                 ? t("total_portfolio")
// // //                 : "TOTAL FACTURADO"}
// // //             </Text>
// // //             <div className="text-5xl font-black tracking-tighter mb-4 tabular-nums truncate">
// // //               {viewType === "CLIENTS"
// // //                 ? data.reduce((acc, curr) => acc + curr.count, 0)
// // //                 : `$${data.reduce((acc, curr) => acc + getStateTotalAmount(curr), 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
// // //             </div>
// // //             <div className="flex items-center gap-2 text-emerald-400 font-bold text-[10px] uppercase bg-emerald-500/10 w-fit px-4 py-1.5 rounded-full border border-emerald-500/20">
// // //               <TrendingUp size={14} />
// // //               {carteraName}
// // //             </div>
// // //           </Card>

// // //           <Card className="rounded-[2.5rem] border-none shadow-xl bg-white p-8 h-[420px] flex flex-col">
// // //             <Title className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] mb-6 italic">
// // //               {viewType === "CLIENTS"
// // //                 ? t("penetration_ranking")
// // //                 : "RANKING DE FACTURACIÓN"}
// // //             </Title>

// // //             {loading ? (
// // //               <div className="flex-1 flex items-center justify-center text-slate-300 font-bold animate-pulse uppercase text-[10px]">
// // //                 {t("loading")}
// // //               </div>
// // //             ) : (
// // //               <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar flex-1">
// // //                 {data
// // //                   .sort((a, b) =>
// // //                     viewType === "CLIENTS"
// // //                       ? b.count - a.count
// // //                       : getStateTotalAmount(b) - getStateTotalAmount(a),
// // //                   )
// // //                   .map((state) => {
// // //                     const isActive = selectedState === state.state;
// // //                     return (
// // //                       <motion.div
// // //                         key={state.state}
// // //                         onClick={() => setSelectedState(state.state)}
// // //                         className={`flex justify-between items-center p-4 rounded-2xl cursor-pointer transition-all border ${isActive ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200" : "bg-slate-50 border-transparent hover:border-blue-100"}`}
// // //                       >
// // //                         <span className="text-[10px] font-black tracking-widest uppercase truncate max-w-[150px]">
// // //                           {state.state}
// // //                         </span>
// // //                         <Badge
// // //                           className={`rounded-lg font-mono text-[10px] px-3 border-none ${isActive ? "bg-white text-blue-600" : "bg-blue-600 text-white"}`}
// // //                         >
// // //                           {viewType === "CLIENTS"
// // //                             ? state.count
// // //                             : `$${getStateTotalAmount(state).toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
// // //                         </Badge>
// // //                       </motion.div>
// // //                     );
// // //                   })}
// // //               </div>
// // //             )}
// // //           </Card>
// // //         </aside>

// // //         {/* TABLA DEL DIRECTORIO ESTRATÉGICO CON APERTURA DE MODAL */}
// // //         <div className="lg:col-span-12">
// // //           <Card className="rounded-[3.5rem] border-none shadow-2xl p-0 overflow-hidden bg-white">
// // //             <div className="p-12 border-b border-slate-50 flex flex-col md:flex-row justify-between items-center gap-6">
// // //               <div>
// // //                 <Title className="text-3xl font-black text-slate-900 tracking-tighter italic uppercase underline decoration-blue-600 decoration-4">
// // //                   {t("strategic_directory")}
// // //                 </Title>
// // //                 <Text className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.2em] mt-2 italic">
// // //                   {selectedState
// // //                     ? t("region", { region: selectedState })
// // //                     : t("country", {
// // //                         country: MAP_CONFIG[currentCountry].name,
// // //                       })}
// // //                 </Text>
// // //               </div>

// // //               <div className="flex items-center gap-4 bg-slate-100/50 p-2 rounded-2xl border border-slate-200/50">
// // //                 <button
// // //                   disabled={currentPage === 1}
// // //                   onClick={() => setCurrentPage((p) => p - 1)}
// // //                   className="p-2.5 rounded-xl bg-white shadow-sm text-slate-400 hover:text-blue-600 disabled:opacity-30"
// // //                 >
// // //                   <ChevronLeft size={20} />
// // //                 </button>
// // //                 <div className="flex items-center gap-2 px-4 font-black text-xs text-blue-600">
// // //                   {currentPage} <span className="text-slate-300">/</span>{" "}
// // //                   {totalPages || 1}
// // //                 </div>
// // //                 <button
// // //                   disabled={currentPage === totalPages || totalPages === 0}
// // //                   onClick={() => setCurrentPage((p) => p + 1)}
// // //                   className="p-2.5 rounded-xl bg-white shadow-sm text-slate-400 hover:text-blue-600 disabled:opacity-30"
// // //                 >
// // //                   <ChevronRight size={20} />
// // //                 </button>
// // //               </div>
// // //             </div>

// // //             <div className="overflow-x-auto">
// // //               <Table>
// // //                 <TableHead className="bg-slate-50/50">
// // //                   <TableRow>
// // //                     <TableHeaderCell className="text-[11px] font-black uppercase text-slate-400 tracking-widest py-8 pl-12 w-20 text-center">
// // //                       #
// // //                     </TableHeaderCell>
// // //                     <TableHeaderCell className="text-[11px] font-black uppercase text-slate-400 tracking-widest py-8 text-center">
// // //                       {t("social_reason")}
// // //                     </TableHeaderCell>
// // //                     <TableHeaderCell className="text-[11px] font-black uppercase text-slate-400 tracking-widest text-center">
// // //                       RIF / VAT
// // //                     </TableHeaderCell>
// // //                     <TableHeaderCell className="text-[11px] font-black uppercase text-slate-400 tracking-widest text-center pr-12">
// // //                       {isTotalHistory
// // //                         ? "Facturación Histórica"
// // //                         : "Facturación del Periodo"}
// // //                     </TableHeaderCell>
// // //                   </TableRow>
// // //                 </TableHead>
// // //                 <TableBody>
// // //                   {paginatedClients.map((client: any, idx: number) => {
// // //                     const absIdx = (currentPage - 1) * clientsPerPage + idx + 1;
// // //                     return (
// // //                       <motion.tr
// // //                         key={client.rif + absIdx}
// // //                         initial={{ opacity: 0 }}
// // //                         animate={{ opacity: 1 }}
// // //                         // MODIFICACIÓN: cursor-pointer y onClick para abrir el modal pasándole los datos del cliente
// // //                         onClick={() => setSelectedClient(client)}
// // //                         className="group hover:bg-blue-50/40 border-b border-slate-50 last:border-0 transition-all cursor-pointer"
// // //                       >
// // //                         <TableCell className="pl-12 py-8">
// // //                           <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-slate-100 text-slate-400 font-black text-[10px] group-hover:bg-blue-600 group-hover:text-white transition-all shadow-inner">
// // //                             {absIdx}
// // //                           </div>
// // //                         </TableCell>
// // //                         <TableCell className="font-bold text-slate-800 uppercase tracking-tight text-xs text-center">
// // //                           {client.name}
// // //                         </TableCell>
// // //                         <TableCell className="text-[11px] font-mono font-bold text-slate-400 tracking-widest text-center">
// // //                           {client.rif}
// // //                         </TableCell>
// // //                         <TableCell className="text-center pr-12 font-black text-blue-600 text-sm tabular-nums">
// // //                           ${" "}
// // //                           {client.value.toLocaleString("en-US", {
// // //                             minimumFractionDigits: 2,
// // //                           })}
// // //                         </TableCell>
// // //                       </motion.tr>
// // //                     );
// // //                   })}
// // //                 </TableBody>
// // //               </Table>
// // //             </div>
// // //           </Card>
// // //         </div>
// // //       </div>

// // //       {/* MODAL DETALLADO PREMIUM SUPER MEJORADO */}
// // //       <AnimatePresence>
// // //         {selectedClient && (
// // //           <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
// // //             {/* Fondo oscuro cerrable al hacer clic fuera */}
// // //             <motion.div
// // //               initial={{ opacity: 0 }}
// // //               animate={{ opacity: 1 }}
// // //               exit={{ opacity: 0 }}
// // //               className="absolute inset-0"
// // //               onClick={() => setSelectedClient(null)}
// // //             />

// // //             {/* Contenedor del Modal */}
// // //             <motion.div
// // //               initial={{ scale: 0.95, opacity: 0, y: 20 }}
// // //               animate={{ scale: 1, opacity: 1, y: 0 }}
// // //               exit={{ scale: 0.95, opacity: 0, y: 20 }}
// // //               transition={{ type: "spring", duration: 0.5 }}
// // //               className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-100 relative z-10 flex flex-col max-h-[90vh]"
// // //             >
// // //               {/* Header del Modal */}
// // //               <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex justify-between items-start gap-4">
// // //                 <div className="space-y-1">
// // //                   <span className="text-[9px] bg-blue-100 text-blue-700 font-black px-2.5 py-1 rounded-md uppercase tracking-wider">
// // //                     Ficha de Cliente
// // //                   </span>
// // //                   <Title className="text-2xl font-black text-slate-900 uppercase tracking-tight mt-1">
// // //                     {selectedClient.name}
// // //                   </Title>
// // //                   <Text className="text-xs font-mono font-bold text-slate-400 tracking-wider">
// // //                     RIF: {selectedClient.rif}
// // //                   </Text>
// // //                 </div>
// // //                 <button
// // //                   onClick={() => setSelectedClient(null)}
// // //                   className="p-2 bg-white hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-xl transition-all border border-slate-100 shadow-sm"
// // //                 >
// // //                   <X size={18} />
// // //                 </button>
// // //               </div>

// // //               {/* Contenido / Cuerpo del detalle */}
// // //               <div className="p-8 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
// // //                 {/* Grid de KPIs principales */}
// // //                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
// // //                   <div className="p-5 bg-blue-50/50 border border-blue-100/50 rounded-2xl flex items-center gap-4">
// // //                     <div className="p-3 bg-blue-600 rounded-xl text-white shadow-md shadow-blue-200">
// // //                       <Receipt size={20} />
// // //                     </div>
// // //                     <div>
// // //                       <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
// // //                         Monto Auditado
// // //                       </span>
// // //                       <div className="text-xl font-black text-blue-600 mt-0.5 tabular-nums">
// // //                         ${" "}
// // //                         {selectedClient.value.toLocaleString("en-US", {
// // //                           minimumFractionDigits: 2,
// // //                         })}
// // //                       </div>
// // //                     </div>
// // //                   </div>

// // //                   <div className="p-5 bg-slate-50 border border-slate-100 rounded-2xl flex items-center gap-4">
// // //                     <div className="p-3 bg-slate-900 rounded-xl text-white shadow-md">
// // //                       <CreditCard size={20} />
// // //                     </div>
// // //                     <div>
// // //                       <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
// // //                         Término de Venta
// // //                       </span>
// // //                       {/* Evaluación simulada basada en parámetros lógicos de crédito de Odoo */}
// // //                       <div className="text-sm font-black text-slate-800 uppercase mt-0.5 tracking-wide">
// // //                         {selectedClient.value > 25000 ? (
// // //                           <Badge className="bg-amber-100 border-none text-amber-700 rounded-lg font-bold text-[10px] py-1 px-2.5">
// // //                             Crédito o Giros
// // //                           </Badge>
// // //                         ) : (
// // //                           <Badge className="bg-emerald-100 border-none text-emerald-700 rounded-lg font-bold text-[10px] py-1 px-2.5">
// // //                             Contado / Traspaso
// // //                           </Badge>
// // //                         )}
// // //                       </div>
// // //                     </div>
// // //                   </div>
// // //                 </div>

// // //                 {/* Bloques de Información Estructurada */}
// // //                 <div className="space-y-4">
// // //                   <div className="flex items-start gap-4 p-4 border border-slate-100 rounded-2xl bg-white hover:bg-slate-50/50 transition-all">
// // //                     <div className="p-2 bg-slate-100 text-slate-600 rounded-xl mt-0.5">
// // //                       <User size={16} />
// // //                     </div>
// // //                     <div>
// // //                       <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
// // //                         Ejecutivo Comercial (Vendedor Odoo)
// // //                       </h4>
// // //                       <p className="text-sm font-bold text-slate-800 mt-0.5 uppercase tracking-tight">
// // //                         {selectedClient.seller_name ||
// // //                           "Asesor Comercial Predeterminado"}
// // //                       </p>
// // //                     </div>
// // //                   </div>

// // //                   <div className="flex items-start gap-4 p-4 border border-slate-100 rounded-2xl bg-white hover:bg-slate-50/50 transition-all">
// // //                     <div className="p-2 bg-slate-100 text-slate-600 rounded-xl mt-0.5">
// // //                       <MapPin size={16} />
// // //                     </div>
// // //                     <div>
// // //                       <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
// // //                         Localización Geográfica
// // //                       </h4>
// // //                       <p className="text-sm font-bold text-slate-800 mt-0.5 uppercase tracking-tight">
// // //                         {selectedClient.city || "Ciudad Principal"} -{" "}
// // //                         {selectedState || "Ubicación del Estado"}
// // //                       </p>
// // //                     </div>
// // //                   </div>
// // //                 </div>

// // //                 {/* Tabla interna simulada de últimos artículos facturados */}
// // //                 <div className="space-y-3">
// // //                   <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">
// // //                     Historial del Período Reciente
// // //                   </h4>
// // //                   <div className="border border-slate-100 rounded-2xl overflow-hidden">
// // //                     <div className="bg-slate-50 px-4 py-2.5 flex justify-between text-[9px] font-black text-slate-400 uppercase tracking-wider">
// // //                       <span>Concepto General</span>
// // //                       <span>Monto Relativo</span>
// // //                     </div>
// // //                     <div className="divide-y divide-slate-50 px-4">
// // //                       <div className="py-3 flex justify-between items-center text-xs">
// // //                         <span className="font-bold text-slate-700">
// // //                           Consumibles de Alta Gama (Línea ASTA)
// // //                         </span>
// // //                         <span className="font-mono font-bold text-slate-900">
// // //                           ${" "}
// // //                           {(selectedClient.value * 0.6).toLocaleString(
// // //                             "en-US",
// // //                             { maximumFractionDigits: 2 },
// // //                           )}
// // //                         </span>
// // //                       </div>
// // //                       <div className="py-3 flex justify-between items-center text-xs">
// // //                         <span className="font-bold text-slate-700">
// // //                           Logística de Despacho Corporativo
// // //                         </span>
// // //                         <span className="font-mono font-bold text-slate-900">
// // //                           ${" "}
// // //                           {(selectedClient.value * 0.4).toLocaleString(
// // //                             "en-US",
// // //                             { maximumFractionDigits: 2 },
// // //                           )}
// // //                         </span>
// // //                       </div>
// // //                     </div>
// // //                   </div>
// // //                 </div>
// // //               </div>

// // //               {/* Footer del Modal */}
// // //               <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
// // //                 <button
// // //                   onClick={() => setSelectedClient(null)}
// // //                   className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md transition-all"
// // //                 >
// // //                   Entendido
// // //                 </button>
// // //               </div>
// // //             </motion.div>
// // //           </div>
// // //         )}
// // //       </AnimatePresence>
// // //     </div>
// // //   );
// // // }
// // "use client";

// // import {
// //   Badge,
// //   Card,
// //   Table,
// //   TableBody,
// //   TableCell,
// //   TableHead,
// //   TableHeaderCell,
// //   TableRow,
// //   Text,
// //   Title,
// // } from "@tremor/react";
// // import { format } from "date-fns";
// // import { AnimatePresence, motion } from "framer-motion";
// // import {
// //   Building2,
// //   Calendar as CalendarIcon,
// //   ChevronLeft,
// //   ChevronRight,
// //   CreditCard,
// //   FilterX,
// //   Globe,
// //   History,
// //   Info,
// //   MapPin,
// //   Receipt,
// //   TrendingUp,
// //   User,
// //   X,
// // } from "lucide-react";
// // import { useTranslations } from "next-intl";
// // import { useEffect, useMemo, useState } from "react";
// // import { DateRange } from "react-day-picker";
// // import { ComposableMap, Geographies, Geography } from "react-simple-maps";

// // const COMPANY_NAMES: Record<number, string> = {
// //   9: "Valencia",
// //   10: "Caracas",
// //   7: "Panama",
// // };

// // const MAP_CONFIG: Record<string, any> = {
// //   VE: {
// //     name: "venezuela",
// //     geoUrl:
// //       "https://raw.githubusercontent.com/apache/superset/master/superset-frontend/plugins/legacy-plugin-chart-country-map/src/countries/venezuela.geojson",
// //     scale: 2800,
// //     center: [-66.3, 6.6],
// //   },
// //   PA: {
// //     name: "panama",
// //     geoUrl:
// //       "https://raw.githubusercontent.com/apache/superset/master/superset-frontend/plugins/legacy-plugin-chart-country-map/src/countries/panama.geojson",
// //     scale: 8000,
// //     center: [-80, 8.5],
// //   },
// // };

// // export default function MapsClientsPage() {
// //   const t = useTranslations("mapsClientsPage");
// //   const [currentCountry, setCurrentCountry] = useState("VE");

// //   // CONTROL DE VISTA: "Cliente" o "Monto"
// //   const [viewType, setViewType] = useState<"CLIENTS" | "AMOUNT">("CLIENTS");

// //   const [data, setData] = useState<any[]>([]);
// //   const [loading, setLoading] = useState(true);
// //   const [selectedState, setSelectedState] = useState<string | null>(null);
// //   const [currentPage, setCurrentPage] = useState(1);
// //   const clientsPerPage = 4;
// //   const [userCompanyId, setUserCompanyId] = useState<number | null>(null);
// //   const [selSeller, setSelSeller] = useState("all");
// //   const [availableSellers, setAvailableSellers] = useState<any[]>([]);

// //   // NUEVO ESTADO: Controla el cliente seleccionado para el Modal de detalles
// //   const [selectedClient, setSelectedClient] = useState<any | null>(null);

// //   // Estado para el Historial Total
// //   const [isTotalHistory, setIsTotalHistory] = useState(false);

// //   // Estado del calendario nativo
// //   const [date, setDate] = useState<DateRange | undefined>({
// //     from: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
// //     to: new Date(),
// //   });

// //   const PRIMARY_BLUE = "#2563eb";

// //   useEffect(() => {
// //     let ignore = false;
// //     if (!isTotalHistory && !date?.from) return;

// //     setLoading(true);
// //     setData([]);

// //     async function fetchData() {
// //       try {
// //         let url = `/api/superadmin/mapsclients?country=${currentCountry}`;

// //         if (selSeller !== "all") {
// //           url += `&vendor_id=${selSeller}`;
// //         }

// //         if (!isTotalHistory && date?.from) {
// //           const start = format(date.from, "yyyy-MM-dd");
// //           const end = date.to ? format(date.to, "yyyy-MM-dd") : start;
// //           url += `&startDate=${start}&endDate=${end}`;
// //         }

// //         const res = await fetch(url, { cache: "no-store" });
// //         const d = await res.json();

// //         if (!ignore) {
// //           setData(d.summary || []);
// //           setUserCompanyId(d.company_id);
// //           setAvailableSellers(d.sellers || []);
// //           setLoading(false);
// //         }
// //       } catch (e) {
// //         if (!ignore) setLoading(false);
// //       }
// //     }

// //     fetchData();

// //     return () => {
// //       ignore = true;
// //     };
// //   }, [currentCountry, selSeller, date, isTotalHistory]);

// //   const carteraName = userCompanyId
// //     ? COMPANY_NAMES[userCompanyId]
// //     : "Venezuela";

// //   const normalize = (name: string) => {
// //     if (!name) return "";
// //     return name
// //       .split("(")[0]
// //       .trim()
// //       .toUpperCase()
// //       .normalize("NFD")
// //       .replace(/[\u0300-\u036f]/g, "")
// //       .replace(/ESTADO /g, "");
// //   };

// //   const getStateTotalAmount = (stateData: any) => {
// //     if (!stateData || !stateData.clients) return 0;
// //     return stateData.clients.reduce(
// //       (acc: number, c: any) => acc + (c.value || 0),
// //       0,
// //     );
// //   };

// //   const getMapColor = (geoName: string) => {
// //     const geoKey = normalize(geoName);
// //     const stateData = data.find(
// //       (d) =>
// //         d.state_key === geoKey ||
// //         (geoKey === "VARGAS" && d.state_key === "LA GUAIRA"),
// //     );

// //     if (selectedState && normalize(selectedState) !== geoKey) return "#868585";
// //     if (!stateData) return "#868585";

// //     if (viewType === "CLIENTS") {
// //       const count = stateData.count || 0;
// //       if (count === 0) return "#868585";
// //       if (count >= 500) return PRIMARY_BLUE;
// //       if (count >= 100) return "#60a5fa";
// //       return "#bfdbfe";
// //     } else {
// //       const amount = getStateTotalAmount(stateData);
// //       if (amount === 0) return "#868585";
// //       if (amount >= 50000) return PRIMARY_BLUE;
// //       if (amount >= 10000) return "#60a5fa";
// //       return "#bfdbfe";
// //     }
// //   };

// //   const processedClients = useMemo(() => {
// //     let clients = selectedState
// //       ? data.find((d) => normalize(d.state) === normalize(selectedState))
// //           ?.clients || []
// //       : data.flatMap((d) => d.clients);
// //     return [...clients].sort((a, b) => b.value - a.value);
// //   }, [selectedState, data]);

// //   const totalPages = Math.ceil(processedClients.length / clientsPerPage);
// //   const paginatedClients = processedClients.slice(
// //     (currentPage - 1) * clientsPerPage,
// //     currentPage * clientsPerPage,
// //   );

// //   useEffect(() => {
// //     setCurrentPage(1);
// //   }, [selectedState, currentCountry, viewType]);

// //   return (
// //     <div className="min-h-screen p-6 lg:p-8 space-y-8 font-sans text-slate-900 relative">
// //       {/* HEADER DINÁMICO */}
// //       <header className="flex flex-col lg:flex-row justify-between items-center gap-6 bg-white p-8 rounded-[2.5rem] shadow-sm border border-white">
// //         <div>
// //           <Title className="text-4xl font-black text-slate-900 tracking-tighter uppercase italic">
// //             {t("title")} <span className="text-blue-600">{t("title2")}</span>
// //           </Title>
// //         </div>

// //         <div className="flex flex-col xl:flex-row gap-4 items-center flex-wrap justify-end">
// //           <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
// //             <button
// //               onClick={() => setViewType("CLIENTS")}
// //               className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewType === "CLIENTS" ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
// //             >
// //               Cliente
// //             </button>
// //             <button
// //               onClick={() => setViewType("AMOUNT")}
// //               className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewType === "AMOUNT" ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
// //             >
// //               Monto
// //             </button>
// //           </div>

// //           <button
// //             onClick={() => setIsTotalHistory(!isTotalHistory)}
// //             className={`px-4 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all shadow-sm flex items-center gap-2 border ${isTotalHistory ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-500 border-slate-200 hover:text-slate-900 hover:border-slate-300"}`}
// //           >
// //             <History size={14} /> Historial Total
// //           </button>

// //           <div
// //             className={`bg-white border border-slate-200 rounded-2xl p-2.5 flex items-center gap-2 shadow-sm transition-all duration-300 ${isTotalHistory ? "opacity-30 pointer-events-none grayscale" : ""}`}
// //           >
// //             <CalendarIcon size={16} className="text-slate-400 ml-2" />
// //             <input
// //               type="date"
// //               className="text-xs font-bold text-slate-600 border-none focus:ring-0 bg-transparent cursor-pointer"
// //               value={date?.from ? format(date.from, "yyyy-MM-dd") : ""}
// //               onChange={(e) =>
// //                 setDate((prev) => ({
// //                   ...prev,
// //                   from: e.target.value ? new Date(e.target.value) : undefined,
// //                 }))
// //               }
// //               disabled={isTotalHistory}
// //             />
// //             <span className="text-slate-300 font-bold">-</span>
// //             <input
// //               type="date"
// //               className="text-xs font-bold text-slate-600 border-none focus:ring-0 bg-transparent cursor-pointer"
// //               value={date?.to ? format(date.to, "yyyy-MM-dd") : ""}
// //               onChange={(e) =>
// //                 setDate((prev) => ({
// //                   ...prev,
// //                   to: e.target.value ? new Date(e.target.value) : undefined,
// //                 }))
// //               }
// //               disabled={isTotalHistory}
// //             />
// //           </div>

// //           <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200 gap-4">
// //             <select
// //               className="bg-white border-none rounded-xl text-[10px] font-bold p-3 outline-none cursor-pointer"
// //               value={selSeller}
// //               onChange={(e) => setSelSeller(e.target.value)}
// //             >
// //               <option value="all">Todos los Vendedores</option>
// //               {availableSellers.map((s: any) => (
// //                 <option key={s.id} value={s.id}>
// //                   {s.name}
// //                 </option>
// //               ))}
// //             </select>

// //             <div className="w-px bg-slate-200 my-1.5" />

// //             <div className="flex gap-1.5">
// //               {Object.entries(MAP_CONFIG).map(([code, config]) => (
// //                 <button
// //                   key={code}
// //                   onClick={() => {
// //                     setCurrentCountry(code);
// //                     setSelectedState(null);
// //                   }}
// //                   className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${currentCountry === code ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
// //                 >
// //                   {config.name}
// //                 </button>
// //               ))}
// //             </div>
// //           </div>
// //         </div>
// //       </header>

// //       <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
// //         {/* MAPA */}
// //         <div className="lg:col-span-8">
// //           <Card className="rounded-[3rem] border-none shadow-xl p-0 bg-white overflow-hidden h-[750px] flex flex-col relative">
// //             <div className="p-8 border-b border-slate-50 flex justify-between items-center z-10">
// //               <div className="flex items-center gap-3">
// //                 <div className="p-2 bg-blue-50 rounded-xl text-blue-600">
// //                   <Globe size={20} />
// //                 </div>
// //                 <Title className="text-xl font-black text-slate-800 uppercase italic flex items-center gap-2">
// //                   {t("map_of", { country: MAP_CONFIG[currentCountry].name })}
// //                   <span className="text-xs bg-slate-100 text-slate-500 rounded-lg px-2.5 py-1 font-bold normal-case italic">
// //                     por{" "}
// //                     {viewType === "CLIENTS" ? "clientes" : "monto facturado"}
// //                   </span>
// //                 </Title>
// //               </div>
// //               {selectedState && (
// //                 <button
// //                   onClick={() => setSelectedState(null)}
// //                   className="group flex items-center gap-2 bg-red-50 text-red-600 px-5 py-2.5 rounded-2xl text-xs font-black uppercase shadow-sm"
// //                 >
// //                   <FilterX size={14} /> {t("reset_map")}
// //                 </button>
// //               )}
// //             </div>

// //             <div className="flex-1 bg-[#fcfcfc] relative flex items-center justify-center overflow-hidden">
// //               {loading ? (
// //                 <Text className="font-black text-slate-300 animate-pulse uppercase text-[10px]">
// //                   {t("loading")}
// //                 </Text>
// //               ) : (
// //                 <ComposableMap
// //                   projection="geoMercator"
// //                   projectionConfig={{
// //                     scale: MAP_CONFIG[currentCountry].scale,
// //                     center: MAP_CONFIG[currentCountry].center,
// //                   }}
// //                   className="w-full h-full"
// //                 >
// //                   <Geographies geography={MAP_CONFIG[currentCountry].geoUrl}>
// //                     {({ geographies }) =>
// //                       geographies.map((geo) => {
// //                         const geoName =
// //                           geo.properties.name ||
// //                           geo.properties.NAME_1 ||
// //                           geo.properties.NAME;
// //                         const fillColor = getMapColor(geoName);
// //                         const isSelected =
// //                           selectedState &&
// //                           normalize(geoName) === normalize(selectedState);
// //                         return (
// //                           <Geography
// //                             key={geo.rsmKey}
// //                             geography={geo}
// //                             onClick={() => {
// //                               const key = normalize(geoName);
// //                               const sData = data.find(
// //                                 (d) =>
// //                                   d.state_key === key ||
// //                                   (key === "VARGAS" &&
// //                                     d.state_key === "LA GUAIRA"),
// //                               );
// //                               if (sData) setSelectedState(sData.state);
// //                             }}
// //                             style={{
// //                               default: {
// //                                 fill: fillColor,
// //                                 outline: "none",
// //                                 transition: "all 0.4s ease",
// //                               },
// //                               hover: {
// //                                 fill: PRIMARY_BLUE,
// //                                 outline: "none",
// //                                 cursor: "pointer",
// //                                 opacity: 0.9,
// //                               },
// //                             }}
// //                             className={`stroke-white ${isSelected ? "stroke-[3px] z-20" : "stroke-[1.2px]"}`}
// //                           />
// //                         );
// //                       })
// //                     }
// //                   </Geographies>
// //                 </ComposableMap>
// //               )}

// //               {/* LEYENDA */}
// //               <div className="absolute top-6 right-6 bg-white/90 backdrop-blur-xl p-6 rounded-[2.5rem] border border-white shadow-2xl space-y-4 z-10">
// //                 <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
// //                   <Info size={16} className="text-blue-600" />
// //                   <Text className="text-[10px] font-black uppercase text-slate-500 tracking-widest">
// //                     Métricas por {viewType === "CLIENTS" ? "Clientes" : "Monto"}
// //                   </Text>
// //                 </div>
// //                 <div className="space-y-3">
// //                   {(viewType === "CLIENTS"
// //                     ? [
// //                         {
// //                           label: "Alta Densidad",
// //                           range: "500+",
// //                           color: PRIMARY_BLUE,
// //                         },
// //                         {
// //                           label: "Media Densidad",
// //                           range: "100-499",
// //                           color: "#60a5fa",
// //                         },
// //                         {
// //                           label: "Baja Densidad",
// //                           range: "1-99",
// //                           color: "#bfdbfe",
// //                         },
// //                         {
// //                           label: "Sin Clientes",
// //                           range: "0",
// //                           color: "#868585",
// //                           border: true,
// //                         },
// //                       ]
// //                     : [
// //                         {
// //                           label: "Facturación Alta",
// //                           range: "$50,000+",
// //                           color: PRIMARY_BLUE,
// //                         },
// //                         {
// //                           label: "Facturación Media",
// //                           range: "$10,000 - $49,999",
// //                           color: "#60a5fa",
// //                         },
// //                         {
// //                           label: "Facturación Baja",
// //                           range: "Menos de $10,000",
// //                           color: "#bfdbfe",
// //                         },
// //                         {
// //                           label: "Sin Facturación",
// //                           range: "$0",
// //                           color: "#868585",
// //                           border: true,
// //                         },
// //                       ]
// //                   ).map((item, i) => (
// //                     <div key={i} className="flex items-center gap-3">
// //                       <div
// //                         className={`h-3 w-3 rounded-full ${item.border ? "border border-slate-200" : ""}`}
// //                         style={{ backgroundColor: item.color }}
// //                       />
// //                       <div className="flex flex-col">
// //                         <span className="text-[10px] font-black text-slate-700 uppercase">
// //                           {item.label}
// //                         </span>
// //                         <span className="text-[9px] font-bold text-slate-400">
// //                           {item.range}
// //                         </span>
// //                       </div>
// //                     </div>
// //                   ))}
// //                 </div>
// //               </div>
// //             </div>
// //           </Card>
// //         </div>

// //         {/* SIDEBAR */}
// //         <aside className="lg:col-span-4 space-y-8">
// //           <Card className="rounded-[2.5rem] border-none shadow-xl bg-slate-900 text-white p-10 overflow-hidden relative">
// //             <Building2 className="absolute -right-12 -bottom-12 text-white/5 w-64 h-64 rotate-12" />
// //             <Text
// //               className={`text-blue-400 font-black text-xs uppercase tracking-[0.3em] mb-3 ${loading ? "animate-pulse text-slate-400" : ""}`}
// //             >
// //               {viewType === "CLIENTS"
// //                 ? t("total_portfolio")
// //                 : "TOTAL FACTURADO"}
// //             </Text>
// //             <div className="text-5xl font-black tracking-tighter mb-4 tabular-nums truncate">
// //               {viewType === "CLIENTS"
// //                 ? data.reduce((acc, curr) => acc + curr.count, 0)
// //                 : `$${data.reduce((acc, curr) => acc + getStateTotalAmount(curr), 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
// //             </div>
// //             <div className="flex items-center gap-2 text-emerald-400 font-bold text-[10px] uppercase bg-emerald-500/10 w-fit px-4 py-1.5 rounded-full border border-emerald-500/20">
// //               <TrendingUp size={14} />
// //               {carteraName}
// //             </div>
// //           </Card>

// //           <Card className="rounded-[2.5rem] border-none shadow-xl bg-white p-8 h-[420px] flex flex-col">
// //             <Title className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] mb-6 italic">
// //               {viewType === "CLIENTS"
// //                 ? t("penetration_ranking")
// //                 : "RANKING DE FACTURACIÓN"}
// //             </Title>

// //             {loading ? (
// //               <div className="flex-1 flex items-center justify-center text-slate-300 font-bold animate-pulse uppercase text-[10px]">
// //                 {t("loading")}
// //               </div>
// //             ) : (
// //               <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar flex-1">
// //                 {data
// //                   .sort((a, b) =>
// //                     viewType === "CLIENTS"
// //                       ? b.count - a.count
// //                       : getStateTotalAmount(b) - getStateTotalAmount(a),
// //                   )
// //                   .map((state) => {
// //                     const isActive = selectedState === state.state;
// //                     return (
// //                       <motion.div
// //                         key={state.state}
// //                         onClick={() => setSelectedState(state.state)}
// //                         className={`flex justify-between items-center p-4 rounded-2xl cursor-pointer transition-all border ${isActive ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200" : "bg-slate-50 border-transparent hover:border-blue-100"}`}
// //                       >
// //                         <span className="text-[10px] font-black tracking-widest uppercase truncate max-w-[150px]">
// //                           {state.state}
// //                         </span>
// //                         <Badge
// //                           className={`rounded-lg font-mono text-[10px] px-3 border-none ${isActive ? "bg-white text-blue-600" : "bg-blue-600 text-white"}`}
// //                         >
// //                           {viewType === "CLIENTS"
// //                             ? state.count
// //                             : `$${getStateTotalAmount(state).toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
// //                         </Badge>
// //                       </motion.div>
// //                     );
// //                   })}
// //               </div>
// //             )}
// //           </Card>
// //         </aside>

// //         {/* TABLA DEL DIRECTORIO ESTRATÉGICO CON APERTURA DE MODAL */}
// //         <div className="lg:col-span-12">
// //           <Card className="rounded-[3.5rem] border-none shadow-2xl p-0 overflow-hidden bg-white">
// //             <div className="p-12 border-b border-slate-50 flex flex-col md:flex-row justify-between items-center gap-6">
// //               <div>
// //                 <Title className="text-3xl font-black text-slate-900 tracking-tighter italic uppercase underline decoration-blue-600 decoration-4">
// //                   {t("strategic_directory")}
// //                 </Title>
// //                 <Text className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.2em] mt-2 italic">
// //                   {selectedState
// //                     ? t("region", { region: selectedState })
// //                     : t("country", {
// //                         country: MAP_CONFIG[currentCountry].name,
// //                       })}
// //                 </Text>
// //               </div>

// //               <div className="flex items-center gap-4 bg-slate-100/50 p-2 rounded-2xl border border-slate-200/50">
// //                 <button
// //                   disabled={currentPage === 1}
// //                   onClick={() => setCurrentPage((p) => p - 1)}
// //                   className="p-2.5 rounded-xl bg-white shadow-sm text-slate-400 hover:text-blue-600 disabled:opacity-30"
// //                 >
// //                   <ChevronLeft size={20} />
// //                 </button>
// //                 <div className="flex items-center gap-2 px-4 font-black text-xs text-blue-600">
// //                   {currentPage} <span className="text-slate-300">/</span>{" "}
// //                   {totalPages || 1}
// //                 </div>
// //                 <button
// //                   disabled={currentPage === totalPages || totalPages === 0}
// //                   onClick={() => setCurrentPage((p) => p + 1)}
// //                   className="p-2.5 rounded-xl bg-white shadow-sm text-slate-400 hover:text-blue-600 disabled:opacity-30"
// //                 >
// //                   <ChevronRight size={20} />
// //                 </button>
// //               </div>
// //             </div>

// //             <div className="overflow-x-auto">
// //               <Table>
// //                 <TableHead className="bg-slate-50/50">
// //                   <TableRow>
// //                     <TableHeaderCell className="text-[11px] font-black uppercase text-slate-400 tracking-widest py-8 pl-12 w-20 text-center">
// //                       #
// //                     </TableHeaderCell>
// //                     <TableHeaderCell className="text-[11px] font-black uppercase text-slate-400 tracking-widest py-8 text-center">
// //                       {t("social_reason")}
// //                     </TableHeaderCell>
// //                     <TableHeaderCell className="text-[11px] font-black uppercase text-slate-400 tracking-widest text-center">
// //                       RIF / VAT
// //                     </TableHeaderCell>
// //                     <TableHeaderCell className="text-[11px] font-black uppercase text-slate-400 tracking-widest text-center pr-12">
// //                       {isTotalHistory
// //                         ? "Facturación Histórica"
// //                         : "Facturación del Periodo"}
// //                     </TableHeaderCell>
// //                   </TableRow>
// //                 </TableHead>
// //                 <TableBody>
// //                   {paginatedClients.map((client: any, idx: number) => {
// //                     const absIdx = (currentPage - 1) * clientsPerPage + idx + 1;
// //                     return (
// //                       <motion.tr
// //                         key={client.rif + absIdx}
// //                         initial={{ opacity: 0 }}
// //                         animate={{ opacity: 1 }}
// //                         onClick={() => setSelectedClient(client)}
// //                         className="group hover:bg-blue-50/40 border-b border-slate-50 last:border-0 transition-all cursor-pointer"
// //                       >
// //                         <TableCell className="pl-12 py-8">
// //                           <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-slate-100 text-slate-400 font-black text-[10px] group-hover:bg-blue-600 group-hover:text-white transition-all shadow-inner">
// //                             {absIdx}
// //                           </div>
// //                         </TableCell>
// //                         <TableCell className="font-bold text-slate-800 uppercase tracking-tight text-xs text-center">
// //                           {client.name}
// //                         </TableCell>
// //                         <TableCell className="text-[11px] font-mono font-bold text-slate-400 tracking-widest text-center">
// //                           {client.rif}
// //                         </TableCell>
// //                         <TableCell className="text-center pr-12 font-black text-blue-600 text-sm tabular-nums">
// //                           ${" "}
// //                           {client.value.toLocaleString("en-US", {
// //                             minimumFractionDigits: 2,
// //                           })}
// //                         </TableCell>
// //                       </motion.tr>
// //                     );
// //                   })}
// //                 </TableBody>
// //               </Table>
// //             </div>
// //           </Card>
// //         </div>
// //       </div>

// //       {/* MODAL DETALLADO PREMIUM DEFINITIVO */}
// //       <AnimatePresence>
// //         {selectedClient && (
// //           <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
// //             <motion.div
// //               initial={{ opacity: 0 }}
// //               animate={{ opacity: 1 }}
// //               exit={{ opacity: 0 }}
// //               className="absolute inset-0"
// //               onClick={() => setSelectedClient(null)}
// //             />

// //             <motion.div
// //               initial={{ scale: 0.95, opacity: 0, y: 20 }}
// //               animate={{ scale: 1, opacity: 1, y: 0 }}
// //               exit={{ scale: 0.95, opacity: 0, y: 20 }}
// //               transition={{ type: "spring", duration: 0.5 }}
// //               className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-100 relative z-10 flex flex-col max-h-[90vh]"
// //             >
// //               {/* Header del Modal */}
// //               <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex justify-between items-start gap-4">
// //                 <div className="space-y-1">
// //                   <span className="text-[9px] bg-blue-100 text-blue-700 font-black px-2.5 py-1 rounded-md uppercase tracking-wider">
// //                     Ficha de Cliente
// //                   </span>
// //                   <Title className="text-2xl font-black text-slate-900 uppercase tracking-tight mt-1">
// //                     {selectedClient.name}
// //                   </Title>
// //                   <Text className="text-xs font-mono font-bold text-slate-400 tracking-wider">
// //                     RIF: {selectedClient.rif}
// //                   </Text>
// //                 </div>
// //                 <button
// //                   onClick={() => setSelectedClient(null)}
// //                   className="p-2 bg-white hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-xl transition-all border border-slate-100 shadow-sm"
// //                 >
// //                   <X size={18} />
// //                 </button>
// //               </div>

// //               {/* Contenido */}
// //               <div className="p-8 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
// //                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
// //                   <div className="p-5 bg-blue-50/50 border border-blue-100/50 rounded-2xl flex items-center gap-4">
// //                     <div className="p-3 bg-blue-600 rounded-xl text-white shadow-md shadow-blue-200">
// //                       <Receipt size={20} />
// //                     </div>
// //                     <div>
// //                       <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
// //                         Monto
// //                       </span>
// //                       <div className="text-xl font-black text-blue-600 mt-0.5 tabular-nums">
// //                         ${" "}
// //                         {selectedClient.value.toLocaleString("en-US", {
// //                           minimumFractionDigits: 2,
// //                         })}
// //                       </div>
// //                     </div>
// //                   </div>

// //                   <div className="p-5 bg-slate-50 border border-slate-100 rounded-2xl flex items-center gap-4">
// //                     <div className="p-3 bg-slate-900 rounded-xl text-white shadow-md">
// //                       <CreditCard size={20} />
// //                     </div>
// //                     <div>
// //                       <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
// //                         Término de Venta
// //                       </span>
// //                       <div className="text-sm font-black text-slate-800 uppercase mt-0.5 tracking-wide">
// //                         {selectedClient.value > 25000 ? (
// //                           <Badge className="bg-amber-100 border-none text-amber-700 rounded-lg font-bold text-[10px] py-1 px-2.5">
// //                             Crédito
// //                           </Badge>
// //                         ) : (
// //                           <Badge className="bg-emerald-100 border-none text-emerald-700 rounded-lg font-bold text-[10px] py-1 px-2.5">
// //                             Contado
// //                           </Badge>
// //                         )}
// //                       </div>
// //                     </div>
// //                   </div>
// //                 </div>

// //                 <div className="space-y-4">
// //                   <div className="flex items-start gap-4 p-4 border border-slate-100 rounded-2xl bg-white hover:bg-slate-50/50 transition-all">
// //                     <div className="p-2 bg-slate-100 text-slate-600 rounded-xl mt-0.5">
// //                       <User size={16} />
// //                     </div>
// //                     <div>
// //                       <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
// //                         Vendedor
// //                       </h4>
// //                       <p className="text-sm font-bold text-slate-800 mt-0.5 uppercase tracking-tight">
// //                         {selectedClient.seller_name &&
// //                         selectedClient.seller_name !== "N/A"
// //                           ? selectedClient.seller_name
// //                           : "Asesor Comercial Predeterminado"}
// //                       </p>
// //                     </div>
// //                   </div>

// //                   <div className="flex items-start gap-4 p-4 border border-slate-100 rounded-2xl bg-white hover:bg-slate-50/50 transition-all">
// //                     <div className="p-2 bg-slate-100 text-slate-600 rounded-xl mt-0.5">
// //                       <MapPin size={16} />
// //                     </div>
// //                     <div>
// //                       <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
// //                         Localización Geográfica
// //                       </h4>
// //                       <p className="text-sm font-bold text-slate-800 mt-0.5 uppercase tracking-tight">
// //                         {selectedClient.city || "Ciudad Principal"} -{" "}
// //                         {selectedState || MAP_CONFIG[currentCountry].name}
// //                       </p>
// //                     </div>
// //                   </div>
// //                 </div>

// //                 {/* MODIFICACIÓN: LISTADO DE PRODUCTOS 100% DINÁMICO DESDE ODOO */}
// //                 <div className="space-y-3">
// //                   <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">
// //                     Productos Adquiridos
// //                   </h4>
// //                   <div className="border border-slate-100 rounded-2xl overflow-hidden bg-white shadow-sm">
// //                     <div className="bg-slate-50 px-5 py-3 flex justify-between text-[9px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">
// //                       <span>Artículo / Cantidad</span>
// //                       <span>Monto Facturado</span>
// //                     </div>
// //                     <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto custom-scrollbar">
// //                       {selectedClient.products &&
// //                       selectedClient.products.length > 0 ? (
// //                         selectedClient.products.map((item: any) => (
// //                           <div
// //                             key={item.id}
// //                             className="px-5 py-3.5 flex justify-between items-center text-xs hover:bg-slate-50/40 transition-all"
// //                           >
// //                             <div className="flex flex-col gap-0.5 max-w-[70%]">
// //                               <span className="font-bold text-slate-800 uppercase tracking-tight line-clamp-2">
// //                                 {item.product}
// //                               </span>
// //                               <span className="text-[10px] text-slate-400 font-bold tabular-nums">
// //                                 {" "}
// //                                 {item.quantity.toLocaleString("en-US")} unidades
// //                               </span>
// //                             </div>
// //                             <span className="font-mono font-black text-blue-600 text-right tabular-nums">
// //                               ${" "}
// //                               {item.total.toLocaleString("en-US", {
// //                                 minimumFractionDigits: 2,
// //                                 maximumFractionDigits: 2,
// //                               })}
// //                             </span>
// //                           </div>
// //                         ))
// //                       ) : (
// //                         <div className="py-8 text-center text-xs text-slate-400 italic font-medium">
// //                           Sin desglose de productos para visualización histórica
// //                           total o período vacío.
// //                         </div>
// //                       )}
// //                     </div>
// //                   </div>
// //                 </div>
// //               </div>
// //             </motion.div>
// //           </div>
// //         )}
// //       </AnimatePresence>
// //     </div>
// //   );
// // }
// "use client";

// import {
//   Badge,
//   Card,
//   Table,
//   TableBody,
//   TableCell,
//   TableHead,
//   TableHeaderCell,
//   TableRow,
//   Text,
//   Title,
// } from "@tremor/react";
// import { format } from "date-fns";
// import { AnimatePresence, motion } from "framer-motion";
// import {
//   Building2,
//   Calendar as CalendarIcon,
//   ChevronLeft,
//   ChevronRight,
//   CreditCard,
//   FilterX,
//   Globe,
//   History,
//   Info,
//   MapPin,
//   Receipt,
//   TrendingUp,
//   User,
//   X,
// } from "lucide-react";
// import { useTranslations } from "next-intl";
// import { useEffect, useMemo, useState } from "react";
// import { DateRange } from "react-day-picker";
// import { ComposableMap, Geographies, Geography } from "react-simple-maps";

// const COMPANY_NAMES: Record<number, string> = {
//   9: "Valencia",
//   10: "Caracas",
//   7: "Panama",
// };

// const MAP_CONFIG: Record<string, any> = {
//   VE: {
//     name: "venezuela",
//     geoUrl:
//       "https://raw.githubusercontent.com/apache/superset/master/superset-frontend/plugins/legacy-plugin-chart-country-map/src/countries/venezuela.geojson",
//     scale: 2800,
//     center: [-66.3, 6.6],
//   },
//   PA: {
//     name: "panama",
//     geoUrl:
//       "https://raw.githubusercontent.com/apache/superset/master/superset-frontend/plugins/legacy-plugin-chart-country-map/src/countries/panama.geojson",
//     scale: 8000,
//     center: [-80, 8.5],
//   },
// };

// export default function MapsClientsPage() {
//   const t = useTranslations("mapsClientsPage");
//   const [currentCountry, setCurrentCountry] = useState("VE");

//   // CONTROL DE VISTA: "Cliente" o "Monto"
//   const [viewType, setViewType] = useState<"CLIENTS" | "AMOUNT">("CLIENTS");

//   const [data, setData] = useState<any[]>([]);
//   const [loading, setLoading] = useState(true);
//   const [selectedState, setSelectedState] = useState<string | null>(null);
//   const [currentPage, setCurrentPage] = useState(1);
//   const clientsPerPage = 4;
//   const [userCompanyId, setUserCompanyId] = useState<number | null>(null);
//   const [selSeller, setSelSeller] = useState("all");
//   const [availableSellers, setAvailableSellers] = useState<any[]>([]);

//   // NUEVO ESTADO: Controla el cliente seleccionado para el Modal de detalles
//   const [selectedClient, setSelectedClient] = useState<any | null>(null);

//   // Estado para el Historial Total
//   const [isTotalHistory, setIsTotalHistory] = useState(false);

//   // Estado del calendario nativo
//   const [date, setDate] = useState<DateRange | undefined>({
//     from: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
//     to: new Date(),
//   });

//   const PRIMARY_BLUE = "#2563eb";

//   // NUEVO EFFECT: Congela el scroll del background/body de la página al abrir el modal
//   useEffect(() => {
//     if (selectedClient) {
//       document.body.classList.add("overflow-hidden");
//     } else {
//       document.body.classList.remove("overflow-hidden");
//     }
//     // Limpieza preventiva si el componente se desmonta inesperadamente con el modal abierto
//     return () => {
//       document.body.classList.remove("overflow-hidden");
//     };
//   }, [selectedClient]);

//   useEffect(() => {
//     let ignore = false;
//     if (!isTotalHistory && !date?.from) return;

//     setLoading(true);
//     setData([]);

//     async function fetchData() {
//       try {
//         let url = `/api/superadmin/mapsclients?country=${currentCountry}`;

//         if (selSeller !== "all") {
//           url += `&vendor_id=${selSeller}`;
//         }

//         if (!isTotalHistory && date?.from) {
//           const start = format(date.from, "yyyy-MM-dd");
//           const end = date.to ? format(date.to, "yyyy-MM-dd") : start;
//           url += `&startDate=${start}&endDate=${end}`;
//         }

//         const res = await fetch(url, { cache: "no-store" });
//         const d = await res.json();

//         if (!ignore) {
//           setData(d.summary || []);
//           setUserCompanyId(d.company_id);
//           setAvailableSellers(d.sellers || []);
//           setLoading(false);
//         }
//       } catch (e) {
//         if (!ignore) setLoading(false);
//       }
//     }

//     fetchData();

//     return () => {
//       ignore = true;
//     };
//   }, [currentCountry, selSeller, date, isTotalHistory]);

//   const carteraName = userCompanyId
//     ? COMPANY_NAMES[userCompanyId]
//     : "Venezuela";

//   const normalize = (name: string) => {
//     if (!name) return "";
//     return name
//       .split("(")[0]
//       .trim()
//       .toUpperCase()
//       .normalize("NFD")
//       .replace(/[\u0300-\u036f]/g, "")
//       .replace(/ESTADO /g, "");
//   };

//   const getStateTotalAmount = (stateData: any) => {
//     if (!stateData || !stateData.clients) return 0;
//     return stateData.clients.reduce(
//       (acc: number, c: any) => acc + (c.value || 0),
//       0,
//     );
//   };

//   const getMapColor = (geoName: string) => {
//     const geoNameStr = geoName || "";
//     const geoKey = normalize(geoNameStr);
//     const stateData = data.find(
//       (d) =>
//         d.state_key === geoKey ||
//         (geoKey === "VARGAS" && d.state_key === "LA GUAIRA"),
//     );

//     if (selectedState && normalize(selectedState) !== geoKey) return "#868585";
//     if (!stateData) return "#868585";

//     if (viewType === "CLIENTS") {
//       const count = stateData.count || 0;
//       if (count === 0) return "#868585";
//       if (count >= 500) return PRIMARY_BLUE;
//       if (count >= 100) return "#60a5fa";
//       return "#bfdbfe";
//     } else {
//       const amount = getStateTotalAmount(stateData);
//       if (amount === 0) return "#868585";
//       if (amount >= 50000) return PRIMARY_BLUE;
//       if (amount >= 10000) return "#60a5fa";
//       return "#bfdbfe";
//     }
//   };

//   const processedClients = useMemo(() => {
//     let clients = selectedState
//       ? data.find((d) => normalize(d.state) === normalize(selectedState))
//           ?.clients || []
//       : data.flatMap((d) => d.clients);
//     return [...clients].sort((a, b) => b.value - a.value);
//   }, [selectedState, data]);

//   const totalPages = Math.ceil(processedClients.length / clientsPerPage);
//   const paginatedClients = processedClients.slice(
//     (currentPage - 1) * clientsPerPage,
//     currentPage * clientsPerPage,
//   );

//   useEffect(() => {
//     setCurrentPage(1);
//   }, [selectedState, currentCountry, viewType]);

//   return (
//     <div className="min-h-screen p-6 lg:p-8 space-y-8 font-sans text-slate-900 relative">
//       {/* HEADER DINÁMICO */}
//       <header className="flex flex-col lg:flex-row justify-between items-center gap-6 bg-white p-8 rounded-[2.5rem] shadow-sm border border-white">
//         <div>
//           <Title className="text-4xl font-black text-slate-900 tracking-tighter uppercase italic">
//             {t("title")} <span className="text-blue-600">{t("title2")}</span>
//           </Title>
//         </div>

//         <div className="flex flex-col xl:flex-row gap-4 items-center flex-wrap justify-end">
//           <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
//             <button
//               onClick={() => setViewType("CLIENTS")}
//               className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewType === "CLIENTS" ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
//             >
//               Cliente
//             </button>
//             <button
//               onClick={() => setViewType("AMOUNT")}
//               className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewType === "AMOUNT" ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
//             >
//               Monto
//             </button>
//           </div>

//           <button
//             onClick={() => setIsTotalHistory(!isTotalHistory)}
//             className={`px-4 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all shadow-sm flex items-center gap-2 border ${isTotalHistory ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-500 border-slate-200 hover:text-slate-900 hover:border-slate-300"}`}
//           >
//             <History size={14} /> Historial Total
//           </button>

//           <div
//             className={`bg-white border border-slate-200 rounded-2xl p-2.5 flex items-center gap-2 shadow-sm transition-all duration-300 ${isTotalHistory ? "opacity-30 pointer-events-none grayscale" : ""}`}
//           >
//             <CalendarIcon size={16} className="text-slate-400 ml-2" />
//             <input
//               type="date"
//               className="text-xs font-bold text-slate-600 border-none focus:ring-0 bg-transparent cursor-pointer"
//               value={date?.from ? format(date.from, "yyyy-MM-dd") : ""}
//               onChange={(e) =>
//                 setDate((prev) => ({
//                   ...prev,
//                   from: e.target.value ? new Date(e.target.value) : undefined,
//                 }))
//               }
//               disabled={isTotalHistory}
//             />
//             <span className="text-slate-300 font-bold">-</span>
//             <input
//               type="date"
//               className="text-xs font-bold text-slate-600 border-none focus:ring-0 bg-transparent cursor-pointer"
//               value={date?.to ? format(date.to, "yyyy-MM-dd") : ""}
//               onChange={(e) =>
//                 setDate((prev) => ({
//                   ...prev,
//                   to: e.target.value ? new Date(e.target.value) : undefined,
//                 }))
//               }
//               disabled={isTotalHistory}
//             />
//           </div>

//           <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200 gap-4">
//             <select
//               className="bg-white border-none rounded-xl text-[10px] font-bold p-3 outline-none cursor-pointer"
//               value={selSeller}
//               onChange={(e) => setSelSeller(e.target.value)}
//             >
//               <option value="all">Todos los Vendedores</option>
//               {availableSellers.map((s: any) => (
//                 <option key={s.id} value={s.id}>
//                   {s.name}
//                 </option>
//               ))}
//             </select>

//             <div className="w-px bg-slate-200 my-1.5" />

//             <div className="flex gap-1.5">
//               {Object.entries(MAP_CONFIG).map(([code, config]) => (
//                 <button
//                   key={code}
//                   onClick={() => {
//                     setCurrentCountry(code);
//                     setSelectedState(null);
//                   }}
//                   className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${currentCountry === code ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
//                 >
//                   {config.name}
//                 </button>
//               ))}
//             </div>
//           </div>
//         </div>
//       </header>

//       <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
//         {/* MAPA */}
//         <div className="lg:col-span-8">
//           <Card className="rounded-[3rem] border-none shadow-xl p-0 bg-white overflow-hidden h-[750px] flex flex-col relative">
//             <div className="p-8 border-b border-slate-50 flex justify-between items-center z-10">
//               <div className="flex items-center gap-3">
//                 <div className="p-2 bg-blue-50 rounded-xl text-blue-600">
//                   <Globe size={20} />
//                 </div>
//                 <Title className="text-xl font-black text-slate-800 uppercase italic flex items-center gap-2">
//                   {t("map_of", { country: MAP_CONFIG[currentCountry].name })}
//                   <span className="text-xs bg-slate-100 text-slate-500 rounded-lg px-2.5 py-1 font-bold normal-case italic">
//                     por{" "}
//                     {viewType === "CLIENTS" ? "clientes" : "monto facturado"}
//                   </span>
//                 </Title>
//               </div>
//               {selectedState && (
//                 <button
//                   onClick={() => setSelectedState(null)}
//                   className="group flex items-center gap-2 bg-red-50 text-red-600 px-5 py-2.5 rounded-2xl text-xs font-black uppercase shadow-sm"
//                 >
//                   <FilterX size={14} /> {t("reset_map")}
//                 </button>
//               )}
//             </div>

//             <div className="flex-1 bg-[#fcfcfc] relative flex items-center justify-center overflow-hidden">
//               {loading ? (
//                 <Text className="font-black text-slate-300 animate-pulse uppercase text-[10px]">
//                   {t("loading")}
//                 </Text>
//               ) : (
//                 <ComposableMap
//                   projection="geoMercator"
//                   projectionConfig={{
//                     scale: MAP_CONFIG[currentCountry].scale,
//                     center: MAP_CONFIG[currentCountry].center,
//                   }}
//                   className="w-full h-full"
//                 >
//                   <Geographies geography={MAP_CONFIG[currentCountry].geoUrl}>
//                     {({ geographies }) =>
//                       geographies.map((geo) => {
//                         const geoName =
//                           geo.properties.name ||
//                           geo.properties.NAME_1 ||
//                           geo.properties.NAME;
//                         const fillColor = getMapColor(geoName);
//                         const isSelected =
//                           selectedState &&
//                           normalize(geoName) === normalize(selectedState);
//                         return (
//                           <Geography
//                             key={geo.rsmKey}
//                             geography={geo}
//                             onClick={() => {
//                               const key = normalize(geoName);
//                               const sData = data.find(
//                                 (d) =>
//                                   d.state_key === key ||
//                                   (key === "VARGAS" &&
//                                     d.state_key === "LA GUAIRA"),
//                               );
//                               if (sData) setSelectedState(sData.state);
//                             }}
//                             style={{
//                               default: {
//                                 fill: fillColor,
//                                 outline: "none",
//                                 transition: "all 0.4s ease",
//                               },
//                               hover: {
//                                 fill: PRIMARY_BLUE,
//                                 outline: "none",
//                                 cursor: "pointer",
//                                 opacity: 0.9,
//                               },
//                             }}
//                             className={`stroke-white ${isSelected ? "stroke-[3px] z-20" : "stroke-[1.2px]"}`}
//                           />
//                         );
//                       })
//                     }
//                   </Geographies>
//                 </ComposableMap>
//               )}

//               {/* LEYENDA */}
//               <div className="absolute top-6 right-6 bg-white/90 backdrop-blur-xl p-6 rounded-[2.5rem] border border-white shadow-2xl space-y-4 z-10">
//                 <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
//                   <Info size={16} className="text-blue-600" />
//                   <Text className="text-[10px] font-black uppercase text-slate-500 tracking-widest">
//                     Métricas por {viewType === "CLIENTS" ? "Clientes" : "Monto"}
//                   </Text>
//                 </div>
//                 <div className="space-y-3">
//                   {(viewType === "CLIENTS"
//                     ? [
//                         {
//                           label: "Alta Densidad",
//                           range: "500+",
//                           color: PRIMARY_BLUE,
//                         },
//                         {
//                           label: "Media Densidad",
//                           range: "100-499",
//                           color: "#60a5fa",
//                         },
//                         {
//                           label: "Baja Densidad",
//                           range: "1-99",
//                           color: "#bfdbfe",
//                         },
//                         {
//                           label: "Sin Clientes",
//                           range: "0",
//                           color: "#868585",
//                           border: true,
//                         },
//                       ]
//                     : [
//                         {
//                           label: "Facturación Alta",
//                           range: "$50,000+",
//                           color: PRIMARY_BLUE,
//                         },
//                         {
//                           label: "Facturación Media",
//                           range: "$10,000 - $49,999",
//                           color: "#60a5fa",
//                         },
//                         {
//                           label: "Facturación Baja",
//                           range: "Menos de $10,000",
//                           color: "#bfdbfe",
//                         },
//                         {
//                           label: "Sin Facturación",
//                           range: "$0",
//                           color: "#868585",
//                           border: true,
//                         },
//                       ]
//                   ).map((item, i) => (
//                     <div key={i} className="flex items-center gap-3">
//                       <div
//                         className={`h-3 w-3 rounded-full ${item.border ? "border border-slate-200" : ""}`}
//                         style={{ backgroundColor: item.color }}
//                       />
//                       <div className="flex flex-col">
//                         <span className="text-[10px] font-black text-slate-700 uppercase">
//                           {item.label}
//                         </span>
//                         <span className="text-[9px] font-bold text-slate-400">
//                           {item.range}
//                         </span>
//                       </div>
//                     </div>
//                   ))}
//                 </div>
//               </div>
//             </div>
//           </Card>
//         </div>

//         {/* SIDEBAR */}
//         <aside className="lg:col-span-4 space-y-8">
//           <Card className="rounded-[2.5rem] border-none shadow-xl bg-slate-900 text-white p-10 overflow-hidden relative">
//             <Building2 className="absolute -right-12 -bottom-12 text-white/5 w-64 h-64 rotate-12" />
//             <Text
//               className={`text-blue-400 font-black text-xs uppercase tracking-[0.3em] mb-3 ${loading ? "animate-pulse text-slate-400" : ""}`}
//             >
//               {viewType === "CLIENTS"
//                 ? t("total_portfolio")
//                 : "TOTAL FACTURADO"}
//             </Text>
//             <div className="text-5xl font-black tracking-tighter mb-4 tabular-nums truncate">
//               {viewType === "CLIENTS"
//                 ? data.reduce((acc, curr) => acc + curr.count, 0)
//                 : `$${data.reduce((acc, curr) => acc + getStateTotalAmount(curr), 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
//             </div>
//             <div className="flex items-center gap-2 text-emerald-400 font-bold text-[10px] uppercase bg-emerald-500/10 w-fit px-4 py-1.5 rounded-full border border-emerald-500/20">
//               <TrendingUp size={14} />
//               {carteraName}
//             </div>
//           </Card>

//           <Card className="rounded-[2.5rem] border-none shadow-xl bg-white p-8 h-[420px] flex flex-col">
//             <Title className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] mb-6 italic">
//               {viewType === "CLIENTS"
//                 ? t("penetration_ranking")
//                 : "RANKING DE FACTURACIÓN"}
//             </Title>

//             {loading ? (
//               <div className="flex-1 flex items-center justify-center text-slate-300 font-bold animate-pulse uppercase text-[10px]">
//                 {t("loading")}
//               </div>
//             ) : (
//               <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar flex-1">
//                 {data
//                   .sort((a, b) =>
//                     viewType === "CLIENTS"
//                       ? b.count - a.count
//                       : getStateTotalAmount(b) - getStateTotalAmount(a),
//                   )
//                   .map((state) => {
//                     const isActive = selectedState === state.state;
//                     return (
//                       <motion.div
//                         key={state.state}
//                         onClick={() => setSelectedState(state.state)}
//                         className={`flex justify-between items-center p-4 rounded-2xl cursor-pointer transition-all border ${isActive ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200" : "bg-slate-50 border-transparent hover:border-blue-100"}`}
//                       >
//                         <span className="text-[10px] font-black tracking-widest uppercase truncate max-w-[150px]">
//                           {state.state}
//                         </span>
//                         <Badge
//                           className={`rounded-lg font-mono text-[10px] px-3 border-none ${isActive ? "bg-white text-blue-600" : "bg-blue-600 text-white"}`}
//                         >
//                           {viewType === "CLIENTS"
//                             ? state.count
//                             : `$${getStateTotalAmount(state).toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
//                         </Badge>
//                       </motion.div>
//                     );
//                   })}
//               </div>
//             )}
//           </Card>
//         </aside>

//         {/* TABLA DEL DIRECTORIO ESTRATÉGICO CON APERTURA DE MODAL */}
//         <div className="lg:col-span-12">
//           <Card className="rounded-[3.5rem] border-none shadow-2xl p-0 overflow-hidden bg-white">
//             <div className="p-12 border-b border-slate-50 flex flex-col md:flex-row justify-between items-center gap-6">
//               <div>
//                 <Title className="text-3xl font-black text-slate-900 tracking-tighter italic uppercase underline decoration-blue-600 decoration-4">
//                   {t("strategic_directory")}
//                 </Title>
//                 <Text className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.2em] mt-2 italic">
//                   {selectedState
//                     ? t("region", { region: selectedState })
//                     : t("country", {
//                         country: MAP_CONFIG[currentCountry].name,
//                       })}
//                 </Text>
//               </div>

//               <div className="flex items-center gap-4 bg-slate-100/50 p-2 rounded-2xl border border-slate-200/50">
//                 <button
//                   disabled={currentPage === 1}
//                   onClick={() => setCurrentPage((p) => p - 1)}
//                   className="p-2.5 rounded-xl bg-white shadow-sm text-slate-400 hover:text-blue-600 disabled:opacity-30"
//                 >
//                   <ChevronLeft size={20} />
//                 </button>
//                 <div className="flex items-center gap-2 px-4 font-black text-xs text-blue-600">
//                   {currentPage} <span className="text-slate-300">/</span>{" "}
//                   {totalPages || 1}
//                 </div>
//                 <button
//                   disabled={currentPage === totalPages || totalPages === 0}
//                   onClick={() => setCurrentPage((p) => p + 1)}
//                   className="p-2.5 rounded-xl bg-white shadow-sm text-slate-400 hover:text-blue-600 disabled:opacity-30"
//                 >
//                   <ChevronRight size={20} />
//                 </button>
//               </div>
//             </div>

//             <div className="overflow-x-auto">
//               <Table>
//                 <TableHead className="bg-slate-50/50">
//                   <TableRow>
//                     <TableHeaderCell className="text-[11px] font-black uppercase text-slate-400 tracking-widest py-8 pl-12 w-20 text-center">
//                       #
//                     </TableHeaderCell>
//                     <TableHeaderCell className="text-[11px] font-black uppercase text-slate-400 tracking-widest py-8 text-center">
//                       {t("social_reason")}
//                     </TableHeaderCell>
//                     <TableHeaderCell className="text-[11px] font-black uppercase text-slate-400 tracking-widest text-center">
//                       RIF / VAT
//                     </TableHeaderCell>
//                     <TableHeaderCell className="text-[11px] font-black uppercase text-slate-400 tracking-widest text-center pr-12">
//                       {isTotalHistory
//                         ? "Facturación Histórica"
//                         : "Facturación del Periodo"}
//                     </TableHeaderCell>
//                   </TableRow>
//                 </TableHead>
//                 <TableBody>
//                   {paginatedClients.map((client: any, idx: number) => {
//                     const absIdx = (currentPage - 1) * clientsPerPage + idx + 1;
//                     return (
//                       <motion.tr
//                         key={client.rif + absIdx}
//                         initial={{ opacity: 0 }}
//                         animate={{ opacity: 1 }}
//                         onClick={() => setSelectedClient(client)}
//                         className="group hover:bg-blue-50/40 border-b border-slate-50 last:border-0 transition-all cursor-pointer"
//                       >
//                         <TableCell className="pl-12 py-8">
//                           <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-slate-100 text-slate-400 font-black text-[10px] group-hover:bg-blue-600 group-hover:text-white transition-all shadow-inner">
//                             {absIdx}
//                           </div>
//                         </TableCell>
//                         <TableCell className="font-bold text-slate-800 uppercase tracking-tight text-xs text-center">
//                           {client.name}
//                         </TableCell>
//                         <TableCell className="text-[11px] font-mono font-bold text-slate-400 tracking-widest text-center">
//                           {client.rif}
//                         </TableCell>
//                         <TableCell className="text-center pr-12 font-black text-blue-600 text-sm tabular-nums">
//                           ${" "}
//                           {client.value.toLocaleString("en-US", {
//                             minimumFractionDigits: 2,
//                           })}
//                         </TableCell>
//                       </motion.tr>
//                     );
//                   })}
//                 </TableBody>
//               </Table>
//             </div>
//           </Card>
//         </div>
//       </div>

//       {/* MODAL DETALLADO PREMIUM DEFINITIVO */}
//       <AnimatePresence>
//         {selectedClient && (
//           <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
//             <motion.div
//               initial={{ opacity: 0 }}
//               animate={{ opacity: 1 }}
//               exit={{ opacity: 0 }}
//               className="absolute inset-0"
//               onClick={() => setSelectedClient(null)}
//             />

//             <motion.div
//               initial={{ scale: 0.95, opacity: 0, y: 20 }}
//               animate={{ scale: 1, opacity: 1, y: 0 }}
//               exit={{ scale: 0.95, opacity: 0, y: 20 }}
//               transition={{ type: "spring", duration: 0.5 }}
//               className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-100 relative z-10 flex flex-col max-h-[90vh]"
//             >
//               {/* Header del Modal */}
//               <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex justify-between items-start gap-4">
//                 <div className="space-y-1">
//                   <span className="text-[9px] bg-blue-100 text-blue-700 font-black px-2.5 py-1 rounded-md uppercase tracking-wider">
//                     Ficha de Cliente
//                   </span>
//                   <Title className="text-2xl font-black text-slate-900 uppercase tracking-tight mt-1">
//                     {selectedClient.name}
//                   </Title>
//                   <Text className="text-xs font-mono font-bold text-slate-400 tracking-wider">
//                     RIF: {selectedClient.rif}
//                   </Text>
//                 </div>
//                 <button
//                   onClick={() => setSelectedClient(null)}
//                   className="p-2 bg-white hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-xl transition-all border border-slate-100 shadow-sm"
//                 >
//                   <X size={18} />
//                 </button>
//               </div>

//               {/* Contenido */}
//               <div className="p-8 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
//                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
//                   <div className="p-5 bg-blue-50/50 border border-blue-100/50 rounded-2xl flex items-center gap-4">
//                     <div className="p-3 bg-blue-600 rounded-xl text-white shadow-md shadow-blue-200">
//                       <Receipt size={20} />
//                     </div>
//                     <div>
//                       <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
//                         Monto
//                       </span>
//                       <div className="text-xl font-black text-blue-600 mt-0.5 tabular-nums">
//                         ${" "}
//                         {selectedClient.value.toLocaleString("en-US", {
//                           minimumFractionDigits: 2,
//                         })}
//                       </div>
//                     </div>
//                   </div>

//                   <div className="p-5 bg-slate-50 border border-slate-100 rounded-2xl flex items-center gap-4">
//                     <div className="p-3 bg-slate-900 rounded-xl text-white shadow-md">
//                       <CreditCard size={20} />
//                     </div>
//                     <div>
//                       <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
//                         Término de Venta
//                       </span>
//                       <div className="text-sm font-black text-slate-800 uppercase mt-0.5 tracking-wide">
//                         {selectedClient.value > 25000 ? (
//                           <Badge className="bg-amber-100 border-none text-amber-700 rounded-lg font-bold text-[10px] py-1 px-2.5">
//                             Crédito
//                           </Badge>
//                         ) : (
//                           <Badge className="bg-emerald-100 border-none text-emerald-700 rounded-lg font-bold text-[10px] py-1 px-2.5">
//                             Contado
//                           </Badge>
//                         )}
//                       </div>
//                     </div>
//                   </div>
//                 </div>

//                 <div className="space-y-4">
//                   <div className="flex items-start gap-4 p-4 border border-slate-100 rounded-2xl bg-white hover:bg-slate-50/50 transition-all">
//                     <div className="p-2 bg-slate-100 text-slate-600 rounded-xl mt-0.5">
//                       <User size={16} />
//                     </div>
//                     <div>
//                       <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
//                         Vendedor
//                       </h4>
//                       <p className="text-sm font-bold text-slate-800 mt-0.5 uppercase tracking-tight">
//                         {selectedClient.seller_name &&
//                         selectedClient.seller_name !== "N/A"
//                           ? selectedClient.seller_name
//                           : "Asesor Comercial Predeterminado"}
//                       </p>
//                     </div>
//                   </div>

//                   <div className="flex items-start gap-4 p-4 border border-slate-100 rounded-2xl bg-white hover:bg-slate-50/50 transition-all">
//                     <div className="p-2 bg-slate-100 text-slate-600 rounded-xl mt-0.5">
//                       <MapPin size={16} />
//                     </div>
//                     <div>
//                       <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
//                         Localización Geográfica
//                       </h4>
//                       <p className="text-sm font-bold text-slate-800 mt-0.5 uppercase tracking-tight">
//                         {selectedClient.city || "Ciudad Principal"} -{" "}
//                         {selectedState || MAP_CONFIG[currentCountry].name}
//                       </p>
//                     </div>
//                   </div>
//                 </div>

//                 {/* LISTADO DE PRODUCTOS 100% DINÁMICO DESDE ODOO */}
//                 <div className="space-y-3">
//                   <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">
//                     Productos Adquiridos
//                   </h4>
//                   <div className="border border-slate-100 rounded-2xl overflow-hidden bg-white shadow-sm">
//                     <div className="bg-slate-50 px-5 py-3 flex justify-between text-[9px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">
//                       <span>Artículo / Cantidad</span>
//                       <span>Monto Facturado</span>
//                     </div>
//                     <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto custom-scrollbar">
//                       {selectedClient.products &&
//                       selectedClient.products.length > 0 ? (
//                         selectedClient.products.map((item: any) => (
//                           <div
//                             key={item.id}
//                             className="px-5 py-3.5 flex justify-between items-center text-xs hover:bg-slate-50/40 transition-all"
//                           >
//                             <div className="flex flex-col gap-0.5 max-w-[70%]">
//                               <span className="font-bold text-slate-800 uppercase tracking-tight line-clamp-2">
//                                 {item.product}
//                               </span>
//                               <span className="text-[10px] text-slate-400 font-bold tabular-nums">
//                                 {item.quantity.toLocaleString("en-US")} unidades
//                               </span>
//                             </div>
//                             <span className="font-mono font-black text-blue-600 text-right tabular-nums">
//                               ${" "}
//                               {item.total.toLocaleString("en-US", {
//                                 minimumFractionDigits: 2,
//                                 maximumFractionDigits: 2,
//                               })}
//                             </span>
//                           </div>
//                         ))
//                       ) : (
//                         <div className="py-8 text-center text-xs text-slate-400 italic font-medium">
//                           Sin desglose de productos para visualización histórica
//                           total o período vacío.
//                         </div>
//                       )}
//                     </div>
//                   </div>
//                 </div>
//               </div>
//             </motion.div>
//           </div>
//         )}
//       </AnimatePresence>
//     </div>
//   );
// }
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
import { AnimatePresence, motion } from "framer-motion";
import {
  Building2,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  CreditCard,
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

const MAP_CONFIG: Record<string, any> = {
  VE: {
    name: "venezuela",
    geoUrl:
      "https://raw.githubusercontent.com/apache/superset/master/superset-frontend/plugins/legacy-plugin-chart-country-map/src/countries/venezuela.geojson",
    scale: 2800,
    center: [-66.3, 6.6],
  },
  PA: {
    name: "panama",
    geoUrl:
      "https://raw.githubusercontent.com/apache/superset/master/superset-frontend/plugins/legacy-plugin-chart-country-map/src/countries/panama.geojson",
    scale: 8000,
    center: [-80, 8.5],
  },
};

export default function MapsClientsPage() {
  const t = useTranslations("mapsClientsPage");
  const [currentCountry, setCurrentCountry] = useState("VE");

  // CONTROL DE VISTA: "Cliente" o "Monto"
  const [viewType, setViewType] = useState<"CLIENTS" | "AMOUNT">("CLIENTS");

  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const clientsPerPage = 4;
  const [userCompanyId, setUserCompanyId] = useState<number | null>(null);
  const [selSeller, setSelSeller] = useState("all");
  const [availableSellers, setAvailableSellers] = useState<any[]>([]);

  // NUEVO ESTADO: Controla el cliente seleccionado para el Modal de detalles
  const [selectedClient, setSelectedClient] = useState<any | null>(null);

  // Estado para el Historial Total
  const [isTotalHistory, setIsTotalHistory] = useState(false);

  // Estado del calendario nativo
  const [date, setDate] = useState<DateRange | undefined>({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    to: new Date(),
  });

  const PRIMARY_BLUE = "#2563eb";

  // Congela el scroll del background/body de la página al abrir el modal
  useEffect(() => {
    if (selectedClient) {
      document.body.classList.add("overflow-hidden");
    } else {
      document.body.classList.remove("overflow-hidden");
    }
    return () => {
      document.body.classList.remove("overflow-hidden");
    };
  }, [selectedClient]);

  useEffect(() => {
    let ignore = false;
    if (!isTotalHistory && !date?.from) return;

    setLoading(true);
    setData([]);

    async function fetchData() {
      try {
        let url = `/api/superadmin/mapsclients?country=${currentCountry}`;

        if (selSeller !== "all") {
          url += `&vendor_id=${selSeller}`;
        }

        if (!isTotalHistory && date?.from) {
          const start = format(date.from, "yyyy-MM-dd");
          const end = date.to ? format(date.to, "yyyy-MM-dd") : start;
          url += `&startDate=${start}&endDate=${end}`;
        }

        const res = await fetch(url, { cache: "no-store" });
        const d = await res.json();

        if (!ignore) {
          setData(d.summary || []);
          setUserCompanyId(d.company_id);
          setAvailableSellers(d.sellers || []);
          setLoading(false);
        }
      } catch (e) {
        if (!ignore) setLoading(false);
      }
    }

    fetchData();

    return () => {
      ignore = true;
    };
  }, [currentCountry, selSeller, date, isTotalHistory]);

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

  const getStateTotalAmount = (stateData: any) => {
    if (!stateData || !stateData.clients) return 0;
    return stateData.clients.reduce(
      (acc: number, c: any) => acc + (c.value || 0),
      0,
    );
  };

  const getMapColor = (geoName: string) => {
    const geoNameStr = geoName || "";
    const geoKey = normalize(geoNameStr);
    const stateData = data.find(
      (d) =>
        d.state_key === geoKey ||
        (geoKey === "VARGAS" && d.state_key === "LA GUAIRA"),
    );

    if (selectedState && normalize(selectedState) !== geoKey) return "#868585";
    if (!stateData) return "#868585";

    if (viewType === "CLIENTS") {
      const count = stateData.count || 0;
      if (count === 0) return "#868585";
      if (count >= 500) return PRIMARY_BLUE;
      if (count >= 100) return "#60a5fa";
      return "#bfdbfe";
    } else {
      const amount = getStateTotalAmount(stateData);
      if (amount === 0) return "#868585";
      if (amount >= 50000) return PRIMARY_BLUE;
      if (amount >= 10000) return "#60a5fa";
      return "#bfdbfe";
    }
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
  }, [selectedState, currentCountry, viewType]);

  return (
    <div className="min-h-screen p-6 lg:p-8 space-y-8 font-sans text-slate-900 relative">
      {/* HEADER PREMIUM OPTIMIZADO */}
      <header className="bg-white p-6 lg:p-8 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col gap-6">
        {/* Fila Superior: Título y Segmentación Principal */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-50 pb-4">
          <div>
            <Title className="text-3xl font-black text-slate-900 tracking-tighter uppercase italic">
              {t("title")} <span className="text-blue-600">{t("title2")}</span>
            </Title>
            <Text className="text-[11px] text-slate-400 font-bold uppercase tracking-wider mt-1">
              Panel de control comercial y analítico
            </Text>
          </div>

          {/* Switch de Métricas: Cliente / Monto */}
          <div className="flex bg-slate-100/80 p-1 rounded-xl border border-slate-200/40 shadow-inner self-stretch md:self-auto">
            <button
              onClick={() => setViewType("CLIENTS")}
              className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-200 ${
                viewType === "CLIENTS"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-400 hover:text-slate-600"
              }`}
            >
              Cliente
            </button>
            <button
              onClick={() => setViewType("AMOUNT")}
              className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-200 ${
                viewType === "AMOUNT"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-400 hover:text-slate-600"
              }`}
            >
              Monto
            </button>
          </div>
        </div>

        {/* Fila Inferior: Barra de Filtros Unificada */}
        <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4">
          {/* Bloque Izquierdo de Filtros: Tiempo */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
            {/* Botón Historial */}
            <button
              onClick={() => setIsTotalHistory(!isTotalHistory)}
              className={`h-11 px-5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-2 border shadow-sm ${
                isTotalHistory
                  ? "bg-slate-900 text-white border-slate-900 hover:bg-slate-800"
                  : "bg-white text-slate-500 border-slate-200 hover:text-slate-800 hover:border-slate-300"
              }`}
            >
              <History size={14} /> Historial Total
            </button>

            {/* Rangos Calendario */}
            <div
              className={`h-11 bg-white border border-slate-200 rounded-xl px-4 flex items-center gap-2 shadow-sm transition-all duration-300 flex-1 sm:flex-none ${
                isTotalHistory
                  ? "opacity-30 pointer-events-none grayscale bg-slate-50"
                  : ""
              }`}
            >
              <CalendarIcon size={15} className="text-slate-400" />
              <input
                type="date"
                className="text-xs font-bold text-slate-600 border-none focus:ring-0 bg-transparent cursor-pointer w-full p-0"
                value={date?.from ? format(date.from, "yyyy-MM-dd") : ""}
                onChange={(e) =>
                  setDate((prev) => ({
                    ...prev,
                    from: e.target.value ? new Date(e.target.value) : undefined,
                  }))
                }
                disabled={isTotalHistory}
              />
              <span className="text-slate-300 font-bold text-xs px-1">-</span>
              <input
                type="date"
                className="text-xs font-bold text-slate-600 border-none focus:ring-0 bg-transparent cursor-pointer w-full p-0"
                value={date?.to ? format(date.to, "yyyy-MM-dd") : ""}
                onChange={(e) =>
                  setDate((prev) => ({
                    ...prev,
                    to: e.target.value ? new Date(e.target.value) : undefined,
                  }))
                }
                disabled={isTotalHistory}
              />
            </div>
          </div>

          {/* Bloque Derecho de Filtros: Entidades (Vendedores y Países) */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Dropdown Vendedores */}
            <div className="relative flex-1 sm:w-64">
              <select
                className="w-full h-11 bg-white border border-slate-200 rounded-xl text-[11px] font-bold px-4 py-2 outline-none cursor-pointer appearance-none shadow-sm text-slate-600 hover:border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all"
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
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
                <ChevronLeft size={16} className="-rotate-90" />
              </div>
            </div>

            {/* Tabs de Países */}
            <div className="flex bg-slate-100/80 p-1 rounded-xl border border-slate-200/40 shadow-inner h-11">
              {Object.entries(MAP_CONFIG).map(([code, config]) => (
                <button
                  key={code}
                  onClick={() => {
                    setCurrentCountry(code);
                    setSelectedState(null);
                  }}
                  className={`px-5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-200 ${
                    currentCountry === code
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  {config.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* MAPA */}
        <div className="lg:col-span-8">
          <Card className="rounded-[3rem] border-none shadow-xl p-0 bg-white overflow-hidden h-[750px] flex flex-col relative">
            <div className="p-8 border-b border-slate-50 flex justify-between items-center z-10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-xl text-blue-600">
                  <Globe size={20} />
                </div>
                <Title className="text-xl font-black text-slate-800 uppercase italic flex items-center gap-2">
                  {t("map_of", { country: MAP_CONFIG[currentCountry].name })}
                  <span className="text-xs bg-slate-100 text-slate-500 rounded-lg px-2.5 py-1 font-bold normal-case italic">
                    por{" "}
                    {viewType === "CLIENTS" ? "clientes" : "monto facturado"}
                  </span>
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
                    Métricas por {viewType === "CLIENTS" ? "Clientes" : "Monto"}
                  </Text>
                </div>
                <div className="space-y-3">
                  {(viewType === "CLIENTS"
                    ? [
                        {
                          label: "Alta Densidad",
                          range: "500+",
                          color: PRIMARY_BLUE,
                        },
                        {
                          label: "Media Densidad",
                          range: "100-499",
                          color: "#60a5fa",
                        },
                        {
                          label: "Baja Densidad",
                          range: "1-99",
                          color: "#bfdbfe",
                        },
                        {
                          label: "Sin Clientes",
                          range: "0",
                          color: "#868585",
                          border: true,
                        },
                      ]
                    : [
                        {
                          label: "Facturación Alta",
                          range: "$50,000+",
                          color: PRIMARY_BLUE,
                        },
                        {
                          label: "Facturación Media",
                          range: "$10,000 - $49,999",
                          color: "#60a5fa",
                        },
                        {
                          label: "Facturación Baja",
                          range: "Menos de $10,000",
                          color: "#bfdbfe",
                        },
                        {
                          label: "Sin Facturación",
                          range: "$0",
                          color: "#868585",
                          border: true,
                        },
                      ]
                  ).map((item, i) => (
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
                          {item.range}
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
              {viewType === "CLIENTS"
                ? t("total_portfolio")
                : "TOTAL FACTURADO"}
            </Text>
            <div className="text-5xl font-black tracking-tighter mb-4 tabular-nums truncate">
              {viewType === "CLIENTS"
                ? data.reduce((acc, curr) => acc + curr.count, 0)
                : `$${data.reduce((acc, curr) => acc + getStateTotalAmount(curr), 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
            </div>
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-[10px] uppercase bg-emerald-500/10 w-fit px-4 py-1.5 rounded-full border border-emerald-500/20">
              <TrendingUp size={14} />
              {carteraName}
            </div>
          </Card>

          <Card className="rounded-[2.5rem] border-none shadow-xl bg-white p-8 h-[420px] flex flex-col">
            <Title className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] mb-6 italic">
              {viewType === "CLIENTS"
                ? t("penetration_ranking")
                : "RANKING DE FACTURACIÓN"}
            </Title>

            {loading ? (
              <div className="flex-1 flex items-center justify-center text-slate-300 font-bold animate-pulse uppercase text-[10px]">
                {t("loading")}
              </div>
            ) : (
              <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar flex-1">
                {data
                  .sort((a, b) =>
                    viewType === "CLIENTS"
                      ? b.count - a.count
                      : getStateTotalAmount(b) - getStateTotalAmount(a),
                  )
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
                          {viewType === "CLIENTS"
                            ? state.count
                            : `$${getStateTotalAmount(state).toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
                        </Badge>
                      </motion.div>
                    );
                  })}
              </div>
            )}
          </Card>
        </aside>

        {/* TABLA DEL DIRECTORIO ESTRATÉGICO CON APERTURA DE MODAL */}
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
                          ${" "}
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

      {/* MODAL DETALLADO PREMIUM DEFINITIVO */}
      <AnimatePresence>
        {selectedClient && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0"
              onClick={() => setSelectedClient(null)}
            />

            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-100 relative z-10 flex flex-col max-h-[90vh]"
            >
              {/* Header del Modal */}
              <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex justify-between items-start gap-4">
                <div className="space-y-1">
                  <span className="text-[9px] bg-blue-100 text-blue-700 font-black px-2.5 py-1 rounded-md uppercase tracking-wider">
                    Ficha de Cliente
                  </span>
                  <Title className="text-2xl font-black text-slate-900 uppercase tracking-tight mt-1">
                    {selectedClient.name}
                  </Title>
                  <Text className="text-xs font-mono font-bold text-slate-400 tracking-wider">
                    RIF: {selectedClient.rif}
                  </Text>
                </div>
                <button
                  onClick={() => setSelectedClient(null)}
                  className="p-2 bg-white hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-xl transition-all border border-slate-100 shadow-sm"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Contenido */}
              <div className="p-8 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-5 bg-blue-50/50 border border-blue-100/50 rounded-2xl flex items-center gap-4">
                    <div className="p-3 bg-blue-600 rounded-xl text-white shadow-md shadow-blue-200">
                      <Receipt size={20} />
                    </div>
                    <div>
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                        Monto
                      </span>
                      <div className="text-xl font-black text-blue-600 mt-0.5 tabular-nums">
                        ${" "}
                        {selectedClient.value.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="p-5 bg-slate-50 border border-slate-100 rounded-2xl flex items-center gap-4">
                    <div className="p-3 bg-slate-900 rounded-xl text-white shadow-md">
                      <CreditCard size={20} />
                    </div>
                    <div>
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                        Término de Venta
                      </span>
                      <div className="text-sm font-black text-slate-800 uppercase mt-0.5 tracking-wide">
                        {selectedClient.value > 25000 ? (
                          <Badge className="bg-amber-100 border-none text-amber-700 rounded-lg font-bold text-[10px] py-1 px-2.5">
                            Crédito
                          </Badge>
                        ) : (
                          <Badge className="bg-emerald-100 border-none text-emerald-700 rounded-lg font-bold text-[10px] py-1 px-2.5">
                            Contado
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-start gap-4 p-4 border border-slate-100 rounded-2xl bg-white hover:bg-slate-50/50 transition-all">
                    <div className="p-2 bg-slate-100 text-slate-600 rounded-xl mt-0.5">
                      <User size={16} />
                    </div>
                    <div>
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Vendedor
                      </h4>
                      <p className="text-sm font-bold text-slate-800 mt-0.5 uppercase tracking-tight">
                        {selectedClient.seller_name &&
                        selectedClient.seller_name !== "N/A"
                          ? selectedClient.seller_name
                          : "Asesor Comercial Predeterminado"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-4 border border-slate-100 rounded-2xl bg-white hover:bg-slate-50/50 transition-all">
                    <div className="p-2 bg-slate-100 text-slate-600 rounded-xl mt-0.5">
                      <MapPin size={16} />
                    </div>
                    <div>
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Localización Geográfica
                      </h4>
                      <p className="text-sm font-bold text-slate-800 mt-0.5 uppercase tracking-tight">
                        {selectedClient.city || "Ciudad Principal"} -{" "}
                        {selectedState || MAP_CONFIG[currentCountry].name}
                      </p>
                    </div>
                  </div>
                </div>

                {/* LISTADO DE PRODUCTOS 100% DINÁMICO DESDE ODOO */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">
                    Productos Adquiridos
                  </h4>
                  <div className="border border-slate-100 rounded-2xl overflow-hidden bg-white shadow-sm">
                    <div className="bg-slate-50 px-5 py-3 flex justify-between text-[9px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">
                      <span>Artículo / Cantidad</span>
                      <span>Monto Facturado</span>
                    </div>
                    <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto custom-scrollbar">
                      {selectedClient.products &&
                      selectedClient.products.length > 0 ? (
                        selectedClient.products.map((item: any) => (
                          <div
                            key={item.id}
                            className="px-5 py-3.5 flex justify-between items-center text-xs hover:bg-slate-50/40 transition-all"
                          >
                            <div className="flex flex-col gap-0.5 max-w-[70%]">
                              <span className="font-bold text-slate-800 uppercase tracking-tight line-clamp-2">
                                {item.product}
                              </span>
                              <span className="text-[10px] text-slate-400 font-bold tabular-nums">
                                {item.quantity.toLocaleString("en-US")} unidades
                              </span>
                            </div>
                            <span className="font-mono font-black text-blue-600 text-right tabular-nums">
                              ${" "}
                              {item.total.toLocaleString("en-US", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="py-8 text-center text-xs text-slate-400 italic font-medium">
                          Sin desglose de productos para visualización histórica
                          total o período vacío.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
