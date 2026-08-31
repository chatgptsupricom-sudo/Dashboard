"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertTriangle, ChevronRight, RefreshCw, Users, Wallet } from "lucide-react";

/**
 * Landing de "Estado de Cuentas": un vendedor por fila, con su cartera
 * pendiente total.
 *
 * Flujo completo (issue del Gerente de Ventas): vendedor -> sus clientes ->
 * estado de cuenta del cliente -> detalle de una factura. Cada paso es su
 * propia pagina bajo /estado-cuenta/..., no un modal, para que se pueda
 * compartir el enlace o volver atras con el boton del navegador.
 */

type Vendedor = {
  userId: number;
  userName: string;
  totalReceivable: number;
  totalOverdue: number;
  clientCount: number;
  invoiceCount: number;
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export default function EstadoCuentaVendedoresPage() {
  const params = useParams();
  const locale = (params?.locale as string) || "es";

  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    fetch("/api/gerente_venta/estado-cuenta/vendedores")
      .then((res) => res.json())
      .then((json) => {
        if (cancelado) return;
        if (json.success) setVendedores(json.vendedores || []);
        else setError(json.error || "No se pudo cargar");
      })
      .catch(() => {
        if (!cancelado) setError("Error al cargar los vendedores");
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="h-11 w-11 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-200">
          <Wallet className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900">Estado de Cuentas</h1>
          <p className="text-sm text-slate-500">
            {cargando ? "Cargando..." : `${vendedores.length} vendedores con cartera pendiente`}
          </p>
        </div>
      </div>

      {cargando && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 rounded-2xl bg-white border border-slate-100 animate-pulse" />
          ))}
        </div>
      )}

      {error && !cargando && (
        <div className="rounded-2xl bg-red-50 border border-red-100 p-6 text-center text-red-600 text-sm flex items-center justify-center gap-2">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {!cargando && !error && vendedores.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-300">
          <RefreshCw className="w-12 h-12 mb-3" />
          <p className="text-sm font-medium">Sin cartera pendiente por ahora</p>
        </div>
      )}

      {!cargando && !error && vendedores.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {vendedores.map((v) => (
            <Link
              key={v.userId}
              href={`/${locale}/gerente_venta/estado-cuenta/${v.userId}?nombre=${encodeURIComponent(v.userName)}`}
              className="group flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm hover:shadow-lg hover:border-blue-200 hover:-translate-y-0.5 transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 font-bold text-sm">
                    {v.userName.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{v.userName}</p>
                    <p className="text-xs text-slate-400 flex items-center gap-1">
                      <Users size={11} /> {v.clientCount} clientes · {v.invoiceCount} facturas
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-400 shrink-0 transition-colors mt-1" />
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-slate-50">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Por cobrar</p>
                  <p className="text-lg font-black text-slate-900">{formatCurrency(v.totalReceivable)}</p>
                </div>
                {v.totalOverdue > 0 && (
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest">Vencido</p>
                    <p className="text-sm font-bold text-red-600">{formatCurrency(v.totalOverdue)}</p>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
