"use client";

import { useAuthStore } from "@/lib/stores/auth.store";
import { useEffect, useState } from "react";

export default function InventoryReport() {
  const { user } = useAuthStore();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function getInventory() {
      if (!user) return;
      try {
        const response = await fetch("/api/reports/inventory"); // Ajusta a tu endpoint
        const resData = await response.json();

        // Filtrar datos según las empresas (cids) a las que tiene acceso el usuario
        const allowedData = resData.filter((item: any) =>
          user.cids?.includes(item.cid || item.companyId),
        );
        setData(allowedData);
      } catch (error) {
        console.error("Error al cargar reporte de inventario:", error);
      } finally {
        setLoading(false);
      }
    }
    getInventory();
  }, [user]);

  if (loading)
    return (
      <div className="text-slate-400 p-4">Cargando datos de inventario...</div>
    );

  return (
    <div className="p-6 bg-slate-900 rounded-xl border border-slate-800 text-slate-100">
      <h2 className="text-xl font-bold mb-4">
        Reporte Analítico de Inventario
      </h2>
      {/* Tu tabla o gráficos aquí mapeando "data" */}
      <p className="text-xs text-slate-500">
        Visualizando datos basados en tu jerarquía corporativa.
      </p>
    </div>
  );
}
