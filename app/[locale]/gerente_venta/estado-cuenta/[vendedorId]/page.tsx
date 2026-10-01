"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, ChevronRight, RefreshCw, UserCheck } from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth.store";

/**
 * Paso 2 de Estado de Cuentas: los clientes de UN vendedor.
 *
 * Reusa /api/superadmin/cuentas-por-cobrar/detail?user_id=X — el mismo
 * endpoint que ya usa el dashboard de Cuentas por Cobrar — y agrupa las
 * facturas por cliente en el navegador. No hace falta un endpoint nuevo: el
 * detalle ya trae partnerId/partnerName por factura.
 */

type Factura = {
  id: number;
  moveId: number;
  partnerId: number;
  partnerName: string;
  amountResidual: number;
  agingDays: number;
};

type Cliente = {
  partnerId: number;
  partnerName: string;
  total: number;
  overdue: number;
  count: number;
  oldest: number;
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export default function EstadoCuentaClientesPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const locale = (params?.locale as string) || "es";
  const vendedorId = params?.vendedorId as string;
  const nombreVendedor = searchParams?.get("nombre") || "";

  const { user } = useAuthStore();

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!vendedorId) return;
    let cancelado = false;
    setCargando(true);
    setError(null);
    const qp = new URLSearchParams({ user_id: vendedorId });
    if (user?.cids) qp.set("userCids", String(user.cids));
    fetch(`/api/superadmin/cuentas-por-cobrar/detail?${qp}`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelado) return;
        if (!json.success) {
          setError(json.error || "No se pudo cargar");
          return;
        }
        const facturas: Factura[] = json.data?.invoices || [];
        const porCliente: Record<number, Cliente> = {};
        facturas.forEach((f) => {
          if (!porCliente[f.partnerId]) {
            porCliente[f.partnerId] = {
              partnerId: f.partnerId,
              partnerName: f.partnerName,
              total: 0,
              overdue: 0,
              count: 0,
              oldest: 0,
            };
          }
          const c = porCliente[f.partnerId];
          c.total += f.amountResidual;
          c.count++;
          if (f.agingDays > 0) c.overdue += f.amountResidual;
          if (f.agingDays > c.oldest) c.oldest = f.agingDays;
        });
        setClientes(Object.values(porCliente).sort((a, b) => b.total - a.total));
      })
      .catch(() => {
        if (!cancelado) setError("Error al cargar los clientes");
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [vendedorId, user?.cids]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/${locale}/gerente_venta/estado-cuenta`}
          className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl font-black text-slate-900">
            {nombreVendedor || "Vendedor"}
          </h1>
          <p className="text-sm text-slate-500">
            {cargando ? "Cargando..." : `${clientes.length} clientes con cartera pendiente`}
          </p>
        </div>
      </div>

      {cargando && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-white border border-slate-100 animate-pulse" />
          ))}
        </div>
      )}

      {error && !cargando && (
        <div className="rounded-2xl bg-red-50 border border-red-100 p-6 text-center text-red-600 text-sm flex items-center justify-center gap-2">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {!cargando && !error && clientes.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-300">
          <RefreshCw className="w-12 h-12 mb-3" />
          <p className="text-sm font-medium">Este vendedor no tiene cartera pendiente</p>
        </div>
      )}

      {!cargando && !error && clientes.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {clientes.map((c) => (
            <Link
              key={c.partnerId}
              href={`/${locale}/gerente_venta/estado-cuenta/${vendedorId}/${c.partnerId}?nombre=${encodeURIComponent(c.partnerName)}&vendedor=${encodeURIComponent(nombreVendedor)}`}
              className="group flex items-start gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm hover:shadow-lg hover:border-blue-200 hover:-translate-y-0.5 transition-all"
            >
              <div className="w-9 h-9 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center shrink-0">
                <UserCheck className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-900 truncate">{c.partnerName}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {c.count} facturas {c.oldest > 0 ? `· ${c.oldest} días vencida` : ""}
                </p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-sm font-black text-slate-900">{formatCurrency(c.total)}</span>
                  {c.overdue > 0 && (
                    <span className="text-xs font-bold text-red-600">{formatCurrency(c.overdue)} vencido</span>
                  )}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-400 shrink-0 mt-1" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
