"use client";

import { Clock, Filter, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

export default function AuditLogsPage() {
  const t = useTranslations("superadmin.auditoria_panel");
  const [logs, setLogs] = useState<any[]>([]);
  const [filters, setFilters] = useState({ search: "", role: t("todos") });

  useEffect(() => {
    // Asegúrate de crear este endpoint que haga un SELECT * FROM audit_logs
    fetch("/api/superadmin/auditoria_panel")
      .then((res) => res.json())
      .then((data) => setLogs(data));
  }, []);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchesSearch = log.user_name
        .toLowerCase()
        .includes(filters.search.toLowerCase());
      const matchesRole = filters.role === t("todos") || log.role === filters.role;
      return matchesSearch && matchesRole;
    });
  }, [logs, filters]);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">
          {t("title")}
        </h1>
      </div>

      {/* Barra de Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-4 rounded-2xl border border-zinc-100 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-3 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder={t("buscar")}
            className="w-full pl-10 pr-4 py-2 bg-zinc-50 rounded-xl text-sm border-none focus:ring-2 focus:ring-blue-500"
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-3 w-4 h-4 text-zinc-400" />
          <select
            className="w-full pl-10 pr-4 py-2 bg-zinc-50 rounded-xl text-sm border-none focus:ring-2 focus:ring-blue-500 text-zinc-600 appearance-none"
            onChange={(e) => setFilters({ ...filters, role: e.target.value })}
          >
            <option value="TODOS">{t("todos_roles")}</option>
            <option value="adminleads">AdminLeads</option>
            <option value="vendedor">{t("vendedor_option")}</option>
          </select>
        </div>
      </div>

      {/* Tabla de Logs */}
      <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-zinc-100 text-zinc-400 text-[10px] uppercase tracking-widest font-bold bg-zinc-50/50">
              <th className="px-6 py-4 text-left">{t("usuario")}</th>
              <th className="px-6 py-4 text-left">{t("rol")}</th>
              <th className="px-6 py-4 text-left">{t("accion")}</th>
              <th className="px-6 py-4 text-left">{t("detalles")}</th>
              <th className="px-6 py-4 text-right">{t("fecha")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {filteredLogs.map((log) => (
              <tr
                key={log.id}
                className="hover:bg-zinc-50/50 transition-colors"
              >
                <td className="px-6 py-4 text-sm font-bold text-zinc-900">
                  {log.user_name}
                </td>
                <td className="px-6 py-4 text-xs font-bold text-blue-500 uppercase">
                  {log.role}
                </td>
                <td className="px-6 py-4 text-xs font-semibold text-zinc-600 uppercase">
                  {log.action}
                </td>
                <td className="px-6 py-4 text-[10px] text-zinc-400 font-mono bg-zinc-50 rounded">
                  {JSON.stringify(log.changes)}
                </td>
                <td className="px-6 py-4 text-right text-xs text-zinc-400 flex items-center justify-end gap-1">
                  <Clock size={12} />
                  {new Date(log.created_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
