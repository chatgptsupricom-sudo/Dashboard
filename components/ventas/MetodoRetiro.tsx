"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { describirMetodo, evaluarRutaGratis, type FilaMetodo, type MetodoRetiro as Metodo } from "@/lib/ventas/metodoRetiroTipos";
import { CheckCircle2, Loader2, Lock, Package, Search, Store, Truck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

type Pedido = {
  sale_id: number;
  pedido: string;
  cliente: string;
  vendedor_uid: number | null;
  vendedor: string;
  fecha: string | null;
  total: number;
  /** Total sin IVA: decide si la ruta es gratis. */
  base: number;
  company_id: number | null;
  moneda: string;
  /** Facturado sin IVA (facturas menos notas de crédito); null = sin factura. */
  facturado: number | null;
  estado_cliente: string | null;
  ordenes: { id: number; nombre: string; estado: string }[];
  facturas: { numero: string; fecha: string | null }[];
  en_despacho: boolean;
  metodo: FilaMetodo | null;
};

type Opcion = { id: number; nombre: string };
type Borrador = { metodo: Metodo | ""; ruta_id: string; agencia: string; otra: string; nota: string };

const ICONO: Record<Metodo, any> = { sucursal: Store, ruta: Truck, encomienda: Package };
const usd = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fecha(v: string | null) {
  if (!v) return "—";
  const d = new Date(v.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-VE", { day: "2-digit", month: "short" });
}

/**
 * Sección "Método de retiro" (lib/ventas/metodoRetiro.ts): el vendedor indica
 * cómo recibe el cliente cada pedido (retiro en sucursal, ruta o encomienda).
 * El Asistente de Ventas ve los de todos los vendedores y lo carga por ellos.
 * Almacén no registra el egreso de un pedido sin método.
 */
export function MetodoRetiro() {
  const t = useTranslations("metodoRetiro");
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [rutas, setRutas] = useState<Opcion[]>([]);
  const [agencias, setAgencias] = useState<Opcion[]>([]);
  const [porVendedor, setPorVendedor] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [busqueda, setBusqueda] = useState("");
  const [soloSinMetodo, setSoloSinMetodo] = useState(true);
  const [vendedor, setVendedor] = useState("");

  const [borradores, setBorradores] = useState<Record<number, Borrador>>({});
  const [guardando, setGuardando] = useState<number | null>(null);
  const [errores, setErrores] = useState<Record<number, string>>({});
  const [guardados, setGuardados] = useState<Record<number, boolean>>({});

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/ventas/metodo-retiro");
        const j = await r.json();
        if (!j.success) throw new Error(j.error);
        setPedidos(j.pedidos || []);
        setRutas(j.rutas || []);
        setAgencias(j.agencias || []);
        setPorVendedor(!!j.puedeElegirVendedor);
      } catch (e: any) {
        setError(e?.message || t("error_cargar"));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const vendedores = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of pedidos) if (p.vendedor_uid) m.set(p.vendedor_uid, p.vendedor);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [pedidos]);

  const visibles = pedidos.filter((p) => {
    if (soloSinMetodo && p.metodo) return false;
    if (vendedor && String(p.vendedor_uid) !== vendedor) return false;
    const q = busqueda.trim().toLowerCase();
    if (q && ![p.pedido, p.cliente, ...p.ordenes.map((o) => o.nombre)].some((x) => x.toLowerCase().includes(q))) {
      return false;
    }
    return true;
  });
  const sinMetodo = pedidos.filter((p) => !p.metodo).length;

  const borrador = (p: Pedido): Borrador => {
    if (borradores[p.sale_id]) return borradores[p.sale_id];
    const m = p.metodo;
    const conocida = !!m?.agencia && agencias.some((a) => a.nombre === m.agencia);
    return {
      metodo: m?.metodo || "",
      ruta_id: m?.ruta_id ? String(m.ruta_id) : "",
      agencia: m?.agencia ? (conocida ? m.agencia : "otra") : "",
      otra: m?.agencia && !conocida ? m.agencia : "",
      nota: m?.nota || "",
    };
  };
  const cambiar = (p: Pedido, c: Partial<Borrador>) => {
    setBorradores((prev) => ({ ...prev, [p.sale_id]: { ...borrador(p), ...c } }));
    setGuardados((prev) => ({ ...prev, [p.sale_id]: false }));
  };

  const guardar = async (p: Pedido) => {
    const b = borrador(p);
    setErrores((prev) => ({ ...prev, [p.sale_id]: "" }));
    if (!b.metodo) return setErrores((prev) => ({ ...prev, [p.sale_id]: t("error_metodo") }));
    if (b.metodo === "ruta" && !b.ruta_id) return setErrores((prev) => ({ ...prev, [p.sale_id]: t("error_ruta") }));
    const agencia = b.agencia === "otra" ? b.otra.trim() : b.agencia;
    if (b.metodo === "encomienda" && !agencia) {
      return setErrores((prev) => ({ ...prev, [p.sale_id]: t("error_agencia") }));
    }
    setGuardando(p.sale_id);
    try {
      const r = await fetch("/api/ventas/metodo-retiro", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sale_id: p.sale_id,
          metodo: b.metodo,
          ruta_id: b.metodo === "ruta" ? Number(b.ruta_id) : null,
          agencia: b.metodo === "encomienda" ? agencia : null,
          nota: b.nota,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.success) throw new Error(j.error || t("error_guardar"));
      setPedidos((prev) => prev.map((x) => (x.sale_id === p.sale_id ? { ...x, metodo: j.metodo } : x)));
      setBorradores((prev) => {
        const n = { ...prev };
        delete n[p.sale_id];
        return n;
      });
      setGuardados((prev) => ({ ...prev, [p.sale_id]: true }));
    } catch (e: any) {
      setErrores((prev) => ({ ...prev, [p.sale_id]: e?.message || t("error_guardar") }));
    } finally {
      setGuardando(null);
    }
  };

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-violet-100 rounded-xl">
          <Truck className="w-6 h-6 text-violet-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("titulo")}</h1>
          <p className="text-sm text-slate-500">{t(porVendedor ? "desc_asistente" : "desc_vendedor")}</p>
        </div>
      </div>

      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder={t("buscar")} className="pl-10" />
          </div>
          {porVendedor && (
            <select
              value={vendedor}
              onChange={(e) => setVendedor(e.target.value)}
              aria-label={t("vendedor")}
              className="h-10 px-3 border border-slate-200 rounded-md text-sm bg-white"
            >
              <option value="">{t("todos_vendedores")}</option>
              {vendedores.map(([id, nombre]) => (
                <option key={id} value={String(id)}>
                  {nombre}
                </option>
              ))}
            </select>
          )}
          <label className="inline-flex items-center gap-2 text-sm text-slate-600 whitespace-nowrap">
            <input type="checkbox" checked={soloSinMetodo} onChange={(e) => setSoloSinMetodo(e.target.checked)} />
            {t("solo_sin_metodo", { n: sinMetodo })}
          </label>
        </CardContent>
      </Card>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      ) : visibles.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white py-12 text-center text-sm text-slate-500">
          {soloSinMetodo && pedidos.length ? t("todo_listo") : t("sin_pedidos")}
        </p>
      ) : (
        <div className="space-y-3">
          {visibles.map((p) => {
            const b = borrador(p);
            return (
              <Card key={p.sale_id} className={`rounded-2xl shadow-sm ${p.metodo ? "border-slate-200" : "border-amber-300"}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-slate-900">{p.pedido}</span>
                        {p.metodo ? (
                          <Badge className="bg-violet-100 text-violet-700 border-violet-200 border">{describirMetodo(p.metodo)}</Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-800 border-amber-200 border">{t("sin_metodo")}</Badge>
                        )}
                        {p.facturas.length === 0 && (
                          <Badge className="bg-slate-100 text-slate-600 border-slate-200 border">{t("sin_facturar")}</Badge>
                        )}
                      </div>
                      <p className="text-sm text-slate-700 truncate">{p.cliente}</p>
                      <p className="text-xs text-slate-400">
                        {porVendedor && p.vendedor ? `${p.vendedor} · ` : ""}
                        {fecha(p.fecha)} · {p.ordenes.map((o) => o.nombre).join(", ")}
                      </p>
                    </div>
                    <div className="text-right whitespace-nowrap">
                      <p className="text-sm font-semibold text-slate-700 tabular-nums">
                        {usd(p.total)} {p.moneda}
                      </p>
                      <p className="text-[11px] text-slate-400 tabular-nums">{t("sin_iva", { monto: usd(p.base) })}</p>
                      {p.facturado !== null && (
                        <p className="text-[11px] font-semibold text-slate-600 tabular-nums">{t("facturado", { monto: usd(p.facturado) })}</p>
                      )}
                    </div>
                  </div>

                  {p.en_despacho ? (
                    <p className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Lock className="w-3.5 h-3.5" />
                      {t("en_despacho")}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <div className="grid grid-cols-3 gap-2">
                        {(["sucursal", "ruta", "encomienda"] as Metodo[]).map((m) => {
                          const Icono = ICONO[m];
                          return (
                            <button
                              key={m}
                              type="button"
                              onClick={() => cambiar(p, { metodo: m })}
                              aria-pressed={b.metodo === m}
                              className={`h-11 px-2 rounded-xl border text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors ${
                                b.metodo === m
                                  ? "border-violet-500 bg-violet-50 text-violet-700"
                                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                              }`}
                            >
                              <Icono className="w-4 h-4" />
                              {t(`metodo_${m}`)}
                            </button>
                          );
                        })}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {b.metodo === "ruta" && (
                          <select
                            value={b.ruta_id}
                            onChange={(e) => cambiar(p, { ruta_id: e.target.value })}
                            aria-label={t("ruta")}
                            className="h-10 px-3 border border-slate-200 rounded-md text-sm bg-white"
                          >
                            <option value="">{t("elige_ruta")}</option>
                            {rutas.map((r) => (
                              <option key={r.id} value={String(r.id)}>
                                {r.nombre}
                              </option>
                            ))}
                          </select>
                        )}
                        {b.metodo === "encomienda" && (
                          <div className="flex gap-2">
                            <select
                              value={b.agencia}
                              onChange={(e) => cambiar(p, { agencia: e.target.value })}
                              aria-label={t("agencia")}
                              className="h-10 flex-1 px-3 border border-slate-200 rounded-md text-sm bg-white"
                            >
                              <option value="">{t("elige_agencia")}</option>
                              {agencias.map((a) => (
                                <option key={a.id} value={a.nombre}>
                                  {a.nombre}
                                </option>
                              ))}
                              <option value="otra">{t("otra_agencia")}</option>
                            </select>
                            {b.agencia === "otra" && (
                              <Input
                                value={b.otra}
                                onChange={(e) => cambiar(p, { otra: e.target.value.slice(0, 100) })}
                                placeholder={t("nombre_agencia")}
                                className="flex-1"
                              />
                            )}
                          </div>
                        )}
                        {b.metodo && (
                          <Input
                            value={b.nota}
                            onChange={(e) => cambiar(p, { nota: e.target.value.slice(0, 500) })}
                            placeholder={t(b.metodo === "sucursal" ? "nota_sucursal" : "nota_envio")}
                            className={b.metodo === "sucursal" ? "sm:col-span-2" : ""}
                          />
                        )}
                      </div>
                      {b.metodo === "ruta" && b.ruta_id && (() => {
                        const ruta = rutas.find((r) => String(r.id) === b.ruta_id)?.nombre;
                        // Con lo facturado si ya hay factura; si no, con el pedido.
                        const monto = p.facturado ?? p.base;
                        const ev = evaluarRutaGratis({ companyId: p.company_id, rutaNombre: ruta, monto, moneda: p.moneda, estadoCliente: p.estado_cliente });
                        if (ev.minimo === null || ev.gratis === null) return null;
                        return (
                          <div className="space-y-1.5">
                            {ev.gratis === 1 ? (
                              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                                {t("ruta_gratis", { base: usd(monto), minimo: usd(ev.minimo) })}
                              </p>
                            ) : (
                              <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                                {t("ruta_flete", { base: usd(monto), minimo: usd(ev.minimo), falta: usd(ev.minimo - monto) })}
                              </p>
                            )}
                            {ev.alerta && (
                              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{ev.alerta}</p>
                            )}
                            {p.facturado === null && <p className="text-[11px] text-slate-400">{t("se_recalcula")}</p>}
                          </div>
                        );
                      })()}
                      <div className="flex items-center justify-end gap-3">
                        {errores[p.sale_id] && <span className="text-xs text-red-600">{errores[p.sale_id]}</span>}
                        {guardados[p.sale_id] && !errores[p.sale_id] && (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {t("guardado")}
                          </span>
                        )}
                        <Button
                          size="sm"
                          onClick={() => guardar(p)}
                          disabled={guardando === p.sale_id || !b.metodo}
                          className="bg-violet-600 hover:bg-violet-700 text-white"
                        >
                          {guardando === p.sale_id && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                          {t(p.metodo ? "actualizar" : "guardar")}
                        </Button>
                      </div>
                    </div>
                  )}
                  {p.metodo?.alerta && (
                    <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">⚠ {p.metodo.alerta}</p>
                  )}
                  {p.metodo?.registrado_por && (
                    <p className="text-[11px] text-slate-400">{t("indicado_por", { quien: p.metodo.registrado_por })}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
