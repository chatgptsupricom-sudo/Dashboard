"use client";

import type { Manual } from "@/lib/manuales/datos";
import { Info, User } from "lucide-react";

const fmtFecha = (iso: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}-${m}-${y}`;
};

/** Texto con saltos de línea; las líneas que empiezan con "- " son viñetas. */
export function Texto({ texto }: { texto: string }) {
  if (!texto) return null;
  const bloques: { tipo: "p" | "ul"; lineas: string[] }[] = [];
  for (const linea of texto.split("\n")) {
    const tipo = /^\s*-\s+/.test(linea) ? "ul" : "p";
    const limpia = tipo === "ul" ? linea.replace(/^\s*-\s+/, "") : linea;
    const ultimo = bloques[bloques.length - 1];
    if (ultimo && ultimo.tipo === tipo) ultimo.lineas.push(limpia);
    else bloques.push({ tipo, lineas: [limpia] });
  }
  return (
    <div className="space-y-2 text-sm leading-relaxed text-slate-700">
      {bloques.map((b, i) =>
        b.tipo === "ul" ? (
          <ul key={i} className="list-disc space-y-1 pl-5">
            {b.lineas.map((l, j) => (
              <li key={j}>{l}</li>
            ))}
          </ul>
        ) : (
          <p key={i} className="whitespace-pre-line">
            {b.lineas.join("\n").trim()}
          </p>
        ),
      )}
    </div>
  );
}

function Seccion({ n, id, titulo, children }: { n: number; id: string; titulo: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 space-y-3">
      <h2 className="text-base font-bold text-slate-900">
        {n}. {titulo}
      </h2>
      {children}
    </section>
  );
}

/** El manual en formato de procedimiento, de solo lectura. */
export function VistaManual({ manual }: { manual: Manual }) {
  const c = manual.contenido;
  const secciones = [
    { id: "objetivo", titulo: "Objetivo", visible: Boolean(c.objetivo) },
    { id: "alcance", titulo: "Alcance", visible: Boolean(c.alcance) },
    { id: "responsables", titulo: "Responsables", visible: c.responsables.length > 0 },
    { id: "definiciones", titulo: "Definiciones", visible: c.definiciones.length > 0 },
    { id: "procedimiento", titulo: "Procedimiento", visible: c.pasos.length > 0 },
    { id: "documentos", titulo: "Documentos y registros", visible: Boolean(c.documentos) },
    { id: "cambios", titulo: "Control de cambios", visible: c.cambios.length > 0 },
  ].filter((s) => s.visible);
  const num = (id: string) => secciones.findIndex((s) => s.id === id) + 1;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_220px]">
      <article className="min-w-0 space-y-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        {/* Encabezado del procedimiento */}
        <header className="space-y-4 border-b border-slate-100 pb-6">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
            {manual.codigo && <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono">{manual.codigo}</span>}
            {manual.area && <span>{manual.area}</span>}
            {!manual.publicado && (
              <span className="rounded-md bg-amber-100 px-2 py-0.5 text-amber-700">Borrador</span>
            )}
          </div>
          <h1 className="text-2xl font-black text-slate-900">{manual.titulo}</h1>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-slate-500">Versión</dt>
              <dd className="font-semibold text-slate-800">{manual.version || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Última actualización</dt>
              <dd className="font-semibold text-slate-800">{fmtFecha(manual.updatedAt)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Pasos</dt>
              <dd className="font-semibold text-slate-800">{c.pasos.length}</dd>
            </div>
          </dl>
        </header>

        {c.objetivo && (
          <Seccion n={num("objetivo")} id="objetivo" titulo="Objetivo">
            <Texto texto={c.objetivo} />
          </Seccion>
        )}
        {c.alcance && (
          <Seccion n={num("alcance")} id="alcance" titulo="Alcance">
            <Texto texto={c.alcance} />
          </Seccion>
        )}
        {c.responsables.length > 0 && (
          <Seccion n={num("responsables")} id="responsables" titulo="Responsables">
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="p-3">Rol</th>
                    <th className="p-3">Responsabilidad</th>
                  </tr>
                </thead>
                <tbody>
                  {c.responsables.map((r, i) => (
                    <tr key={i} className="border-t border-slate-100 align-top">
                      <td className="p-3 font-semibold whitespace-nowrap text-slate-800">{r.rol}</td>
                      <td className="p-3">
                        <Texto texto={r.responsabilidad} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Seccion>
        )}
        {c.definiciones.length > 0 && (
          <Seccion n={num("definiciones")} id="definiciones" titulo="Definiciones">
            <dl className="space-y-3">
              {c.definiciones.map((d, i) => (
                <div key={i}>
                  <dt className="text-sm font-semibold text-slate-800">{d.termino}</dt>
                  <dd>
                    <Texto texto={d.definicion} />
                  </dd>
                </div>
              ))}
            </dl>
          </Seccion>
        )}
        {c.pasos.length > 0 && (
          <Seccion n={num("procedimiento")} id="procedimiento" titulo="Procedimiento">
            <ol className="space-y-6">
              {c.pasos.map((p, i) => (
                <li key={i} id={`paso-${i + 1}`} className="scroll-mt-24 rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-slate-900">{p.titulo}</h3>
                        {p.responsable && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                            <User className="h-3 w-3" /> {p.responsable}
                          </span>
                        )}
                      </div>
                      <Texto texto={p.descripcion} />
                      {p.imagenes.map((img) => (
                        <a key={img} href={`/api/manuales/imagenes/${img}`} target="_blank" rel="noreferrer">
                          <img
                            src={`/api/manuales/imagenes/${img}`}
                            alt={`Paso ${i + 1}: ${p.titulo}`}
                            loading="lazy"
                            className="max-h-[480px] w-auto max-w-full rounded-lg border border-slate-200"
                          />
                        </a>
                      ))}
                      {p.nota && (
                        <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                          <Texto texto={p.nota} />
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </Seccion>
        )}
        {c.documentos && (
          <Seccion n={num("documentos")} id="documentos" titulo="Documentos y registros">
            <Texto texto={c.documentos} />
          </Seccion>
        )}
        {c.cambios.length > 0 && (
          <Seccion n={num("cambios")} id="cambios" titulo="Control de cambios">
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="p-3">Versión</th>
                    <th className="p-3">Fecha</th>
                    <th className="p-3">Cambio</th>
                  </tr>
                </thead>
                <tbody>
                  {c.cambios.map((x, i) => (
                    <tr key={i} className="border-t border-slate-100 align-top">
                      <td className="p-3 font-mono">{x.version}</td>
                      <td className="p-3 whitespace-nowrap">{fmtFecha(x.fecha || null)}</td>
                      <td className="p-3">{x.descripcion}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Seccion>
        )}
      </article>

      {/* Índice */}
      <nav className="hidden lg:block print:hidden">
        <div className="sticky top-24 space-y-1 text-sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Contenido</p>
          {secciones.map((s, i) => (
            <a key={s.id} href={`#${s.id}`} className="block rounded-md px-2 py-1 text-slate-600 hover:bg-slate-100">
              {i + 1}. {s.titulo}
            </a>
          ))}
          {c.pasos.length > 0 && (
            <div className="mt-2 border-l border-slate-200 pl-2">
              {c.pasos.map((p, i) => (
                <a
                  key={i}
                  href={`#paso-${i + 1}`}
                  className="block truncate rounded-md px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-100"
                >
                  {i + 1}. {p.titulo}
                </a>
              ))}
            </div>
          )}
        </div>
      </nav>
    </div>
  );
}
