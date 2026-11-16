"use client";

import { Texto } from "@/components/manuales/VistaManual";
import type { Manual, Paso } from "@/lib/manuales/datos";
import { ArrowLeft, ArrowRight, BookOpenCheck, CheckCircle2, Circle, ExternalLink, GraduationCap, Lightbulb } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// El avance (qué pasos vio) es solo una comodidad de quien lo lee: se guarda
// en su navegador y, si no se puede, el tutorial funciona igual.
const clave = (id: number) => `tutorial-visto-${id}`;
const leerVistos = (id: number): number[] => {
  try {
    const v = JSON.parse(localStorage.getItem(clave(id)) || "[]");
    return Array.isArray(v) ? v.filter((n) => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
};
const guardarVistos = (id: number, vistos: number[]) => {
  try {
    localStorage.setItem(clave(id), JSON.stringify(vistos));
  } catch {
    /* sin almacenamiento: no se recuerda el avance */
  }
};

function ContenidoPaso({ paso, n, locale }: { paso: Paso; n: number; locale: string }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-black text-slate-900">{paso.titulo}</h2>
        {paso.enlace && (
          <a
            href={`/${locale}${paso.enlace}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 print:hidden"
          >
            Abrir esta pantalla <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
      {paso.responsable && <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{paso.responsable}</p>}
      <Texto texto={paso.descripcion} />
      {paso.imagenes.map((img) => (
        <a key={img} href={`/api/manuales/imagenes/${img}`} target="_blank" rel="noreferrer">
          <img
            src={`/api/manuales/imagenes/${img}`}
            alt={`Paso ${n}: ${paso.titulo}`}
            loading="lazy"
            className="max-h-[520px] w-auto max-w-full rounded-lg border border-slate-200"
          />
        </a>
      ))}
      {paso.nota && (
        <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <Texto texto={paso.nota} />
        </div>
      )}
    </div>
  );
}

/** Tutorial del panel de un rol: una pantalla por paso, con Anterior / Siguiente. */
export function VistaTutorial({ manual }: { manual: Manual }) {
  const { locale } = useParams<{ locale: string }>();
  const c = manual.contenido;
  const total = c.pasos.length;
  const [actual, setActual] = useState(0);
  const [vistos, setVistos] = useState<number[]>([]);
  const seccion = useRef<HTMLElement>(null);

  useEffect(() => setVistos(leerVistos(manual.id)), [manual.id]);

  const ir = (i: number) => {
    if (i < 0 || i >= total) return;
    // Pasar de un paso lo da por visto.
    const nuevos = vistos.includes(actual) ? vistos : [...vistos, actual];
    setVistos(nuevos);
    guardarVistos(manual.id, nuevos);
    setActual(i);
    // Al paso, no al tope: la bienvenida de arriba es larga.
    if (seccion.current && seccion.current.getBoundingClientRect().top < 0)
      seccion.current.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const terminar = () => {
    const todos = Array.from({ length: total }, (_, i) => i);
    setVistos(todos);
    guardarVistos(manual.id, todos);
  };
  const reiniciar = () => {
    setVistos([]);
    guardarVistos(manual.id, []);
    setActual(0);
  };

  const paso = c.pasos[actual];
  const terminado = total > 0 && vistos.length >= total;
  const avance = total ? Math.round((Math.min(vistos.length, total) / total) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Bienvenida */}
      <header className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
          <span className="inline-flex items-center gap-1 rounded-md bg-violet-100 px-2 py-0.5 text-violet-700">
            <GraduationCap className="h-3.5 w-3.5" /> Tutorial
          </span>
          {manual.area && <span>{manual.area}</span>}
          {manual.version && <span>v{manual.version}</span>}
          {!manual.publicado && <span className="rounded-md bg-amber-100 px-2 py-0.5 text-amber-700">Borrador</span>}
        </div>
        <h1 className="text-2xl font-black text-slate-900">{manual.titulo}</h1>
        <Texto texto={c.objetivo} />
        {c.alcance && (
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Antes de empezar</p>
            <Texto texto={c.alcance} />
          </div>
        )}
        {total > 0 && (
          <div className="space-y-1 print:hidden">
            <div className="flex justify-between text-xs text-slate-500">
              <span>
                {terminado ? "¡Terminaste el recorrido!" : `Llevas ${Math.min(vistos.length, total)} de ${total} pantallas`}
              </span>
              <span>{avance} %</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${avance}%` }} />
            </div>
          </div>
        )}
      </header>

      {total > 0 && (
        <div className="grid gap-6 lg:grid-cols-[260px_1fr] print:hidden">
          {/* Lista de pantallas */}
          <nav className="space-y-1 lg:sticky lg:top-24 lg:self-start">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Pantallas</p>
            <div className="flex gap-2 overflow-x-auto pb-2 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
              {c.pasos.map((p, i) => (
                <button
                  key={i}
                  onClick={() => ir(i)}
                  className={`flex w-auto shrink-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm lg:w-full ${
                    i === actual ? "bg-violet-600 font-semibold text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {vistos.includes(i) && i !== actual ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                  ) : (
                    <Circle className={`h-4 w-4 shrink-0 ${i === actual ? "text-white" : "text-slate-300"}`} />
                  )}
                  <span className="whitespace-nowrap lg:truncate lg:whitespace-normal">
                    {i + 1}. {p.titulo}
                  </span>
                </button>
              ))}
            </div>
          </nav>

          {/* Paso actual */}
          <section ref={seccion} className="min-w-0 scroll-mt-24 space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
            <p className="text-xs font-bold uppercase tracking-wide text-violet-600">
              Paso {actual + 1} de {total}
            </p>
            <ContenidoPaso paso={paso} n={actual + 1} locale={locale} />
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
              <button
                onClick={() => ir(actual - 1)}
                disabled={actual === 0}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                <ArrowLeft className="h-4 w-4" /> Anterior
              </button>
              {actual < total - 1 ? (
                <button
                  onClick={() => ir(actual + 1)}
                  className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
                >
                  Siguiente <ArrowRight className="h-4 w-4" />
                </button>
              ) : terminado ? (
                <button onClick={reiniciar} className="text-sm font-semibold text-violet-700 hover:underline">
                  Empezar de nuevo
                </button>
              ) : (
                <button
                  onClick={terminar}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  <BookOpenCheck className="h-4 w-4" /> Terminar
                </button>
              )}
            </div>
          </section>
        </div>
      )}

      {/* Impreso: todas las pantallas seguidas */}
      <div className="hidden space-y-8 print:block">
        {c.pasos.map((p, i) => (
          <section key={i} className="break-inside-avoid space-y-2">
            <p className="text-xs font-bold uppercase text-slate-500">Paso {i + 1}</p>
            <ContenidoPaso paso={p} n={i + 1} locale={locale} />
          </section>
        ))}
      </div>

      {c.definiciones.length > 0 && (
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          <h2 className="text-base font-bold text-slate-900">Palabras que vas a ver</h2>
          <dl className="grid gap-4 sm:grid-cols-2">
            {c.definiciones.map((d, i) => (
              <div key={i}>
                <dt className="text-sm font-semibold text-slate-800">{d.termino}</dt>
                <dd>
                  <Texto texto={d.definicion} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {c.documentos && (
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          <h2 className="text-base font-bold text-slate-900">Si algo no sale como esperas</h2>
          <Texto texto={c.documentos} />
        </section>
      )}
    </div>
  );
}
