// "use client";

// import { ClosuresTab } from "@/components/leads/Cierres"; // Asegura que la ruta sea correcta
// import { useEffect, useState } from "react";

// export default function CierrePage() {
//   const [closedLeads, setClosedLeads] = useState([]);
//   const [loading, setLoading] = useState(true);

//   // Aquí obtienes tus datos (ya sea desde una API o desde tu lógica existente)
//   useEffect(() => {
//     fetch("/api/vendedores/leads")
//       .then((res) => res.json())
//       .then((data) => {
//         // Filtramos solo los cerrados aquí para pasárselos al componente
//         const filtered = data
//           .filter((l: any) => l.status === "CERRADO")
//           .map((l: any) => ({
//             ...l,
//             empresa: l.name,
//             nombre: l.nombre_contacto,
//             valorEstimado: parseFloat(l.monto_cerrado_usd || 0),
//             fechaVenta: l.fecha_venta,
//             motivo_cierre: l.motivo_cierre,
//             num_factura: l.num_factura,
//           }));
//         setClosedLeads(filtered);
//         setLoading(false);
//       });
//   }, []);

//   if (loading) return <div>Cargando...</div>;

//   return (
//     <div className="p-8">
//       {/* Aquí envuelves tu sub-componente en el export default */}
//       <ClosuresTab
//         closedLeads={closedLeads}
//         userRole="VENDEDOR"
//       />
//     </div>
//   );
// }
"use client";

import { ClosuresTab } from "@/components/leads/Cierres"; // Asegura que la ruta sea correcta
import { useEffect, useState } from "react";

export default function CierrePage() {
  const [closedLeads, setClosedLeads] = useState([]);
  const [loading, setLoading] = useState(true);

  // Aquí obtienes tus datos (ya sea desde una API o desde tu lógica existente)
  useEffect(() => {
    fetch("/api/vendedores/leads")
      .then((res) => res.json())
      .then((data) => {
        // Filtramos solo los cerrados aquí para pasárselos al componente
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
  }, []);

  if (loading) return <div>Cargando...</div>;

  return <ClosuresTab closedLeads={closedLeads} userRole="VENDEDOR" />;
}
