"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  PackagePlus,
  RefreshCw,
  Search,
  Sparkles,
  Undo2,
} from "lucide-react";
import { BotonPrimario, BotonSecundario, inputClases, labelClases } from "@/components/seguridad/mercancia-ui";
import { leerExcel } from "@/lib/recepcion/leerExcel";
import type {
  CandidatoOdoo,
  FichaPropuesta,
  PropuestaCruce,
  RenglonApartado,
  RenglonSinProducto,
} from "@/lib/recepcion/cruceIa";

/**
 * Renglones de una recepcion cerrada que no se cargaron en Odoo porque no se
 * cruzaron con ningun producto (packing list sin codigo). La IA propone el
 * producto de cada uno (de la OC o del catalogo), una persona lo confirma y
 * despues se carga lo que faltaba. Si de verdad no existe, Compras crea la
 * ficha con lo que la IA encontro en internet. Ver lib/recepcion/cruceIa.ts.
 *
 * Lo que es de otra factura del embarque (INV1062 de Caracas) se aparta: se
 * conto aca pero no se carga en esta sede. Se marca a mano o subiendo el
 * Excel del packing list, que ademas completa los codigos que faltaban.
 */

type Fila = RenglonSinProducto & Partial<Pick<PropuestaCruce, "product_id" | "confianza" | "motivo" | "candidatos">>;
type Ficha = FichaPropuesta & { item_id: number };
type Opciones = { marcas: Array<{ id: number; nombre: string }>; categorias: Array<{ id: number; nombre: string }> };

const fmt = (n: number) => n.toLocaleString("es-VE", { maximumFractionDigits: 3 });

export default function CruceOdoo({
  recepcionId,
  faltaCargar,
  puedeCrearFicha,
  onCambio,
}: {
  recepcionId: number;
  /** Ya se cargo en Odoo y quedaron renglones fuera: se ofrece cargar lo que faltaba. */
  faltaCargar: boolean;
  puedeCrearFicha: boolean;
  /** Algo cambio: la pantalla recarga la recepcion (con la respuesta, si la hay). */
  onCambio: (detalle?: any) => void;
}) {
  const t = useTranslations("recepcion.odoo.cruce");
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [elegido, setElegido] = useState<Record<number, number>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // Busqueda a mano por renglon.
  const [busca, setBusca] = useState<Record<number, string>>({});
  const [hallados, setHallados] = useState<Record<number, CandidatoOdoo[]>>({});
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [opciones, setOpciones] = useState<Opciones | null>(null);
  const [apartados, setApartados] = useState<RenglonApartado[]>([]);
  // Renglon al que se le esta escribiendo la factura para apartarlo.
  const [apartando, setApartando] = useState<{ item_id: number; factura: string } | null>(null);
  const [delExcel, setDelExcel] = useState<string[]>([]);

  const url = `/api/recepcion/${recepcionId}/cruce`;

  const aplicarEstado = useCallback((j: any) => {
    setFilas((prev) => {
      // Lo que ya propuso la IA se conserva para los que siguen sin producto.
      const antes = new Map((prev || []).map((f) => [f.item_id, f]));
      return ((j.renglones || []) as RenglonSinProducto[]).map((r) => ({ ...antes.get(r.item_id), ...r }));
    });
    setApartados(j.apartados || []);
  }, []);

  const leer = useCallback(async () => {
    try {
      const res = await fetch(url);
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || t("error"));
      aplicarEstado(j);
    } catch (e: any) {
      setError(e?.message || t("error"));
      setFilas([]);
    }
  }, [url, t, aplicarEstado]);

  useEffect(() => {
    void leer();
  }, [leer]);

  const pedir = async (cuerpo: Record<string, unknown>, que: string) => {
    setError(null);
    setAviso(null);
    setOcupado(que);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || t("error"));
      return j;
    } catch (e: any) {
      setError(e?.message || t("error"));
      return null;
    } finally {
      setOcupado(null);
    }
  };

  const proponer = async () => {
    const j = await pedir({ accion: "proponer" }, "proponer");
    if (!j) return;
    const propuestas = j.propuestas as PropuestaCruce[];
    setFilas(propuestas);
    setElegido(Object.fromEntries(propuestas.filter((p) => p.product_id).map((p) => [p.item_id, p.product_id!])));
  };

  const confirmar = async (itemId: number, productId: number) => {
    const j = await pedir({ accion: "confirmar", item_id: itemId, product_id: productId }, `confirmar-${itemId}`);
    if (!j) return;
    setAviso(t("confirmado", { producto: j.producto?.nombre || "" }));
    setFilas((prev) => (prev || []).filter((f) => f.item_id !== itemId));
    onCambio();
  };

  const buscar = async (itemId: number) => {
    const texto = (busca[itemId] || "").trim();
    if (texto.length < 3) return;
    setOcupado(`buscar-${itemId}`);
    try {
      const res = await fetch(`${url}?buscar=${encodeURIComponent(texto)}`);
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || t("error"));
      setHallados((h) => ({ ...h, [itemId]: j.productos || [] }));
    } catch (e: any) {
      setError(e?.message || t("error"));
    } finally {
      setOcupado(null);
    }
  };

  const abrirFicha = async (itemId: number) => {
    if (!opciones) {
      try {
        const res = await fetch(`${url}?opciones=1`);
        const j = await res.json().catch(() => ({}));
        if (res.ok) setOpciones({ marcas: j.marcas || [], categorias: j.categorias || [] });
      } catch {
        // Sin las listas se ve igual la propuesta; al crear pide categoria.
      }
    }
    const j = await pedir({ accion: "proponer_ficha", item_id: itemId }, `ficha-${itemId}`);
    if (j?.ficha) setFicha({ ...j.ficha, item_id: itemId });
  };

  const crearFicha = async () => {
    if (!ficha) return;
    const j = await pedir({ accion: "crear_ficha", item_id: ficha.item_id, ficha }, "crear");
    if (!j) return;
    setAviso(t("ficha_creada", { producto: j.producto?.nombre || ficha.nombre }));
    setFilas((prev) => (prev || []).filter((f) => f.item_id !== ficha.item_id));
    setFicha(null);
    onCambio();
  };

  const apartar = async (itemId: number, factura: string | null) => {
    const j = await pedir({ accion: "aparte", item_id: itemId, factura }, `aparte-${itemId}`);
    if (!j) return;
    setApartando(null);
    aplicarEstado(j);
    onCambio();
  };

  const subirExcel = async (archivo: File) => {
    setError(null);
    setAviso(null);
    setDelExcel([]);
    let leidos: Awaited<ReturnType<typeof leerExcel>>;
    try {
      leidos = await leerExcel(archivo);
    } catch {
      leidos = [];
    }
    if (!leidos.length) {
      setError(t("excel_error"));
      return;
    }
    const j = await pedir(
      {
        accion: "excel",
        renglones: leidos.map((l) => ({
          codigo: l.codigo,
          producto: l.producto,
          cantidad: l.cantidad_esperada,
          factura_aparte: l.factura_aparte,
        })),
      },
      "excel",
    );
    if (!j) return;
    aplicarEstado(j);
    setAviso(t("excel_resumen", { codigos: j.excel.codigos, apartados: j.excel.apartados }));
    setDelExcel([
      ...j.excel.sin_cruzar.map((x: string) => t("excel_sin_cruzar", { renglon: x })),
      ...j.excel.ya_en_odoo.map((x: string) => t("excel_ya_en_odoo", { renglon: x })),
    ]);
    onCambio();
  };

  const cargarFaltantes = async () => {
    const j = await pedir({ accion: "cargar_faltantes" }, "cargar");
    if (!j) return;
    onCambio(j);
    void leer();
  };

  if (filas === null) {
    return (
      <p className="flex items-center gap-2 text-xs text-slate-500">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        {t("revisando")}
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-3">
      <div className="space-y-1">
        <label
          className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 ${
            ocupado ? "opacity-40 pointer-events-none" : "cursor-pointer hover:bg-slate-50"
          }`}
        >
          {ocupado === "excel" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
          {t("excel_subir")}
          <input
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void subirExcel(f);
            }}
          />
        </label>
        <p className="text-[11px] text-slate-500">{t("excel_ayuda")}</p>
        {delExcel.length > 0 && (
          <ul className="list-disc list-inside text-[11px] text-amber-800">
            {delExcel.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        )}
      </div>

      {filas.length > 0 ? (
        <>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-amber-900">{t("titulo", { count: filas.length })}</p>
            <p className="text-xs text-amber-800">{t("explicacion")}</p>
          </div>
          {!filas.some((f) => f.candidatos) && (
            <BotonPrimario
              onClick={() => void proponer()}
              disabled={!!ocupado}
              icon={ocupado === "proponer" ? Loader2 : Sparkles}
              className="w-full"
            >
              {ocupado === "proponer" ? t("proponiendo") : t("proponer")}
            </BotonPrimario>
          )}

          <ul className="space-y-3">
            {filas.map((f) => {
              const candidatos = [...(f.candidatos || []), ...(hallados[f.item_id] || [])].filter(
                (c, i, a) => a.findIndex((x) => x.product_id === c.product_id) === i,
              );
              const pid = elegido[f.item_id];
              const elegidoProd = candidatos.find((c) => c.product_id === pid) || null;
              const cantidad = f.recibido || f.esperado;
              // En Odoo lleva serial y no se pistolearon todos: Odoo no lo recibe.
              const faltanSeriales = !!elegidoProd?.lleva_serial && f.seriales !== cantidad;
              return (
                <li key={f.item_id} className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{f.producto}</p>
                    <p className="text-[11px] text-slate-500">
                      {[f.codigo, t("cantidades", { recibido: fmt(f.recibido), esperado: fmt(f.esperado) })]
                        .filter(Boolean)
                        .join(" · ")}
                      {f.seriales > 0 && ` · ${t("seriales", { count: f.seriales })}`}
                    </p>
                  </div>

                  {candidatos.length > 0 && (
                    <div className="space-y-1">
                      <select
                        value={pid || ""}
                        onChange={(e) =>
                          setElegido((v) => ({ ...v, [f.item_id]: Number(e.target.value) || (undefined as any) }))
                        }
                        className={inputClases}
                        aria-label={t("producto_odoo")}
                      >
                        <option value="">{t("elegir")}</option>
                        {candidatos.map((c) => (
                          <option key={c.product_id} value={c.product_id}>
                            {c.codigo ? `[${c.codigo}] ` : ""}
                            {c.nombre}
                            {c.pedido !== null ? ` · ${t("en_oc", { pedido: fmt(c.pedido) })}` : ""}
                          </option>
                        ))}
                      </select>
                      {f.product_id !== undefined && (
                        <p className="text-[11px] text-slate-600">
                          {f.product_id ? (
                            <>
                              <span
                                className={`mr-1 rounded px-1.5 py-0.5 font-semibold uppercase ${
                                  f.confianza === "alta"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : f.confianza === "media"
                                      ? "bg-amber-100 text-amber-800"
                                      : "bg-red-100 text-red-700"
                                }`}
                              >
                                {t(`confianza.${f.confianza || "baja"}`)}
                              </span>
                              {f.motivo}
                            </>
                          ) : (
                            <span className="text-red-700">{f.motivo || t("ninguno")}</span>
                          )}
                        </p>
                      )}
                      {faltanSeriales && (
                        <p className="flex items-start gap-1.5 text-[11px] text-red-700">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                          {t("faltan_seriales", { seriales: f.seriales, cantidad: fmt(cantidad) })}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative flex-1 min-w-[12rem]">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <input
                        value={busca[f.item_id] || ""}
                        onChange={(e) => setBusca((b) => ({ ...b, [f.item_id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void buscar(f.item_id);
                          }
                        }}
                        placeholder={t("buscar")}
                        aria-label={t("buscar")}
                        className="w-full h-9 pl-8 pr-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-violet-100"
                      />
                    </div>
                    {ocupado === `buscar-${f.item_id}` && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
                    <button
                      type="button"
                      onClick={() => pid && void confirmar(f.item_id, pid)}
                      disabled={!pid || !!ocupado}
                      className="inline-flex items-center gap-1 h-9 px-3 rounded-lg bg-violet-600 text-white text-xs font-semibold disabled:opacity-40"
                    >
                      {ocupado === `confirmar-${f.item_id}` ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      )}
                      {t("confirmar")}
                    </button>
                    {puedeCrearFicha && (
                      <button
                        type="button"
                        onClick={() => void abrirFicha(f.item_id)}
                        disabled={!!ocupado}
                        title={t("crear_ficha_ayuda")}
                        className="inline-flex items-center gap-1 h-9 px-3 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 disabled:opacity-40"
                      >
                        {ocupado === `ficha-${f.item_id}` ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <PackagePlus className="w-3.5 h-3.5" />
                        )}
                        {ocupado === `ficha-${f.item_id}` ? t("buscando_ficha") : t("crear_ficha")}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setApartando({ item_id: f.item_id, factura: "INV" })}
                      disabled={!!ocupado}
                      className="inline-flex items-center gap-1 h-9 px-3 rounded-lg border border-amber-300 bg-white text-xs font-semibold text-amber-800 disabled:opacity-40"
                    >
                      {t("aparte_boton")}
                    </button>
                  </div>

                  {apartando?.item_id === f.item_id && (
                    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 p-2">
                      <p className="w-full text-[11px] text-amber-900">{t("aparte_pregunta")}</p>
                      <input
                        value={apartando.factura}
                        onChange={(e) => setApartando({ item_id: f.item_id, factura: e.target.value.slice(0, 50) })}
                        aria-label={t("aparte_factura")}
                        className="h-9 w-36 px-2 rounded-lg border border-slate-200 text-xs font-mono uppercase"
                      />
                      <button
                        type="button"
                        onClick={() => void apartar(f.item_id, apartando.factura)}
                        disabled={!!ocupado || !apartando.factura.trim()}
                        className="h-9 px-3 rounded-lg bg-amber-600 text-white text-xs font-semibold disabled:opacity-40"
                      >
                        {t("aparte_confirmar")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setApartando(null)}
                        className="text-xs font-semibold text-slate-500 hover:underline"
                      >
                        {t("ficha_cancelar")}
                      </button>
                    </div>
                  )}

                  {ficha?.item_id === f.item_id && (
                    <FormFicha
                      ficha={ficha}
                      opciones={opciones}
                      onChange={setFicha}
                      onCrear={() => void crearFicha()}
                      onCancelar={() => setFicha(null)}
                      creando={ocupado === "crear"}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="flex items-center gap-2 text-sm text-emerald-800">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {t("todos_cruzados")}
        </p>
      )}

      {apartados.length > 0 && (
        <div className="space-y-2">
          <div>
            <p className="text-sm font-semibold text-slate-800">{t("apartados_titulo", { count: apartados.length })}</p>
            <p className="text-[11px] text-slate-600">{t("apartados_explicacion")}</p>
          </div>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
            {apartados.map((a) => (
              <li key={a.item_id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
                <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-900">{a.factura}</span>
                <span className="min-w-0 flex-1 text-slate-800">
                  {a.codigo && <span className="font-mono text-slate-500">{a.codigo} · </span>}
                  {a.producto}
                  <span className="text-slate-500"> · {fmt(a.recibido)}</span>
                </span>
                <button
                  type="button"
                  onClick={() => void apartar(a.item_id, null)}
                  disabled={!!ocupado}
                  className="inline-flex items-center gap-1 font-semibold text-violet-700 hover:underline disabled:opacity-40"
                >
                  {ocupado === `aparte-${a.item_id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />}
                  {t("aparte_quitar")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {faltaCargar && (
        <div className="space-y-1">
          <BotonSecundario
            onClick={() => void cargarFaltantes()}
            disabled={!!ocupado}
            icon={ocupado === "cargar" ? Loader2 : RefreshCw}
            className="w-full"
          >
            {t("cargar_faltantes")}
          </BotonSecundario>
          {filas.length > 0 && <p className="text-[11px] text-slate-500">{t("cargar_faltantes_ayuda")}</p>}
        </div>
      )}

      {aviso && <p className="text-xs font-medium text-emerald-700">{aviso}</p>}
      {error && <p className="text-xs font-medium text-red-700 whitespace-pre-line">{error}</p>}
    </div>
  );
}

function FormFicha({
  ficha,
  opciones,
  onChange,
  onCrear,
  onCancelar,
  creando,
}: {
  ficha: Ficha;
  opciones: Opciones | null;
  onChange: (f: Ficha) => void;
  onCrear: () => void;
  onCancelar: () => void;
  creando: boolean;
}) {
  const t = useTranslations("recepcion.odoo.cruce");
  const set = (p: Partial<Ficha>) => onChange({ ...ficha, ...p });
  const [imagenRota, setImagenRota] = useState(false);
  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/50 p-3 space-y-3">
      <p className="text-xs text-violet-900">{t("ficha_revisa")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelClases}>{t("ficha_nombre")}</label>
          <input value={ficha.nombre} onChange={(e) => set({ nombre: e.target.value })} className={inputClases} />
        </div>
        <div>
          <label className={labelClases}>{t("ficha_codigo")}</label>
          <input value={ficha.codigo} onChange={(e) => set({ codigo: e.target.value })} className={inputClases} />
        </div>
        <div>
          <label className={labelClases}>{t("ficha_marca")}</label>
          <select
            value={ficha.marca_id || ""}
            onChange={(e) => set({ marca_id: Number(e.target.value) || null })}
            className={inputClases}
          >
            <option value="">{ficha.marca ? t("ficha_marca_no_esta", { marca: ficha.marca }) : t("ficha_sin_marca")}</option>
            {(opciones?.marcas || []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={labelClases}>{t("ficha_categoria")}</label>
          <select
            value={ficha.categoria_id || ""}
            onChange={(e) => set({ categoria_id: Number(e.target.value) || null })}
            className={inputClases}
          >
            <option value="">{t("ficha_elegir_categoria")}</option>
            {(opciones?.categorias || []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={labelClases}>{t("ficha_descripcion")}</label>
          <textarea
            value={ficha.descripcion}
            onChange={(e) => set({ descripcion: e.target.value })}
            rows={4}
            className={`${inputClases} h-auto py-2`}
          />
        </div>
        <div className="sm:col-span-2 space-y-2">
          <label className={labelClases}>{t("ficha_imagen")}</label>
          <input
            value={ficha.imagen_url || ""}
            onChange={(e) => {
              setImagenRota(false);
              set({ imagen_url: e.target.value.trim() || null });
            }}
            placeholder="https://…"
            className={inputClases}
          />
          {ficha.imagen_url &&
            (imagenRota ? (
              <p className="text-[11px] text-red-700">{t("ficha_imagen_rota")}</p>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={ficha.imagen_url}
                alt={ficha.nombre}
                onError={() => setImagenRota(true)}
                className="h-32 w-32 rounded-lg border border-slate-200 bg-white object-contain"
              />
            ))}
        </div>
        <label className="sm:col-span-2 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={ficha.lleva_serial}
            onChange={(e) => set({ lleva_serial: e.target.checked })}
            className="w-4 h-4 rounded border-slate-300"
          />
          {t("ficha_lleva_serial")}
        </label>
      </div>
      {ficha.fuentes.length > 0 && (
        <div className="text-[11px] text-slate-500">
          <p className="font-medium">{t("ficha_fuentes")}</p>
          <ul className="list-disc list-inside">
            {ficha.fuentes.map((u) => (
              <li key={u} className="truncate">
                <a href={u} target="_blank" rel="noopener noreferrer" className="text-violet-700 hover:underline">
                  {u}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <BotonPrimario
          onClick={onCrear}
          disabled={creando || !ficha.nombre.trim() || !ficha.codigo.trim() || !ficha.categoria_id}
          icon={creando ? Loader2 : PackagePlus}
        >
          {t("ficha_crear")}
        </BotonPrimario>
        <BotonSecundario onClick={onCancelar} disabled={creando}>
          {t("ficha_cancelar")}
        </BotonSecundario>
      </div>
    </div>
  );
}
