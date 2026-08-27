"use client";

import Link from "next/link";
import { getSocket } from "@/lib/socket-client";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronRight, Inbox, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { fechaCorta } from "@/lib/fecha";

/**
 * Equipos por llegar: tickets del portal que todavia no tienen ingreso.
 *
 * Cierra el hueco entre las dos mitades del sistema — un cliente reporta una
 * falla desde supricom.com.ve y en el almacen nadie se entera hasta que
 * aparece con el equipo en la mano.
 *
 * Vivia dentro del mostrador; al quitarse esa vista, pasa a ser una pantalla
 * propia de la seccion RMA, que es donde tiene sentido.
 */

type TicketEsperando = {
  id: number;
  case_number: string;
  cliente: string;
  producto: string;
  marca: string;
  serial: string | null;
  factura: string;
  reportado_at: string;
};

export default function PorLlegarPage() {
  const t = useTranslations("seguridad");
  const tp = useTranslations("seguridad.por_llegar");
  const params = useParams();
  const locale = (params?.locale as string) || "es";
  const base = `/${locale}/seguridad`;

  const [tickets, setTickets] = useState<TicketEsperando[]>([]);
  const [cargando, setCargando] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/seguridad/tickets-sin-ingreso");
      if (!res.ok) return;
      const json = await res.json();
      setTickets(json.tickets || []);
    } catch {
      // Sin conexion se deja lo que ya esta en pantalla: lo viejo es mas util
      // que una lista vacia.
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
    // Refresco periodico: esta pantalla queda abierta toda la jornada y nadie
    // va a recargarla a mano.
    const id = setInterval(cargar, 30_000);
    return () => clearInterval(id);
  }, [cargar]);

  // Aviso en vivo cuando entra un reporte por el portal. El servidor ya emitia
  // `rma_ticket_nuevo` desde el issue #24.
  useEffect(() => {
    let socket: any;
    try {
      socket = getSocket();
      socket.on("rma_ticket_nuevo", (datos: any) => {
        setAviso(
          `${datos?.case_number ?? ""} · ${datos?.client_name ?? ""}`.trim(),
        );
        cargar();
        setTimeout(() => setAviso(null), 12_000);
      });
    } catch {
      // Sin socket, el refresco de 30s cubre igual.
    }
    return () => {
      try {
        socket?.off("rma_ticket_nuevo");
      } catch {}
    };
  }, [cargar]);

  return (
    <div className="min-h-screen bg-slate-50/50 font-sans">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <div className="p-2 rounded-xl bg-violet-100 shrink-0">
            <Inbox className="w-5 h-5 text-violet-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">
              {tp("titulo")}
            </h1>
            <p className="text-xs text-slate-500 truncate">{tp("subtitulo")}</p>
          </div>
          <button
            type="button"
            onClick={() => cargar()}
            aria-label={tp("refrescar")}
            className="p-2 rounded-[10px] text-slate-500 hover:bg-slate-100"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-3">
        {aviso && (
          <div
            role="status"
            className="rounded-2xl px-4 py-3 text-white text-sm font-semibold"
            style={{ backgroundColor: "var(--portal-primary,#741DFE)" }}
          >
            {tp("nuevo_reporte")}: {aviso}
          </div>
        )}

        {cargando ? (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-400 text-sm">
            <Loader2 className="w-5 h-5 animate-spin" />
            {t("dashboard.loading")}
          </div>
        ) : tickets.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">
            {tp("vacio")}
          </div>
        ) : (
          tickets.map((tk) => (
            <Link
              key={tk.id}
              // El formulario ya sabe leer ?ticket= y se prellena solo, para no
              // teclear el numero con el cliente delante.
              href={`${base}/ingreso/nuevo?ticket=${encodeURIComponent(tk.case_number)}`}
              className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 hover:border-violet-300 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-violet-700">
                    {tk.case_number}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {fechaCorta(tk.reportado_at)}
                  </span>
                </div>
                <p className="text-sm font-semibold text-slate-900 truncate mt-0.5">
                  {tk.cliente}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {tk.producto}
                  {tk.serial ? ` · ${tk.serial}` : ""}
                </p>
              </div>
              <span className="text-xs font-semibold text-violet-700 shrink-0 hidden sm:inline">
                {tp("registrar")}
              </span>
              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
            </Link>
          ))
        )}
      </main>
    </div>
  );
}
