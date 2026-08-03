// "use client";

// import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// import {
//   Activity,
//   DollarSign,
//   Package,
//   ShoppingBag,
//   TrendingUp,
//   Users,
// } from "lucide-react";
// import { useTranslations } from "next-intl"; // Importamos el hook
// import { useEffect, useState } from "react";
// import {
//   Bar,
//   BarChart,
//   CartesianGrid,
//   Line,
//   LineChart,
//   ResponsiveContainer,
//   Tooltip,
//   XAxis,
//   YAxis,
// } from "recharts";

// export function SuperAdminView() {
//   const t = useTranslations("userManagement"); // Namespace para las traducciones
//   const [data, setData] = useState<any>(null);
//   const [loading, setLoading] = useState(true);
//   const [companyId, setCompanyId] = useState<string>("all");

//   useEffect(() => {
//     setLoading(true);
//     fetch(`/api/superadmin/stats?company_id=${companyId}`)
//       .then((res) => res.json())
//       .then((json) => {
//         const sanitizedData = {
//           ...json,
//           topClients: json.topClients?.slice(0, 5) || [],
//           topProducts: json.topProducts || [],
//           bottomProducts: json.bottomProducts || [],
//           salesByUser: json.salesByUser || [],
//           monthlyGrowth: json.monthlyGrowth || [],
//           brands: {
//             mostSold: json.brands?.mostSold?.slice(0, 5) || [],
//             leastSold: json.brands?.leastSold?.slice(0, 5) || [],
//           },
//           summary: json.summary || {
//             totalMonth: 0,
//             topProductName: "N/A",
//             growthRate: "0%",
//           },
//         };
//         setData(sanitizedData);
//         setLoading(false);
//       })
//       .catch((err) => {
//         console.error("Error:", err);
//         setLoading(false);
//       });
//   }, [companyId]);

//   if (loading)
//     return (
//       <div className="p-10 text-center font-bold text-slate-400 uppercase animate-pulse">
//         {t("loading.dashboard")}
//       </div>
//     );

//   return (
//     <div className="space-y-8 bg-slate-50/30 p-4">
//       {/* Selector de Sede */}
//       <div className="flex justify-end">
//         <select
//           className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-medium focus:outline-none"
//           value={companyId}
//           onChange={(e) => setCompanyId(e.target.value)}
//         >
//           <option value="all">{t("all_locations")}</option>
//           <option value="9">{t("valencia")}</option>
//           <option value="10">{t("caracas")}</option>
//           <option value="7">{t("panama")}</option>
//         </select>
//       </div>
//       {/* KPIs Superiores */}
//       <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
//         <MetricCard
//           title={t("monthly_sales")}
//           value={`$${data.summary.totalMonth.toLocaleString()}`}
//           icon={DollarSign}
//           trend={t("real")}
//           color="blue"
//         />
//         <MetricCard
//           title={t("star_product")}
//           value={data.summary.topProductName}
//           icon={Package}
//           trend={t("leader")}
//           color="purple"
//         />
//         <MetricCard
//           title={t("active_clients")}
//           value={data.summary.activeClientsCount}
//           icon={Users}
//           trend={t("total_odoo")}
//           color="green"
//         />
//         <MetricCard
//           title={t("growth")}
//           value={data.summary.growthRate}
//           icon={TrendingUp}
//           trend={t("monthly")}
//           color="orange"
//         />
//       </div>

//       <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
//         {/* Gráfico 1: Historial */}
//         <Card className="rounded-3xl border-none shadow-sm bg-white">
//           <CardHeader>
//             <CardTitle className="text-slate-700 font-bold">
//               {t("billing_history")}
//             </CardTitle>
//           </CardHeader>
//           <CardContent className="h-[300px]">
//             <ResponsiveContainer width="100%" height="100%">
//               <LineChart
//                 data={data.monthlyGrowth}
//                 margin={{ left: 40, right: 20, top: 20, bottom: 20 }} // Agregamos margen izquierdo
//               >
//                 <CartesianGrid
//                   strokeDasharray="3 3"
//                   vertical={false}
//                   stroke="#f1f5f9"
//                 />
//                 <XAxis dataKey="month" axisLine={false} tickLine={false} />
//                 <YAxis
//                   axisLine={false}
//                   tickLine={false}
//                   // Formatea 1000000 a 1M o 100k para ahorrar espacio
//                   tickFormatter={(value) =>
//                     value >= 1000
//                       ? `$${(value / 1000).toFixed(0)}k`
//                       : `$${value}`
//                   }
//                   width={80} // Forzamos un ancho fijo para el área de los números
//                 />
//                 <Tooltip
//                   formatter={(value: number) => `$${value.toLocaleString()}`}
//                 />
//                 <Line
//                   type="monotone"
//                   dataKey="total"
//                   stroke="#3b82f6"
//                   strokeWidth={4}
//                   dot={{ r: 4 }}
//                 />
//               </LineChart>
//             </ResponsiveContainer>
//           </CardContent>
//         </Card>

//         {/* Gráfico 2: VENDEDORES (Nuevo Requerimiento) */}
//         <Card className="rounded-3xl border-none shadow-sm bg-white">
//           <CardHeader>
//             <CardTitle className="text-slate-700 font-bold">
//               {t("top_sellers")}
//             </CardTitle>
//           </CardHeader>
//           <CardContent className="h-[300px]">
//             <ResponsiveContainer width="100%" height="100%">
//               <BarChart
//                 data={data.salesByUser}
//                 margin={{ left: 40, bottom: 40 }} // Margen para el eje Y y nombres largos abajo
//               >
//                 <CartesianGrid
//                   strokeDasharray="3 3"
//                   vertical={false}
//                   stroke="#f1f5f9"
//                 />
//                 <XAxis
//                   dataKey="name"
//                   tick={{ fontSize: 10 }}
//                   interval={0} // Obliga a mostrar todos los nombres
//                   angle={-20} // Rota los nombres para que no choquen
//                   textAnchor="end"
//                 />
//                 <YAxis
//                   axisLine={false}
//                   tickLine={false}
//                   tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
//                   width={80}
//                 />
//                 <Tooltip
//                   cursor={{ fill: "#f8fafc" }}
//                   formatter={(value: number) => `$${value.toLocaleString()}`}
//                 />
//                 <Bar
//                   dataKey="total"
//                   fill="#10b981"
//                   radius={[6, 6, 0, 0]}
//                   barSize={40}
//                 />
//               </BarChart>
//             </ResponsiveContainer>
//           </CardContent>
//         </Card>
//       </div>

//       {/* SECCIÓN DE LAS 4 TABLAS DE MARCAS Y PRODUCTOS */}
//       {/* Tablas de marcas y productos */}
//       <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
//         <RankTable
//           title={t("top_brands")}
//           data={data.brands.mostSold}
//           icon={TrendingUp}
//           color="green"
//         />
//         <RankTable
//           title={t("least_sold_brands")}
//           data={data.brands.leastSold}
//           icon={Activity}
//           color="red"
//         />
//         <RankTable
//           title={t("top_products")}
//           data={data.topProducts}
//           icon={Package}
//           color="blue"
//         />
//         <RankTable
//           title={t("least_sold_products")}
//           data={data.bottomProducts}
//           icon={ShoppingBag}
//           color="orange"
//         />
//       </div>

//       {/* TOP 5 CLIENTES */}
//       <Card className="rounded-3xl border-none shadow-sm overflow-hidden bg-white">
//         <CardHeader className="bg-slate-50/50 border-b border-slate-100">
//           <CardTitle className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
//             <Users size={16} /> {t("top_clients_title")}
//           </CardTitle>
//         </CardHeader>
//         <div className="divide-y divide-slate-100">
//           {data.topClients.map((client: any, i: number) => (
//             <div
//               key={i}
//               className="p-4 flex justify-between items-center hover:bg-slate-50 transition-colors group"
//             >
//               <div className="flex items-center gap-3">
//                 {/* Círculo con el número de posición */}
//                 <span className="w-6 h-6 rounded-full bg-blue-50 text-blue-600 text-[10px] font-bold flex items-center justify-center border border-blue-100">
//                   {i + 1}
//                 </span>
//                 <span className="font-bold text-slate-700 uppercase text-sm">
//                   {client.name}
//                 </span>
//               </div>
//               <div className="text-right">
//                 <p className="text-blue-600 font-black text-sm">
//                   $
//                   {client.total.toLocaleString("de-DE", {
//                     minimumFractionDigits: 2,
//                   })}
//                 </p>
//                 <p className="text-[10px] text-slate-400 font-medium uppercase">
//                   Total Facturado
//                 </p>
//               </div>
//             </div>
//           ))}
//         </div>
//       </Card>
//     </div>
//   );
// }

// // COMPONENTES DE APOYO REUTILIZABLES
// function RankTable({ title, data, icon: Icon, color }: any) {
//   // Colores dinámicos para los números de la lista
//   const colorMap: any = {
//     green: "bg-green-50 text-green-600",
//     red: "bg-red-50 text-red-600",
//     blue: "bg-blue-50 text-blue-600",
//     orange: "bg-orange-50 text-orange-600",
//   };

//   return (
//     <Card className="rounded-3xl border-none shadow-md bg-white overflow-hidden">
//       <CardHeader className="pb-3 border-b border-slate-50">
//         <CardTitle className="text-sm font-bold text-slate-700 flex items-center gap-2">
//           <Icon size={18} className="opacity-70" /> {title}
//         </CardTitle>
//       </CardHeader>
//       <CardContent className="pt-4">
//         <div className="space-y-4">
//           {data?.length > 0 ? (
//             data.map((item: any, i: number) => (
//               <div key={i} className="flex items-center gap-3 group">
//                 {/* Número de la lista tipo Badge */}
//                 <span
//                   className={`flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold ${colorMap[color] || "bg-slate-100"}`}
//                 >
//                   {i + 1}
//                 </span>

//                 <div className="flex-1 min-w-0">
//                   <p className="text-[12px] font-semibold text-slate-700 uppercase tracking-tight truncate leading-none">
//                     {item.name}
//                   </p>
//                 </div>

//                 {item.revenue !== undefined && (
//                   <span className="text-[12px] font-black text-slate-900 whitespace-nowrap">
//                     ${Number(item.revenue).toLocaleString("de-DE")}
//                   </span>
//                 )}
//               </div>
//             ))
//           ) : (
//             <p className="text-[11px] text-slate-400 text-center py-4">
//               Sin registros
//             </p>
//           )}
//         </div>
//       </CardContent>
//     </Card>
//   );
// }

// function MetricCard({ title, value, icon: Icon, trend, color }: any) {
//   const iconColors: any = {
//     blue: "bg-blue-50 text-blue-600",
//     green: "bg-green-50 text-green-600",
//     purple: "bg-purple-50 text-purple-600",
//     orange: "bg-orange-50 text-orange-600",
//   };
//   return (
//     <Card className="border-none shadow-sm rounded-3xl p-6 bg-white">
//       <div className="flex items-center gap-4">
//         <div className={`p-4 rounded-2xl ${iconColors[color]}`}>
//           <Icon size={24} />
//         </div>
//         <div className="min-w-0 flex-1">
//           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
//             {title}
//           </p>
//           <h4 className="text-lg font-black text-slate-900 truncate">
//             {value}
//           </h4>
//           <span className="text-[10px] text-green-500 font-bold bg-green-50 px-2 py-0.5 rounded-full">
//             {trend}
//           </span>
//         </div>
//       </div>
//     </Card>
//   );
// }
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Activity,
  DollarSign,
  Package,
  ShoppingBag,
  TrendingUp,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl"; // Importamos el hook
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Tooltip as RechartsTooltip,
  ResponsiveContainer, // Renombrado para no chocar con shadcn
  XAxis,
  YAxis,
} from "recharts";

// IMPORTACIONES NUEVAS PARA EL TOOLTIP Y EL TOGGLE
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function SuperAdminView() {
  const t = useTranslations("userManagement"); // Namespace para las traducciones
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string>("all");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/superadmin/stats?company_id=${companyId}`)
      .then((res) => res.json())
      .then((json) => {
        const sanitizedData = {
          ...json,
          topClients: (json.topClients || []).filter((c: any) => !c.name?.toLowerCase().includes("supricom")).slice(0, 5),
          topProducts: json.topProducts || [],
          bottomProducts: json.bottomProducts || [],
          salesByUser: json.salesByUser || [],
          monthlyGrowth: json.monthlyGrowth || [],
          brands: {
            mostSold: json.brands?.mostSold?.slice(0, 5) || [],
            leastSold: json.brands?.leastSold?.slice(0, 5) || [],
          },
          summary: json.summary || {
            totalMonth: 0,
            topProductName: "N/A",
            growthRate: "0%",
          },
        };
        setData(sanitizedData);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error:", err);
        setLoading(false);
      });
  }, [companyId]);

  if (loading)
    return (
      <div className="p-10 text-center font-bold text-slate-400 uppercase animate-pulse">
        {t("loading.dashboard")}
      </div>
    );

  return (
    <div className="space-y-8 bg-slate-50/30 p-4">
      {/* Selector de Sede */}
      <div className="flex justify-end">
        <select
          className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-medium focus:outline-none"
          value={companyId}
          onChange={(e) => setCompanyId(e.target.value)}
        >
          <option value="all">{t("all_locations")}</option>
          <option value="9">{t("valencia")}</option>
          <option value="10">{t("caracas")}</option>
          <option value="7">{t("panama")}</option>
        </select>
      </div>
      {/* KPIs Superiores */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          title={t("monthly_sales")}
          value={`$${data.summary.totalMonth.toLocaleString()}`}
          icon={DollarSign}
          trend={t("real")}
          color="blue"
        />
        <MetricCard
          title={t("star_product")}
          value={data.summary.topProductName}
          icon={Package}
          trend={t("leader")}
          color="purple"
        />
        <MetricCard
          title={t("active_clients")}
          value={data.summary.activeClientsCount}
          icon={Users}
          trend={t("total_odoo")}
          color="green"
        />
        <MetricCard
          title={t("growth")}
          value={data.summary.growthRate}
          icon={TrendingUp}
          trend={t("monthly")}
          color="orange"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico 1: Historial */}
        <Card className="rounded-3xl border-none shadow-sm bg-white">
          <CardHeader>
            <CardTitle className="text-slate-700 font-bold">
              {t("billing_history")}
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data.monthlyGrowth}
                margin={{ left: 40, right: 20, top: 20, bottom: 20 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#f1f5f9"
                />
                <XAxis dataKey="month" axisLine={false} tickLine={false} />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) =>
                    value >= 1000
                      ? `$${(value / 1000).toFixed(0)}k`
                      : `$${value}`
                  }
                  width={80}
                />
                <RechartsTooltip
                  formatter={(value: number) => `$${value.toLocaleString()}`}
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="#3b82f6"
                  strokeWidth={4}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Gráfico 2: VENDEDORES */}
        <Card className="rounded-3xl border-none shadow-sm bg-white">
          <CardHeader>
            <CardTitle className="text-slate-700 font-bold">
              {t("top_sellers")}
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.salesByUser}
                margin={{ left: 40, bottom: 40 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#f1f5f9"
                />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10 }}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                  width={80}
                />
                <RechartsTooltip
                  cursor={{ fill: "#f8fafc" }}
                  formatter={(value: number) => `$${value.toLocaleString()}`}
                />
                <Bar
                  dataKey="total"
                  fill="#10b981"
                  radius={[6, 6, 0, 0]}
                  barSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* SECCIÓN DE LAS 4 TABLAS DE MARCAS Y PRODUCTOS */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <RankTable
          title={t("top_brands")}
          data={data.brands.mostSold}
          icon={TrendingUp}
          color="green"
        />
        <RankTable
          title={t("least_sold_brands")}
          data={data.brands.leastSold}
          icon={Activity}
          color="red"
        />
        <RankTable
          title={t("top_products")}
          data={data.topProducts}
          icon={Package}
          color="blue"
        />
        <RankTable
          title={t("least_sold_products")}
          data={data.bottomProducts}
          icon={ShoppingBag}
          color="orange"
        />
      </div>

      {/* TOP 5 CLIENTES */}
      <Card className="rounded-3xl border-none shadow-sm overflow-hidden bg-white">
        <CardHeader className="bg-slate-50/50 border-b border-slate-100">
          <CardTitle className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
            <Users size={16} /> {t("top_clients_title")}
          </CardTitle>
        </CardHeader>
        <div className="divide-y divide-slate-100">
          {data.topClients.map((client: any, i: number) => (
            <div
              key={i}
              className="p-4 flex justify-between items-center hover:bg-slate-50 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-blue-50 text-blue-600 text-[10px] font-bold flex items-center justify-center border border-blue-100">
                  {i + 1}
                </span>
                <span className="font-bold text-slate-700 uppercase text-sm">
                  {client.name}
                </span>
              </div>
              <div className="text-right">
                <p className="text-blue-600 font-black text-sm">
                  $
                  {client.total.toLocaleString("de-DE", {
                    minimumFractionDigits: 2,
                  })}
                </p>
                <p className="text-[10px] text-slate-400 font-medium uppercase">
                  Total Facturado
                </p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// =====================================================================
// COMPONENTE RANKTABLE ACTUALIZADO CON TOOLTIP Y TOGGLE DE CANTIDAD/$
// =====================================================================
function RankTable({ title, data, icon: Icon, color }: any) {
  // Estado local para alternar entre monto y cantidad
  const [displayMode, setDisplayMode] = useState<"monto" | "cantidad">("monto");

  const colorMap: any = {
    green: "bg-green-50 text-green-600",
    red: "bg-red-50 text-red-600",
    blue: "bg-blue-50 text-blue-600",
    orange: "bg-orange-50 text-orange-600",
  };

  return (
    <Card className="rounded-3xl border-none shadow-md bg-white overflow-hidden flex flex-col">
      <CardHeader className="pb-3 border-b border-slate-50 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-bold text-slate-700 flex items-center gap-2">
          <Icon size={18} className="opacity-70" /> {title}
        </CardTitle>

        {/* Toggle para cambiar vista */}
        {/* <ToggleGroup
          type="single"
          value={displayMode}
          onValueChange={(val) => {
            if (val) setDisplayMode(val as "monto" | "cantidad");
          }}
          size="sm"
          className="h-6"
        >
          <ToggleGroupItem
            value="monto"
            className="h-6 px-2 text-[10px]"
            aria-label="Por Monto"
          >
            $
          </ToggleGroupItem>
          <ToggleGroupItem
            value="cantidad"
            className="h-6 px-2 text-[10px]"
            aria-label="Por Cantidad"
          >
            Und
          </ToggleGroupItem>
        </ToggleGroup> */}
      </CardHeader>

      <CardContent className="pt-4 flex-1">
        <TooltipProvider delayDuration={300}>
          <div className="space-y-4">
            {data?.length > 0 ? (
              data.map((item: any, i: number) => (
                <div key={i} className="flex items-center gap-3 group">
                  <span
                    className={`flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold ${colorMap[color] || "bg-slate-100"}`}
                  >
                    {i + 1}
                  </span>

                  {/* Nombre con Tooltip */}
                  <div className="flex-1 min-w-0">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p className="text-[12px] font-semibold text-slate-700 uppercase tracking-tight truncate cursor-default leading-none">
                          {item.name}
                        </p>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p className="text-xs">{item.name}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>

                  {/* Valores Dinámicos según el Toggle */}
                  <div className="flex flex-col items-end flex-shrink-0">
                    {displayMode === "monto" ? (
                      <>
                        <span className="text-[12px] font-black text-slate-900 whitespace-nowrap">
                          ${Number(item.revenue || 0).toLocaleString("de-DE")}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">
                          {Number(
                            item.quantity || item.cantidad || 0,
                          ).toLocaleString("de-DE")}{" "}
                          unds
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-[12px] font-black text-slate-900 whitespace-nowrap">
                          {Number(
                            item.quantity || item.cantidad || 0,
                          ).toLocaleString("de-DE")}{" "}
                          unds
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">
                          ${Number(item.revenue || 0).toLocaleString("de-DE")}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-[11px] text-slate-400 text-center py-4">
                Sin registros
              </p>
            )}
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}

// COMPONENTE METRICCARD SIN CAMBIOS
function MetricCard({ title, value, icon: Icon, trend, color }: any) {
  const iconColors: any = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    purple: "bg-purple-50 text-purple-600",
    orange: "bg-orange-50 text-orange-600",
  };
  return (
    <Card className="border-none shadow-sm rounded-3xl p-6 bg-white">
      <div className="flex items-center gap-4">
        <div className={`p-4 rounded-2xl ${iconColors[color]}`}>
          <Icon size={24} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            {title}
          </p>
          <h4 className="text-lg font-black text-slate-900 truncate">
            {value}
          </h4>
          <span className="text-[10px] text-green-500 font-bold bg-green-50 px-2 py-0.5 rounded-full">
            {trend}
          </span>
        </div>
      </div>
    </Card>
  );
}
