"use client";

import {
  Badge,
  Card,
  Select,
  SelectItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Text,
  TextInput,
  Title,
} from "@tremor/react";
import { AnimatePresence, motion } from "framer-motion";
import { MapPin, Search, ShieldCheck, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";

// URL verificada y estable (GeoJSON de alta fidelidad)
const geoUrl =
  "https://raw.githubusercontent.com/apache/superset/master/superset-frontend/plugins/legacy-plugin-chart-country-map/src/countries/venezuela.geojson";

const SELLERS_DATA = [
  { name: "ARTURO ARAY", state: "ANZOÁTEGUI", zone: "CENTRO" },
  { name: "EMILI BRICEÑO", state: "APURE", zone: "CENTRO" },
  { name: "DANIELA SUAREZ", state: "ARAGUA", zone: "CENTRO" },
  { name: "EMILI BRICEÑO", state: "BARINAS", zone: "CENTRO" },
  { name: "GABRIEL SANCHEZ", state: "BOLÍVAR", zone: "CENTRO" },
  { name: "Todos", state: "CARABOBO", zone: "CENTRO" },
  { name: "MARYORI VILLANUEVA", state: "COJEDES", zone: "CENTRO" },
  { name: "MARYORI VILLANUEVA", state: "DELTA AMACURO", zone: "CENTRO" },
  { name: "DANIELA SUAREZ", state: "FALCÓN", zone: "CENTRO" },
  { name: "EMILI BRICEÑO", state: "GUÁRICO", zone: "CENTRO" },
  { name: "DANIEL ESPINOZA", state: "LA GUAIRA", zone: "CENTRO" },
  { name: "ARTURO ARAY", state: "LARA", zone: "CENTRO" },
  { name: "José Riccardo", state: "MÉRIDA", zone: "CENTRO" },
  { name: "DANIEL ESPINOZA", state: "LOS TEQUES", zone: "CENTRO" },
  { name: "DANIEL ESPINOZA", state: "CARRIZAL", zone: "CENTRO" },
  { name: "DANIEL ESPINOZA", state: "SAN ANTONIO", zone: "CENTRO" },
  { name: "DANIEL ESPINOZA", state: "CHARALLAVE", zone: "CENTRO" },
  { name: "DANIEL ESPINOZA", state: "CÚA", zone: "CENTRO" },
  { name: "DANIEL ESPINOZA", state: "SANTA TERESA DEL TUY", zone: "CENTRO" },
  { name: "José Riccardo", state: "GUARENAS", zone: "CENTRO" },
  { name: "José Riccardo", state: "GUATIRE", zone: "CENTRO" },
  { name: "ARTURO ARAY", state: "NUEVA ESPARTA", zone: "CENTRO" },
  { name: "EMILI BRICEÑO", state: "NUEVA ESPARTA", zone: "CENTRO" },
  { name: "GABRIEL SANCHEZ", state: "NUEVA ESPARTA", zone: "CENTRO" },
  { name: "DANIEL ESPINOZA", state: "MONAGAS", zone: "CENTRO" },
  { name: "GABRIEL SANCHEZ", state: "NUEVA ESPARTA", zone: "CENTRO" },
  { name: "DANIEL ESPINOZA", state: "PORTUGUESA", zone: "CENTRO" },
  { name: "DANIELA SUAREZ", state: "SUCRE", zone: "CENTRO" },
  {
    name: "Todos (Prioritarios: ARTURO ARAY, GABRIEL SANCHEZ, EMILI BRICEÑO)",
    state: "ARAGUA",
    zone: "CENTRO",
  },
  { name: "ANDREA FERNANDEZ", state: "ZULIA", zone: "CENTRO" },
];

const ZONE_COLORS: Record<string, string> = {
  CENTRO: "#3b82f6",
  CARACAS: "#6366f1",
  OCCIDENTE: "#10b981",
  ORIENTE: "#f59e0b",
  ANDES: "#8b5cf6",
  LLANOS: "#06b6d4",
  SUR: "#f43f5e",
  INSULAR: "#ec4899",
  DEFAULT: "#f1f5f9",
};

const ZONES = [
  "TODAS",
  "CENTRO",
  "CARACAS",
  "OCCIDENTE",
  "ORIENTE",
  "ANDES",
  "LLANOS",
  "SUR",
  "INSULAR",
];

export function SellerMapPageClient() {
  const [mounted, setMounted] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedZone, setSelectedZone] = useState("TODAS");

  useEffect(() => {
    setMounted(true);
  }, []);

  const filteredSellers = useMemo(() => {
    return SELLERS_DATA.filter((seller) => {
      const matchesSearch =
        seller.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        seller.state.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesZone =
        selectedZone === "TODAS" || seller.zone === selectedZone;
      return matchesSearch && matchesZone;
    });
  }, [searchTerm, selectedZone]);

  const stats = useMemo(() => {
    const byZone = ZONES.reduce(
      (acc, zone) => {
        if (zone === "TODAS") return acc;
        acc[zone] = SELLERS_DATA.filter((s) => s.zone === zone).length;
        return acc;
      },
      {} as Record<string, number>,
    );
    return { total: SELLERS_DATA.length, byZone };
  }, []);

  return (
    <div className="min-h-screen bg-[#f1f5f9] p-4 md:p-10 space-y-10 animate-in fade-in duration-1000">
      <header className="relative overflow-hidden bg-white p-10 rounded-[3rem] shadow-[0_20px_50px_rgba(0,0,0,0.05)] border border-white/60">
        <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
          <div className="space-y-3">
            <Badge
              color="blue"
              icon={ShieldCheck}
              className="rounded-full px-4 py-1 text-[10px] uppercase tracking-widest font-black"
            >
              Fuerza de Ventas Auditada
            </Badge>
            <Title className="text-5xl font-black text-slate-900 tracking-tighter italic">
              Seller <span className="text-blue-600">Intelligence</span>
            </Title>
            <Text className="text-slate-500 text-lg max-w-xl font-medium">
              Control Maestro de Cobertura — Supervisión Christian R.
            </Text>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto bg-slate-50 p-4 rounded-[2rem]">
            <TextInput
              icon={Search}
              placeholder="Buscar agente o estado..."
              onChange={(e) => setSearchTerm(e.target.value)}
              className="rounded-2xl border-none shadow-sm min-w-[320px]"
            />
            <Select
              value={selectedZone}
              onValueChange={setSelectedZone}
              className="rounded-2xl border-none shadow-sm min-w-[180px]"
            >
              {ZONES.map((zone) => (
                <SelectItem key={zone} value={zone}>
                  {zone}
                </SelectItem>
              ))}
            </Select>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-8">
          <Card className="rounded-[3rem] border-none shadow-2xl p-8 bg-white h-[750px] flex flex-col relative overflow-hidden">
            <Title className="text-2xl font-black text-slate-800 uppercase italic mb-8">
              Mapa de Cobertura Nacional
            </Title>

            <div className="flex-1 bg-slate-50 rounded-[2.5rem] border border-slate-100 relative overflow-hidden flex items-center justify-center">
              {!mounted ? (
                <div className="text-center space-y-4">
                  <div className="h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
                  <Text className="font-bold text-slate-400">
                    Cargando Cartografía de Supricom...
                  </Text>
                </div>
              ) : (
                <ComposableMap
                  projection="geoMercator"
                  projectionConfig={{ scale: 3400, center: [-66, 7.5] }}
                  className="w-full h-full animate-in fade-in zoom-in-95 duration-1000"
                >
                  <Geographies geography={geoUrl}>
                    {({ geographies }) =>
                      geographies.map((geo) => {
                        // Resiliencia: Chequeamos varios nombres posibles del GeoJSON
                        let rawName =
                          geo.properties.name ||
                          geo.properties.NAME ||
                          geo.properties.NAME_1 ||
                          "";
                        let stateName = rawName
                          .toUpperCase()
                          .normalize("NFD")
                          .replace(/[\u0300-\u036f]/g, "");

                        // Fix histórico: Algunos mapas llaman "Vargas" a "La Guaira"
                        if (stateName === "VARGAS") stateName = "LA GUAIRA";

                        const sellerInState = SELLERS_DATA.find(
                          (s) =>
                            s.state
                              .normalize("NFD")
                              .replace(/[\u0300-\u036f]/g, "") === stateName,
                        );
                        const zone = sellerInState?.zone || "DEFAULT";
                        const isHighlighted =
                          selectedZone === "TODAS" || selectedZone === zone;
                        const fillColor = isHighlighted
                          ? ZONE_COLORS[zone] || ZONE_COLORS.DEFAULT
                          : "#f1f5f9";

                        return (
                          <Geography
                            key={geo.rsmKey}
                            geography={geo}
                            style={{
                              default: {
                                fill: fillColor,
                                outline: "none",
                                transition: "all 0.4s ease",
                              },
                              hover: {
                                fill: "#1e293b",
                                outline: "none",
                                cursor: "pointer",
                              },
                              pressed: { fill: "#0f172a", outline: "none" },
                            }}
                            className="stroke-white stroke-[0.8px]"
                          />
                        );
                      })
                    }
                  </Geographies>
                </ComposableMap>
              )}

              <div className="absolute bottom-8 left-8 bg-white/90 backdrop-blur-xl p-6 rounded-[2rem] shadow-xl border border-white/50 space-y-3">
                <Text className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 border-b pb-2">
                  Referencia de Zonas
                </Text>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  {Object.entries(ZONE_COLORS).map(
                    ([name, color]) =>
                      name !== "DEFAULT" && (
                        <div
                          key={name}
                          className="flex items-center gap-2 group cursor-pointer"
                          onClick={() => setSelectedZone(name)}
                        >
                          <div
                            className="h-2.5 w-2.5 rounded-full shadow-sm"
                            style={{ backgroundColor: color }}
                          />
                          <span
                            className={`text-[10px] font-bold tracking-tight ${selectedZone === name ? "text-blue-600" : "text-slate-600"}`}
                          >
                            {name}
                          </span>
                        </div>
                      ),
                  )}
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Sidebar y Tabla iguales a tu diseño previo... */}
        <aside className="lg:col-span-4 space-y-8">
          <Card className="p-0 rounded-[2.5rem] border-none shadow-xl overflow-hidden bg-white/80 backdrop-blur-md">
            <div className="bg-slate-900 p-8 text-white flex justify-between items-center">
              <div>
                <Text className="text-blue-400 font-black text-[11px] uppercase tracking-widest mb-1">
                  Fuerza de Ventas
                </Text>
                <div className="text-5xl font-black">{stats.total}</div>
              </div>
              <Users size={40} className="text-slate-700" />
            </div>
            <div className="p-8">
              <Title className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">
                Distribución Regional
              </Title>
              <div className="space-y-4 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                {Object.entries(stats.byZone).map(([zone, count]) => (
                  <motion.div
                    key={zone}
                    whileHover={{ x: 5 }}
                    className={`flex justify-between items-center p-4 rounded-2xl cursor-pointer transition-all ${selectedZone === zone ? "bg-blue-50 shadow-inner" : "hover:bg-slate-50"}`}
                    onClick={() => setSelectedZone(zone)}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: ZONE_COLORS[zone] }}
                      />
                      <Text
                        className={`text-sm font-bold ${selectedZone === zone ? "text-blue-700" : "text-slate-600"}`}
                      >
                        {zone}
                      </Text>
                    </div>
                    <Badge
                      color={selectedZone === zone ? "blue" : "slate"}
                      className="rounded-lg font-mono"
                    >
                      {count.toString().padStart(2, "0")}
                    </Badge>
                  </motion.div>
                ))}
              </div>
            </div>
          </Card>
        </aside>

        <div className="lg:col-span-12">
          {/* ... Tu Tabla de Cobertura aquí ... */}
          <Card className="rounded-[3rem] border-none shadow-2xl p-0 overflow-hidden bg-white">
            <div className="p-10 border-b border-slate-50 flex justify-between items-center bg-white">
              <Title className="text-2xl font-black text-slate-800 tracking-tight italic">
                Registro Maestro de Cobertura
              </Title>
              <Badge color="blue">
                {filteredSellers.length} Agentes en Vista
              </Badge>
            </div>
            <div className="overflow-x-auto custom-scrollbar">
              <Table>
                <TableHead className="bg-slate-50/50">
                  <TableRow>
                    <TableHeaderCell className="text-[11px] font-black uppercase text-slate-400 tracking-widest py-6 pl-10">
                      Agente Comercial
                    </TableHeaderCell>
                    <TableHeaderCell className="text-[11px] font-black uppercase text-slate-400 tracking-widest">
                      Ubicación
                    </TableHeaderCell>
                    <TableHeaderCell className="text-[11px] font-black uppercase text-slate-400 tracking-widest text-right pr-10">
                      Zona Logística
                    </TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  <AnimatePresence mode="popLayout">
                    {filteredSellers.map((seller, idx) => (
                      <motion.tr
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="group hover:bg-slate-50 transition-all duration-300 border-b border-slate-50 last:border-0"
                        key={`${seller.name}-${seller.state}-${idx}`}
                      >
                        <TableCell className="pl-10 py-5">
                          <div className="flex items-center gap-4">
                            <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-600 font-black text-sm group-hover:bg-blue-600 group-hover:text-white transition-all shadow-sm">
                              {seller.name.charAt(0)}
                            </div>
                            <span className="font-bold text-slate-800 uppercase tracking-tight text-sm italic">
                              {seller.name}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <MapPin size={14} className="text-blue-400" />
                            <span className="text-slate-600 font-bold text-sm tracking-tight">
                              {seller.state}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right pr-10">
                          <Badge
                            color={
                              seller.zone === "CENTRO"
                                ? "blue"
                                : seller.zone === "CARACAS"
                                  ? "indigo"
                                  : seller.zone === "OCCIDENTE"
                                    ? "emerald"
                                    : "slate"
                            }
                            className="rounded-xl px-4 py-1.5 font-black text-[10px] tracking-tighter"
                          >
                            {seller.zone}
                          </Badge>
                        </TableCell>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
