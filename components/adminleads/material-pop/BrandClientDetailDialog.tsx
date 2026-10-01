"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type DetalleProducto = {
  producto: string;
  marca: string;
  unidades: number;
  monto: number;
};

type DetalleFactura = {
  numero: string;
  fecha: string | null;
  vendedor: string;
  unidades: number;
  monto: number;
  esNotaCredito: boolean;
};

const fmtNum = (n: number, dec = 0) =>
  n.toLocaleString("es-VE", { minimumFractionDigits: dec, maximumFractionDigits: dec });

const fmtFecha = (s: string | null) => {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}-${m}-${y}`;
};

/**
 * Detrás de las cifras de una fila: qué productos compró el cliente y en qué
 * facturas. Se abre en la pestaña que corresponde a la celda que se tocó —
 * unidades y monto llevan a productos, el número de facturas a facturas.
 */
export function BrandClientDetailDialog({
  partnerId,
  cliente,
  desde,
  hasta,
  marca,
  foco,
  onClose,
}: {
  partnerId: number | null;
  cliente: string;
  desde: string;
  hasta: string;
  marca: string;
  foco: "productos" | "facturas";
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"productos" | "facturas">(foco);
  const [productos, setProductos] = useState<DetalleProducto[]>([]);
  const [facturas, setFacturas] = useState<DetalleFactura[]>([]);
  const [totales, setTotales] = useState({ unidades: 0, monto: 0, facturas: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTab(foco);
  }, [foco, partnerId]);

  useEffect(() => {
    if (!partnerId) return;
    let cancelado = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ partnerId: String(partnerId), desde, hasta });
    if (marca) params.set("marca", marca);
    fetch(`/api/adminleads/material-pop/brand-clients/detalle?${params}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "No se pudo cargar el detalle");
        return json;
      })
      .then((json) => {
        if (cancelado) return;
        setProductos(json.productos || []);
        setFacturas(json.facturas || []);
        setTotales(json.totales || { unidades: 0, monto: 0, facturas: 0 });
      })
      .catch((e) => {
        if (!cancelado) {
          setError(e?.message || "Error");
          setProductos([]);
          setFacturas([]);
        }
      })
      .finally(() => {
        if (!cancelado) setLoading(false);
      });
    return () => {
      cancelado = true;
    };
  }, [partnerId, desde, hasta, marca]);

  return (
    <Dialog open={partnerId !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{cliente}</DialogTitle>
          <DialogDescription>
            {fmtFecha(desde)} a {fmtFecha(hasta)} · {marca || "todas las marcas del catálogo"} ·{" "}
            {fmtNum(totales.unidades)} unidades · $ {fmtNum(totales.monto, 2)} ·{" "}
            {totales.facturas} facturas
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {(
            [
              ["productos", `Productos (${productos.length})`],
              ["facturas", `Facturas (${facturas.length})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                tab === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {loading && (
          <div className="p-8 text-center text-slate-400">
            <Loader2 className="mx-auto h-5 w-5 animate-spin" />
          </div>
        )}

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {!loading && !error && tab === "productos" && (
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2">Producto</th>
                <th className="py-2">Marca</th>
                <th className="py-2 text-right">Unidades</th>
                <th className="py-2 text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              {productos.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-slate-400">
                    Sin productos en el rango
                  </td>
                </tr>
              )}
              {productos.map((p, i) => (
                <tr key={`${p.producto}-${i}`} className="border-t border-slate-100">
                  <td className="py-2 pr-3">{p.producto}</td>
                  <td className="py-2 pr-3 text-slate-500">{p.marca}</td>
                  <td className="py-2 text-right font-medium">{fmtNum(p.unidades)}</td>
                  <td className="py-2 text-right font-semibold">$ {fmtNum(p.monto, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {!loading && !error && tab === "facturas" && (
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2">Factura</th>
                <th className="py-2">Fecha</th>
                <th className="py-2">Vendedor</th>
                <th className="py-2 text-right">Unidades</th>
                <th className="py-2 text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              {facturas.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-400">
                    Sin facturas en el rango
                  </td>
                </tr>
              )}
              {facturas.map((f, i) => (
                <tr key={`${f.numero}-${i}`} className="border-t border-slate-100">
                  <td className="py-2 pr-3">
                    {f.numero}
                    {f.esNotaCredito && (
                      <span className="ml-1.5 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                        NC
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap text-slate-600">{fmtFecha(f.fecha)}</td>
                  <td className="py-2 pr-3 text-slate-600">{f.vendedor || "—"}</td>
                  <td className="py-2 text-right font-medium">{fmtNum(f.unidades)}</td>
                  <td className="py-2 text-right font-semibold">$ {fmtNum(f.monto, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </DialogContent>
    </Dialog>
  );
}
