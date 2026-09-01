"use client";

import { useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import { BrandBubbles } from "@/components/dashboard/brand-bubbles";
import { RotacionSkus } from "@/components/adminleads/RotacionSkus";

export default function AdminLeadsDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        setLoading(true);
        const res = await fetch("/api/adminleads/product-stats?months=3");
        const json = await res.json();
        if (json.success) setData(json);
      } catch (error) {
        console.error("Error fetching stats:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-3 bg-purple-100 rounded-xl">
          <BarChart3 className="w-6 h-6 text-purple-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard de Productos</h1>
          <p className="text-sm text-slate-500">Estadísticas de ventas de los últimos 3 meses</p>
        </div>
      </div>

      <BrandBubbles
        brands={data?.brands || []}
        categories={data?.categories || []}
        loading={loading}
      />

      <RotacionSkus />
    </div>
  );
}
