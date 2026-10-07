"use client";

import { VistaManual } from "@/components/manuales/VistaManual";
import type { Contenido, Manual, Paso } from "@/lib/manuales/datos";
import { ArrowDown, ArrowLeft, ArrowUp, Eye, FileUp, ImagePlus, Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Form = Omit<Manual, "id" | "updatedBy" | "updatedAt">;

const VACIO: Form = {
  codigo: "",
  titulo: "",
  area: "",
  version: "1.0",
  roles: [],
  publicado: false,
  contenido: {
    objetivo: "",
    alcance: "",
    responsables: [],
    definiciones: [],
    pasos: [],
    documentos: "",
    cambios: [],
  },
};

const PASO_VACIO: Paso = { titulo: "", responsable: "", descripcion: "", imagenes: [], nota: "" };

const campo = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const etiqueta = "mb-1 block text-xs font-semibold text-slate-600";

function Bloque({ titulo, ayuda, children }: { titulo: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="font-bold text-slate-900">{titulo}</h2>
        {ayuda && <p className="text-xs text-slate-500">{ayuda}</p>}
      </div>
      {children}
    </section>
  );
}

/** Mueve el elemento i una posición (dir = -1 sube, 1 baja). */
const mover = <T,>(arr: T[], i: number, dir: number) => {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const copia = [...arr];
  [copia[i], copia[j]] = [copia[j], copia[i]];
  return copia;
};

/** Crear (id = null) o editar un manual. SuperAdmin y Procesos (middleware y API). */
export function EditorManual({ id }: { id: number | null }) {
  const { locale } = useParams<{ locale: string }>();
  const router = useRouter();
  const [form, setForm] = useState<Form>(VACIO);
  const [roles, setRoles] = useState<{ rol: string; nombre: string }[]>([]);
  const [cargando, setCargando] = useState(Boolean(id));
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState<number | null>(null);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [previa, setPrevia] = useState(false);
  const importar = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/manuales")
      .then((r) => r.json())
      .then((j) => setRoles(j.roles || []))
      .catch(() => {});
    if (!id) return;
    fetch(`/api/manuales/${id}`)
      .then((r) => r.json().then((j) => (r.ok ? j : Promise.reject(new Error(j?.error || "Error")))))
      .then(({ manual }: { manual: Manual }) => {
        const { id: _, updatedBy: __, updatedAt: ___, ...resto } = manual;
        setForm(resto);
      })
      .catch((e) => setMensaje({ ok: false, texto: e.message }))
      .finally(() => setCargando(false));
  }, [id]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setC = <K extends keyof Contenido>(k: K, v: Contenido[K]) =>
    setForm((f) => ({ ...f, contenido: { ...f.contenido, [k]: v } }));
  const setPaso = (i: number, cambios: Partial<Paso>) =>
    setC(
      "pasos",
      form.contenido.pasos.map((p, j) => (j === i ? { ...p, ...cambios } : p)),
    );

  const guardar = async () => {
    setGuardando(true);
    setMensaje(null);
    try {
      const res = await fetch(id ? `/api/manuales/${id}` : "/api/manuales", {
        method: id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      if (!id) {
        router.replace(`/${locale}/manuales/${j.id}/editar`);
        return;
      }
      setMensaje({ ok: true, texto: "Guardado." });
    } catch (e: any) {
      setMensaje({ ok: false, texto: e.message });
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async () => {
    if (!id || !confirm(`¿Eliminar el manual "${form.titulo}" y sus imágenes? No se puede deshacer.`)) return;
    const res = await fetch(`/api/manuales/${id}`, { method: "DELETE" });
    if (res.ok) router.replace(`/${locale}/manuales`);
    else setMensaje({ ok: false, texto: "No se pudo eliminar." });
  };

  const subirImagen = async (i: number, archivo: File) => {
    if (!id) return;
    setSubiendo(i);
    try {
      const fd = new FormData();
      fd.set("manualId", String(id));
      fd.set("archivo", archivo);
      const res = await fetch("/api/manuales/imagenes", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      setPaso(i, { imagenes: [...form.contenido.pasos[i].imagenes, j.id] });
      setMensaje({ ok: true, texto: "Imagen subida. Guarda el manual para dejarla en el paso." });
    } catch (e: any) {
      setMensaje({ ok: false, texto: e.message });
    } finally {
      setSubiendo(null);
    }
  };

  // Importa un manual en JSON (mismo formato que guarda el panel). Conserva
  // las imágenes y los roles actuales si el archivo no trae.
  const importarJson = async (archivo: File) => {
    try {
      const j = JSON.parse(await archivo.text());
      setForm((f) => ({
        ...f,
        ...j,
        roles: Array.isArray(j.roles) && j.roles.length ? j.roles : f.roles,
        contenido: { ...VACIO.contenido, ...(j.contenido || {}) },
      }));
      setMensaje({ ok: true, texto: "Importado. Revisa y pulsa Guardar." });
    } catch {
      setMensaje({ ok: false, texto: "El archivo no es un JSON válido." });
    }
  };

  if (cargando) return <Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin text-slate-400" />;

  const c = form.contenido;

  return (
    <div className="space-y-4 p-4 sm:p-8">
      {/* Barra de acciones */}
      <div className="sticky top-0 z-20 -mx-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8">
        <Link
          href={id ? `/${locale}/manuales/${id}` : `/${locale}/manuales`}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" /> {id ? "Ver manual" : "Manuales"}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {mensaje && (
            <span className={`text-sm ${mensaje.ok ? "text-emerald-700" : "text-red-600"}`}>{mensaje.texto}</span>
          )}
          <input
            ref={importar}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importarJson(f);
              e.target.value = "";
            }}
          />
          <button onClick={() => importar.current?.click()} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <FileUp className="h-4 w-4" /> Importar JSON
          </button>
          <button onClick={() => setPrevia((v) => !v)} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            {previa ? <Pencil className="h-4 w-4" /> : <Eye className="h-4 w-4" />} {previa ? "Editar" : "Vista previa"}
          </button>
          {id && (
            <button onClick={eliminar} className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50">
              <Trash2 className="h-4 w-4" /> Eliminar
            </button>
          )}
          <button
            onClick={guardar}
            disabled={guardando || !form.titulo.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar
          </button>
        </div>
      </div>

      {previa ? (
        <VistaManual manual={{ ...form, id: id ?? 0, updatedBy: null, updatedAt: null }} />
      ) : (
        <div className="mx-auto max-w-4xl space-y-4">
          <Bloque titulo="Datos del procedimiento">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={etiqueta}>Título *</label>
                <input className={campo} value={form.titulo} onChange={(e) => set("titulo", e.target.value)} placeholder="Ej: Egreso de mercancía" />
              </div>
              <div>
                <label className={etiqueta}>Código</label>
                <input className={campo} value={form.codigo} onChange={(e) => set("codigo", e.target.value)} placeholder="Ej: PR-ALM-001" />
              </div>
              <div>
                <label className={etiqueta}>Versión</label>
                <input className={campo} value={form.version} onChange={(e) => set("version", e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className={etiqueta}>Área</label>
                <input className={campo} value={form.area} onChange={(e) => set("area", e.target.value)} placeholder="Ej: Almacén" />
              </div>
            </div>
          </Bloque>

          <Bloque titulo="Quién lo ve" ayuda="Roles que leerán el manual cuando Manuales se abra a ellos (por ahora solo entran Procesos y SuperAdmin). Además tiene que estar publicado.">
            <div className="grid gap-2 sm:grid-cols-3">
              {roles.map((r) => (
                <label key={r.rol} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.roles.includes(r.rol)}
                    onChange={(e) =>
                      set("roles", e.target.checked ? [...form.roles, r.rol] : form.roles.filter((x) => x !== r.rol))
                    }
                    className="h-4 w-4 accent-blue-600"
                  />
                  {r.nombre}
                </label>
              ))}
            </div>
            <label className="flex items-center gap-2 border-t border-slate-100 pt-3 text-sm font-semibold text-slate-800">
              <input type="checkbox" checked={form.publicado} onChange={(e) => set("publicado", e.target.checked)} className="h-4 w-4 accent-emerald-600" />
              Publicado (si no, queda como borrador)
            </label>
          </Bloque>

          <Bloque titulo="Objetivo y alcance" ayuda='Las líneas que empiezan con "- " salen como viñetas.'>
            <div>
              <label className={etiqueta}>Objetivo</label>
              <textarea className={campo} rows={3} value={c.objetivo} onChange={(e) => setC("objetivo", e.target.value)} />
            </div>
            <div>
              <label className={etiqueta}>Alcance</label>
              <textarea className={campo} rows={3} value={c.alcance} onChange={(e) => setC("alcance", e.target.value)} />
            </div>
          </Bloque>

          <Bloque titulo="Responsables">
            {c.responsables.map((r, i) => (
              <div key={i} className="flex gap-2">
                <input className={`${campo} sm:w-48`} value={r.rol} placeholder="Rol" onChange={(e) => setC("responsables", c.responsables.map((x, j) => (j === i ? { ...x, rol: e.target.value } : x)))} />
                <textarea className={campo} rows={2} value={r.responsabilidad} placeholder="Responsabilidad" onChange={(e) => setC("responsables", c.responsables.map((x, j) => (j === i ? { ...x, responsabilidad: e.target.value } : x)))} />
                <button onClick={() => setC("responsables", c.responsables.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-600" aria-label="Quitar responsable">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button onClick={() => setC("responsables", [...c.responsables, { rol: "", responsabilidad: "" }])} className="flex items-center gap-1 text-sm font-semibold text-blue-600">
              <Plus className="h-4 w-4" /> Agregar responsable
            </button>
          </Bloque>

          <Bloque titulo="Definiciones">
            {c.definiciones.map((d, i) => (
              <div key={i} className="flex gap-2">
                <input className={`${campo} sm:w-48`} value={d.termino} placeholder="Término" onChange={(e) => setC("definiciones", c.definiciones.map((x, j) => (j === i ? { ...x, termino: e.target.value } : x)))} />
                <textarea className={campo} rows={2} value={d.definicion} placeholder="Definición" onChange={(e) => setC("definiciones", c.definiciones.map((x, j) => (j === i ? { ...x, definicion: e.target.value } : x)))} />
                <button onClick={() => setC("definiciones", c.definiciones.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-600" aria-label="Quitar definición">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button onClick={() => setC("definiciones", [...c.definiciones, { termino: "", definicion: "" }])} className="flex items-center gap-1 text-sm font-semibold text-blue-600">
              <Plus className="h-4 w-4" /> Agregar definición
            </button>
          </Bloque>

          <Bloque titulo="Procedimiento" ayuda={id ? "Cada paso con quién lo hace, qué hacer y sus capturas." : "Guarda el manual una vez para poder subir capturas."}>
            {c.pasos.map((p, i) => (
              <div key={i} className="space-y-2 rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">{i + 1}</span>
                  <input className={campo} value={p.titulo} placeholder="Título del paso" onChange={(e) => setPaso(i, { titulo: e.target.value })} />
                  <button onClick={() => setC("pasos", mover(c.pasos, i, -1))} disabled={i === 0} className="text-slate-400 hover:text-slate-700 disabled:opacity-30" aria-label="Subir paso">
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button onClick={() => setC("pasos", mover(c.pasos, i, 1))} disabled={i === c.pasos.length - 1} className="text-slate-400 hover:text-slate-700 disabled:opacity-30" aria-label="Bajar paso">
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button onClick={() => confirm(`¿Quitar el paso ${i + 1}?`) && setC("pasos", c.pasos.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-600" aria-label="Quitar paso">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <input className={campo} value={p.responsable} placeholder="Responsable (ej: Almacén)" onChange={(e) => setPaso(i, { responsable: e.target.value })} />
                <textarea className={campo} rows={5} value={p.descripcion} placeholder="Qué hacer, botones y campos" onChange={(e) => setPaso(i, { descripcion: e.target.value })} />
                <textarea className={campo} rows={2} value={p.nota} placeholder="Nota o advertencia (opcional)" onChange={(e) => setPaso(i, { nota: e.target.value })} />
                <div className="flex flex-wrap items-start gap-2">
                  {p.imagenes.map((img) => (
                    <div key={img} className="relative">
                      <img src={`/api/manuales/imagenes/${img}`} alt="" className="h-24 rounded-lg border border-slate-200" />
                      <button
                        onClick={() => setPaso(i, { imagenes: p.imagenes.filter((x) => x !== img) })}
                        className="absolute -right-2 -top-2 rounded-full bg-white p-0.5 text-slate-500 shadow hover:text-red-600"
                        aria-label="Quitar imagen"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  {id && (
                    <label className="flex h-24 w-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 text-xs text-slate-500 hover:border-blue-400 hover:text-blue-600">
                      {subiendo === i ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
                      Agregar captura
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) subirImagen(i, f);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>
            ))}
            <button onClick={() => setC("pasos", [...c.pasos, { ...PASO_VACIO }])} className="flex items-center gap-1 text-sm font-semibold text-blue-600">
              <Plus className="h-4 w-4" /> Agregar paso
            </button>
          </Bloque>

          <Bloque titulo="Documentos y registros" ayuda="Formatos, reportes o pantallas donde queda constancia del proceso.">
            <textarea className={campo} rows={3} value={c.documentos} onChange={(e) => setC("documentos", e.target.value)} />
          </Bloque>

          <Bloque titulo="Control de cambios">
            {c.cambios.map((x, i) => (
              <div key={i} className="flex flex-wrap gap-2 sm:flex-nowrap">
                <input className={`${campo} sm:w-24`} value={x.version} placeholder="Versión" onChange={(e) => setC("cambios", c.cambios.map((y, j) => (j === i ? { ...y, version: e.target.value } : y)))} />
                <input type="date" className={`${campo} sm:w-44`} value={x.fecha} onChange={(e) => setC("cambios", c.cambios.map((y, j) => (j === i ? { ...y, fecha: e.target.value } : y)))} />
                <input className={campo} value={x.descripcion} placeholder="Qué cambió" onChange={(e) => setC("cambios", c.cambios.map((y, j) => (j === i ? { ...y, descripcion: e.target.value } : y)))} />
                <button onClick={() => setC("cambios", c.cambios.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-600" aria-label="Quitar cambio">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button onClick={() => setC("cambios", [...c.cambios, { version: form.version, fecha: new Date().toISOString().slice(0, 10), descripcion: "" }])} className="flex items-center gap-1 text-sm font-semibold text-blue-600">
              <Plus className="h-4 w-4" /> Agregar cambio
            </button>
          </Bloque>
        </div>
      )}
    </div>
  );
}
