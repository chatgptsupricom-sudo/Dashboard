"use client";

// Reporte de ventas cerradas por campaña, en páginas imprimibles. Mismo patrón
// que /adminleads/reporte-campanas: vive bajo /adminleads para heredar el guard
// de rol del middleware, se monta como overlay y al imprimir oculta el resto.

import ReporteVentasCampanas from "@/components/leads/ReporteVentasCampanas";
import { Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

function ReporteLoader() {
  const params = useSearchParams();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const desde = params.get("desde") || "";
  const hasta = params.get("hasta") || "";
  const sede = params.get("sede") || "";

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (desde) p.set("desde", desde);
    if (hasta) p.set("hasta", hasta);
    if (sede) p.set("sede", sede);
    return p.toString();
  }, [desde, hasta, sede]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);

    fetch(`/api/adminleads/reporte-ventas-campanas?${qs}`, {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((r) => {
        if (r.error) throw new Error(r.detail || r.error);
        setData(r);
      })
      .catch((e) =>
        setError(
          e.name === "AbortError"
            ? "El reporte tardó demasiado. Probá con un rango de fechas menor."
            : e.message,
        ),
      )
      .finally(() => clearTimeout(timeout));

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [qs]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3 text-center px-6">
        <p className="text-sm font-semibold text-red-500">{error}</p>
        <button onClick={() => window.close()} className="text-xs text-zinc-500 underline">
          Cerrar
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-screen text-zinc-400">
        <Loader2 className="w-5 h-5 animate-spin mr-3" />
        <span className="text-sm">Generando reporte...</span>
      </div>
    );
  }

  return (
    <ReporteVentasCampanas
      data={data}
      hrefExcel={`/api/adminleads/reporte-ventas-campanas/export?${qs}`}
    />
  );
}

export default function ReporteVentasCampanasPage() {
  return (
    <>
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
          <ReporteLoader />
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
