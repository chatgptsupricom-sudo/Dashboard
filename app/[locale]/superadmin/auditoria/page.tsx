"use client";

import {
  Activity,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  RefreshCcw,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

export default function AuditPageClient() {
  const t = useTranslations("superadmin.auditoria");
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/superadmin/audit?page=${page}&type=${filter}&limit=12`,
      );
      const data = await res.json();
      setLogs(data.logs || []);
      setTotal(data.total_count || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [page, filter]);

  const getLevelStyle = (level: string) => {
    switch (level) {
      case "CRITICAL":
        return "bg-red-500/10 text-red-600 border-red-200/50";
      case "SUCCESS":
        return "bg-emerald-500/10 text-emerald-600 border-emerald-200/50";
      case "ACTION":
        return "bg-blue-500/10 text-blue-600 border-blue-200/50";
      default:
        return "bg-slate-500/10 text-slate-600 border-slate-200/50";
    }
  };

  return (
    <div className="p-6 md:p-10 space-y-8 bg-[#fbfcfd] min-h-screen font-sans">
      {/* HEADER PREMIUM */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="flex items-center justify-center w-8 h-8 bg-blue-600 rounded-lg shadow-lg shadow-blue-200">
              <ShieldCheck className="text-white" size={18} />
            </div>
            <span className="text-[10px] font-black text-blue-600 uppercase tracking-[0.3em]">
              {t("badge")}
            </span>
          </div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight uppercase italic">
            AUDI<span className="text-blue-600">TORÍA</span>
          </h1>
          <div className="flex items-center gap-2 mt-2 text-slate-400">
            <Activity size={14} className="text-emerald-500 animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-widest">
              {t("subtitle")}
            </span>
          </div>
        </div>

        <button
          onClick={() => loadLogs()}
          className="group flex items-center gap-3 px-6 py-3 bg-white border border-slate-200 rounded-2xl text-slate-600 font-bold text-xs hover:text-blue-600 hover:border-blue-600 transition-all shadow-sm active:scale-95"
        >
          <RefreshCcw
            size={16}
            className={
              loading
                ? "animate-spin"
                : "group-hover:rotate-180 transition-transform duration-500"
            }
          />
          {t("sincronizar")}
        </button>
      </div>

      {/* FILTROS CAPSULA */}
      <div className="flex flex-wrap gap-2 bg-slate-100/50 p-1.5 rounded-2xl w-fit border border-slate-200/50">
        {["all", "action", "critical", "info"].map((type) => (
          <button
            key={type}
            onClick={() => {
              setFilter(type);
              setPage(1);
            }}
            className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              filter === type
                ? "bg-white text-slate-900 shadow-md border border-slate-200"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      {/* TABLA DE AUDITORÍA */}
      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-2xl shadow-slate-200/40 overflow-hidden relative">
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-8 py-6 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                  {t("evento")}
                </th>
                <th className="px-6 py-6 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                  {t("usuario")}
                </th>
                <th className="px-6 py-6 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                  {t("objetivo")}
                </th>
                <th className="px-8 py-6 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                  {t("hora")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {logs.length > 0 ? (
                logs.map((log) => (
                  <tr
                    key={log.id}
                    className="group hover:bg-slate-50/50 transition-all"
                  >
                    <td className="px-8 py-5">
                      <div className="flex flex-col gap-1.5">
                        <div
                          className={`w-fit px-2.5 py-0.5 rounded-md text-[9px] font-black border ${getLevelStyle(log.level)}`}
                        >
                          {log.level}
                        </div>
                        <span className="text-sm font-bold text-slate-700 tracking-tight leading-relaxed max-w-lg">
                          {log.action}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-black text-[10px] border border-blue-100 uppercase">
                          {log.user.slice(0, 2)}
                        </div>
                        <span className="text-xs font-bold text-slate-600">
                          {log.user}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <ArrowUpRight
                          size={14}
                          className="group-hover:text-blue-500 transition-colors"
                        />
                        <span className="text-[11px] font-mono font-medium text-slate-400 group-hover:text-slate-600 truncate max-w-[150px]">
                          {log.target}
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <div className="flex flex-col items-end">
                        <span className="text-xs font-black text-slate-800 tabular-nums">
                          {new Date(log.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: true,
                          })}
                        </span>
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
                          {t("hoy")}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="py-20 text-center">
                    <div className="flex flex-col items-center opacity-20">
                      <Terminal size={40} />
                      <span className="text-xs font-black uppercase mt-4 tracking-[0.3em]">
                        {t("no_registros")}
                      </span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* FOOTER */}
        <div className="px-8 py-5 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            {total} {t("eventos_detectados")}
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-white disabled:opacity-20 transition-all shadow-sm"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="px-4 py-1 rounded-lg bg-white border border-slate-200 text-[10px] font-black text-slate-700">
              {page}
            </div>
            <button
              disabled={logs.length < 12}
              onClick={() => setPage((p) => p + 1)}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-white disabled:opacity-20 transition-all shadow-sm"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
