"use client";

import { Fragment, useCallback, useEffect, useState } from "react";

// Detalle del DSO (lib/cxc/dso.ts) en el Dashboard de CxC: el número general
// sin las negociaciones especiales, el DSO por tipo de cobro (plazo de pago) y
// las negociaciones especiales, que CxC marca y quita aquí
// (lib/cxc/negociacionesEspeciales.ts).

type Tramo = {
  id: string; label: string; saldo: number; ventas: number; dso: number | null;
  plazoPromedio: number | null; atraso: number | null; clientes: number;
};
type Cliente = {
  partnerId: number; partnerName: string; saldo: number; ventasNetas: number; dias: number;
  dso: number | null; especial?: boolean; especialParcial?: boolean; plazoDias?: number | null;
};
type Marca = {
  id: number; companyId: number; partnerId: number; cliente: string; motivo: string; desde: string; hasta: string | null;
  creadoPor: string; creadoEl: string; quitadoPor: string | null; quitadoDia: string | null; motivoQuitar: string | null;
};
export type DatosDso = {
  summary: { dso: number | null; carteraAbierta: number; ventasNetas: number; dias: number; ventanaMovil: boolean; count: number; dsoConEspeciales?: number | null };
  especiales?: { saldo: number; ventas: number; dso: number | null; clientes: number };
  porPlazo?: Tramo[];
  clientes: Cliente[];
};

const SEDE: Record<number, string> = { 0: "Todas las sedes", 7: "Panamá", 9: "Valencia", 10: "Caracas" };
const usd = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
const dia = (s: string | null) => (s ? s.slice(0, 10).split("-").reverse().join("/") : "—");
const colorDso = (dso: number | null, ref = 45) =>
  dso == null ? "text-slate-400" : dso > ref + 15 ? "text-red-600 font-bold" : dso > ref ? "text-amber-600 font-medium" : "text-emerald-600 font-medium";

export default function DetalleDso({
  data,
  empresa,
  companyIdMarca,
  puedeMarcar,
  onCambio,
}: {
  data: DatosDso;
  empresa: string;
  /** Sede con la que se marca un cliente (0 = las tres). */
  companyIdMarca: number;
  puedeMarcar: boolean;
  /** Se marcó o quitó una negociación: volver a pedir el detalle y la tarjeta. */
  onCambio: () => void;
}) {
  const s = data.summary;
  const esp = data.especiales;
  const [marcas, setMarcas] = useState<Marca[] | null>(null);
  const [verQuitadas, setVerQuitadas] = useState(false);
  const [form, setForm] = useState<{ partnerId: number; nombre: string; motivo: string; hasta: string } | null>(null);
  const [quitando, setQuitando] = useState<{ id: number; motivo: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargarMarcas = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (empresa) params.set("empresa", empresa);
      const res = await fetch(`/api/superadmin/cuentas-por-cobrar/negociaciones-especiales?${params}`);
      const json = await res.json();
      setMarcas(json.success ? json.data : []);
    } catch {
      setMarcas([]);
    }
  }, [empresa]);
  useEffect(() => { cargarMarcas(); }, [cargarMarcas]);

  const enviar = async (body: Record<string, unknown>) => {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch("/api/superadmin/cuentas-por-cobrar/negociaciones-especiales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "No se pudo guardar");
      setForm(null);
      setQuitando(null);
      await cargarMarcas();
      onCambio();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  // Vencida = su "hasta" ya pasó: no cuenta, va con las quitadas.
  const hoy = new Date(Date.now() - 4 * 3_600_000).toISOString().slice(0, 10);
  const vigentes = (marcas || []).filter((m) => !m.quitadoDia && (!m.hasta || m.hasta >= hoy));
  const quitadas = (marcas || []).filter((m) => !vigentes.includes(m));

  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3.5 text-center">
          <span className="text-[9px] font-bold text-blue-400 uppercase tracking-widest block mb-1">CxC crédito al cierre</span>
          <span className="text-lg font-bold text-blue-800">{usd(s.carteraAbierta)}</span>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3.5 text-center">
          <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest block mb-1">{s.ventanaMovil ? `Ventas crédito últimos ${s.dias} días` : "Ventas crédito del mes"}</span>
          <span className="text-lg font-bold text-emerald-800">{usd(s.ventasNetas)}</span>
        </div>
        <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 text-center">
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">DSO general</span>
          <span className="text-lg font-bold text-slate-800">{s.dso !== null ? `${s.dso} días` : "N/A"}</span>
          <span className="text-[10px] text-slate-400 block">{s.dias} días del período</span>
        </div>
      </div>

      <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Fórmula</span>
        <p className="text-xs text-slate-600">
          DSO = CxC a crédito al cierre ÷ Ventas a crédito {s.ventanaMovil ? "del período" : "del mes"} × Días {s.ventanaMovil ? "del período" : "del mes"}
          {" "}= {usd(s.carteraAbierta)} ÷ {usd(s.ventasNetas)} × {s.dias}
          {" "}= <strong>{s.dso !== null ? `${s.dso} días` : "N/A"}</strong>
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Saldo contable a crédito (sin Incobrables, Supricom ni SUPER TECHNO) y facturas a crédito menos sus notas de crédito, con IVA,
          <strong> sin los clientes con negociación especial</strong> (van aparte abajo). Mes en curso: al día de hoy y, mientras el mes
          lleve menos de 30 días, con las ventas de los últimos 30 días. Por cliente, la misma fórmula con su saldo y sus ventas a crédito
          de los últimos 90 días; sin ventas en esos días no hay DSO (—).
        </p>
      </div>

      {/* ── Por tipo de cobro ── */}
      {data.porPlazo && data.porPlazo.length > 0 && (
        <div>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Por tipo de cobro (plazo de pago)</span>
          <p className="text-[11px] text-slate-500 mb-2">
            Cada tramo con su DSO contra el plazo que se le dio (vencimiento − fecha de factura). «Atraso» = DSO − plazo promedio: cuántos
            días más de lo pactado tarda en cobrarse. Sin negociaciones especiales. Los saldos son los de cada factura (no restan pagos sin
            aplicar), por eso su suma no da exacto la CxC de arriba.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50/80 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                  <th className="text-left py-2 px-3">Plazo</th>
                  <th className="text-right py-2 px-3">Clientes</th>
                  <th className="text-right py-2 px-3">Saldo al cierre</th>
                  <th className="text-right py-2 px-3">Ventas crédito</th>
                  <th className="text-right py-2 px-3">Plazo prom.</th>
                  <th className="text-right py-2 px-3">DSO</th>
                  <th className="text-right py-2 px-3">Atraso</th>
                </tr>
              </thead>
              <tbody>
                {data.porPlazo.map((t) => (
                  <tr key={t.id} className="border-t border-slate-50">
                    <td className="py-2 px-3 font-medium text-slate-700">{t.label}</td>
                    <td className="py-2 px-3 text-right text-slate-600">{t.clientes}</td>
                    <td className="py-2 px-3 text-right text-slate-800">{usd(t.saldo)}</td>
                    <td className="py-2 px-3 text-right text-slate-600">{usd(t.ventas)}</td>
                    <td className="py-2 px-3 text-right text-slate-600">{t.plazoPromedio == null ? "—" : `${t.plazoPromedio} d`}</td>
                    <td className={`py-2 px-3 text-right ${colorDso(t.dso, t.plazoPromedio ?? 45)}`}>{t.dso == null ? "—" : `${t.dso} d`}</td>
                    <td className={`py-2 px-3 text-right ${t.atraso == null ? "text-slate-400" : t.atraso > 15 ? "text-red-600 font-bold" : t.atraso > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                      {t.atraso == null ? "—" : `${t.atraso > 0 ? "+" : ""}${t.atraso} d`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Negociaciones especiales ── */}
      <div className="border border-violet-100 bg-violet-50/40 rounded-xl p-4 space-y-3">
        <div>
          <span className="text-[10px] font-bold text-violet-600 uppercase tracking-widest block mb-1">Negociaciones especiales (fuera del DSO general)</span>
          <p className="text-[11px] text-slate-500">
            Clientes con un acuerdo de pago fuera de lo normal (plazo extendido, refinanciamiento, cuotas…). Sesgan el indicador, así que se
            miden aparte.{puedeMarcar ? " Se marcan desde la tabla de clientes de abajo, con su motivo." : ""}
          </p>
        </div>
        {esp && esp.clientes > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div><span className="text-slate-400 block">Clientes</span><span className="font-semibold text-slate-800">{esp.clientes}</span></div>
            <div><span className="text-slate-400 block">Saldo al cierre</span><span className="font-semibold text-slate-800">{usd(esp.saldo)}</span></div>
            <div><span className="text-slate-400 block">Ventas crédito del período</span><span className="font-semibold text-slate-800">{usd(esp.ventas)}</span></div>
            <div>
              <span className="text-slate-400 block">DSO especiales</span>
              <span className="font-semibold text-slate-800">{esp.dso == null ? "—" : `${esp.dso} días`}</span>
              {s.dsoConEspeciales != null && <span className="text-[10px] text-slate-400 block">Con ellas el general sería {s.dsoConEspeciales} días</span>}
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500">Ningún cliente con negociación especial en este período.</p>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
        {vigentes.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                  <th className="text-left py-1.5 px-2">Cliente</th>
                  <th className="text-left py-1.5 px-2">Sede</th>
                  <th className="text-left py-1.5 px-2">Motivo</th>
                  <th className="text-left py-1.5 px-2">Vigencia</th>
                  <th className="text-left py-1.5 px-2">Marcó</th>
                  {puedeMarcar && <th />}
                </tr>
              </thead>
              <tbody>
                {vigentes.map((m) => (
                  <tr key={m.id} className="border-t border-violet-100 align-top">
                    <td className="py-1.5 px-2 font-medium text-slate-700">{m.cliente}</td>
                    <td className="py-1.5 px-2 text-slate-600">{SEDE[m.companyId] ?? m.companyId}</td>
                    <td className="py-1.5 px-2 text-slate-600 max-w-[260px]">{m.motivo}</td>
                    <td className="py-1.5 px-2 text-slate-600 whitespace-nowrap">{dia(m.desde)} → {m.hasta ? dia(m.hasta) : "sin fin"}</td>
                    <td className="py-1.5 px-2 text-slate-500">{m.creadoPor}</td>
                    {puedeMarcar && (
                      <td className="py-1.5 px-2 text-right">
                        {quitando?.id === m.id ? (
                          <div className="flex flex-col gap-1 items-end">
                            <input
                              autoFocus
                              value={quitando.motivo}
                              onChange={(e) => setQuitando({ id: m.id, motivo: e.target.value })}
                              placeholder="Por qué se quita (mín. 10 letras)"
                              className="border border-slate-200 rounded px-2 py-1 w-56"
                            />
                            <div className="flex gap-1">
                              <button disabled={guardando} onClick={() => enviar({ accion: "quitar", id: m.id, motivo: quitando.motivo })} className="px-2 py-0.5 rounded bg-red-600 text-white disabled:opacity-50">Quitar</button>
                              <button onClick={() => setQuitando(null)} className="px-2 py-0.5 rounded border border-slate-200">Cancelar</button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => setQuitando({ id: m.id, motivo: "" })} className="text-red-600 hover:underline">Quitar</button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {quitadas.length > 0 && (
          <div>
            <button onClick={() => setVerQuitadas(!verQuitadas)} className="text-[11px] text-violet-700 hover:underline">
              {verQuitadas ? "Ocultar" : "Ver"} las quitadas o vencidas ({quitadas.length})
            </button>
            {verQuitadas && (
              <ul className="mt-1 space-y-1 text-[11px] text-slate-500">
                {quitadas.map((m) => (
                  <li key={m.id}>
                    <span className="font-medium text-slate-600">{m.cliente}</span> ({SEDE[m.companyId] ?? m.companyId}) · desde {dia(m.desde)} · {m.motivo}
                    {m.quitadoDia ? ` — quitada el ${dia(m.quitadoDia)} por ${m.quitadoPor}: ${m.motivoQuitar}` : ` — venció el ${dia(m.hasta)}`}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* ── Por cliente ── */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50/80">
              <th className="text-left py-2.5 px-3 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Cliente</th>
              <th className="text-right py-2.5 px-3 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Plazo</th>
              <th className="text-right py-2.5 px-3 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Saldo al cierre</th>
              <th className="text-right py-2.5 px-3 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Ventas crédito 90 días</th>
              <th className="text-right py-2.5 px-3 text-[9px] font-bold text-slate-400 uppercase tracking-widest">DSO</th>
              {puedeMarcar && <th />}
            </tr>
          </thead>
          <tbody>
            {data.clientes.map((c) => (
              <Fragment key={c.partnerId}>
                <tr className="border-t border-slate-50 hover:bg-blue-50/30 transition-colors">
                  <td className="py-2.5 px-3 font-medium text-slate-700 max-w-[240px]">
                    <div className="truncate" title={c.partnerName}>{c.partnerName}</div>
                    {c.especial && <span className="text-[10px] border border-violet-200 bg-violet-50 text-violet-700 rounded px-1.5">Negociación especial</span>}
                    {c.especialParcial && <span className="text-[10px] border border-violet-200 bg-violet-50 text-violet-700 rounded px-1.5">Especial en una sede</span>}
                  </td>
                  <td className="py-2.5 px-3 text-right text-slate-500">{c.plazoDias == null ? "—" : `${c.plazoDias} d`}</td>
                  <td className="py-2.5 px-3 text-right font-medium text-slate-800">{usd(c.saldo)}</td>
                  <td className="py-2.5 px-3 text-right text-slate-600">{usd(c.ventasNetas)}</td>
                  <td className="py-2.5 px-3 text-right">
                    {/* Contra su propio plazo cuando se sabe: 45 días es bueno a 45 y malo a 15. */}
                    <span className={colorDso(c.dso, c.plazoDias ?? 45)}>
                      {c.dso == null ? "—" : c.dso.toLocaleString("es-VE", { maximumFractionDigits: 2 })}
                    </span>
                  </td>
                  {puedeMarcar && (
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      {!c.especial && (
                        <button
                          onClick={() => setForm(form?.partnerId === c.partnerId ? null : { partnerId: c.partnerId, nombre: c.partnerName, motivo: "", hasta: "" })}
                          className="text-violet-700 hover:underline"
                        >
                          Negociación especial
                        </button>
                      )}
                    </td>
                  )}
                </tr>
                {form?.partnerId === c.partnerId && (
                  <tr className="bg-violet-50/50">
                    <td colSpan={6} className="px-3 py-3">
                      <div className="flex flex-col gap-2">
                        <span className="text-[11px] text-slate-600">
                          Marcar a <strong>{c.partnerName}</strong> como negociación especial en {SEDE[companyIdMarca] ?? companyIdMarca}: sale del DSO
                          general desde hoy.
                        </span>
                        <textarea
                          autoFocus
                          value={form.motivo}
                          onChange={(e) => setForm({ ...form, motivo: e.target.value })}
                          placeholder="Motivo del acuerdo (ej. refinanciamiento a 90 días aprobado por Gerencia), mínimo 10 letras"
                          className="border border-slate-200 rounded px-2 py-1 text-xs min-h-[56px]"
                        />
                        <div className="flex flex-wrap items-center gap-2 text-[11px]">
                          <label className="text-slate-600">Vence (opcional):</label>
                          <input type="date" value={form.hasta} onChange={(e) => setForm({ ...form, hasta: e.target.value })} className="border border-slate-200 rounded px-2 py-0.5" />
                          <button
                            disabled={guardando || form.motivo.trim().length < 10}
                            onClick={() => enviar({ accion: "marcar", partnerId: c.partnerId, companyId: companyIdMarca, motivo: form.motivo, hasta: form.hasta || null })}
                            className="px-3 py-1 rounded bg-violet-600 text-white disabled:opacity-50"
                          >
                            {guardando ? "Guardando…" : "Guardar"}
                          </button>
                          <button onClick={() => setForm(null)} className="px-3 py-1 rounded border border-slate-200">Cancelar</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
