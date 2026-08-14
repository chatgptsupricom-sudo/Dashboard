// // "use client";

// // import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// // import { Clock, DollarSign, RotateCcw, Target, TrendingUp } from "lucide-react";
// // import { useEffect, useState } from "react";
// // import {
// //   Bar,
// //   BarChart,
// //   Cell,
// //   ReferenceArea,
// //   ResponsiveContainer,
// //   Tooltip,
// //   XAxis,
// //   YAxis,
// // } from "recharts";

// // export default function MetricsDashboardPage() {
// //   const [data, setData] = useState<any>(null);
// //   const [sellerId, setSellerId] = useState("");

// //   useEffect(() => {
// //     const url = sellerId ? `/api/adminleads/stats?seller_id=${sellerId}` : "/api/adminleads/stats";
// //     fetch(url)
// //       .then((res) => res.json())
// //       .then((res) => setData(res));
// //   }, [sellerId]);

// //   if (!data)
// //     return (
// //       <div className="p-10 text-center text-zinc-500 animate-pulse">
// //         Cargando panel...
// //       </div>
// //     );

// //   return (
// //     <div className="p-8 max-w-[1600px] mx-auto space-y-8">
// //       <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
// //         <div>
// //           <h1 className="text-2xl font-bold tracking-tight">Panel de Métricas</h1>
// //           <p className="text-zinc-500 text-sm">Resumen ejecutivo de rendimiento comercial</p>
// //         </div>
// //         <select
// //           className="px-4 py-2 rounded-xl border border-zinc-200 bg-white text-sm font-medium shadow-sm w-full md:w-64"
// //           value={sellerId}
// //           onChange={(e) => setSellerId(e.target.value)}
// //         >
// //           <option value="">Todos los vendedores</option>
// //           {data?.vendorData?.map((v: any) => (
// //             <option key={v.id} value={v.id}>{v.name}</option>
// //           ))}
// //         </select>
// //       </div>

// //       {/* 1. KPIs Principales en Grid optimizado */}
// //       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
// //         <MetricCard
// //           title="Monto Total"
// //           value={`$${data.stats?.monto_total?.toLocaleString() ?? "0"}`}
// //           icon={<DollarSign className="w-4 h-4" />}
// //         />
// //         <MetricCard
// //           title="Efectividad"
// //           value={`${Number(data.stats?.tasa_efectividad || 0).toFixed(1)}%`}
// //           icon={<Target className="w-4 h-4" />}
// //         />
// //         <MetricCard
// //           title="Cierres (Ventas)"
// //           value={data.stats?.total_ventas ?? "0"}
// //           icon={<TrendingUp className="w-4 h-4" />}
// //         />
// //         <MetricCard
// //           title="Avg. Contacto"
// //           value={formatMinutos(data.stats?.avg_tiempo_contacto ?? 0)}
// //           icon={<Clock className="w-4 h-4" />}
// //         />

// //         <MetricCard
// //         title="Avg. Cierre"
// //         value={formatMinutos(data.stats?.avg_tiempo_cierre ?? 0)}
// //         icon={<TrendingUp className="w-4 h-4" />}
// //       />

// //         <MetricCard
// //           title="Reactivación"
// //           value={`${Number(data.stats?.tasa_reactivacion || 0).toFixed(1)}%`}
// //           icon={<RotateCcw className="w-4 h-4" />}
// //         />
// //       </div>

// //       <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
// //         {/* 2. Top 5 + Distribución */}
// //         <div className="lg:col-span-1 space-y-6">
// //           <Card className="shadow-none border-zinc-200 rounded-2xl">
// //             <CardHeader>
// //               <CardTitle className="text-sm font-semibold">
// //                 Leads por Etapa
// //               </CardTitle>
// //             </CardHeader>
// //             <CardContent className="h-[250px]">
// //               <ResponsiveContainer width="100%" height="100%">
// //                 <BarChart
// //                   data={(() => {
// //                     const flat: any[] = [];
// //                     (data.stageData || []).forEach((e: any) => {
// //                       if (e.status === "CERRADO") {
// //                         flat.push({ name: "Venta", value: parseInt(e.venta) || 0, color: "#10b981", group: "CERRADO" });
// //                         flat.push({ name: "Abandono", value: parseInt(e.abandono) || 0, color: "#ef4444", group: "CERRADO" });
// //                       } else {
// //                         flat.push({ name: e.status, value: parseInt(e.count) || 0, color: e.status === "NUEVO" ? "#3b82f6" : "#f59e0b" });
// //                       }
// //                     });
// //                     return flat;
// //                   })()}
// //                   margin={{ top: 24, right: 8, left: -20, bottom: 0 }}
// //                 >
// //                   <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} />
// //                   <YAxis fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
// //                   <Tooltip cursor={{ fill: "#f1f5f9" }} formatter={(val: any, _: any, props: any) => [val, props.payload?.name]} />
// //                   <ReferenceArea x1="Venta" x2="Abandono" fill="#f8fafc" stroke="#e2e8f0" strokeWidth={1} label={{ value: "CERRADO", position: "top", fontSize: 10, fill: "#64748b", fontWeight: 700 }} />
// //                   <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={48}>
// //                     {(() => {
// //                       const flat: any[] = [];
// //                       (data.stageData || []).forEach((e: any) => {
// //                         if (e.status === "CERRADO") {
// //                           flat.push(<Cell key="venta" fill="#10b981" />);
// //                           flat.push(<Cell key="abandono" fill="#ef4444" />);
// //                         } else {
// //                           flat.push(<Cell key={e.status} fill={e.status === "NUEVO" ? "#3b82f6" : "#f59e0b"} />);
// //                         }
// //                       });
// //                       return flat;
// //                     })()}
// //                   </Bar>
// //                 </BarChart>
// //               </ResponsiveContainer>
// //             </CardContent>
// //           </Card>

// //           <Card className="shadow-none border border-zinc-200 rounded-2xl bg-white">
// //             <CardHeader className="pb-3 border-b border-zinc-50">
// //               <CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-500">
// //                 Top 5 Vendedores - Cierres
// //               </CardTitle>
// //             </CardHeader>
// //             <CardContent className="pt-4">
// //               {data?.topVendors && data.topVendors.length > 0 ? (
// //                 <div className="space-y-3">
// //                   {data.topVendors.map((v: any, i: number) => (
// //                     <div
// //                       key={v.name}
// //                       className="flex justify-between items-center group"
// //                     >
// //                       <div className="flex items-center gap-3">
// //                         <span className="text-xs font-mono text-zinc-400 w-4">
// //                           {i + 1}
// //                         </span>
// //                         <span className="text-sm text-zinc-700 font-medium group-hover:text-blue-600 transition-colors">
// //                           {v.name}
// //                         </span>
// //                       </div>
// //                       <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
// //                         {v.total_ventas} cierres
// //                       </span>
// //                     </div>
// //                   ))}
// //                 </div>
// //               ) : (
// //                 <div className="flex flex-col items-center justify-center py-6 text-zinc-400">
// //                   <Target className="w-8 h-8 opacity-20 mb-2" />
// //                   <p className="text-xs italic">Sin cierres registrados aún.</p>
// //                 </div>
// //               )}
// //             </CardContent>
// //           </Card>
// //         </div>

// //         {/* 3. Tabla Rendimiento (Main) */}
// //         <div className="lg:col-span-2 bg-white rounded-2xl border border-zinc-200 overflow-hidden">
// //           <div className="px-6 py-4 border-b border-zinc-100 font-semibold text-sm">
// //             Rendimiento por Vendedor
// //           </div>
// //           <table className="w-full text-xs">
// //             <thead className="bg-zinc-50/50 text-zinc-500">
// //               <tr>
// //                 <th className="px-6 py-3 text-left">Vendedor</th>
// //                 <th className="px-6 py-3 text-center">Activos</th>
// //                 <th className="px-6 py-3 text-center">Ganados</th>
// //                 <th className="px-6 py-3 text-center">Recaudo</th>
// //                 <th className="px-6 py-3 text-center">Conversión</th>
// //               </tr>
// //             </thead>
// //             <tbody className="divide-y divide-zinc-100">
// //               {data?.vendorData?.map((v: any) => (
// //                 <tr
// //                   key={v.id}
// //                   className="hover:bg-zinc-50/80 transition-colors"
// //                 >
// //                   <td className="px-6 py-4 font-medium text-zinc-900">
// //                     {v.name}
// //                   </td>
// //                   <td className="px-6 py-4 text-center">{v.activos}</td>
// //                   <td className="px-6 py-4 text-center font-bold text-emerald-600">
// //                     {v.ganados}
// //                   </td>
// //                   <td className="px-6 py-4 text-center font-semibold">
// //                     $ {v.recaudo?.toLocaleString()}
// //                   </td>
// //                   <td className="px-6 py-4 text-center text-blue-600 font-bold">
// //                     {v.tasa_conversion}%
// //                   </td>
// //                 </tr>
// //               ))}
// //             </tbody>
// //           </table>
// //         </div>
// //       </div>
// //     </div>
// //   );
// // }

// // function formatMinutos(min: number): string {
// //   if (min === null || min === undefined) return "—";
// //   if (min <= 0) return "< 1m";
// //   const dias = Math.floor(min / (24 * 60));
// //   const horas = Math.floor((min % (24 * 60)) / 60);
// //   const minutos = Math.round(min % 60);
// //   if (dias > 0) return `${dias}d ${horas}h ${minutos}m`;
// //   if (horas > 0) return `${horas}h ${minutos}m`;
// //   return `${minutos}m`;
// // }

// // function MetricCard({ title, value, icon }: any) {
// //   return (
// //     <Card className="rounded-2xl border-zinc-200 shadow-none hover:border-blue-200 transition-colors">
// //       <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
// //         <CardTitle className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
// //           {title}
// //         </CardTitle>
// //         <div className="text-zinc-400">{icon}</div>
// //       </CardHeader>
// //       <CardContent>
// //         <div className="text-xl font-bold tracking-tight text-zinc-900">
// //           {value}
// //         </div>
// //       </CardContent>
// //     </Card>
// //   );
// // }
// "use client";

// import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// import {
//   Clock,
//   DollarSign,
//   MapPin,
//   RotateCcw,
//   Target,
//   TrendingUp,
// } from "lucide-react";
// import { useEffect, useState } from "react";
// import {
//   Bar,
//   BarChart,
//   Cell,
//   ReferenceArea,
//   ResponsiveContainer,
//   Tooltip,
//   XAxis,
//   YAxis,
// } from "recharts";

// export default function MetricsDashboardPage() {
//   const [data, setData] = useState<any>(null);
//   const [sellerId, setSellerId] = useState("");

//   useEffect(() => {
//     const url = sellerId
//       ? `/api/adminleads/stats?seller_id=${sellerId}`
//       : "/api/adminleads/stats";
//     fetch(url)
//       .then((res) => res.json())
//       .then((res) => setData(res));
//   }, [sellerId]);

//   if (!data)
//     return (
//       <div className="p-10 text-center text-zinc-500 animate-pulse">
//         Cargando panel...
//       </div>
//     );

//   return (
//     <div className="p-8 max-w-[1600px] mx-auto space-y-8">
//       <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
//         <div>
//           <h1 className="text-2xl font-bold tracking-tight">
//             Panel de Métricas
//           </h1>
//           <p className="text-zinc-500 text-sm">
//             Resumen ejecutivo de rendimiento comercial
//           </p>
//         </div>
//         <select
//           className="px-4 py-2 rounded-xl border border-zinc-200 bg-white text-sm font-medium shadow-sm w-full md:w-64"
//           value={sellerId}
//           onChange={(e) => setSellerId(e.target.value)}
//         >
//           <option value="">Todos los vendedores</option>
//           {data?.vendorData?.map((v: any) => (
//             <option key={v.id} value={v.id}>
//               {v.name}
//             </option>
//           ))}
//         </select>
//       </div>

//       {/* 1. KPIs Principales en Grid optimizado */}
//       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
//         <MetricCard
//           title="Monto Total"
//           value={
//             data.stats?.monto_total > 0
//               ? `$${Number(data.stats.monto_total).toLocaleString()}`
//               : null
//           }
//           emptyText="Sin ventas"
//           icon={<DollarSign className="w-4 h-4" />}
//         />
//         <MetricCard
//           title="Efectividad"
//           value={
//             data.stats?.tasa_efectividad > 0
//               ? `${Number(data.stats.tasa_efectividad).toFixed(1)}%`
//               : null
//           }
//           emptyText="Sin cierres"
//           icon={<Target className="w-4 h-4" />}
//         />
//         <MetricCard
//           title="Cierres (Ventas)"
//           value={data.stats?.total_ventas > 0 ? data.stats.total_ventas : null}
//           emptyText="Sin cierres"
//           icon={<TrendingUp className="w-4 h-4" />}
//         />
//         <MetricCard
//           title="Avg. Contacto"
//           value={
//             data.stats?.avg_tiempo_contacto > 0
//               ? formatMinutos(data.stats.avg_tiempo_contacto)
//               : null
//           }
//           emptyText="Sin contactos"
//           icon={<Clock className="w-4 h-4" />}
//         />
//         <MetricCard
//           title="Avg. Cierre"
//           value={
//             data.stats?.avg_tiempo_cierre > 0
//               ? formatMinutos(data.stats.avg_tiempo_cierre)
//               : null
//           }
//           emptyText="Sin cierres"
//           icon={<TrendingUp className="w-4 h-4" />}
//         />
//         <MetricCard
//           title="Reactivación"
//           value={
//             data.stats?.tasa_reactivacion > 0
//               ? `${Number(data.stats.tasa_reactivacion).toFixed(1)}%`
//               : null
//           }
//           emptyText="Sin reactivaciones"
//           icon={<RotateCcw className="w-4 h-4" />}
//         />
//       </div>

//       <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
//         {/* 2. Top 5 + Distribución */}
//         <div className="lg:col-span-1 space-y-6">
//           <Card className="shadow-none border-zinc-200 rounded-2xl">
//             <CardHeader>
//               <CardTitle className="text-sm font-semibold">
//                 Leads por Etapa
//               </CardTitle>
//             </CardHeader>
//             <CardContent className="h-[250px]">
//               <ResponsiveContainer width="100%" height="100%">
//                 <BarChart
//                   data={(() => {
//                     const flat: any[] = [];
//                     (data.stageData || []).forEach((e: any) => {
//                       if (e.status === "CERRADO") {
//                         flat.push({
//                           name: "Venta",
//                           value: parseInt(e.venta) || 0,
//                           color: "#10b981",
//                           group: "CERRADO",
//                         });
//                         flat.push({
//                           name: "Abandono",
//                           value: parseInt(e.abandono) || 0,
//                           color: "#ef4444",
//                           group: "CERRADO",
//                         });
//                       } else {
//                         flat.push({
//                           name: e.status,
//                           value: parseInt(e.count) || 0,
//                           color: e.status === "NUEVO" ? "#3b82f6" : "#f59e0b",
//                         });
//                       }
//                     });
//                     return flat;
//                   })()}
//                   margin={{ top: 24, right: 8, left: -20, bottom: 0 }}
//                 >
//                   <XAxis
//                     dataKey="name"
//                     fontSize={10}
//                     tickLine={false}
//                     axisLine={false}
//                   />
//                   <YAxis
//                     fontSize={10}
//                     tickLine={false}
//                     axisLine={false}
//                     allowDecimals={false}
//                   />
//                   <Tooltip
//                     cursor={{ fill: "#f1f5f9" }}
//                     formatter={(val: any, _: any, props: any) => [
//                       val,
//                       props.payload?.name,
//                     ]}
//                   />
//                   <ReferenceArea
//                     x1="Venta"
//                     x2="Abandono"
//                     fill="#f8fafc"
//                     stroke="#e2e8f0"
//                     strokeWidth={1}
//                     label={{
//                       value: "CERRADO",
//                       position: "top",
//                       fontSize: 10,
//                       fill: "#64748b",
//                       fontWeight: 700,
//                     }}
//                   />
//                   <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={48}>
//                     {(() => {
//                       const flat: any[] = [];
//                       (data.stageData || []).forEach((e: any) => {
//                         if (e.status === "CERRADO") {
//                           flat.push(<Cell key="venta" fill="#10b981" />);
//                           flat.push(<Cell key="abandono" fill="#ef4444" />);
//                         } else {
//                           flat.push(
//                             <Cell
//                               key={e.status}
//                               fill={
//                                 e.status === "NUEVO" ? "#3b82f6" : "#f59e0b"
//                               }
//                             />,
//                           );
//                         }
//                       });
//                       return flat;
//                     })()}
//                   </Bar>
//                 </BarChart>
//               </ResponsiveContainer>
//             </CardContent>
//           </Card>

//           <Card className="shadow-none border border-zinc-200 rounded-2xl bg-white">
//             <CardHeader className="pb-3 border-b border-zinc-50">
//               <CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-500">
//                 Top 5 Vendedores - Cierres
//               </CardTitle>
//             </CardHeader>
//             <CardContent className="pt-4">
//               {data?.topVendors && data.topVendors.length > 0 ? (
//                 <div className="space-y-3">
//                   {data.topVendors.map((v: any, i: number) => (
//                     <div
//                       key={v.name}
//                       className="flex justify-between items-center group"
//                     >
//                       <div className="flex items-center gap-3">
//                         <span className="text-xs font-mono text-zinc-400 w-4">
//                           {i + 1}
//                         </span>
//                         <span className="text-sm text-zinc-700 font-medium group-hover:text-blue-600 transition-colors">
//                           {v.name}
//                         </span>
//                       </div>
//                       <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
//                         {v.total_ventas} cierres
//                       </span>
//                     </div>
//                   ))}
//                 </div>
//               ) : (
//                 <div className="flex flex-col items-center justify-center py-6 text-zinc-400">
//                   <Target className="w-8 h-8 opacity-20 mb-2" />
//                   <p className="text-xs italic">Sin cierres registrados aún.</p>
//                 </div>
//               )}
//             </CardContent>
//           </Card>
//         </div>

//         {/* 3. Tabla Rendimiento (Main) */}
//         <div className="lg:col-span-2 space-y-6">
//           {/* Ranking de estados */}
//           <Card className="shadow-none border-zinc-200 rounded-2xl">
//             <CardHeader className="pb-3 border-b border-zinc-50">
//               <CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-2">
//                 <MapPin className="w-3.5 h-3.5" /> Leads por Estado (Ubicación)
//               </CardTitle>
//             </CardHeader>
//             <CardContent className="pt-4">
//               {data?.ubicacionRanking && data.ubicacionRanking.length > 0 ? (
//                 (() => {
//                   const max = Math.max(
//                     ...data.ubicacionRanking.map((r: any) => Number(r.total)),
//                   );
//                   return (
//                     <div className="space-y-2.5">
//                       {data.ubicacionRanking.map((r: any, i: number) => (
//                         <div
//                           key={r.ubicacion_estado}
//                           className="flex items-center gap-3"
//                         >
//                           <span className="text-[10px] font-mono text-zinc-400 w-4 flex-shrink-0">
//                             {i + 1}
//                           </span>
//                           <span className="text-xs text-zinc-700 font-medium w-32 truncate flex-shrink-0">
//                             {r.ubicacion_estado}
//                           </span>
//                           <div className="flex-1 bg-zinc-100 rounded-full h-2 overflow-hidden">
//                             <div
//                               className="h-full bg-blue-500 rounded-full transition-all duration-500"
//                               style={{
//                                 width: `${(Number(r.total) / max) * 100}%`,
//                               }}
//                             />
//                           </div>
//                           <span className="text-xs font-bold text-zinc-600 w-8 text-right flex-shrink-0">
//                             {r.total}
//                           </span>
//                         </div>
//                       ))}
//                     </div>
//                   );
//                 })()
//               ) : (
//                 <div className="flex flex-col items-center justify-center py-6 text-zinc-400">
//                   <MapPin className="w-8 h-8 opacity-20 mb-2" />
//                   <p className="text-xs italic">Sin datos de ubicación.</p>
//                 </div>
//               )}
//             </CardContent>
//           </Card>

//           <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
//             <div className="px-6 py-4 border-b border-zinc-100 font-semibold text-sm">
//               Rendimiento por Vendedor
//             </div>
//             <table className="w-full text-xs">
//               <thead className="bg-zinc-50/50 text-zinc-500">
//                 <tr>
//                   <th className="px-6 py-3 text-left">Vendedor</th>
//                   <th className="px-6 py-3 text-center">Activos</th>
//                   <th className="px-6 py-3 text-center">Ganados</th>
//                   <th className="px-6 py-3 text-center">Recaudo</th>
//                   <th className="px-6 py-3 text-center">Conversión</th>
//                 </tr>
//               </thead>
//               <tbody className="divide-y divide-zinc-100">
//                 {data?.vendorData?.map((v: any) => (
//                   <tr
//                     key={v.id}
//                     className="hover:bg-zinc-50/80 transition-colors"
//                   >
//                     <td className="px-6 py-4 font-medium text-zinc-900">
//                       {v.name}
//                     </td>
//                     <td className="px-6 py-4 text-center">{v.activos}</td>
//                     <td className="px-6 py-4 text-center font-bold text-emerald-600">
//                       {v.ganados}
//                     </td>
//                     <td className="px-6 py-4 text-center font-semibold">
//                       $ {v.recaudo?.toLocaleString()}
//                     </td>
//                     <td className="px-6 py-4 text-center text-blue-600 font-bold">
//                       {v.tasa_conversion}%
//                     </td>
//                   </tr>
//                 ))}
//               </tbody>
//             </table>
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// }

// function formatMinutos(min: number): string {
//   if (min === null || min === undefined) return "—";
//   if (min <= 0) return "< 1m";
//   const dias = Math.floor(min / (24 * 60));
//   const horas = Math.floor((min % (24 * 60)) / 60);
//   const minutos = Math.round(min % 60);
//   if (dias > 0) return `${dias}d ${horas}h ${minutos}m`;
//   if (horas > 0) return `${horas}h ${minutos}m`;
//   return `${minutos}m`;
// }

// function MetricCard({ title, value, icon, emptyText = "Sin datos" }: any) {
//   const isEmpty = value === null || value === undefined;
//   return (
//     <Card className="rounded-2xl border-zinc-200 shadow-none hover:border-blue-200 transition-colors">
//       <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
//         <CardTitle className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
//           {title}
//         </CardTitle>
//         <div className={isEmpty ? "text-zinc-300" : "text-zinc-400"}>
//           {icon}
//         </div>
//       </CardHeader>
//       <CardContent>
//         {isEmpty ? (
//           <div className="text-sm font-medium text-zinc-300 italic">
//             {emptyText}
//           </div>
//         ) : (
//           <div className="text-xl font-bold tracking-tight text-zinc-900">
//             {value}
//           </div>
//         )}
//       </CardContent>
//     </Card>
//   );
// }
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Clock,
  DollarSign,
  Download,
  Loader2,
  MapPin,
  PackageX,
  RotateCcw,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const DATE_PRESETS = [
  { label: "Hoy", getValue: () => { const d = fmt(new Date()); return [d, d]; } },
  { label: "Esta semana", getValue: () => { const now = new Date(); const mon = new Date(now); mon.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1)); return [fmt(mon), fmt(now)]; } },
  { label: "Este mes", getValue: () => { const now = new Date(); return [fmt(new Date(now.getFullYear(), now.getMonth(), 1)), fmt(now)]; } },
  { label: "Mes pasado", getValue: () => { const now = new Date(); const first = new Date(now.getFullYear(), now.getMonth() - 1, 1); const last = new Date(now.getFullYear(), now.getMonth(), 0); return [fmt(first), fmt(last)]; } },
  { label: "Últimos 30 días", getValue: () => { const now = new Date(); const from = new Date(now); from.setDate(now.getDate() - 29); return [fmt(from), fmt(now)]; } },
  { label: "Este año", getValue: () => { const now = new Date(); return [fmt(new Date(now.getFullYear(), 0, 1)), fmt(now)]; } },
];

function fmt(d: Date) {
  return d.toISOString().slice(0, 10);
}


const SEDES = [
  { label: "Valencia", value: "9" },
  { label: "Caracas", value: "10" },
];

export default function MetricsDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [sellerId, setSellerId] = useState("");
  const [sede, setSede] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [preset, setPreset] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    setError(null);
    setData(null);
    const params = new URLSearchParams();
    if (sede) params.set("sede", sede);
    if (sellerId) params.set("seller_id", sellerId);
    if (fechaInicio) params.set("fecha_inicio", fechaInicio);
    if (fechaFin) params.set("fecha_fin", fechaFin);
    const url = `/api/adminleads/stats${params.toString() ? "?" + params.toString() : ""}`;
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`Error ${res.status}: ${res.statusText}`);
        return res.json();
      })
      .then((res) => {
        if (res.error) throw new Error(res.error);
        setData(res);
      })
      .catch((err) => {
        console.error("Error cargando stats:", err);
        setError(err.message || "No se pudieron cargar los datos");
      });
  }, [sellerId, sede, fechaInicio, fechaFin]);

  const exportarExcel = async () => {
    setExportando(true);
    try {
      const params = new URLSearchParams();
      if (sede) params.set("sede", sede);
      if (sellerId) params.set("seller_id", sellerId);
      if (fechaInicio) params.set("fecha_inicio", fechaInicio);
      if (fechaFin) params.set("fecha_fin", fechaFin);
      const res = await fetch(`/api/adminleads/export?${params.toString()}`);
      if (!res.ok) {
        const err = await res
          .json()
          .catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="(.+?)"/);
      a.download = match?.[1] || "metricas.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert("Error al exportar: " + e.message);
    } finally {
      setExportando(false);
    }
  };

  if (error)
    return (
      <div className="p-10 text-center">
        <div className="inline-flex flex-col items-center gap-3 bg-red-50 border border-red-200 rounded-2xl px-8 py-6 text-red-700">
          <span className="text-2xl">⚠️</span>
          <p className="font-semibold">Error al cargar el panel</p>
          <p className="text-sm text-red-500">{error}</p>
          <button
            onClick={() => setSellerId(sellerId)}
            className="mt-2 px-4 py-1.5 bg-red-100 hover:bg-red-200 rounded-lg text-sm font-medium transition-colors"
          >
            Reintentar
          </button>
        </div>
      </div>
    );

  if (!data)
    return (
      <div className="p-10 text-center text-zinc-500 animate-pulse">
        Cargando panel...
      </div>
    );

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Panel de Métricas
          </h1>
          <p className="text-zinc-500 text-sm">
            Resumen ejecutivo de rendimiento comercial
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <select
            className="px-4 py-2 rounded-xl border border-zinc-200 bg-white text-sm font-medium shadow-sm"
            value={sede}
            onChange={(e) => {
              setSede(e.target.value);
              setSellerId("");
            }}
          >
            <option value="">Todas las sedes</option>
            {SEDES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <select
            className="px-4 py-2 rounded-xl border border-zinc-200 bg-white text-sm font-medium shadow-sm"
            value={sellerId}
            onChange={(e) => setSellerId(e.target.value)}
          >
            <option value="">Todos los vendedores</option>
            {data?.vendorData?.map((v: any) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            <select
              className="px-4 py-2 rounded-xl border border-zinc-200 bg-white text-sm font-medium shadow-sm"
              value={preset}
              onChange={(e) => {
                const val = e.target.value;
                if (!val) {
                  setPreset("");
                  setFechaInicio("");
                  setFechaFin("");
                } else {
                  const found = DATE_PRESETS.find((p) => p.label === val);
                  if (found) {
                    const [ini, fin] = found.getValue();
                    setPreset(val);
                    setFechaInicio(ini);
                    setFechaFin(fin);
                  }
                }
              }}
            >
              <option value="">Todas las fechas</option>
              {DATE_PRESETS.map((p) => (
                <option key={p.label} value={p.label}>{p.label}</option>
              ))}
            </select>
          </div>
          <button
            onClick={exportarExcel}
            disabled={!data || exportando}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors shadow-sm whitespace-nowrap"
          >
            {exportando ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Download size={16} />
            )}
            {exportando ? "Exportando..." : "Exportar Excel"}
          </button>
        </div>
      </div>

      {/* 1. KPIs Principales en Grid optimizado */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-4">
        <MetricCard
          title="Total Leads"
          value={
            data.stats?.total_leads > 0 ? data.stats.total_leads : null
          }
          emptyText="Sin leads"
          icon={<Users className="w-4 h-4" />}
        />
        <MetricCard
          title="Monto Total"
          value={
            data.stats?.monto_total > 0
              ? `$${Number(data.stats.monto_total).toLocaleString()}`
              : null
          }
          emptyText="Sin ventas"
          icon={<DollarSign className="w-4 h-4" />}
        />
        <MetricCard
          title="Efectividad"
          value={
            data.stats?.tasa_efectividad > 0
              ? `${Number(data.stats.tasa_efectividad).toFixed(1)}%`
              : null
          }
          emptyText="Sin cierres"
          icon={<Target className="w-4 h-4" />}
        />
        <MetricCard
          title="Cierres (Ventas)"
          value={data.stats?.total_ventas > 0 ? data.stats.total_ventas : null}
          emptyText="Sin cierres"
          icon={<TrendingUp className="w-4 h-4" />}
        />
        <MetricCard
          title="Avg. Contacto"
          value={
            data.stats?.avg_tiempo_contacto > 0
              ? formatMinutos(data.stats.avg_tiempo_contacto)
              : null
          }
          emptyText="Sin contactos"
          icon={<Clock className="w-4 h-4" />}
        />
        <MetricCard
          title="Avg. Cierre"
          value={
            data.stats?.avg_tiempo_cierre > 0
              ? formatMinutos(data.stats.avg_tiempo_cierre)
              : null
          }
          emptyText="Sin cierres"
          icon={<TrendingUp className="w-4 h-4" />}
        />
        <MetricCard
          title="Reactivación"
          value={
            data.stats?.tasa_reactivacion > 0
              ? `${Number(data.stats.tasa_reactivacion).toFixed(1)}%`
              : null
          }
          emptyText="Sin reactivaciones"
          icon={<RotateCcw className="w-4 h-4" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 2. Top 5 + Distribución */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="shadow-none border-zinc-200 rounded-2xl">
            <CardHeader>
              <CardTitle className="text-sm font-semibold">
                Leads por Etapa
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={(() => {
                    const flat: any[] = [];
                    (data.stageData || []).forEach((e: any) => {
                      if (e.status === "CERRADO") {
                        flat.push({
                          name: "Venta",
                          value: parseInt(e.venta) || 0,
                          color: "#10b981",
                          group: "CERRADO",
                        });
                        flat.push({
                          name: "Abandono",
                          value: parseInt(e.abandono) || 0,
                          color: "#ef4444",
                          group: "CERRADO",
                        });
                      } else {
                        flat.push({
                          name: e.status,
                          value: parseInt(e.count) || 0,
                          color: e.status === "NUEVO" ? "#3b82f6" : "#f59e0b",
                        });
                      }
                    });
                    return flat;
                  })()}
                  margin={{ top: 24, right: 8, left: -20, bottom: 0 }}
                >
                  <XAxis
                    dataKey="name"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    cursor={{ fill: "#f1f5f9" }}
                    formatter={(val: any, _: any, props: any) => [
                      val,
                      props.payload?.name,
                    ]}
                  />
                  <ReferenceArea
                    x1="Venta"
                    x2="Abandono"
                    fill="#f8fafc"
                    stroke="#e2e8f0"
                    strokeWidth={1}
                    label={{
                      value: "CERRADO",
                      position: "top",
                      fontSize: 10,
                      fill: "#64748b",
                      fontWeight: 700,
                    }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={48}>
                    {(() => {
                      const flat: any[] = [];
                      (data.stageData || []).forEach((e: any) => {
                        if (e.status === "CERRADO") {
                          flat.push(<Cell key="venta" fill="#10b981" />);
                          flat.push(<Cell key="abandono" fill="#ef4444" />);
                        } else {
                          flat.push(
                            <Cell
                              key={e.status}
                              fill={
                                e.status === "NUEVO" ? "#3b82f6" : "#f59e0b"
                              }
                            />,
                          );
                        }
                      });
                      return flat;
                    })()}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="shadow-none border border-zinc-200 rounded-2xl bg-white">
            <CardHeader className="pb-3 border-b border-zinc-50">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                Top 5 Vendedores - Cierres
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {data?.topVendors && data.topVendors.length > 0 ? (
                <div className="space-y-3">
                  {data.topVendors.map((v: any, i: number) => (
                    <div
                      key={v.name}
                      className="flex justify-between items-center group"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-zinc-400 w-4">
                          {i + 1}
                        </span>
                        <span className="text-sm text-zinc-700 font-medium group-hover:text-blue-600 transition-colors">
                          {v.name}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
                        {v.total_ventas} cierres
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-zinc-400">
                  <Target className="w-8 h-8 opacity-20 mb-2" />
                  <p className="text-xs italic">Sin cierres registrados aún.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top Productos Sin Stock */}
          <Card className="shadow-none border border-zinc-200 rounded-2xl bg-white">
            <CardHeader className="pb-3 border-b border-zinc-50">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-2">
                <PackageX className="w-3.5 h-3.5 text-red-400" /> Top Productos Sin Stock
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {data?.topProductosSinStock && data.topProductosSinStock.length > 0 ? (
                <div className="space-y-3">
                  {data.topProductosSinStock.map((p: any, i: number) => {
                    const max = data.topProductosSinStock[0].total;
                    const pct = Math.round((p.total / max) * 100);
                    return (
                      <div key={p.producto} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[10px] font-mono text-zinc-400 w-4 shrink-0">{i + 1}</span>
                            <span className="text-xs text-zinc-700 font-medium truncate" title={p.producto}>{p.producto}</span>
                          </div>
                          <span className="text-[10px] font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-full ml-2 shrink-0">
                            {p.total}x
                          </span>
                        </div>
                        <div className="ml-6 w-full bg-zinc-100 rounded-full h-1.5 overflow-hidden">
                          <div className="h-full rounded-full bg-red-400 transition-all duration-500" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-zinc-400">
                  <PackageX className="w-8 h-8 opacity-20 mb-2" />
                  <p className="text-xs italic">Sin registros de productos sin stock.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 3. Tabla Rendimiento (Main) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Ranking de estados */}
          <Card className="shadow-none border-zinc-200 rounded-2xl">
            <CardHeader className="pb-3 border-b border-zinc-50">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5" /> Leads por Estado (Ubicación)
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {data?.ubicacionRanking && data.ubicacionRanking.length > 0 ? (
                (() => {
                  const max = Math.max(
                    ...data.ubicacionRanking.map((r: any) => Number(r.total)),
                  );
                  return (
                    <div className="space-y-2.5">
                      {data.ubicacionRanking.map((r: any, i: number) => (
                        <div
                          key={r.ubicacion_estado}
                          className="flex items-center gap-3"
                        >
                          <span className="text-[10px] font-mono text-zinc-400 w-4 flex-shrink-0">
                            {i + 1}
                          </span>
                          <span className="text-xs text-zinc-700 font-medium w-32 truncate flex-shrink-0">
                            {r.ubicacion_estado}
                          </span>
                          <div className="flex-1 bg-zinc-100 rounded-full h-2 overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full transition-all duration-500"
                              style={{
                                width: `${(Number(r.total) / max) * 100}%`,
                              }}
                            />
                          </div>
                          <span className="text-xs font-bold text-zinc-600 w-8 text-right flex-shrink-0">
                            {r.total}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })()
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-zinc-400">
                  <MapPin className="w-8 h-8 opacity-20 mb-2" />
                  <p className="text-xs italic">Sin datos de ubicación.</p>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-100 font-semibold text-sm">
              Rendimiento por Vendedor
            </div>
            <table className="w-full text-xs">
              <thead className="bg-zinc-50/50 text-zinc-500">
                <tr>
                  <th className="px-6 py-3 text-left">Vendedor</th>
                  <th className="px-6 py-3 text-center">Activos</th>
                  <th className="px-6 py-3 text-center">Ganados</th>
                  <th className="px-6 py-3 text-center">Recaudo</th>
                  <th className="px-6 py-3 text-center">Conversión</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {data?.vendorData?.map((v: any) => (
                  <tr
                    key={v.id}
                    className="hover:bg-zinc-50/80 transition-colors"
                  >
                    <td className="px-6 py-4 font-medium text-zinc-900">
                      {v.name}
                    </td>
                    <td className="px-6 py-4 text-center">{v.activos}</td>
                    <td className="px-6 py-4 text-center font-bold text-emerald-600">
                      {v.ganados}
                    </td>
                    <td className="px-6 py-4 text-center font-semibold">
                      $ {v.recaudo?.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-center text-blue-600 font-bold">
                      {v.tasa_conversion}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatMinutos(min: number): string {
  if (min === null || min === undefined) return "—";
  if (min <= 0) return "< 1m";
  const dias = Math.floor(min / (24 * 60));
  const horas = Math.floor((min % (24 * 60)) / 60);
  const minutos = Math.round(min % 60);
  if (dias > 0) return `${dias}d ${horas}h ${minutos}m`;
  if (horas > 0) return `${horas}h ${minutos}m`;
  return `${minutos}m`;
}

function MetricCard({ title, value, icon, emptyText = "Sin datos" }: any) {
  const isEmpty = value === null || value === undefined;
  return (
    <Card className="rounded-2xl border-zinc-200 shadow-none hover:border-blue-200 transition-colors">
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
          {title}
        </CardTitle>
        <div className={isEmpty ? "text-zinc-300" : "text-zinc-400"}>
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <div className="text-sm font-medium text-zinc-300 italic">
            {emptyText}
          </div>
        ) : (
          <div className="text-xl font-bold tracking-tight text-zinc-900">
            {value}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
