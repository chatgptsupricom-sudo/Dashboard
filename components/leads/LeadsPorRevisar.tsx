"use client";

// Leads de Excel para revisar a mano: vendidos a los que no se les ubicó el
// cliente, y leads que quedaron como contactado/negociación pero el cliente
// compró después. Datos de /api/adminleads/recompra/revisar.

import type { Candidato, LeadPorRevisar } from "@/lib/adminleads/recompra";
import { AlertTriangle, Check, Loader2, Phone, Receipt, Type, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

const SEDES: Record<number, string> = { 9: "Valencia", 10: "Caracas", 7: "Panamá" };
const VIA: Record<Candidato["via"], { texto: string; Icono: typeof Phone; clase: string }> = {
  telefono: { texto: "Mismo teléfono", Icono: Phone, clase: "bg-emerald-50 text-emerald-700" },
  factura: { texto: "Factura del Excel", Icono: Receipt, clase: "bg-blue-50 text-blue-700" },
  nombre: { texto: "Mismo nombre", Icono: Type, clase: "bg-zinc-100 text-zinc-600" },
};
const usd = (n: number) => `$${n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function LeadsPorRevisar({ onCambio }: { onCambio?: (n: number) => void }) {
  const [leads, setLeads] = useState<LeadPorRevisar[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [tipo, setTipo] = useState<"" | "sin_rif" | "posible_venta">("");

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await fetch("/api/adminleads/recompra/revisar").then((x) => x.json());
      if (r.error) throw new Error(r.error);
      setLeads(r.leads);
      onCambio?.(r.leads.length);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, [onCambio]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const enviar = async (l: LeadPorRevisar, body: Record<string, unknown>) => {
    setOcupado(l.id);
    try {
      const r = await fetch("/api/adminleads/recompra/historicos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: l.id, ...body }),
      }).then((x) => x.json());
      if (r.error) throw new Error(r.error);
      setLeads((ls) => {
        const resto = ls.filter((x) => x.id !== l.id);
        onCambio?.(resto.length);
        return resto;
      });
    } catch (e: any) {
      alert(e.message);
    } finally {
      setOcupado(null);
    }
  };

  const elegir = (l: LeadPorRevisar, c: Candidato) =>
    enviar(
      l,
      l.tipo === "posible_venta"
        ? { accion: "confirmar", rif: c.rif, cliente: c.cliente, fecha: c.fecha, monto: c.monto }
        : { rif: c.rif, cliente: c.cliente, fecha: c.fecha },
    );

  const visibles = leads.filter((l) => !tipo || l.tipo === tipo);
  const nSinRif = leads.filter((l) => l.tipo === "sin_rif").length;

  if (cargando && !leads.length) {
    return (
      <div className="flex items-center justify-center py-20 text-zinc-400 text-sm">
        <Loader2 className="w-5 h-5 animate-spin mr-3" /> Buscando compras de cada lead…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-zinc-50 rounded-2xl border border-zinc-100 p-4 text-xs text-zinc-500 space-y-1.5">
        <p>
          <b>Vendidos sin cliente:</b> el Excel dice CONCRETADO pero no se ubicó a quién se facturó. Elige el cliente
          correcto y la venta entra al reporte.
        </p>
        <p>
          <b>Posibles ventas sin marcar:</b> el lead quedó como contactado, negociación, etc., pero ese cliente compró en
          los 90 días siguientes. Si fue el vendedor quien cerró, confírmalo; si no, &quot;No es venta&quot; y no vuelve a
          salir. Volver a subir el Excel no deshace lo que confirmes.
        </p>
        <p>
          Se buscan por <b>teléfono</b> (el del lead en un cliente de Odoo, lo más seguro), por un número de la columna
          Factura/Pedido, o por <b>nombre</b> (revisar con más cuidado). &quot;Ya compraba&quot; = compró en los 6 meses
          antes del lead: puede ser un cliente que habría comprado igual.
        </p>
      </div>

      <div className="flex items-center gap-2">
        {([
          ["", `Todos (${leads.length})`],
          ["sin_rif", `Vendidos sin cliente (${nSinRif})`],
          ["posible_venta", `Posibles ventas sin marcar (${leads.length - nSinRif})`],
        ] as const).map(([v, t]) => (
          <button
            key={v}
            onClick={() => setTipo(v)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${tipo === v ? "bg-blue-600 text-white" : "bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {error && <p className="text-sm font-semibold text-red-500">{error}</p>}
      {!visibles.length && !error && (
        <p className="text-center text-zinc-400 py-10 text-sm bg-white rounded-2xl border border-zinc-100">
          No hay nada por revisar.
        </p>
      )}

      {visibles.map((l) => (
        <div key={l.id} className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-4 space-y-3">
          <div className="flex flex-col md:flex-row md:items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-bold text-zinc-800">{l.nombre}</p>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${l.tipo === "sin_rif" ? "bg-amber-50 text-amber-700" : "bg-violet-50 text-violet-700"}`}
                >
                  {l.tipo === "sin_rif" ? "Vendido sin cliente" : `Posible venta · en el Excel: ${l.estatus || "sin estatus"}`}
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">
                Lead del {l.fecha} · {SEDES[l.company_id]} · {l.vendedor || "sin vendedor"} · {l.telefono || "sin teléfono"}
                {l.factura_txt ? ` · Factura/Pedido: ${l.factura_txt}` : ""}
              </p>
              {l.observacion && <p className="text-xs text-zinc-400 mt-1 italic">&quot;{l.observacion}&quot;</p>}
            </div>
            <button
              disabled={ocupado === l.id}
              onClick={() => enviar(l, { accion: "descartar" })}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-zinc-200 text-xs text-zinc-500 hover:bg-zinc-50 shrink-0"
            >
              <X className="w-3.5 h-3.5" /> {l.tipo === "sin_rif" ? "Ninguno es" : "No es venta"}
            </button>
          </div>

          <div className="space-y-2">
            {l.candidatos.map((c) => {
              const v = VIA[c.via];
              return (
                <div
                  key={c.rif}
                  className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 bg-zinc-50 rounded-xl px-3 py-2"
                >
                  <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg w-fit ${v.clase}`}>
                    <v.Icono className="w-3 h-3" /> {v.texto}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-zinc-700">{c.cliente}</p>
                    <p className="text-[11px] text-zinc-400">
                      {c.rif} · primera compra {c.fecha} ({c.sistema} {c.documento}) por {usd(c.monto)} ·{" "}
                      {c.compras ? `${c.compras} compra(s) en la ventana` : "ninguna compra en la ventana del lead"}
                      {c.compraba && (
                        <span className="text-amber-600 ml-1">
                          <AlertTriangle className="inline w-3 h-3" /> ya compraba
                        </span>
                      )}
                    </p>
                  </div>
                  <button
                    disabled={ocupado === l.id}
                    onClick={() => elegir(l, c)}
                    className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-40 shrink-0"
                  >
                    {ocupado === l.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    {l.tipo === "sin_rif" ? "Es este cliente" : "Sí, se vendió"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
