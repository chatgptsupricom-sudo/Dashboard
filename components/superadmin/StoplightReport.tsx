"use client";

import { stoplightMockData, weekHeaders } from "@/lib/leads/mockData"; // Ajusta la ruta a tus mocks
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Maximize2,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  Settings,
  User,
} from "lucide-react";
import { useState } from "react";

// Función utilitaria para el color del semáforo
const getCellColor = (value: string) => {
  if (!value) return "";
  const numValue = parseFloat(value);
  // Lógica temporal para dar color a la demostración
  if (value.includes("50") || numValue < 60)
    return "bg-red-100 text-red-800 font-medium border-red-200";
  if (value.includes("70") || numValue >= 75)
    return "bg-green-100 text-green-800 font-medium border-green-200";
  return "hover:bg-slate-50";
};

export default function StoplightReportSuperadmin() {
  const [activeTab, setActiveTab] = useState("Weekly");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    {
      "group-1": true,
      "group-2": true,
    },
  );

  // Estado para manejar los valores de los inputs antes de enviarlos al backend
  const [kpiValues, setKpiValues] = useState<Record<string, string>>({});

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const handleValueChange = (kpiId: string, weekIdx: number, value: string) => {
    const key = `${kpiId}-${weekIdx}`;
    setKpiValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleBlur = (kpiId: string, weekIdx: number, value: string) => {
    // Aquí irá la petición PATCH a tu API en el futuro
    console.log(
      `Guardando en BD -> KPI: ${kpiId}, Semana: ${weekIdx}, Valor: ${value}`,
    );
  };

  return (
    <div className="p-6 bg-white min-h-screen font-sans text-slate-800">
      {/* Header & Title */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Stoplight Reports
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Record and evaluate key metrics, streamlined for strategic success.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="text-sm font-medium text-amber-600 flex items-center gap-1 transition-transform hover:scale-105">
            ✨ Ask Supri{" "}
            <span className="text-[10px] bg-amber-100 px-1 rounded text-amber-700">
              NEW
            </span>
          </button>
          <button className="p-2 border rounded-md hover:bg-slate-50 transition-colors">
            <Settings size={16} />
          </button>
          <button className="px-4 py-2 bg-amber-500 text-white text-sm font-medium rounded-md hover:bg-amber-600 transition-colors shadow-sm">
            Create
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-6 border-b mb-6 text-sm font-medium text-slate-500">
        {["Trends", "Weekly", "Monthly", "Quarterly", "Annual"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 transition-colors ${activeTab === tab ? "text-amber-500 border-b-2 border-amber-500" : "hover:text-slate-800"}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-3 py-1.5 border rounded-md text-sm hover:bg-slate-50 transition-colors">
            Team: Caracas <ChevronDown size={14} />
          </button>
          <button className="flex items-center gap-2 px-3 py-1.5 border rounded-md text-sm hover:bg-slate-50 transition-colors">
            View by: Week <ChevronDown size={14} />
          </button>
          <button className="flex items-center gap-2 px-3 py-1.5 border rounded-md text-sm hover:bg-slate-50 transition-colors">
            Date Range: Last 13 Weeks <ChevronDown size={14} />
          </button>
        </div>

        <div className="flex gap-3 items-center">
          <button className="p-1.5 border rounded-md hover:bg-slate-50 transition-colors">
            <RotateCcw size={16} />
          </button>
          <button className="flex items-center gap-1 px-3 py-1.5 border rounded-md text-sm text-amber-600 hover:bg-amber-50 transition-colors">
            <Plus size={14} /> New group
          </button>
          <button className="px-3 py-1.5 border rounded-md text-sm text-amber-600 hover:bg-amber-50 transition-colors">
            Go to KPI Manager
          </button>
          <button className="p-1.5 border rounded-md hover:bg-slate-50 transition-colors">
            <MoreHorizontal size={16} />
          </button>
          <div className="relative">
            <Search
              className="absolute left-2.5 top-2 text-slate-400"
              size={14}
            />
            <input
              type="text"
              placeholder="Search KPIs..."
              className="pl-8 pr-3 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 w-64 transition-shadow"
            />
          </div>
        </div>
      </div>

      {/* KPI Groups */}
      <div className="space-y-6">
        {stoplightMockData.map((group) => (
          <div
            key={group.id}
            className="border rounded-lg overflow-hidden bg-white shadow-sm transition-all"
          >
            {/* Group Header */}
            <div className="flex items-center justify-between p-4 bg-slate-50 border-b">
              <div
                className="flex items-center gap-3 cursor-pointer select-none"
                onClick={() => toggleGroup(group.id)}
              >
                <span className="font-semibold text-lg text-slate-800">
                  {group.title}
                </span>
                <span className="px-2 py-0.5 bg-slate-200 text-slate-600 text-xs rounded-full font-medium">
                  {group.count}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button className="flex items-center gap-1 px-3 py-1 border rounded text-xs text-amber-600 bg-white hover:bg-amber-50 transition-colors">
                  New KPI <ChevronDown size={12} />
                </button>
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
                  {expandedGroups[group.id] ? (
                    <ChevronUp size={16} />
                  ) : (
                    <ChevronDown size={16} />
                  )}
                </button>
              </div>
            </div>

            {/* Table */}
            {expandedGroups[group.id] && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse min-w-[1200px]">
                  <thead>
                    <tr className="bg-white border-b text-slate-500">
                      <th className="p-3 w-10 text-center border-r">
                        <input
                          type="checkbox"
                          className="rounded border-slate-300"
                        />
                      </th>
                      <th className="p-3 w-16 text-center border-r text-xs font-normal">
                        View
                        <br />
                        Trend
                      </th>
                      <th className="p-3 border-r font-medium min-w-[300px]">
                        Title
                      </th>
                      <th className="p-3 w-16 text-center border-r font-medium">
                        Owner
                      </th>
                      <th className="p-3 w-24 text-center border-r font-medium">
                        Goal
                      </th>
                      <th className="p-3 w-24 text-center border-r font-medium">
                        Average
                      </th>
                      <th className="p-3 w-20 text-center border-r font-medium border-r-blue-400 border-r-2">
                        Total
                      </th>
                      {weekHeaders.map((week, idx) => (
                        <th
                          key={idx}
                          className="p-3 w-28 text-center border-r font-normal text-xs text-slate-400"
                        >
                          <div className="flex flex-col">
                            <span>{week.split(" - ")[0]} -</span>
                            <span>{week.split(" - ")[1]}</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {group.kpis.map((kpi) => (
                      <tr key={kpi.id} className="border-b group">
                        <td className="p-3 text-center border-r bg-white">
                          <input
                            type="checkbox"
                            className="rounded border-slate-300"
                          />
                        </td>
                        <td className="p-3 text-center border-r bg-white">
                          {kpi.trend === "help" ? (
                            <HelpCircle
                              size={16}
                              className="text-slate-400 mx-auto cursor-pointer hover:text-slate-600"
                            />
                          ) : (
                            <AlertTriangle
                              size={16}
                              className="text-amber-500 mx-auto cursor-pointer hover:text-amber-600"
                            />
                          )}
                        </td>
                        <td className="p-3 border-r text-slate-700 bg-white font-medium">
                          {kpi.title}
                        </td>
                        <td className="p-3 border-r text-center bg-white">
                          <div className="w-6 h-6 bg-slate-200 rounded-full flex items-center justify-center mx-auto text-slate-500 cursor-pointer hover:bg-slate-300 transition-colors">
                            <User size={14} />
                          </div>
                        </td>
                        <td className="p-3 border-r text-center text-slate-600 bg-white">
                          {kpi.goal}
                        </td>
                        <td className="p-3 border-r text-center text-slate-600 bg-white">
                          {kpi.average}
                        </td>
                        <td className="p-3 border-r text-center text-slate-600 border-r-blue-400 border-r-2 bg-slate-50/50">
                          {kpi.total}
                        </td>

                        {/* Celdas Editables */}
                        {kpi.weeks.map((val, idx) => {
                          const key = `${kpi.id}-${idx}`;
                          const currentValue =
                            kpiValues[key] !== undefined
                              ? kpiValues[key]
                              : val || "";

                          return (
                            <td
                              key={idx}
                              className={`border-r text-center p-0 transition-colors ${getCellColor(currentValue)}`}
                            >
                              <input
                                type="text"
                                value={currentValue}
                                onChange={(e) =>
                                  handleValueChange(kpi.id, idx, e.target.value)
                                }
                                onBlur={(e) =>
                                  handleBlur(kpi.id, idx, e.target.value)
                                }
                                className="w-full h-full p-3 text-center bg-transparent focus:outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-amber-500"
                                placeholder="-"
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
