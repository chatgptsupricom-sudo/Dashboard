"use client";

import type { Politica } from "@/lib/politicas/datos";
import {
  pendienteDeLeer,
  puedeEditarPoliticas,
  SEDES_POLITICA,
  situacionPolitica,
  TIPOS_POLITICA,
} from "@/lib/politicas/permisos";
import { useAuthStore } from "@/lib/stores/auth.store";
import { ArrowLeft, CheckCircle2, Download, Loader2, Pencil, Printer, Users } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type Acuses = {
  leyeron: { email: string; nombre: string; fecha: string }[];
  pendientes: { email: string; nombre: string; rol: string }[];
};

const fechaCorta = (iso: string | null) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("es-VE") : "";

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);

export default function PoliticaPage() {
  const { locale, id } = useParams<{ locale: string; id: string }>();
  const { user } = useAuthStore();
  const puedeEditar = puedeEditarPoliticas(user?.role);
  const [politica, setPolitica] = useState<Politica | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [marcando, setMarcando] = useState(false);
  const [acuses, setAcuses] = useState<Acuses | null>(null);

  const cargar = () =>
    fetch(`/api/politicas/${id}`)
      .then((r) => r.json().then((j) => (r.ok ? j : Promise.reject(new Error(j?.error || "Error")))))
      .then((j) => setPolitica(j.politica))
      .catch((e) => setError(e.message));

  useEffect(() => {
    cargar();
    if (puedeEditar)
      fetch(`/api/politicas/${id}/acuses`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => j && setAcuses(j))
        .catch(() => {});
  }, [id, puedeEditar]);

  const marcarLeida = async () => {
    setMarcando(true);
    try {
      const r = await fetch(`/api/politicas/${id}/acuse`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      await cargar();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setMarcando(false);
    }
  };

  const s = politica && situacionPolitica(politica);

  return (
    <div className="space-y-4 p-4 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={`/${locale}/politicas`} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> Políticas y Acuerdos
        </Link>
        {politica && (
          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Printer className="h-4 w-4" /> Imprimir
            </button>
            {puedeEditar && (
              <Link
                href={`/${locale}/politicas/${id}/editar`}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <Pencil className="h-4 w-4" /> Editar
              </Link>
            )}
          </div>
        )}
      </div>

      {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      {!politica && !error && <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />}

      {politica && s && (
        <article className="mx-auto max-w-4xl space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8 print:border-0 print:shadow-none">
          <header className="space-y-2 border-b border-slate-100 pb-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>{TIPOS_POLITICA[politica.tipo]}</span>
              {politica.categoria && <span>· {politica.categoria}</span>}
              <span>· {SEDES_POLITICA[politica.sede]}</span>
              <span>· Versión {politica.version}</span>
              <span className={`rounded px-1.5 py-0.5 font-semibold ${s.clase}`}>{s.texto}</span>
            </div>
            <h1 className="text-2xl font-black text-slate-900">{politica.titulo}</h1>
            <dl className="grid gap-x-6 gap-y-1 text-sm text-slate-600 sm:grid-cols-2">
              {(politica.vigenciaDesde || politica.vigenciaHasta) && (
                <div>
                  <dt className="inline font-semibold">Vigencia: </dt>
                  <dd className="inline">
                    {politica.vigenciaDesde ? `desde ${fechaCorta(politica.vigenciaDesde)}` : ""}
                    {politica.vigenciaHasta ? ` hasta ${fechaCorta(politica.vigenciaHasta)}` : " sin fecha de fin"}
                  </dd>
                </div>
              )}
              {politica.responsable && (
                <div>
                  <dt className="inline font-semibold">Dudas a: </dt>
                  <dd className="inline">{politica.responsable}</dd>
                </div>
              )}
              {politica.updatedAt && (
                <div>
                  <dt className="inline font-semibold">Actualizada: </dt>
                  <dd className="inline">{fechaCorta(politica.updatedAt)}</dd>
                </div>
              )}
            </dl>
          </header>

          {politica.resumen && (
            <section className="rounded-xl bg-blue-50 p-4">
              <h2 className="mb-1 text-xs font-bold uppercase tracking-wide text-blue-700">En pocas palabras</h2>
              <p className="whitespace-pre-line text-sm text-slate-800">{politica.resumen}</p>
            </section>
          )}

          {politica.contenido && (
            <section className="whitespace-pre-line text-sm leading-relaxed text-slate-800">{politica.contenido}</section>
          )}

          {politica.adjuntos.length > 0 && (
            <section className="space-y-2 print:hidden">
              <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Documentos</h2>
              <ul className="space-y-1">
                {politica.adjuntos.map((a) => (
                  <li key={a.id}>
                    <a
                      href={`/api/politicas/adjuntos/${a.id}`}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:border-blue-300 hover:text-blue-700"
                    >
                      <Download className="h-4 w-4" /> {a.nombre} <span className="text-xs text-slate-400">{kb(a.tamano)}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {politica.requiereAcuse && s.texto === "Vigente" && (
            <footer className="border-t border-slate-100 pt-4 print:hidden">
              {pendienteDeLeer(politica) ? (
                <button
                  onClick={marcarLeida}
                  disabled={marcando}
                  className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {marcando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Leído y entendido
                </button>
              ) : (
                <p className="flex items-center gap-2 text-sm text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" /> Leíste la versión {politica.version} el {fechaCorta(politica.leidaEl)}.
                </p>
              )}
            </footer>
          )}
        </article>
      )}

      {puedeEditar && acuses && politica?.requiereAcuse && politica.estado !== "borrador" && (
        <section className="mx-auto max-w-4xl space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm print:hidden">
          <h2 className="flex items-center gap-2 font-bold text-slate-900">
            <Users className="h-4 w-4" /> Lectura de la versión {politica.version}: {acuses.leyeron.length} de{" "}
            {acuses.leyeron.length + acuses.pendientes.length}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-emerald-700">Leyeron</h3>
              <ul className="space-y-0.5 text-sm text-slate-700">
                {acuses.leyeron.map((a) => (
                  <li key={a.email}>
                    {a.nombre || a.email} <span className="text-xs text-slate-400">{fechaCorta(a.fecha)}</span>
                  </li>
                ))}
                {!acuses.leyeron.length && <li className="text-slate-400">Nadie todavía.</li>}
              </ul>
            </div>
            <div>
              <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-orange-700">Faltan</h3>
              <ul className="space-y-0.5 text-sm text-slate-700">
                {acuses.pendientes.map((a) => (
                  <li key={a.email}>
                    {a.nombre || a.email} <span className="text-xs text-slate-400">{a.rol}</span>
                  </li>
                ))}
                {!acuses.pendientes.length && <li className="text-slate-400">Nadie.</li>}
              </ul>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
