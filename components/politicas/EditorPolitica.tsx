"use client";

import type { Adjunto, Politica } from "@/lib/politicas/datos";
import { ESTADOS_POLITICA, SEDES_POLITICA, TIPOS_POLITICA } from "@/lib/politicas/permisos";
import { ArrowLeft, FileUp, Loader2, Save, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Form = Omit<Politica, "id" | "adjuntos" | "updatedBy" | "updatedAt" | "leidaEl">;

const VACIO: Form = {
  tipo: "politica",
  titulo: "",
  categoria: "",
  sede: 0,
  version: "1.0",
  estado: "borrador",
  vigenciaDesde: null,
  vigenciaHasta: null,
  responsable: "",
  resumen: "",
  contenido: "",
  requiereAcuse: true,
};

const campo = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const etiqueta = "mb-1 block text-xs font-semibold text-slate-600";

/** Crear (id = null) o editar una política. Procesos y SuperAdmin (middleware y API). */
export function EditorPolitica({ id }: { id: number | null }) {
  const { locale } = useParams<{ locale: string }>();
  const router = useRouter();
  const [form, setForm] = useState<Form>(VACIO);
  const [adjuntos, setAdjuntos] = useState<Adjunto[]>([]);
  const [versionGuardada, setVersionGuardada] = useState("");
  const [categorias, setCategorias] = useState<string[]>([]);
  const [cargando, setCargando] = useState(Boolean(id));
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const archivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Las categorías que ya existen, para no escribir la misma de dos formas.
    fetch("/api/politicas")
      .then((r) => r.json())
      .then((j) => setCategorias([...new Set<string>((j.politicas || []).map((p: Politica) => p.categoria).filter(Boolean))].sort()))
      .catch(() => {});
    if (!id) return;
    fetch(`/api/politicas/${id}`)
      .then((r) => r.json().then((j) => (r.ok ? j : Promise.reject(new Error(j?.error || "Error")))))
      .then(({ politica }: { politica: Politica }) => {
        const { id: _, adjuntos: adj, updatedBy: __, updatedAt: ___, leidaEl: ____, ...resto } = politica;
        setForm(resto);
        setAdjuntos(adj);
        setVersionGuardada(resto.version);
      })
      .catch((e) => setMensaje({ ok: false, texto: e.message }))
      .finally(() => setCargando(false));
  }, [id]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const guardar = async () => {
    setGuardando(true);
    setMensaje(null);
    try {
      const res = await fetch(id ? `/api/politicas/${id}` : "/api/politicas", {
        method: id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      if (!id) {
        router.replace(`/${locale}/politicas/${j.id}/editar`);
        return;
      }
      setVersionGuardada(form.version);
      setMensaje({ ok: true, texto: "Guardado." });
    } catch (e: any) {
      setMensaje({ ok: false, texto: e.message });
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async () => {
    if (!id || !confirm(`¿Eliminar "${form.titulo}", sus documentos y quién la leyó? No se puede deshacer.`)) return;
    const res = await fetch(`/api/politicas/${id}`, { method: "DELETE" });
    if (res.ok) router.replace(`/${locale}/politicas`);
    else setMensaje({ ok: false, texto: "No se pudo eliminar." });
  };

  const subir = async (f: File) => {
    if (!id) return;
    setSubiendo(true);
    setMensaje(null);
    try {
      const fd = new FormData();
      fd.set("politicaId", String(id));
      fd.set("archivo", f);
      const res = await fetch("/api/politicas/adjuntos", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      setAdjuntos((a) => [...a, j]);
    } catch (e: any) {
      setMensaje({ ok: false, texto: e.message });
    } finally {
      setSubiendo(false);
      if (archivo.current) archivo.current.value = "";
    }
  };

  const quitarAdjunto = async (a: Adjunto) => {
    if (!confirm(`¿Quitar "${a.nombre}"?`)) return;
    const res = await fetch(`/api/politicas/adjuntos/${a.id}`, { method: "DELETE" });
    if (res.ok) setAdjuntos((l) => l.filter((x) => x.id !== a.id));
    else setMensaje({ ok: false, texto: "No se pudo quitar el documento." });
  };

  if (cargando) return <Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin text-slate-400" />;

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={id ? `/${locale}/politicas/${id}` : `/${locale}/politicas`}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" /> {id ? "Ver política" : "Políticas y Acuerdos"}
        </Link>
        <div className="flex gap-2">
          {id && (
            <button
              onClick={eliminar}
              className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" /> Eliminar
            </button>
          )}
          <button
            onClick={guardar}
            disabled={guardando}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar
          </button>
        </div>
      </div>

      {mensaje && (
        <p className={`rounded-xl p-3 text-sm ${mensaje.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          {mensaje.texto}
        </p>
      )}

      <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={etiqueta} htmlFor="pol-titulo">Título</label>
          <input
            id="pol-titulo"
            value={form.titulo}
            onChange={(e) => set("titulo", e.target.value)}
            placeholder="Ej. Carta de autorización de envío de mercancía"
            className={campo}
          />
        </div>
        <div>
          <label className={etiqueta} htmlFor="pol-tipo">Tipo</label>
          <select id="pol-tipo" value={form.tipo} onChange={(e) => set("tipo", e.target.value as Form["tipo"])} className={campo}>
            {Object.entries(TIPOS_POLITICA).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={etiqueta} htmlFor="pol-categoria">Categoría</label>
          <input
            id="pol-categoria"
            list="pol-categorias"
            value={form.categoria}
            onChange={(e) => set("categoria", e.target.value)}
            placeholder="Ej. Despachos, Crédito y cobranza, Gastos"
            className={campo}
          />
          <datalist id="pol-categorias">
            {categorias.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
        <div>
          <label className={etiqueta} htmlFor="pol-sede">Sede</label>
          <select id="pol-sede" value={form.sede} onChange={(e) => set("sede", Number(e.target.value))} className={campo}>
            {Object.entries(SEDES_POLITICA).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={etiqueta} htmlFor="pol-responsable">Dudas a (responsable)</label>
          <input
            id="pol-responsable"
            value={form.responsable}
            onChange={(e) => set("responsable", e.target.value)}
            placeholder="Ej. Administración Valencia"
            className={campo}
          />
        </div>
        <div>
          <label className={etiqueta} htmlFor="pol-estado">Estado</label>
          <select id="pol-estado" value={form.estado} onChange={(e) => set("estado", e.target.value as Form["estado"])} className={campo}>
            {Object.entries(ESTADOS_POLITICA).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">Los borradores solo los ven Procesos y el SuperAdmin.</p>
        </div>
        <div>
          <label className={etiqueta} htmlFor="pol-version">Versión</label>
          <input id="pol-version" value={form.version} onChange={(e) => set("version", e.target.value)} className={campo} />
          {id && versionGuardada && form.version !== versionGuardada ? (
            <p className="mt-1 text-xs text-orange-700">Al guardar, todos tendrán que volver a confirmar la lectura.</p>
          ) : (
            <p className="mt-1 text-xs text-slate-500">Súbela cuando cambie algo de fondo: pide leerla de nuevo.</p>
          )}
        </div>
        <div>
          <label className={etiqueta} htmlFor="pol-desde">Vigente desde</label>
          <input
            id="pol-desde"
            type="date"
            value={form.vigenciaDesde ?? ""}
            onChange={(e) => set("vigenciaDesde", e.target.value || null)}
            className={campo}
          />
        </div>
        <div>
          <label className={etiqueta} htmlFor="pol-hasta">Vigente hasta (opcional)</label>
          <input
            id="pol-hasta"
            type="date"
            value={form.vigenciaHasta ?? ""}
            onChange={(e) => set("vigenciaHasta", e.target.value || null)}
            className={campo}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
          <input type="checkbox" checked={form.requiereAcuse} onChange={(e) => set("requiereAcuse", e.target.checked)} />
          Pedir "Leído y entendido" a los roles que la consultan
        </label>
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <label className={etiqueta} htmlFor="pol-resumen">En pocas palabras</label>
          <textarea
            id="pol-resumen"
            rows={3}
            value={form.resumen}
            onChange={(e) => set("resumen", e.target.value)}
            placeholder="Lo esencial en 2 o 3 líneas: qué dice y a quién aplica."
            className={campo}
          />
        </div>
        <div>
          <label className={etiqueta} htmlFor="pol-contenido">Texto completo</label>
          <textarea
            id="pol-contenido"
            rows={16}
            value={form.contenido}
            onChange={(e) => set("contenido", e.target.value)}
            className={`${campo} font-mono`}
          />
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="font-bold text-slate-900">Documentos</h2>
          <p className="text-xs text-slate-500">El original para descargar o imprimir: PDF, Word, Excel o imagen, hasta 10 MB.</p>
        </div>
        {adjuntos.map((a) => (
          <div key={a.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <a href={`/api/politicas/adjuntos/${a.id}`} target="_blank" rel="noopener" className="text-blue-700 hover:underline">
              {a.nombre}
            </a>
            <button onClick={() => quitarAdjunto(a)} aria-label={`Quitar ${a.nombre}`} className="text-slate-400 hover:text-red-600">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        {id ? (
          <>
            <input
              ref={archivo}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && subir(e.target.files[0])}
            />
            <button
              onClick={() => archivo.current?.click()}
              disabled={subiendo}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {subiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />} Adjuntar documento
            </button>
          </>
        ) : (
          <p className="text-sm text-slate-500">Guarda primero para poder adjuntar documentos.</p>
        )}
      </section>
    </div>
  );
}
