"use client";

import { AdminLeadsTab } from "@/components/adminleads/AdminLeadsTab";
import { useEffect, useState } from "react";

export default function AdminLeadsPage() {
  const [leads, setLeads] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [leadsRes, sellersRes] = await Promise.all([
        fetch("/api/adminleads/leads"),
        fetch("/api/vendedores/sellers"),
      ]);

      if (!leadsRes.ok || !sellersRes.ok)
        throw new Error("Error al cargar los datos");

      const [leadsData, sellersData] = await Promise.all([
        leadsRes.json(),
        sellersRes.json(),
      ]);

      setLeads(leadsData);
      setSellers(sellersData);
    } catch (err) {
      console.error("Error:", err);
      // toast.error("No se pudieron cargar los datos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleReassign = async (leadId: string, newSellerId: string) => {
    if (!confirm("¿Estás seguro de reasignar este lead?")) return;

    try {
      const response = await fetch("/api/adminleads/reasignar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, newSellerId }),
      });

      // --- AQUÍ ESTÁ EL CAMBIO PARA DEPURAR ---
      if (!response.ok) {
        const errorData = await response.json(); // Leemos el mensaje del servidor
        console.error("Detalle del error del servidor:", errorData);
        throw new Error(errorData.error || "Error desconocido en el servidor");
      }
      // ----------------------------------------

      await fetchData();
      alert("Reasignado con éxito");
    } catch (err: any) {
      console.error("Error capturado:", err);
      alert("Error: " + err.message); // Verás el mensaje real aquí
    }
  };

  if (loading)
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6 text-slate-900">
        Reasignación de Leads
      </h1>
      <AdminLeadsTab
        allLeads={leads}
        allSellers={sellers}
        onReassign={handleReassign}
      />
    </div>
  );
}
