"use client";

import { Input } from "@/components/ui/input";
import { fechaCorta } from "@/lib/fecha";
import { NOMBRES_SUCURSAL } from "@/lib/servicio-tecnico/sucursales";
import { AlertTriangle, CheckCircle2, FileSearch, HelpCircle, Loader2, Search, Undo2, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type FormEvent, type ReactNode } from "react";

/**
 * Buscar Factura (rol RMA): valida si un equipo se compró en la empresa.
 * Por factura (sus productos con serial y garantía), por serial (por dónde
 * pasó y el veredicto) o por los dos (además, si el serial es de esa
 * factura), en Odoo y en Smartbit. API: GET /api/rma/buscar-factura
 * (lib/rma/buscarSerial.ts, lib/rma/buscarCompras.ts y
 * lib/servicio-tecnico/factura.ts).
 */

type Veredicto = "comprado" | "devuelto" | "solo_entre_sedes" | "sin_salida" | "no_existe";
type Movimiento = {
  tipo: "salida" | "devolucion";
  fecha: string;
  sede: number | null;
  despacho: string;
  cliente: string;
  intercompania: boolean;
  facturas: { numero: string; fecha: string | null }[];
  producto?: string;
};
type ResultadoSerial = { serial: string; veredicto: Veredicto; productos: string[]; venta: Movimiento | null; movimientos: Movimiento[] };
type Garantia = { estado: string; fecha_vencimiento: string | null };
type Item = {
  id: string;
  codigo: string;
  nombre: string;
  marca: string;
  serial: string;
  cantidad: number;
  despacho: string;
  garantia: Garantia;
  ya_reportado: boolean;
  rma_case_number: string | null;
};
type Resumen = { numero: string; fecha: string | null; compania: string; compania_id: number | null };
type Factura =
  | { estado: "ok"; factura: Resumen; cliente: { nombre: string }; items: Item[] }
  | { estado: "no_encontrada" }
  | { estado: "ambiguo"; coincidencias: Resumen[] };
type FacturaSmartbit = {
  sede: number;
  fecha: string;
  numero: string;
  cliente: string;
  rif: string;
  unidades: number | null;
  devolucion: boolean;
  /** true = productos de la factura; false = lo que el cliente compró ese día. */
  porNumero: boolean;
  productos: { codigo: string; articulo: string; unidades: number; seriales: string[]; garantia: Garantia }[];
};
type Compra = {
  origen: "odoo" | "smartbit";
  fecha: string;
  sede: number | null;
  cliente: string;
  factura: string | null;
  codigo: string;
  producto: string;
  serial: string | null;
  unidades: number;
};
type Respuesta = {
  factura: Factura | null;
  facturasSmartbit: FacturaSmartbit[] | null;
  serial: ResultadoSerial | null;
  serialSmartbit: (ResultadoSerial & { garantia: Garantia | null; cargado: boolean }) | null;
  enFactura: boolean | null;
  compras: { compras: Compra[]; productosOdoo: string[] } | null;
};

const comparable = (s: string) => s.trim().toUpperCase();
const sedeDe = (id: number | null | undefined, fallback = "") => (id ? NOMBRES_SUCURSAL[id] || fallback : fallback);

const VEREDICTO: Record<Veredicto, { estilo: string; icono: ReactNode }> = {
  comprado: { estilo: "bg-emerald-50 border-emerald-200 text-emerald-900", icono: <CheckCircle2 className="w-6 h-6 text-emerald-600" /> },
  devuelto: { estilo: "bg-amber-50 border-amber-200 text-amber-900", icono: <Undo2 className="w-6 h-6 text-amber-600" /> },
  solo_entre_sedes: { estilo: "bg-amber-50 border-amber-200 text-amber-900", icono: <AlertTriangle className="w-6 h-6 text-amber-600" /> },
  sin_salida: { estilo: "bg-red-50 border-red-200 text-red-900", icono: <XCircle className="w-6 h-6 text-red-600" /> },
  no_existe: { estilo: "bg-red-50 border-red-200 text-red-900", icono: <XCircle className="w-6 h-6 text-red-600" /> },
};

const GARANTIA: Record<string, string> = {
  en_garantia: "bg-emerald-50 text-emerald-700 border-emerald-200",
  vencida: "bg-amber-50 text-amber-800 border-amber-200",
  vida_util: "bg-blue-50 text-blue-700 border-blue-200",
};

export function BuscarFactura() {
  const t = useTranslations("rma.buscar_factura");
  const [factura, setFactura] = useState("");
  const [serial, setSerial] = useState("");
  const [producto, setProducto] = useState("");
  const [cliente, setCliente] = useState("");
  const [sede, setSede] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [res, setRes] = useState<Respuesta | null>(null);

  async function buscar(sedeElegida = sede, campos = { factura, serial, producto, cliente }) {
    if (!campos.factura.trim() && !campos.serial.trim() && !campos.producto.trim() && !campos.cliente.trim()) {
      setError(t("falta_dato"));
      return;
    }
    setCargando(true);
    setError("");
    try {
      const qs = new URLSearchParams({
        factura: campos.factura.trim(),
        serial: campos.serial.trim(),
        producto: campos.producto.trim(),
        cliente: campos.cliente.trim(),
        sede: sedeElegida,
      });
      const r = await fetch(`/api/rma/buscar-factura?${qs}`);
      const json = await r.json();
      if (!r.ok || !json.success) {
        setRes(null);
        setError(json.error || t("error"));
      } else {
        setRes(json);
      }
    } catch {
      setRes(null);
      setError(t("error"));
    }
    setCargando(false);
  }

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    buscar();
  };

  const elegirSede = (id: number | null) => {
    const v = id ? String(id) : "";
    setSede(v);
    buscar(v);
  };

  // Desde una compra o un serial: abre esa factura (y conserva el serial para marcarlo).
  const abrirFactura = (numero: string, sedeId: number | null) => {
    const v = sedeId ? String(sedeId) : "";
    const campos = { factura: numero, serial, producto: "", cliente: "" };
    setFactura(numero);
    setProducto("");
    setCliente("");
    setSede(v);
    buscar(v, campos);
  };

  const s = res?.serial;
  const ss = res?.serialSmartbit;
  const enSmartbit = !!ss && ss.veredicto !== "no_existe";
  const f = res?.factura;
  const sb = res?.facturasSmartbit ?? [];
  const compras = res?.compras;
  // Serial que no está en la factura pero sí se vendió con otra: se dice cuál.
  const otraFactura = res?.enFactura === false && s?.venta?.facturas[0]?.numero;

  return (
    <div className="p-4 sm:p-8 space-y-6 bg-slate-50/30 min-h-screen">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-violet-100 rounded-xl">
          <FileSearch className="w-6 h-6 text-violet-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("titulo")}</h1>
          <p className="text-sm text-slate-500">{t("subtitulo")}</p>
        </div>
      </div>

      <form onSubmit={enviar} className="rounded-3xl bg-white p-4 sm:p-5 shadow-sm grid grid-cols-1 md:grid-cols-3 xl:grid-cols-[1fr_1fr_1fr_1fr_11rem_auto] gap-3 items-end">
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-slate-500">{t("factura")}</span>
          <Input value={factura} onChange={(e) => setFactura(e.target.value)} placeholder={t("factura_ph")} className="bg-white" />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-slate-500">{t("serial")}</span>
          <Input value={serial} onChange={(e) => setSerial(e.target.value)} placeholder={t("serial_ph")} className="bg-white font-mono" />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-slate-500">{t("producto")}</span>
          <Input value={producto} onChange={(e) => setProducto(e.target.value)} placeholder={t("producto_ph")} className="bg-white" />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-slate-500">{t("cliente")}</span>
          <Input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder={t("cliente_ph")} className="bg-white" />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-slate-500">{t("sede")}</span>
          <select
            value={sede}
            onChange={(e) => setSede(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-white px-3 text-sm"
          >
            <option value="">{t("todas")}</option>
            {Object.entries(NOMBRES_SUCURSAL).map(([id, nombre]) => (
              <option key={id} value={id}>
                {nombre}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={cargando}
          className="h-9 inline-flex items-center justify-center gap-2 rounded-md bg-violet-600 px-5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {cargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          {t("buscar")}
        </button>
      </form>
      <p className="-mt-3 px-1 text-xs text-slate-500">{t("ayuda")}</p>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {cargando && (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          {t("buscando")}
        </div>
      )}

      {/* Si el serial no está en Odoo pero sí se vendió en Smartbit, la tarjeta de Odoo no dice nada útil. */}
      {!cargando && enSmartbit && ss && <TarjetaSerial s={ss} origen="smartbit" garantia={ss.garantia} onFactura={abrirFactura} />}
      {!cargando && s && !(enSmartbit && s.veredicto === "no_existe") && (
        <TarjetaSerial
          s={s}
          origen="odoo"
          onFactura={abrirFactura}
          nota={
            !enSmartbit && (s.veredicto === "no_existe" || s.veredicto === "sin_salida")
              ? t(ss && !ss.cargado ? "nota_smartbit_sin_datos" : "nota_smartbit")
              : ""
          }
        />
      )}

      {!cargando && f && f.estado === "no_encontrada" && sb.length === 0 && (
        <div className="rounded-3xl bg-white py-10 text-center text-sm text-slate-500 shadow-sm">{t("factura_no_encontrada")}</div>
      )}

      {!cargando && f && f.estado === "ambiguo" && (
        <div className="rounded-3xl bg-white p-5 shadow-sm space-y-3">
          <p className="text-sm text-slate-600">{t("ambigua")}</p>
          <div className="flex flex-wrap gap-2">
            {f.coincidencias.map((c) => (
              <button
                key={`${c.compania_id}-${c.numero}`}
                type="button"
                onClick={() => {
                  setFactura(c.numero);
                  elegirSede(c.compania_id);
                }}
                className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm text-violet-800 hover:bg-violet-100"
              >
                {c.numero} · {sedeDe(c.compania_id, c.compania)} · {fechaCorta(c.fecha)}
              </button>
            ))}
          </div>
        </div>
      )}

      {!cargando && f && f.estado === "ok" && (
        <section className="rounded-3xl bg-white p-5 shadow-sm space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-lg font-bold text-slate-900">{f.factura.numero}</p>
              <p className="text-sm text-slate-500">
                {f.cliente.nombre} · {sedeDe(f.factura.compania_id, f.factura.compania)} · {fechaCorta(f.factura.fecha)}
              </p>
            </div>
            {res?.enFactura !== null && res?.enFactura !== undefined && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${
                  res.enFactura ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-red-50 text-red-800 border-red-200"
                }`}
              >
                {res.enFactura ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                {t(res.enFactura ? "en_factura_si" : "en_factura_no", { serial: serial.trim() })}
                {otraFactura ? ` (${otraFactura})` : ""}
              </span>
            )}
          </div>

          <p className="text-xs font-semibold text-slate-600">{t("productos_factura")}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b">
                  <th className="py-2 pr-3 font-medium">{t("producto")}</th>
                  <th className="py-2 pr-3 font-medium">{t("serial")}</th>
                  <th className="py-2 pr-3 font-medium">{t("despacho")}</th>
                  <th className="py-2 font-medium">{t("garantia")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {f.items.map((it) => {
                  const coincide = !!serial.trim() && !!it.serial && comparable(it.serial) === comparable(serial);
                  return (
                    <tr key={it.id} className={coincide ? "bg-emerald-50" : ""}>
                      <td className="py-2 pr-3">
                        <p className="font-medium text-slate-800">{it.nombre}</p>
                        <p className="text-xs text-slate-500">
                          {[it.codigo, it.marca].filter(Boolean).join(" · ")}
                          {it.cantidad > 1 ? ` · ×${it.cantidad}` : ""}
                        </p>
                        {it.ya_reportado && (
                          <p className="text-xs text-violet-700 mt-0.5">{t("ya_reportado", { caso: it.rma_case_number || "" })}</p>
                        )}
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs break-all">
                        {it.serial || <span className="font-sans text-slate-400">{t("sin_serial")}</span>}
                      </td>
                      <td className="py-2 pr-3 text-xs text-slate-600">{it.despacho || t("sin_despacho")}</td>
                      <td className="py-2">
                        <EtiquetaGarantia g={it.garantia} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {!cargando && sb.length > 0 && (
        <section className="rounded-3xl bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-800">Smartbit</span>
            <p className="text-sm text-slate-600">{t("smartbit_factura")}</p>
          </div>
          {sb.map((x) => {
            const buscado = serial.trim();
            // Con número, se sabe si el serial buscado es de esta factura.
            const tieneSerial =
              buscado && x.porNumero ? x.productos.some((p) => p.seriales.some((z) => comparable(z) === comparable(buscado))) : null;
            return (
              <div key={`${x.sede}-${x.numero}`} className="rounded-2xl border border-slate-100 p-4 space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-bold text-slate-900">
                    {x.numero}
                    {x.devolucion && <span className="ml-2 text-xs font-medium text-amber-700">{t("devolucion")}</span>}
                  </p>
                  <p className="text-sm text-slate-500">
                    {[x.cliente, x.rif, sedeDe(x.sede), fechaCorta(x.fecha)].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {tieneSerial !== null && (
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${
                      tieneSerial ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-red-50 text-red-800 border-red-200"
                    }`}
                  >
                    {tieneSerial ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                    {t(tieneSerial ? "en_factura_si" : "en_factura_no", { serial: buscado })}
                  </span>
                )}
                {x.productos.length ? (
                  <>
                    <p className="text-xs text-slate-500">{t(x.porNumero ? "smartbit_productos_factura" : "smartbit_productos")}</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-slate-500 border-b">
                            <th className="py-2 pr-3 font-medium">{t("producto")}</th>
                            <th className="py-2 pr-3 font-medium">{t("serial")}</th>
                            <th className="py-2 font-medium">{t("garantia")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {x.productos.map((p, i) => (
                            <tr key={i}>
                              <td className="py-2 pr-3">
                                <p className="font-medium text-slate-800">{p.articulo}</p>
                                <p className="text-xs text-slate-500">
                                  {p.codigo}
                                  {p.unidades !== 1 ? ` · ×${p.unidades}` : ""}
                                </p>
                              </td>
                              <td className="py-2 pr-3 font-mono text-xs">
                                {p.seriales.length ? (
                                  <ul className="space-y-0.5">
                                    {p.seriales.map((z, j) => (
                                      <li
                                        key={j}
                                        className={`break-all ${buscado && comparable(z) === comparable(buscado) ? "rounded bg-emerald-100 px-1 text-emerald-900" : ""}`}
                                      >
                                        {z}
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <span className="font-sans text-slate-400">{x.porNumero ? t("sin_serial") : "—"}</span>
                                )}
                              </td>
                              <td className="py-2">{x.devolucion ? "—" : <EtiquetaGarantia g={p.garantia} />}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-slate-500">{t("smartbit_sin_productos")}</p>
                )}
              </div>
            );
          })}
        </section>
      )}

      {!cargando && compras && (
        <section className="rounded-3xl bg-white p-5 shadow-sm space-y-3">
          <div>
            <p className="text-lg font-bold text-slate-900">{t(producto.trim() ? "compras_titulo" : "compras_titulo_cliente")}</p>
            {producto.trim() && (
              <p className="text-xs text-slate-500">
                {compras.productosOdoo.length
                  ? t("compras_productos_odoo", { productos: compras.productosOdoo.slice(0, 3).join(" / ") + (compras.productosOdoo.length > 3 ? "…" : "") })
                  : t("compras_sin_producto_odoo")}
              </p>
            )}
          </div>
          {compras.compras.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              {t(!producto.trim() ? "compras_vacio_solo_cliente" : cliente.trim() ? "compras_vacio_cliente" : "compras_vacio")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b">
                    <th className="py-2 pr-3 font-medium">{t("fecha")}</th>
                    <th className="py-2 pr-3 font-medium">{t("cliente")}</th>
                    <th className="py-2 pr-3 font-medium">{t("producto")}</th>
                    <th className="py-2 pr-3 font-medium">{t("vendido_factura")}</th>
                    <th className="py-2 pr-3 font-medium">{t("sede")}</th>
                    <th className="py-2 font-medium text-right">{t("unidades")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {compras.compras.map((c, i) => (
                    <tr key={i}>
                      <td className="py-2 pr-3 tabular-nums text-slate-600 whitespace-nowrap">{fechaCorta(c.fecha)}</td>
                      <td className="py-2 pr-3 text-slate-800">{c.cliente}</td>
                      <td className="py-2 pr-3 text-slate-700">
                        {c.producto}
                        {c.codigo && <span className="ml-1 text-xs text-slate-500">{c.codigo}</span>}
                        {c.serial && <span className="block font-mono text-xs text-slate-500">{c.serial}</span>}
                      </td>
                      <td className="py-2 pr-3 text-xs whitespace-nowrap">
                        {c.origen === "smartbit" && (
                          <span className="rounded-full bg-orange-100 px-2 py-0.5 font-semibold text-orange-800">Smartbit</span>
                        )}
                        {c.factura && (
                          <span className="ml-1">
                            <EnlaceFactura numero={c.factura} onClick={() => abrirFactura(c.factura!, c.sede)} />
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-xs text-slate-600">{sedeDe(c.sede, "—")}</td>
                      <td className="py-2 text-right tabular-nums text-slate-700">{c.unidades}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/** Veredicto de un serial en Odoo o en Smartbit (misma forma de datos). */
function TarjetaSerial({
  s,
  origen,
  nota = "",
  garantia = null,
  onFactura,
}: {
  s: ResultadoSerial;
  origen: "odoo" | "smartbit";
  nota?: string;
  garantia?: Garantia | null;
  onFactura: (numero: string, sede: number | null) => void;
}) {
  const t = useTranslations("rma.buscar_factura");
  const smartbit = origen === "smartbit";
  return (
    <section className={`rounded-3xl border p-5 space-y-4 ${VEREDICTO[s.veredicto].estilo}`}>
      <div className="flex items-start gap-3">
        {VEREDICTO[s.veredicto].icono}
        <div className="min-w-0">
          <p className="text-lg font-bold">
            {smartbit && (
              <span className="mr-2 align-middle rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-800">Smartbit</span>
            )}
            {t(`${smartbit ? "sb_" : ""}ver_${s.veredicto}`)}
          </p>
          <p className="text-sm font-mono break-all">
            {s.serial}
            {s.productos.length > 0 && <span className="font-sans"> · {s.productos.join(" / ")}</span>}
          </p>
        </div>
      </div>

      {s.venta && (
        <dl className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
          <Dato titulo={t("vendido_a")} valor={s.venta.cliente} />
          <Dato
            titulo={t("vendido_factura")}
            valor={
              s.venta.facturas.length
                ? s.venta.facturas.map((x) => (
                    <EnlaceFactura key={x.numero} numero={x.numero} onClick={() => onFactura(x.numero, s.venta?.sede ?? null)} />
                  ))
                : t("sin_factura")
            }
          />
          <Dato titulo={t("vendido_fecha")} valor={fechaCorta(s.venta.fecha)} />
          <Dato titulo={t("vendido_sede")} valor={sedeDe(s.venta.sede, "—")} />
          {smartbit ? (
            <Dato titulo={t("garantia")} valor={garantia ? <EtiquetaGarantia g={garantia} /> : "—"} />
          ) : (
            <Dato titulo={t("vendido_despacho")} valor={s.venta.despacho || "—"} />
          )}
        </dl>
      )}

      {nota && <p className="text-xs opacity-80">{nota}</p>}

      {s.movimientos.length > 0 && (
        <div className="rounded-2xl bg-white/70 p-3">
          <p className="text-xs font-semibold text-slate-600 mb-2">{t("movimientos")}</p>
          <ol className="space-y-1.5 text-xs text-slate-700">
            {s.movimientos.map((m, i) => (
              <li key={i} className="flex flex-wrap gap-x-2">
                <span className="tabular-nums text-slate-500">{fechaCorta(m.fecha)}</span>
                <span className="font-medium">
                  {m.intercompania ? t("mov_entre_sedes") : m.tipo === "salida" ? t(smartbit ? "mov_factura" : "mov_salida") : t("mov_devolucion")}
                </span>
                <span>{m.cliente}</span>
                <span className="text-slate-500">
                  {[sedeDe(m.sede), m.despacho, ...m.facturas.map((x) => x.numero), s.productos.length > 1 ? m.producto : ""]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

function EnlaceFactura({ numero, onClick }: { numero: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mr-2 text-violet-700 underline underline-offset-2 hover:text-violet-900">
      {numero}
    </button>
  );
}

function EtiquetaGarantia({ g }: { g: Garantia }) {
  const t = useTranslations("rma.buscar_factura");
  return (
    <>
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
          GARANTIA[g.estado] || "bg-slate-50 text-slate-600 border-slate-200"
        }`}
      >
        {!GARANTIA[g.estado] && <HelpCircle className="w-3 h-3" />}
        {t(`gar_${["en_garantia", "vencida", "vida_util"].includes(g.estado) ? g.estado : "indeterminada"}`)}
      </span>
      {g.fecha_vencimiento && (
        <span className="block text-[11px] text-slate-500 mt-0.5">{t("vence", { fecha: fechaCorta(g.fecha_vencimiento) })}</span>
      )}
    </>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs opacity-70">{titulo}</dt>
      <dd className="font-medium break-words">{valor}</dd>
    </div>
  );
}
