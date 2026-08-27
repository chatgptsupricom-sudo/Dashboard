"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ArrowLeft, Loader2, Search, XCircle } from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth.store";

/**
 * Registro de una carga de mercancia.
 *
 * La lista de renglones NO se escribe a mano: se trae de la orden de entrega
 * de Odoo. Si la escribiera el mismo que carga el camion, verificar contra
 * ella en el porton no probaria nada.
 */

type Linea = {
  odoo_product_id: number | null;
  producto: string;
  codigo: string | null;
  cantidad_cargada: number;
};

function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export default function MercanciaNueva({
  tipo,
}: {
  tipo: "ingreso" | "egreso";
}) {
  const tm = useTranslations("seguridad.mercancia");
  const t = useTranslations("seguridad");
  const params = useParams();
  const router = useRouter();
  const locale = (params?.locale as string) || "es";
  const { user } = useAuthStore();
  const base = `/${locale}/seguridad/mercancia/${tipo}`;

  const [orden, setOrden] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [errorOrden, setErrorOrden] = useState<string | null>(null);
  const [picking, setPicking] = useState<{
    odoo_picking_id: number;
    odoo_picking_name: string;
    contraparte: string;
  } | null>(null);
  const [lineas, setLineas] = useState<Linea[]>([]);

  const [fecha, setFecha] = useState(hoyISO());
  const [almacenista, setAlmacenista] = useState("");
  const [chofer, setChofer] = useState("");
  const [placa, setPlaca] = useState("");
  const [observaciones, setObservaciones] = useState("");
  // Solo el egreso la pide aparte: en el ingreso, la factura de compra ES el
  // documento que se busca, asi que ya viene con la orden.
  const [factura, setFactura] = useState("");

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buscarOrden = async () => {
    const v = orden.trim();
    if (!v) return;
    setBuscando(true);
    setErrorOrden(null);
    try {
      const res = await fetch(
        `/api/seguridad/mercancia/odoo/${encodeURIComponent(v)}?tipo=${tipo}`,
      );
      if (!res.ok) {
        setErrorOrden(tm("no_encontrada"));
        setPicking(null);
        setLineas([]);
        return;
      }
      const json = await res.json();
      const p = json.picking;
      setPicking({
        odoo_picking_id: p.odoo_picking_id,
        odoo_picking_name: p.odoo_picking_name,
        contraparte: p.contraparte,
      });
      setLineas(p.lineas || []);
    } catch {
      setErrorOrden(tm("no_encontrada"));
    } finally {
      setBuscando(false);
    }
  };

  const guardar = async () => {
    setError(null);
    if (!almacenista.trim() || lineas.length === 0) {
      setError(tm("error"));
      return;
    }
    setGuardando(true);
    try {
      const res = await fetch("/api/seguridad/mercancia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo,
          fecha,
          odoo_picking_id: picking?.odoo_picking_id,
          odoo_picking_name: picking?.odoo_picking_name,
          factura_numero:
            tipo === "egreso" ? factura.trim() || undefined : picking?.odoo_picking_name,
          contraparte: picking?.contraparte,
          almacenista_nombre: almacenista.trim(),
          chofer_nombre: chofer.trim() || undefined,
          placa_vehiculo: placa.trim() || undefined,
          observaciones: observaciones.trim() || undefined,
          items: lineas,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || tm("error"));
      router.push(`${base}/${json.id}`);
    } catch (e: any) {
      setError(e?.message || tm("error"));
      setGuardando(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 font-sans">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3 pl-14 lg:pl-4">
          <Link
            href={base}
            className="p-2 rounded-[10px] text-slate-500 hover:bg-slate-100"
            aria-label={t("back")}
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">
            {tm(tipo === "ingreso" ? "ingreso_titulo" : "egreso_titulo")}
          </h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4 pb-28">
        {/* Orden de Odoo */}
        <section className="bg-white border border-slate-200 rounded-[10px] p-5">
          <h2 className="text-sm font-bold text-slate-900 mb-3">
            {tm(tipo === "ingreso" ? "buscar_factura" : "buscar_orden")}
          </h2>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={orden}
              onChange={(e) => setOrden(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  buscarOrden();
                }
              }}
              placeholder={tm(tipo === "ingreso" ? "buscar_factura_ph" : "buscar_orden_ph")}
              className="flex-1 h-12 px-3 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-[color:var(--portal-primary,#741DFE)] focus:ring-2 focus:ring-violet-100"
            />
            <button
              type="button"
              onClick={buscarOrden}
              disabled={buscando || !orden.trim()}
              className="h-12 px-4 inline-flex items-center justify-center gap-2 rounded-[10px] text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: "var(--portal-primary,#741DFE)" }}
            >
              {buscando ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              {tm("buscar")}
            </button>
          </div>
          {errorOrden && (
            <p className="mt-3 text-sm text-red-600 flex items-center gap-2">
              <XCircle className="w-4 h-4" />
              {errorOrden}
            </p>
          )}
          {picking && (
            <div className="mt-4 rounded-[10px] border border-violet-200 bg-violet-50/60 p-4">
              <p className="text-sm font-bold text-violet-900">
                {picking.odoo_picking_name}
              </p>
              <p className="text-xs text-slate-600">
                {tm(tipo === "ingreso" ? "proveedor" : "cliente")}:{" "}
                {picking.contraparte || "—"}
              </p>
            </div>
          )}
        </section>

        {/* Renglones traidos de Odoo. Solo lectura: son la referencia contra la
            que se verificara en el porton. */}
        {lineas.length > 0 && (
          <section className="bg-white border border-slate-200 rounded-[10px] p-5">
            <h2 className="text-sm font-bold text-slate-900 mb-3">
              {tm("items")} ({lineas.length})
            </h2>
            <div className="divide-y divide-slate-100">
              {lineas.map((l, i) => (
                <div key={i} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-900 truncate">{l.producto}</p>
                    {l.codigo && (
                      <p className="text-[11px] font-mono text-slate-400">
                        {l.codigo}
                      </p>
                    )}
                  </div>
                  <span className="text-sm font-bold tabular-nums text-slate-700">
                    {l.cantidad_cargada}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Datos del movimiento */}
        <section className="bg-white border border-slate-200 rounded-[10px] p-5 space-y-4">
          <Campo label={tm("fecha")}>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full h-12 px-3 border border-slate-200 rounded-[10px] text-sm"
            />
          </Campo>
          {tipo === "egreso" && (
            <Campo label={tm("factura")}>
              <input
                type="text"
                value={factura}
                onChange={(e) => setFactura(e.target.value.slice(0, 100))}
                placeholder={tm("factura_ph")}
                className="w-full h-12 px-3 border border-slate-200 rounded-[10px] text-sm"
              />
            </Campo>
          )}
          <Campo label={`${tm("almacenista")} *`}>
            <input
              type="text"
              value={almacenista}
              onChange={(e) => setAlmacenista(e.target.value.slice(0, 200))}
              className="w-full h-12 px-3 border border-slate-200 rounded-[10px] text-sm"
            />
          </Campo>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Campo label={tm("chofer")}>
              <input
                type="text"
                value={chofer}
                onChange={(e) => setChofer(e.target.value.slice(0, 200))}
                className="w-full h-12 px-3 border border-slate-200 rounded-[10px] text-sm"
              />
            </Campo>
            <Campo label={tm("placa")}>
              <input
                type="text"
                value={placa}
                onChange={(e) => setPlaca(e.target.value.slice(0, 50))}
                className="w-full h-12 px-3 border border-slate-200 rounded-[10px] text-sm uppercase"
              />
            </Campo>
          </div>
          <Campo label={tm("observaciones")}>
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value.slice(0, 5000))}
              className="w-full min-h-[80px] px-3 py-2 border border-slate-200 rounded-[10px] text-sm"
            />
          </Campo>
        </section>

        {error && (
          <div className="rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 backdrop-blur lg:pl-60">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3">
          <button
            type="button"
            onClick={guardar}
            disabled={guardando || lineas.length === 0 || !almacenista.trim()}
            className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-[10px] text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: "var(--portal-primary,#741DFE)" }}
          >
            {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
            {tm("guardar")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Campo({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}
