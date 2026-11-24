"use client";

import { Sidebar } from "@/components/dashboard/sidebar";
import { TopBar } from "@/components/dashboard/top-bar";
import { SinMarcas } from "@/components/gerente-marca/SinMarcas";
import { useAuthStore } from "@/lib/stores/auth.store";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

type EstadoMarcas = "cargando" | "con" | "sin" | "error";

// Gerente de Marca: solo sus marcas, en Valencia y Caracas (lib/gerente-marca/).
// Mientras el SuperAdmin no le asigna marcas, el menú tiene una sola sección y
// todas sus pantallas muestran el aviso de pedirlas a soporte.
export default function GerenteMarcaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const rol = String(useAuthStore((s) => s.user?.role) ?? "").toLowerCase().trim();
  const esGerente = rol === "gerente de marca";
  const [marcas, setMarcas] = useState<EstadoMarcas>("cargando");

  useEffect(() => {
    if (window.innerWidth >= 768) setSidebarOpen(true);
  }, []);

  useEffect(() => {
    if (!esGerente) return;
    let vivo = true;
    setMarcas("cargando");
    fetch("/api/gerente-marca/asignaciones", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (vivo) setMarcas(Array.isArray(d?.asignaciones) && d.asignaciones.length > 0 ? "con" : "sin");
      })
      // Si falla la consulta se muestran las pantallas: cada una avisa su error.
      .catch(() => vivo && setMarcas("error"));
    return () => {
      vivo = false;
    };
  }, [esGerente]);

  const sinMarcas = esGerente && marcas === "sin";
  const esperando = esGerente && marcas === "cargando";

  return (
    <div className="flex min-h-dvh bg-[#f8fafc]">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-[99] md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <Sidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        soloSecciones={sinMarcas ? ["gm_sin_marcas"] : esperando ? [] : undefined}
      />
      <div
        className={`flex-1 min-w-0 flex flex-col transition-all duration-300 ${
          sidebarOpen ? "md:pl-72" : "pl-0"
        }`}
      >
        <TopBar onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 md:p-8 max-w-[1600px] mx-auto">
            {esperando ? (
              <p className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 size={15} className="animate-spin" /> Buscando tus marcas…
              </p>
            ) : sinMarcas ? (
              <SinMarcas />
            ) : (
              children
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
