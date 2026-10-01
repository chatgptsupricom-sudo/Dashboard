"use client";

import { useAuthStore } from "@/lib/stores/auth.store";
import { useEffect, useState } from "react";

export default function SellersReport() {
  const { user } = useAuthStore();
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function getSellers() {
      if (!user) return;
      try {
        const response = await fetch("/api/reports/sellers");
        const resData = await response.json();

        // Filtrar por jerarquía de Empresa (cids) y excluir roles superiores si aplica
        const allowedSellers = resData.filter((seller: any) => {
          const matchCompany = user.cids?.includes(seller.companyId);
          // Los gerentes no pueden ver data de superadmins, por ejemplo
          const isHierarchyAllowed =
            user.role === "superAdmin" || seller.role !== "superAdmin";
          return matchCompany && isHierarchyAllowed;
        });

        setSellers(allowedSellers);
      } catch (error) {
        console.error("Error al cargar reporte de vendedores:", error);
      } finally {
        setLoading(false);
      }
    }
    getSellers();
  }, [user]);

  if (loading)
    return (
      <div className="text-slate-400 p-4">Cargando datos de vendedores...</div>
    );

  return (
    <div className="p-6 bg-slate-900 rounded-xl border border-slate-800 text-slate-100">
      <h2 className="text-xl font-bold mb-4">
        Métricas de Rendimiento por Vendedor
      </h2>
      {/* Listado o Grid con las ventas de {sellers} */}
    </div>
  );
}
