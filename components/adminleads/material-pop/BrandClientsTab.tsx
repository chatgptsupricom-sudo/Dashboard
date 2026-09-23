"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandClientDetailDialog } from "./BrandClientDetailDialog";

type ClienteMarca = {
  partnerId: number;
  cliente: string;
  rif: string;
  telefono: string;
  email: string;
  ciudad: string;
  vendedor: string;
  unidades: number;
  monto: number;
  facturas: number;
  ultimaCompra: string | null;
  marcas: string[];
};

const fmtNum = (n: number, dec = 0) =>
  n.toLocaleString("es-VE", { minimumFractionDigits: dec, maximumFractionDigits: dec });

const fmtFecha = (s: string | null) => {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}-${m}-${y}`;
};

const primerDiaAno = () => `${new Date().getFullYear()}-01-01`;
const hoy = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
};

/**
 * Quién compra las marcas del catálogo POP. Los datos son de Odoo: facturas
 * y notas de crédito confirmadas, monto sin IVA.
 */
export function BrandClientsTab() {
  const [desde, setDesde] = useState(primerDiaAno());
  const [hasta, setHasta] = useState(hoy());
  const [marca, setMarca] = useState("");

  const [clientes, setClientes] = useState<ClienteMarca[]>([]);
  const [marcasPop, setMarcasPop] = useState<string[]>([]);
  const [marcasSinVentas, setMarcasSinVentas] = useState<string[]>([]);
  const [totales, setTotales] = useState({ unidades: 0, monto: 0, clientes: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Fila abierta en el modal de detalle, y en qué pestaña abrirlo.
  const [detalle, setDetalle] = useState<{
    partnerId: number;
    cliente: string;
    foco: "productos" | "facturas";
  } | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ desde, hasta });
      if (marca) params.set("marca", marca);
      const res = await fetch(`/api/adminleads/material-pop/brand-clients?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "No se pudo cargar");
      setClientes(json.clientes || []);
      setMarcasPop(json.marcasPop || []);
      setMarcasSinVentas(json.marcasSinVentas || []);
      setTotales(json.totales || { unidades: 0, monto: 0, clientes: 0 });
    } catch (e: any) {
      setError(e?.message || "Error");
      setClientes([]);
    } finally {
      setLoading(false);
    }
  }, [desde, hasta, marca]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <div>
          <label className="block text-[11px] font-medium text-slate-500">Desde</label>
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="mt-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-500">Hasta</label>
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="mt-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-500">Marca</label>
          <select
            value={marca}
            onChange={(e) => setMarca(e.target.value)}
            className="mt-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">Todas las del catálogo</option>
            {marcasPop.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={cargar} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Actualizar
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {marcasSinVentas.length > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Sin ventas que cruzar para {marcasSinVentas.join(", ")}: esas marcas del catálogo POP no
          existen como marca en Odoo.
        </p>
      )}

      {/* Totales */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Clientes</p>
          <p className="text-lg font-semibold text-slate-900">{fmtNum(totales.clientes)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Unidades</p>
          <p className="text-lg font-semibold text-slate-900">{fmtNum(totales.unidades)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Monto sin IVA
          </p>
          <p className="text-lg font-semibold text-slate-900">$ {fmtNum(totales.monto, 2)}</p>
        </div>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="p-3">#</th>
              <th className="p-3">Cliente</th>
              <th className="p-3">RIF</th>
              <th className="p-3">Contacto</th>
              <th className="p-3">Vendedor</th>
              <th className="p-3">Marcas</th>
              <th className="p-3 text-right">Unidades</th>
              <th className="p-3 text-right">Monto</th>
              <th className="p-3 text-right">Facturas</th>
              <th className="p-3">Última compra</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={10} className="p-6 text-center text-slate-400">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            )}
            {!loading && clientes.length === 0 && (
              <tr>
                <td colSpan={10} className="p-6 text-center text-slate-400">
                  Sin compras de estas marcas en el rango
                </td>
              </tr>
            )}
            {!loading &&
              clientes.map((c, i) => (
                <tr key={c.partnerId} className="border-t border-slate-100 align-top">
                  <td className="p-3 text-slate-400">{i + 1}</td>
                  <td className="p-3">
                    <p className="font-medium text-slate-900">{c.cliente}</p>
                    {c.ciudad && <p className="text-xs text-slate-500">{c.ciudad}</p>}
                  </td>
                  <td className="p-3 whitespace-nowrap text-slate-600">{c.rif || "—"}</td>
                  <td className="p-3 text-xs text-slate-600">
                    {c.telefono && <p>{c.telefono}</p>}
                    {c.email && <p className="truncate">{c.email}</p>}
                    {!c.telefono && !c.email && "—"}
                  </td>
                  <td className="p-3 text-slate-600">{c.vendedor || "—"}</td>
                  <td className="p-3">
                    <span className="text-xs text-slate-600">{c.marcas.join(", ")}</span>
                  </td>
                  <td className="p-3 text-right">
                    <button
                      type="button"
                      onClick={() =>
                        setDetalle({ partnerId: c.partnerId, cliente: c.cliente, foco: "productos" })
                      }
                      className="font-medium text-slate-800 underline decoration-dotted underline-offset-2 hover:text-violet-700"
                    >
                      {fmtNum(c.unidades)}
                    </button>
                  </td>
                  <td className="p-3 text-right">
                    <button
                      type="button"
                      onClick={() =>
                        setDetalle({ partnerId: c.partnerId, cliente: c.cliente, foco: "productos" })
                      }
                      className="font-semibold text-slate-900 underline decoration-dotted underline-offset-2 hover:text-violet-700"
                    >
                      $ {fmtNum(c.monto, 2)}
                    </button>
                  </td>
                  <td className="p-3 text-right">
                    <button
                      type="button"
                      onClick={() =>
                        setDetalle({ partnerId: c.partnerId, cliente: c.cliente, foco: "facturas" })
                      }
                      className="text-slate-600 underline decoration-dotted underline-offset-2 hover:text-violet-700"
                    >
                      {c.facturas}
                    </button>
                  </td>
                  <td className="p-3 whitespace-nowrap text-slate-600">{fmtFecha(c.ultimaCompra)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <BrandClientDetailDialog
        partnerId={detalle?.partnerId ?? null}
        cliente={detalle?.cliente ?? ""}
        foco={detalle?.foco ?? "productos"}
        desde={desde}
        hasta={hasta}
        marca={marca}
        onClose={() => setDetalle(null)}
      />
    </div>
  );
}
