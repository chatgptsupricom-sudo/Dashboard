"use client";

// Venezuela / Panamá para los AdminLeads de ADMINLEADS_CON_PANAMA: guarda la
// cookie que leen las APIs del módulo de Leads (payloadLeads) y recarga.
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/lib/stores/auth.store";
import { COOKIE_PAIS_LEADS, veAmbosPaises } from "@/lib/adminleads/sucursal";

// Pantallas de Leads (las demás de /adminleads no separan por país).
const PANTALLAS_LEADS =
  /\/adminleads(\/(monitoreo_leads|cierres|reasignar_leads|configuracion|recompra|reporte-campanas|reporte-ventas-campanas|informe|clientes-mes))?\/?$/;

export function SelectorPaisLeads() {
  const { user } = useAuthStore();
  const pathname = usePathname();
  const [pais, setPais] = useState<"VE" | "PA">("VE");

  useEffect(() => {
    setPais(document.cookie.split("; ").includes(`${COOKIE_PAIS_LEADS}=PA`) ? "PA" : "VE");
  }, []);

  if (!veAmbosPaises(user) || !PANTALLAS_LEADS.test(pathname || "")) return null;

  const elegir = (nuevo: "VE" | "PA") => {
    if (nuevo === pais) return;
    document.cookie =
      nuevo === "PA"
        ? `${COOKIE_PAIS_LEADS}=PA; path=/; max-age=31536000; samesite=lax`
        : `${COOKIE_PAIS_LEADS}=; path=/; max-age=0; samesite=lax`;
    window.location.reload();
  };

  return (
    <div className="mb-4 flex items-center gap-2 text-sm">
      <span className="text-zinc-500">País:</span>
      {(
        [
          ["VE", "Venezuela"],
          ["PA", "Panamá"],
        ] as const
      ).map(([valor, etiqueta]) => (
        <button
          key={valor}
          type="button"
          onClick={() => elegir(valor)}
          aria-pressed={pais === valor}
          className={`rounded-full border px-3 py-1 ${
            pais === valor ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 bg-white text-zinc-700"
          }`}
        >
          {etiqueta}
        </button>
      ))}
    </div>
  );
}
