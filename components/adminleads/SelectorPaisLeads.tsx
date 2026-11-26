"use client";

// Selector de sede para los AdminLeads que ven más de un país (veAmbosPaises):
// guarda la cookie que leen las APIs (payloadLeads / payloadSesion) y recarga.
// El de Panamá elige Panamá, Valencia, Caracas o las tres, en todo /adminleads;
// los de Venezuela (Valencia o Caracas), Venezuela o Panamá, solo en Leads.
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuthStore } from "@/lib/stores/auth.store";
import {
  COOKIE_PAIS_LEADS,
  cookiePaisLeads,
  esAdminLeadsPanama,
  SEDES_ADMINLEADS_PANAMA,
  veAmbosPaises,
} from "@/lib/adminleads/sucursal";

// Pantallas de Leads (las demás de /adminleads no separan por país).
const PANTALLAS_LEADS =
  /\/adminleads(\/(monitoreo_leads|cierres|reasignar_leads|configuracion|recompra|reporte-campanas|reporte-ventas-campanas|informe|clientes-mes))?\/?$/;

const PAISES = [
  { valor: "VE", etiqueta: "Venezuela" },
  { valor: "PA", etiqueta: "Panamá" },
];

export function SelectorPaisLeads() {
  const { user } = useAuthStore();
  const pathname = usePathname();
  const [elegido, setElegido] = useState("");

  useEffect(() => setElegido(cookiePaisLeads()), []);

  if (!veAmbosPaises(user)) return null;
  const dePanama = esAdminLeadsPanama(user);
  if (!dePanama && !PANTALLAS_LEADS.test(pathname || "")) return null;

  const opciones = dePanama ? SEDES_ADMINLEADS_PANAMA : PAISES;
  // Sin cookie (o con una que no es de sus opciones), su propia sede.
  const actual = opciones.some((o) => o.valor === elegido) ? elegido : dePanama ? "PA" : "VE";

  const elegir = (nuevo: string) => {
    if (nuevo === actual) return;
    document.cookie = `${COOKIE_PAIS_LEADS}=${nuevo}; path=/; max-age=31536000; samesite=lax`;
    window.location.reload();
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-zinc-500">{dePanama ? "Sede:" : "País:"}</span>
      {opciones.map(({ valor, etiqueta }) => (
        <button
          key={valor}
          type="button"
          onClick={() => elegir(valor)}
          aria-pressed={actual === valor}
          className={`rounded-full border px-3 py-1 ${
            actual === valor ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 bg-white text-zinc-700"
          }`}
        >
          {etiqueta}
        </button>
      ))}
    </div>
  );
}
