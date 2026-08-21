import React from 'react';
import { BarChart4, CheckCircle2, DollarSign, Clock, Calendar, Trophy, RefreshCw } from 'lucide-react';
import { Column } from '../types';

interface StatsTabProps {
  userRole: 'ADMIN' | 'VENDEDOR';
  selectedVendedor: string;
  selectedVendorStatsFilter: string;
  setSelectedVendorStatsFilter: (v: string) => void;
  sellers: any[];
  leads: any[];
  sellersMap: Record<string, string>;
  sellersPerformance: any[];
  columns: Column[];
}

export const StatsTab: React.FC<StatsTabProps> = ({
  userRole,
  selectedVendedor,
  selectedVendorStatsFilter,
  setSelectedVendorStatsFilter,
  sellers,
  leads,
  sellersMap,
  sellersPerformance,
  columns,
}) => {
  return (
    <div className="space-y-6 animate-fade-in">
          <div className="bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-xs">
            <h2 className="text-lg font-bold text-zinc-950 flex items-center gap-2">
              <BarChart4 className="w-5 h-5 text-blue-600" />
              Estadísticas de Rendimiento y Conversión
            </h2>

            {userRole === 'ADMIN' ? (
              <div className="flex items-center gap-2 mt-3">
                <span className="text-xs font-bold text-zinc-500 uppercase">Filtrar por vendedor:</span>
                <select 
                value={selectedVendorStatsFilter}
                onChange={(e) => setSelectedVendorStatsFilter(e.target.value)} 
                className="p-1 border rounded text-xs"
              >
                <option value="Todos">Todos</option>
                {Array.isArray(sellers) && sellers.length > 0 ? (
                  sellers.map((s: any) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))
                ) : (
                  <option disabled>Sin vendedores</option>
                )}
              </select>
              </div>
            ) : (
              <div className="mt-3">
                <span className="text-xs font-bold text-zinc-500 bg-zinc-100 px-3 py-1.5 rounded-lg inline-block">
                  👤 Vista Comercial: <span className="text-blue-700 font-extrabold">{selectedVendedor}</span>
                </span>
              </div>
            )}

            <p className="text-xs text-zinc-500 mt-2">
              Métricas consolidadas del vendedor seleccionado en tiempo real directamente desde MySQL.
            </p>
          </div>

          {userRole === 'ADMIN' && (
            <div className="bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-xs">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-5 flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-500" /> Top Vendedores por Efectividad de Cierre
              </h3>
              <div className="flex flex-col sm:flex-row gap-4 items-end justify-center">
                {[...sellersPerformance].sort((a, b) => b.vRate - a.vRate).slice(0, 3).map((seller, idx) => {
                  const medals = ['🥇', '🥈', '🥉'];
                  const tiers = [
                    { label: 'Oro', minRate: 100, bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-600' },
                    { label: 'Plata', minRate: 80, bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-600' },
                    { label: 'Bronce', minRate: 60, bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-600' },
                  ];
                  const tier = tiers[idx];
                  const qualifies = seller.vRate >= tier.minRate;
                  return (
                    <div key={seller.vName} className={`flex-1 flex flex-col items-center gap-2 p-5 rounded-2xl border ${tier.bg} ${tier.border} transition-opacity ${!qualifies ? 'opacity-40' : ''}`}>
                      <span className="text-4xl">{medals[idx]}</span>
                      <span className="text-sm font-extrabold text-zinc-900 text-center truncate w-full text-center">{seller.vName}</span>
                      <span className={`text-3xl font-black ${tier.text}`}>{seller.vRate}%</span>
                      <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border ${tier.border} ${tier.text} ${tier.bg}`}>{tier.label} · {tier.minRate}%+</span>
                      <span className="text-[11px] text-zinc-500">{seller.vWon} cierres por venta</span>
                      {!qualifies && <span className="text-[10px] text-red-400 font-bold mt-1">No alcanza el umbral</span>}
                    </div>
                  );
                })}
                {sellersPerformance.length === 0 && (
                  <p className="text-zinc-400 text-sm text-center py-8 w-full">Sin datos de vendedores aún.</p>
                )}
              </div>
            </div>
          )}

          {(() => {
            const currentFilter = userRole === 'ADMIN' ? selectedVendorStatsFilter : selectedVendedor;

           const localStatsLeads = currentFilter === 'Todos' 
            ? leads 
            : leads.filter(l => {
                const sellerName = sellersMap[l.seller_id?.toString()] || l.vendedor || "Sin Asignar";
                return sellerName.trim().toLowerCase() === currentFilter.trim().toLowerCase();
              });

            const localStatsClosedLeads = localStatsLeads.filter(l => l.estatus === 'CERRADO_VENTA' || l.estatus === 'CERRADO' || l.estatus === 'CERRADO_ABANDONADO');
            const localTotalClosedSalesValue = localStatsClosedLeads.filter(l => l.estatus === 'CERRADO_VENTA' || l.estatus === 'CERRADO').reduce((sum, l) => sum + (l.valorEstimado || 0), 0);
            const localClosedSalesCount = localStatsClosedLeads.filter(l => l.estatus === 'CERRADO_VENTA' || l.estatus === 'CERRADO').length;
            const localClosedAbandonedCount = localStatsClosedLeads.filter(l => l.estatus === 'CERRADO_ABANDONADO').length;
            const localTotalClosedCount = localStatsClosedLeads.length;
            const localConversionPercentage = localTotalClosedCount > 0 ? Math.round((localClosedSalesCount / localTotalClosedCount) * 100) : 0;

            const localClosedLeadsWithBothDates = localStatsLeads.filter(l => 
              (l.estatus === 'CERRADO_VENTA' || l.estatus === 'CERRADO') &&
              l.fechaIngreso && l.fechaVentaISO && 
              !isNaN(new Date(l.fechaIngreso).getTime()) && 
              !isNaN(new Date(l.fechaVentaISO).getTime())
            );
            const localTotalClosureMinutes = localClosedLeadsWithBothDates.reduce((sum, l) => sum + Math.max(0, Math.round((new Date(l.fechaVentaISO).getTime() - new Date(l.fechaIngreso).getTime()) / (1000 * 60))), 0);
            const localAverageClosureTimeGlobal = localClosedLeadsWithBothDates.length > 0 ? Math.round(localTotalClosureMinutes / localClosedLeadsWithBothDates.length) : 0;

            const leadsConTiempoContacto = localStatsLeads.filter(l => l.tiempoPrimerContacto !== null && l.tiempoPrimerContacto !== undefined);
            const totalMinutosContacto = leadsConTiempoContacto.reduce((sum, l) => sum + Number(l.tiempoPrimerContacto), 0);
            const promedioMinutosTotales = leadsConTiempoContacto.length > 0 ? Math.round(totalMinutosContacto / leadsConTiempoContacto.length) : 0;

            const formatMinutosADiasHorasMin = (minutosTotales: number): string => {
              if (minutosTotales < 0) return '—';
              if (minutosTotales === 0) return 'Mismo día';
              const dias = Math.floor(minutosTotales / (24 * 60));
              const restoDias = minutosTotales % (24 * 60);
              const horas = Math.floor(restoDias / 60);
              const minutos = restoDias % 60;
              const partes = [];
              if (dias > 0) partes.push(`${dias}d`);
              if (horas > 0) partes.push(`${horas}h`);
              if (minutos > 0 || partes.length === 0) partes.push(`${minutos}m`);
              return partes.join(' ');
            };

            const textoTiempoContactoFormat = formatMinutosADiasHorasMin(promedioMinutosTotales);

            return (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-5">
                  <div className="bg-white p-4 rounded-xl border border-zinc-200/60 shadow-xs flex items-center justify-between">
                    <div><span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">Cierres con Venta (Won)</span><span className="text-xl font-black text-emerald-700 mt-1 block">{localClosedSalesCount} leads</span></div>
                    <span className="p-2.5 bg-emerald-50 text-emerald-600 rounded-lg"><CheckCircle2 className="w-5 h-5" /></span>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-zinc-200/60 shadow-xs flex items-center justify-between">
                    <div><span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">Recaudado USD</span><span className="text-xl font-bold text-zinc-850 mt-1 block">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(localTotalClosedSalesValue)}</span></div>
                    <span className="p-2.5 bg-blue-50 text-blue-650 rounded-lg"><DollarSign className="w-5 h-5" /></span>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-zinc-200/60 shadow-xs flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">Tiempo Primer Contacto</span>
                      <span className="text-xl font-black text-indigo-700 mt-1 block font-mono">{textoTiempoContactoFormat}</span>
                    </div>
                    <span className="p-2.5 bg-indigo-50 text-indigo-600 rounded-lg"><Clock className="w-5 h-5" /></span>
                  </div>
                  
                <div className="bg-white p-4 rounded-xl border border-zinc-200/60 shadow-xs flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">Tiempo Promedio Cierre</span>
                      <span className="text-xl font-black text-indigo-700 mt-1 block font-mono">
                        {localAverageClosureTimeGlobal > 0 ? formatMinutosADiasHorasMin(localAverageClosureTimeGlobal) : '—'}
                      </span>
                    </div>
                    <span className="p-2.5 bg-amber-50 text-amber-600 rounded-lg"><Calendar className="w-5 h-5" /></span>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row gap-6 justify-center">
                  <div className="bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-xs flex flex-col items-center justify-center flex-1 max-w-xs mx-auto md:mx-0">
                    <h3 className="text-xs font-bold text-zinc-650 uppercase tracking-widest pb-4 self-start">Tasa de Efectividad</h3>
                    <div className="relative w-40 h-40 flex items-center justify-center">
                      <svg className="w-full h-full transform -rotate-90">
                        <circle cx="80" cy="80" r="65" className="stroke-zinc-100" strokeWidth="10" fill="transparent" />
                        <circle cx="80" cy="80" r="65" className="stroke-emerald-500 transition-all duration-1000" strokeWidth="12" strokeDasharray={408.4} strokeDashoffset={408.4 - (408.4 * localConversionPercentage) / 100} strokeLinecap="round" fill="transparent" />
                      </svg>
                      <div className="absolute flex flex-col items-center justify-center"><span className="text-3xl font-extrabold text-zinc-900">{localConversionPercentage}%</span><span className="text-[10px] text-zinc-400 font-bold uppercase">Eficiencia</span></div>
                    </div>
                  </div>

                  <div className="bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-xs flex flex-col items-center justify-center flex-1 max-w-xs mx-auto md:mx-0">
                    <h3 className="text-xs font-bold text-zinc-650 uppercase tracking-widest pb-4 self-start">Tasa de Reactivación</h3>
                    <div className="relative w-40 h-40 flex items-center justify-center">
                      <svg className="w-full h-full transform -rotate-90">
                        <circle cx="80" cy="80" r="65" className="stroke-zinc-100" strokeWidth="10" fill="transparent" />
                        <circle cx="80" cy="80" r="65" className="stroke-blue-500 transition-all duration-1000" strokeWidth="12" strokeDasharray={408.4} strokeDashoffset={408.4 - (408.4 * Math.min((() => {
                          const reactivados = localStatsLeads.filter(l => (l as any).reactivaciones > 0).length;
                          const cerradosSinReactivar = localStatsLeads.filter(l => (l.estatus === 'CERRADO_VENTA' || l.estatus === 'CERRADO_ABANDONADO' || l.estatus === 'CERRADO') && !((l as any).reactivaciones > 0)).length;
                          const totalEverClosed = reactivados + cerradosSinReactivar;
                          return totalEverClosed > 0 ? Math.round((reactivados / totalEverClosed) * 100) : 0;
                        })(), 100)) / 100} strokeLinecap="round" fill="transparent" />
                      </svg>
                      <div className="absolute flex flex-col items-center justify-center">
                        <span className="text-3xl font-extrabold text-zinc-900">{Math.min((() => {
                          const reactivados = localStatsLeads.filter(l => (l as any).reactivaciones > 0).length;
                          const cerradosSinReactivar = localStatsLeads.filter(l => (l.estatus === 'CERRADO_VENTA' || l.estatus === 'CERRADO_ABANDONADO' || l.estatus === 'CERRADO') && !((l as any).reactivaciones > 0)).length;
                          const totalEverClosed = reactivados + cerradosSinReactivar;
                          return totalEverClosed > 0 ? Math.round((reactivados / totalEverClosed) * 100) : 0;
                        })(), 100)}%</span>
                        <span className="text-[10px] text-zinc-400 font-bold uppercase">Reactivados</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-xs flex flex-col justify-between">
                  <h3 className="text-xs font-bold text-zinc-650 uppercase tracking-widest pb-2">Distribución de Leads por Etapa</h3>
                  <div className="space-y-3 flex-1 flex flex-col justify-center">
                    {columns.filter(c => c.id !== 'CERRADO').map((column) => {
                      const statsActiveLeads = localStatsLeads.filter(l => l.estatus !== 'CERRADO_VENTA' && l.estatus !== 'CERRADO_ABANDONADO' && l.estatus !== 'CERRADO');
                      const amtInCol = statsActiveLeads.filter(l => l.estatus === column.id).length;
                      const ratio = statsActiveLeads.length > 0 ? (amtInCol / statsActiveLeads.length) * 100 : 0;
                      return (
                        <div key={column.id} className="space-y-1">
                          <div className="flex justify-between text-xs font-semibold"><span className="text-zinc-800 flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${column.color}`} />{column.title}</span><span className="text-zinc-500 font-mono">{amtInCol} leads</span></div>
                          <div className="w-full bg-zinc-100 rounded-full h-2.5 overflow-hidden"><div className={`h-full rounded-full ${column.color}`} style={{ width: `${Math.max(ratio, 2)}%` }} /></div>
                        </div>
                      );
                    })}
                    <div className="space-y-1 pt-1">
                      <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider pb-1">Cierre</div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs font-semibold"><span className="text-zinc-800 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" />Venta</span><span className="text-zinc-500 font-mono">{localStatsLeads.filter(l => l.estatus === 'CERRADO_VENTA').length} leads</span></div>
                        <div className="w-full bg-zinc-100 rounded-full h-2.5 overflow-hidden"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${localStatsLeads.length > 0 ? Math.max((localStatsLeads.filter(l => l.estatus === 'CERRADO_VENTA').length / localStatsLeads.length) * 100, localStatsLeads.filter(l => l.estatus === 'CERRADO_VENTA').length > 0 ? 2 : 0) : 0}%` }} /></div>
                      </div>
                      <div className="space-y-1 mt-1">
                        <div className="flex justify-between text-xs font-semibold"><span className="text-zinc-800 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" />Abandonado</span><span className="text-zinc-500 font-mono">{localStatsLeads.filter(l => l.estatus === 'CERRADO_ABANDONADO' || l.estatus === 'CERRADO').length} leads</span></div>
                        <div className="w-full bg-zinc-100 rounded-full h-2.5 overflow-hidden"><div className="h-full rounded-full bg-red-500" style={{ width: `${localStatsLeads.length > 0 ? Math.max((localStatsLeads.filter(l => l.estatus === 'CERRADO_ABANDONADO' || l.estatus === 'CERRADO').length / localStatsLeads.length) * 100, localStatsLeads.filter(l => l.estatus === 'CERRADO_ABANDONADO' || l.estatus === 'CERRADO').length > 0 ? 2 : 0) : 0}%` }} /></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

      {userRole === 'ADMIN' && (
        <div className="bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-xs space-y-4">
          <h3 className="text-xs font-bold text-zinc-650 uppercase tracking-widest">RENDIMIENTO POR VENDEDORES</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-100 text-zinc-400 font-bold bg-zinc-50/50">
                  <th className="p-3">Vendedor</th>
                  <th className="p-3">Total Asignados</th>
                  <th className="p-3">Activos</th>
                  <th className="p-3">Ganados</th>
                  <th className="p-3">Perdidos</th>
                  <th className="p-3 text-right">Recaudado</th>
                  <th className="p-3 text-center">Tasa Conversión</th>
                  <th className="p-3 text-center">Tiempo Promedio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {sellersPerformance.map((seller) => (
                  <tr key={seller.vName} className="hover:bg-zinc-50/45 transition-colors text-zinc-700">
                    <td className="p-3 font-bold text-zinc-900">{seller.vName}</td>
                    <td className="p-3 font-semibold">{seller.total}</td>
                    <td className="p-3 font-medium text-zinc-500">{seller.vActive}</td>
                    <td className="p-3 font-bold text-emerald-700">{seller.vWon}</td>
                    <td className="p-3 text-zinc-400">{seller.vLost}</td>
                    <td className="p-3 text-right font-bold text-zinc-800">${seller.vRev.toLocaleString()}</td>
                    <td className="p-3 text-center"><span className="px-2 py-0.5 bg-zinc-100 rounded text-zinc-800 font-bold font-mono">{seller.vRate}%</span></td>
                    <td className="p-3 text-center font-semibold text-zinc-600">{seller.vAverageClosureTime > 0 ? `${seller.vAverageClosureTime} días` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
