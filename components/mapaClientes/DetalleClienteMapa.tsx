"use client";

import { Badge } from "@tremor/react";
import { CalendarClock, CreditCard, FileText, Package } from "lucide-react";
import { useEffect, useState } from "react";
import type { DetalleCliente } from "@/lib/mapaClientes/detalleCliente";

const ESTADO_PAGO: Record<string, { label: string; clase: string }> = {
  not_paid: { label: "Pendiente", clase: "bg-amber-100 text-amber-700" },
  partial: { label: "Parcial", clase: "bg-orange-100 text-orange-700" },
  in_payment: { label: "En proceso", clase: "bg-blue-100 text-blue-700" },
  paid: { label: "Pagada", clase: "bg-emerald-100 text-emerald-700" },
  reversed: { label: "Revertida", clase: "bg-slate-100 text-slate-500" },
};

const usd = (n: number) =>
  `$ ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fecha = (f: string | null | undefined) => {
  if (!f) return "—";
  const [a, m, d] = f.split("-");
  return `${d}/${m}/${a}`;
};

/**
 * Plazo de pago, ultima compra, facturas y productos del cliente, leidos de
 * Odoo al abrir la ficha (`/api/gerente_venta/mapa_cliente/detalle`).
 */
export function DetalleClienteMapa({
  partnerId,
  desde,
  hasta,
}: {
  partnerId: number | null | undefined;
  desde: string | null;
  hasta: string | null;
}) {
  const [detalle, setDetalle] = useState<DetalleCliente | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!partnerId) {
      setCargando(false);
      setError("Este cliente no trae su id de Odoo; recarga la página.");
      return;
    }
    let ignorar = false;
    setCargando(true);
    setError(null);
    setDetalle(null);
    const qs = new URLSearchParams({ partner_id: String(partnerId) });
    if (desde && hasta) {
      qs.set("startDate", desde);
      qs.set("endDate", hasta);
    }
    fetch(`/api/gerente_venta/mapa_cliente/detalle?${qs.toString()}`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
        return json as DetalleCliente;
      })
      .then((d) => !ignorar && setDetalle(d))
      .catch((e) => !ignorar && setError(e.message))
      .finally(() => !ignorar && setCargando(false));
    return () => {
      ignorar = true;
    };
  }, [partnerId, desde, hasta]);

  if (cargando) {
    return (
      <div className="py-8 text-center text-xs font-bold text-slate-400 uppercase tracking-wider animate-pulse">
        Cargando facturas y productos de Odoo…
      </div>
    );
  }
  if (error || !detalle) {
    return (
      <div className="p-5 rounded-2xl border border-red-100 bg-red-50 text-xs text-red-700">
        No se pudo cargar el detalle: {error}
      </div>
    );
  }

  const periodo = detalle.desde && detalle.hasta ? `del ${fecha(detalle.desde)} al ${fecha(detalle.hasta)}` : "todo el historial en Odoo";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-5 bg-slate-50 border border-slate-100 rounded-2xl flex items-center gap-4">
          <div className="p-3 bg-slate-900 rounded-xl text-white shadow-md">
            <CreditCard size={20} />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Plazo de pago (Odoo)</span>
            <div className="text-sm font-black text-slate-800 uppercase mt-0.5 tracking-wide">
              {detalle.plazo || "Sin plazo en la ficha"}
            </div>
            {detalle.limiteCredito > 0 && (
              <div className="text-[10px] text-slate-400 font-bold">Límite de crédito {usd(detalle.limiteCredito)}</div>
            )}
          </div>
        </div>
        <div className="p-5 bg-slate-50 border border-slate-100 rounded-2xl flex items-center gap-4">
          <div className="p-3 bg-emerald-600 rounded-xl text-white shadow-md">
            <CalendarClock size={20} />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Última compra</span>
            {detalle.ultimaCompra ? (
              <>
                <div className="text-sm font-black text-slate-800 mt-0.5">{fecha(detalle.ultimaCompra.fecha)}</div>
                <div className="text-[10px] text-slate-400 font-bold">
                  Factura {detalle.ultimaCompra.numero} · {usd(detalle.ultimaCompra.monto)}
                </div>
              </>
            ) : (
              <div className="text-sm font-black text-slate-800 mt-0.5">Sin compras en Odoo</div>
            )}
          </div>
        </div>
      </div>

      {/* Facturas */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2 pl-1">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
            <FileText size={12} /> Facturas ({detalle.totalFacturas})
          </h4>
          <span className="text-[10px] text-slate-400 font-bold">
            {periodo} · facturado {usd(detalle.facturado)} · pendiente {usd(detalle.pendiente)}
          </span>
        </div>
        <div className="border border-slate-100 rounded-2xl overflow-hidden bg-white shadow-sm">
          <div className="bg-slate-50 px-5 py-3 grid grid-cols-[1fr_auto_auto] gap-3 text-[9px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">
            <span>Factura / Fecha</span>
            <span className="text-right">Total</span>
            <span className="text-right w-20">Estado</span>
          </div>
          <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
            {detalle.facturas.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 italic font-medium">Sin facturas en el período.</div>
            ) : (
              detalle.facturas.map((f) => {
                const estado = ESTADO_PAGO[f.estadoPago] || { label: f.estadoPago, clase: "bg-slate-100 text-slate-500" };
                return (
                  <div key={f.id} className="px-5 py-3 grid grid-cols-[1fr_auto_auto] gap-3 items-center text-xs">
                    <div className="min-w-0">
                      <div className="font-bold text-slate-800 font-mono">
                        {f.numero}
                        {f.esNotaCredito && <span className="ml-1.5 text-[9px] font-black text-red-500">NC</span>}
                      </div>
                      <div className="text-[10px] text-slate-400 font-bold">
                        {fecha(f.fecha)}
                        {f.vence && !f.esNotaCredito && ` · vence ${fecha(f.vence)}`}
                        {f.vendedor && ` · ${f.vendedor}`}
                      </div>
                    </div>
                    <div className="text-right tabular-nums">
                      <div className="font-mono font-black text-slate-800">{usd(f.total)}</div>
                      {f.pendiente !== 0 && f.pendiente !== f.total && (
                        <div className="text-[10px] text-amber-600 font-bold">debe {usd(f.pendiente)}</div>
                      )}
                    </div>
                    <div className="w-20 text-right">
                      <Badge className={`border-none rounded-lg font-bold text-[9px] py-0.5 px-2 ${estado.clase}`}>
                        {estado.label}
                      </Badge>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
        {detalle.totalFacturas > detalle.facturas.length && (
          <p className="text-[10px] text-slate-400 pl-1">
            Se muestran las {detalle.facturas.length} más recientes de {detalle.totalFacturas}.
          </p>
        )}
      </div>

      {/* Productos */}
      <div className="space-y-3">
        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1 flex items-center gap-1.5">
          <Package size={12} /> Productos adquiridos
        </h4>
        <div className="border border-slate-100 rounded-2xl overflow-hidden bg-white shadow-sm">
          <div className="bg-slate-50 px-5 py-3 flex justify-between text-[9px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">
            <span>Artículo / Cantidad</span>
            <span>Monto facturado</span>
          </div>
          <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
            {detalle.productos.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 italic font-medium">Sin productos en el período.</div>
            ) : (
              detalle.productos.map((p) => (
                <div key={p.producto} className="px-5 py-3.5 flex justify-between items-center gap-3 text-xs">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="font-bold text-slate-800 uppercase tracking-tight line-clamp-2">{p.producto}</span>
                    <span className="text-[10px] text-slate-400 font-bold tabular-nums">
                      {p.cantidad.toLocaleString("en-US")} unidades
                    </span>
                  </div>
                  <span className="font-mono font-black text-blue-600 text-right tabular-nums whitespace-nowrap">
                    {usd(p.monto)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
        <p className="text-[10px] text-slate-400 pl-1">
          Solo Odoo: lo vendido antes del {fecha(detalle.corteOdoo)} está en Smartbit y no sale aquí.
        </p>
      </div>
    </div>
  );
}
