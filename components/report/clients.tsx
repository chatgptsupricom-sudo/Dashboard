"use client";

import { useAuthStore } from "@/lib/stores/auth.store";
import { useEffect, useState } from "react";

export default function ClientsReport() {
  const { user } = useAuthStore();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function getClients() {
      if (!user) return;
      try {
        const response = await fetch("/api/reports/clients");
        const resData = await response.json();

        // Filtrado estricto por cids (Empresas permitidas)
        const allowedClients = resData.filter((client: any) =>
          user.cids?.includes(client.companyId),
        );
        setClients(allowedClients);
      } catch (error) {
        console.error("Error al cargar reporte de clientes:", error);
      } finally {
        setLoading(false);
      }
    }
    getClients();
  }, [user]);

  if (loading)
    return (
      <div className="text-slate-400 p-4">Cargando cartera de clientes...</div>
    );

  return (
    <div className="p-6 bg-slate-900 rounded-xl border border-slate-800 text-slate-100">
      <h2 className="text-xl font-bold mb-4">Reporte de Clientes y Carteras</h2>
      {/* Tabla analítica mapeando {clients} */}
    </div>
  );
}
