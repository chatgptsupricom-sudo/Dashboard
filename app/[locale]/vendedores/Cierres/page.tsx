"use client";

import { ClosuresTab } from "@/components/leads/Cierres";
import { useAuthStore } from "@/lib/stores/auth.store";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function CierrePage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const sellerActivo = (user as any)?.activo;
  const [closedLeads, setClosedLeads] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (sellerActivo === 0) {
      router.replace("/vendedores");
      return;
    }

    fetch("/api/vendedores/leads")
      .then((res) => res.json())
      .then((data) => {
        const filtered = data
          .filter((l: any) => l.status === "CERRADO")
          .map((l: any) => ({
            ...l,
            empresa: l.name,
            nombre: l.nombre_contacto,
            valorEstimado: parseFloat(l.monto_cerrado_usd || 0),
            fechaVenta: l.fecha_venta,
            motivo_cierre: l.motivo_cierre,
            num_factura: l.num_factura,
          }));
        setClosedLeads(filtered);
        setLoading(false);
      });
  }, [sellerActivo, router]);

  if (sellerActivo === 0) {
    return (
      <div className="p-10 text-center text-slate-400 font-medium">
        No tienes acceso a esta sección. Contacta a tu administrador.
      </div>
    );
  }

  if (loading) return <div>Cargando...</div>;

  return <ClosuresTab closedLeads={closedLeads} userRole="VENDEDOR" />;
}
