"use client";

// Informe KPI mensual de redes sociales, en formato de slides imprimibles.
// Se abre desde el tab "Campanas Meta" con el rango de fechas ya aplicado y se
// guarda como PDF con el boton Imprimir del navegador (@page A4 horizontal).
//
// La pagina vive dentro de /adminleads para heredar el guard de rol del
// middleware, pero se monta como overlay sobre el layout y en impresion oculta
// todo lo que no sea el informe.

import InformeRedesSociales from "@/components/leads/InformeRedesSociales";
import { Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function InformeLoader() {
  const params = useSearchParams();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const fechaInicio = params.get("fecha_inicio") || "";
  const fechaFin = params.get("fecha_fin") || "";
  const sede = params.get("sede") || "";

  useEffect(() => {
    const qs = new URLSearchParams();
    if (fechaInicio) qs.set("fecha_inicio", fechaInicio);
    if (fechaFin) qs.set("fecha_fin", fechaFin);
    if (sede) qs.set("sede", sede);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);

    fetch(`/api/adminleads/informe-mensual?${qs}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((r) => {
        if (r.error) throw new Error(r.detail || r.error);
        setData(r);
      })
      .catch((e) =>
        setError(
          e.name === "AbortError"
            ? "El informe tardó demasiado. Probá con un rango de fechas menor."
            : e.message,
        ),
      )
      .finally(() => clearTimeout(timeout));

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [fechaInicio, fechaFin, sede]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3 text-center px-6">
        <p className="text-sm font-semibold text-red-500">{error}</p>
        <button
          onClick={() => window.close()}
          className="text-xs text-zinc-500 underline"
        >
          Cerrar
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-screen text-zinc-400">
        <Loader2 className="w-5 h-5 animate-spin mr-3" />
        <span className="text-sm">Generando informe...</span>
      </div>
    );
  }

  return <InformeRedesSociales data={data} />;
}

export default function InformePage() {
  return (
    <>
      {/* Overlay: cubre el layout de adminleads en pantalla y aisla el informe al imprimir */}
      <div
        id="informe-redes"
        className="fixed inset-0 z-[200] bg-[#f4f5f7] overflow-auto print:static print:overflow-visible print:bg-white"
      >
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-screen text-zinc-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          }
        >
          <InformeLoader />
        </Suspense>
      </div>

      <style jsx global>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 10mm;
          }
          body * {
            visibility: hidden;
          }
          #informe-redes,
          #informe-redes * {
            visibility: visible;
          }
          /* inset:0 fijaria la altura al viewport y Chrome recortaria todo lo
             que no entra en la primera pagina: se ancla arriba y se deja que
             el alto crezca para que pagine. */
          #informe-redes {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: auto;
            overflow: visible;
          }
          .no-print {
            display: none !important;
          }
          /* Sin break-inside: avoid — un slide mas alto que la pagina debe
             continuar en la siguiente, no recortarse. */
          .slide {
            break-after: page;
            page-break-after: always;
          }
          .slide:last-child {
            break-after: auto;
            page-break-after: auto;
          }
          table {
            break-inside: avoid;
          }
        }
      `}</style>
    </>
  );
}
