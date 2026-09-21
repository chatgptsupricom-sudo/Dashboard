"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { FileSpreadsheet, FileText, Loader2, Plus, Trash2, Upload, X } from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth.store";
import { SUCURSALES } from "@/lib/recepcion/flujo";
import { leerExcel } from "@/lib/recepcion/leerExcel";
import {
  PageHeader,
  Card,
  SectionTitle,
  BotonPrimario,
  BotonSecundario,
  inputClases,
  labelClases,
} from "@/components/seguridad/mercancia-ui";

/**
 * Compras carga el packing list (antes lo mandaba por correo a Almacen).
 *
 * Los renglones se pueden sacar de tres lados, porque cada proveedor lo manda
 * distinto: leidos de un Excel, tomados de una orden de compra del panel
 * (cuando el packing list es un PDF) o escritos a mano. Siempre quedan en la
 * grilla para revisarlos antes de guardar. El archivo original se adjunta
 * igual, para que Almacen lo pueda abrir.
 */

type Renglon = { codigo: string; producto: string; cantidad_esperada: string; cajas_esperadas: string };
type Orden = { id: number; order_number: string; supplier_name: string };

const vacio = (): Renglon => ({ codigo: "", producto: "", cantidad_esperada: "", cajas_esperadas: "" });

// Un contenedor puede tener varios precintos: se escriben separados por coma
// (los precintos pueden llevar espacios, "ML 445566", asi que no se separa por
// espacio).
type ContenedorForm = { numero: string; precintos: string };
const contVacio = (): ContenedorForm => ({ numero: "", precintos: "" });
const separarPrecintos = (v: string) =>
  v.split(/[,;\n]+/).map((p) => p.trim()).filter(Boolean);

function hoyMas(dias: number) {
  const d = new Date(Date.now() + dias * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function PackingListForm({ base, id }: { base: string; id?: string }) {
  const t = useTranslations("recepcion");
  const router = useRouter();
  const { user } = useAuthStore();
  const editando = !!id;

  const [cids, setCids] = useState<number>(Number((user as any)?.cids) || 9);
  const [proveedor, setProveedor] = useState("");
  const [referencia, setReferencia] = useState("");
  const [contenedores, setContenedores] = useState<ContenedorForm[]>([contVacio()]);
  const [fecha, setFecha] = useState(hoyMas(7));
  const [ordenId, setOrdenId] = useState<number | "">("");
  const [ocRef, setOcRef] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [renglones, setRenglones] = useState<Renglon[]>([vacio()]);
  const [archivos, setArchivos] = useState<File[]>([]);
  const [existentes, setExistentes] = useState<Array<{ id: number; nombre: string | null; mime: string }>>([]);

  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [cargando, setCargando] = useState(editando);
  const inputExcel = useRef<HTMLInputElement>(null);
  const inputArchivo = useRef<HTMLInputElement>(null);

  // Edicion: se carga lo que hay.
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const res = await fetch(`/api/recepcion/${id}`);
        const j = await res.json();
        if (!res.ok) throw new Error(j.error);
        const r = j.recepcion;
        setCids(Number(r.cids));
        setProveedor(r.proveedor || "");
        setReferencia(r.referencia || "");
        setContenedores(
          (j.contenedores || []).length
            ? j.contenedores.map((c: any) => ({
                numero: c.numero || "",
                precintos: (c.precintos_esperados || []).join(", "),
              }))
            : [contVacio()],
        );
        setFecha(r.fecha_estimada ? String(r.fecha_estimada).slice(0, 10) : "");
        setOrdenId(r.purchase_order_id || "");
        setOcRef(r.oc_referencia || "");
        setObservaciones(r.observaciones || "");
        setRenglones(
          (j.items || []).map((i: any) => ({
            codigo: i.codigo || "",
            producto: i.producto,
            cantidad_esperada: String(Number(i.cantidad_esperada)),
            cajas_esperadas: i.cajas_esperadas === null ? "" : String(i.cajas_esperadas),
          })),
        );
        setExistentes((j.archivos || []).filter((a: any) => a.tipo === "packing_list"));
      } catch (e: any) {
        setError(e?.message || t("error"));
      } finally {
        setCargando(false);
      }
    })();
  }, [id, t]);

  // Ordenes de compra aprobadas de la sucursal elegida.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/recepcion/ordenes-compra?cids=${cids}`);
        setOrdenes(res.ok ? (await res.json()).ordenes || [] : []);
      } catch {
        setOrdenes([]);
      }
    })();
  }, [cids]);

  const hayRenglones = renglones.some((r) => r.producto.trim() || r.cantidad_esperada);
  const confirmarReemplazo = () => !hayRenglones || window.confirm(t("excel_reemplazo"));

  const importarExcel = async (archivo: File) => {
    setError(null);
    setAviso(null);
    if (!confirmarReemplazo()) return;
    try {
      const leidos = await leerExcel(archivo);
      if (leidos.length === 0) {
        setError(t("excel_error"));
        return;
      }
      setRenglones(
        leidos.map((l) => ({
          codigo: l.codigo,
          producto: l.producto,
          cantidad_esperada: String(l.cantidad_esperada),
          cajas_esperadas: l.cajas_esperadas === null ? "" : String(l.cajas_esperadas),
        })),
      );
      setAviso(t("excel_leido", { count: leidos.length }));
      // El Excel es tambien el packing list original: se adjunta solo.
      setArchivos((p) => (p.some((f) => f.name === archivo.name) ? p : [...p, archivo]));
    } catch {
      setError(t("excel_error"));
    }
  };

  const importarOrden = async (idOrden: number) => {
    setError(null);
    setAviso(null);
    if (!idOrden) return;
    if (!confirmarReemplazo()) {
      setOrdenId("");
      return;
    }
    const res = await fetch(`/api/recepcion/ordenes-compra?id=${idOrden}`);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(j.error || t("error"));
      return;
    }
    setOrdenId(idOrden);
    setOcRef(j.orden.order_number);
    if (!proveedor.trim()) setProveedor(j.orden.supplier_name);
    setRenglones(
      (j.lineas || []).map((l: any) => ({
        codigo: l.codigo || "",
        producto: l.producto,
        cantidad_esperada: String(Number(l.cantidad)),
        cajas_esperadas: "",
      })),
    );
  };

  const cambiar = (i: number, campo: keyof Renglon, v: string) =>
    setRenglones((p) => p.map((r, n) => (n === i ? { ...r, [campo]: v } : r)));

  const cambiarCont = (i: number, campo: keyof ContenedorForm, v: string) =>
    setContenedores((p) => p.map((c, n) => (n === i ? { ...c, [campo]: v } : c)));

  const contLimpios = contenedores.filter((c) => c.numero.trim() || c.precintos.trim());
  const numeros = contLimpios.map((c) => c.numero.trim());
  const contenedoresOk =
    contLimpios.length > 0 &&
    numeros.every(Boolean) &&
    new Set(numeros).size === numeros.length;

  const limpios = renglones.filter((r) => r.producto.trim() || r.cantidad_esperada.trim());
  const listo =
    proveedor.trim() &&
    referencia.trim() &&
    contenedoresOk &&
    limpios.length > 0 &&
    limpios.every((r) => r.producto.trim() && r.cantidad_esperada.trim() !== "" && Number(r.cantidad_esperada) >= 0);

  const guardar = async () => {
    setError(null);
    setGuardando(true);
    try {
      const res = await fetch(editando ? `/api/recepcion/${id}` : "/api/recepcion", {
        method: editando ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cids,
          proveedor,
          referencia,
          contenedores: contLimpios.map((c) => ({
            numero: c.numero.trim(),
            precintos_esperados: separarPrecintos(c.precintos),
          })),
          fecha_estimada: fecha || null,
          purchase_order_id: ordenId || null,
          oc_referencia: ocRef || null,
          observaciones,
          items: limpios.map((r) => ({
            codigo: r.codigo,
            producto: r.producto,
            cantidad_esperada: Number(r.cantidad_esperada),
            cajas_esperadas: r.cajas_esperadas === "" ? null : Number(r.cajas_esperadas),
          })),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || t("error"));
      const recepcionId = editando ? Number(id) : j.id;

      // Archivos del packing list: despues de crear, que ya hay a donde colgarlos.
      for (const f of archivos) {
        const fd = new FormData();
        fd.append("tipo", "packing_list");
        fd.append("archivo", f, f.name);
        const r = await fetch(`/api/recepcion/${recepcionId}/archivos`, { method: "POST", body: fd });
        if (!r.ok) {
          const e = await r.json().catch(() => ({}));
          throw new Error(`${f.name}: ${e.error || t("error")}`);
        }
      }
      router.push(`${base}/${recepcionId}`);
    } catch (e: any) {
      setError(e?.message || t("error"));
      setGuardando(false);
    }
  };

  const quitarExistente = async (archivoId: number) => {
    const r = await fetch(`/api/recepcion/${id}/archivos/${archivoId}`, { method: "DELETE" });
    if (r.ok) setExistentes((p) => p.filter((a) => a.id !== archivoId));
  };

  if (cargando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-300">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <PageHeader titulo={editando ? t("editar") : t("nuevo")} volverA={editando ? `${base}/${id}` : base} />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-4 pb-28">
        <Card className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClases}>{t("sucursal")} *</label>
              <select value={cids} onChange={(e) => setCids(Number(e.target.value))} className={inputClases}>
                {SUCURSALES.map((s) => (
                  <option key={s.cids} value={s.cids}>{s.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClases}>{t("fecha_estimada")}</label>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputClases} />
            </div>
            <div>
              <label className={labelClases}>{t("proveedor")} *</label>
              <input value={proveedor} onChange={(e) => setProveedor(e.target.value.slice(0, 200))} className={inputClases} />
            </div>
            <div>
              <label className={labelClases}>{t("referencia")} *</label>
              <input value={referencia} onChange={(e) => setReferencia(e.target.value.slice(0, 100))} className={inputClases} />
            </div>
          </div>
          <div>
            <label className={labelClases}>{t("observaciones")}</label>
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value.slice(0, 5000))}
              className={`${inputClases} h-auto min-h-[72px] py-2.5`}
            />
          </div>
        </Card>

        {/* Contenedores: un packing list puede venir en varios, y cada uno se
            recibe por separado en el almacen (pueden llegar en dias distintos). */}
        <Card>
          <SectionTitle>
            {t("contenedores")} ({contLimpios.length})
          </SectionTitle>
          <p className="text-xs text-slate-500 -mt-1 mb-3">{t("contenedores_ayuda")}</p>
          <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem] gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400 pb-2 border-b border-slate-100">
            <span>{t("contenedor")} *</span>
            <span>{t("precintos_esperados")}</span>
            <span />
          </div>
          <div className="divide-y divide-slate-50">
            {contenedores.map((c, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem] gap-2 py-2 items-center">
                <input
                  value={c.numero}
                  onChange={(e) => cambiarCont(i, "numero", e.target.value.toUpperCase().slice(0, 50))}
                  placeholder="MSKU1234567"
                  aria-label={t("contenedor")}
                  className={`${inputClases} h-10 font-mono text-xs`}
                />
                <input
                  value={c.precintos}
                  onChange={(e) => cambiarCont(i, "precintos", e.target.value.slice(0, 500))}
                  placeholder={t("precintos_ph")}
                  aria-label={t("precintos_esperados")}
                  className={`${inputClases} h-10`}
                />
                <button
                  type="button"
                  onClick={() =>
                    setContenedores((p) => (p.length > 1 ? p.filter((_, n) => n !== i) : [contVacio()]))
                  }
                  aria-label={t("quitar")}
                  className="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setContenedores((p) => [...p, contVacio()])}
            className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[color:var(--portal-primary,#741DFE)] hover:opacity-80"
          >
            <Plus className="w-4 h-4" />
            {t("agregar_contenedor")}
          </button>
        </Card>

        {/* Archivo del packing list */}
        <Card>
          <SectionTitle>{t("archivo_pl")}</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {existentes.map((a) => (
              <Chip key={a.id} nombre={a.nombre || `#${a.id}`} href={`/api/recepcion/${id}/archivos/${a.id}`} onQuitar={() => void quitarExistente(a.id)} />
            ))}
            {archivos.map((f) => (
              <Chip key={f.name} nombre={f.name} onQuitar={() => setArchivos((p) => p.filter((x) => x !== f))} />
            ))}
            <BotonSecundario icon={Upload} onClick={() => inputArchivo.current?.click()}>
              {t("subir_archivo")}
            </BotonSecundario>
            <input
              ref={inputArchivo}
              type="file"
              accept=".pdf,.xlsx,.xls,image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const fs = Array.from(e.target.files || []);
                setArchivos((p) => [...p, ...fs.filter((f) => !p.some((x) => x.name === f.name))]);
                e.target.value = "";
              }}
            />
          </div>
        </Card>

        {/* Renglones */}
        <Card>
          <SectionTitle>
            {t("renglones")} ({limpios.length})
          </SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
            <BotonSecundario icon={FileSpreadsheet} onClick={() => inputExcel.current?.click()}>
              {t("importar_excel")}
            </BotonSecundario>
            <input
              ref={inputExcel}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importarExcel(f);
                e.target.value = "";
              }}
            />
            <select
              value={ordenId}
              onChange={(e) => void importarOrden(Number(e.target.value))}
              className={inputClases}
              aria-label={t("importar_oc")}
            >
              <option value="">{ordenes.length ? t("elegir_oc") : t("sin_oc")}</option>
              {ordenes.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.order_number} — {o.supplier_name}
                </option>
              ))}
            </select>
          </div>
          {aviso && <p className="mb-3 text-sm text-emerald-700">{aviso}</p>}

          <div className="hidden sm:grid grid-cols-[7rem_minmax(0,1fr)_6rem_5rem_2rem] gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400 pb-2 border-b border-slate-100">
            <span>{t("codigo")}</span>
            <span>{t("producto")}</span>
            <span className="text-right">{t("cantidad")}</span>
            <span className="text-right">{t("cajas")}</span>
            <span />
          </div>
          <div className="divide-y divide-slate-50">
            {renglones.map((r, i) => (
              <div
                key={i}
                className="grid grid-cols-[minmax(0,1fr)_5rem_4rem_2rem] sm:grid-cols-[7rem_minmax(0,1fr)_6rem_5rem_2rem] gap-2 py-2 items-center"
              >
                <input
                  value={r.codigo}
                  onChange={(e) => cambiar(i, "codigo", e.target.value.slice(0, 100))}
                  placeholder={t("codigo")}
                  className={`${inputClases} h-10 font-mono text-xs col-span-4 sm:col-span-1`}
                />
                <input
                  value={r.producto}
                  onChange={(e) => cambiar(i, "producto", e.target.value.slice(0, 300))}
                  placeholder={t("producto")}
                  className={`${inputClases} h-10`}
                />
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={r.cantidad_esperada}
                  onChange={(e) => cambiar(i, "cantidad_esperada", e.target.value)}
                  placeholder={t("cantidad")}
                  className={`${inputClases} h-10 text-right tabular-nums`}
                />
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={r.cajas_esperadas}
                  onChange={(e) => cambiar(i, "cajas_esperadas", e.target.value)}
                  placeholder={t("cajas")}
                  className={`${inputClases} h-10 text-right tabular-nums`}
                />
                <button
                  type="button"
                  onClick={() => setRenglones((p) => (p.length > 1 ? p.filter((_, n) => n !== i) : [vacio()]))}
                  aria-label={t("quitar")}
                  className="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setRenglones((p) => [...p, vacio()])}
            className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[color:var(--portal-primary,#741DFE)] hover:opacity-80"
          >
            <Plus className="w-4 h-4" />
            {t("agregar_renglon")}
          </button>
        </Card>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200/70 bg-white/90 backdrop-blur">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3">
          <BotonPrimario onClick={guardar} disabled={guardando || !listo} className="w-full h-12">
            {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
            {editando ? t("guardar_cambios") : t("guardar")}
          </BotonPrimario>
        </div>
      </div>
    </div>
  );
}

function Chip({ nombre, href, onQuitar }: { nombre: string; href?: string; onQuitar: () => void }) {
  const esExcel = /\.xlsx?$/i.test(nombre);
  const Icono = esExcel ? FileSpreadsheet : FileText;
  const contenido = (
    <>
      <Icono className="w-3.5 h-3.5 shrink-0" />
      <span className="truncate max-w-[14rem]">{nombre}</span>
    </>
  );
  return (
    <span className="inline-flex items-center gap-1.5 h-11 pl-3 pr-1.5 rounded-xl bg-violet-50 text-xs font-medium text-violet-700">
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:underline">
          {contenido}
        </a>
      ) : (
        contenido
      )}
      <button type="button" onClick={onQuitar} className="p-1 rounded-full hover:bg-violet-100" aria-label="x">
        <X className="w-3.5 h-3.5" />
      </button>
    </span>
  );
}
