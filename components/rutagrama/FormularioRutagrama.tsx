"use client";

import { Pasos } from "@/components/servicio-tecnico/form-ui";
import {
  AYUDA_MEDIO,
  DIAS,
  MEDIOS,
  TURNOS,
  VEHICULOS,
  conVehiculo,
  datosVacios,
  describirTramo,
  faltantes,
  fechaLarga,
  invertirTramos,
  rutaVuelta,
  tramosVuelta,
  type DatosRutagrama,
  type Medio,
  type Punto,
  type Tramo,
} from "@/lib/rutagrama/tipos";
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  Home,
  Loader2,
  LocateFixed,
  Plus,
  Route,
  Search,
  Trash2,
  Undo2,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { CENTRO_SEDE, COLOR_IDA, COLOR_VUELTA, type ModoMapa } from "./Mapa";
import { Firma } from "./Firma";

const Mapa = dynamic(() => import("./Mapa").then((m) => m.Mapa), {
  ssr: false,
  loading: () => <div className="h-[380px] animate-pulse rounded-xl bg-black/5" />,
});

/**
 * Página pública del rutagrama (/mi-ruta/<token>, lib/rutagrama/): el nuevo
 * ingreso declara cómo va y cómo vuelve del trabajo, traza la ruta en el mapa
 * y firma. Lo que lleva escrito se guarda en el teléfono (localStorage) por si
 * se cierra la página antes de enviar.
 */

type Vista =
  | { estado: "completado"; nombre: string; enviado_at: string | null }
  | { estado: "pendiente"; sede: number; ciudad: string; datos: DatosRutagrama; trabajo: Punto | null; direccionTrabajo: string };

// El scroll no siempre es de window (depende del layout): se sube la tarjeta.
const arriba = () => requestAnimationFrame(() => document.querySelector(".pt-shell")?.scrollIntoView({ block: "start" }));

const PASOS = ["Tus datos", "Tu puesto", "Ida", "Regreso", "Mapa", "Firma"];
const CLAVE_PASO = ["datos", "puesto", "ida", "vuelta", "mapa"] as const;

const leerBorrador = (token: string): DatosRutagrama | null => {
  try {
    const t = localStorage.getItem(`rutagrama:${token}`);
    return t ? { ...datosVacios(), ...JSON.parse(t) } : null;
  } catch {
    return null;
  }
};
const guardarBorrador = (token: string, d: DatosRutagrama | null) => {
  try {
    if (d) localStorage.setItem(`rutagrama:${token}`, JSON.stringify(d));
    else localStorage.removeItem(`rutagrama:${token}`);
  } catch {
    /* sin almacenamiento: no pasa nada, solo no se recuerda */
  }
};

function AvisoError({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return (
    <p role="alert" className="pt-error mt-5">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      {texto}
    </p>
  );
}

export function FormularioRutagrama({ token }: { token: string }) {
  const [vista, setVista] = useState<Vista | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [d, setD] = useState<DatosRutagrama>(datosVacios);
  const [paso, setPaso] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [declaro, setDeclaro] = useState(false);
  const [firma, setFirma] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/rutagrama/${token}`)
      .then((r) => r.json().then((j) => (r.ok ? j : Promise.reject(new Error(j?.error || "No pudimos abrir el formulario.")))))
      .then((v: Vista) => {
        setVista(v);
        if (v.estado !== "pendiente") return;
        // Lo que ya está guardado (lo que puso RRHH o el envío anterior), y encima el borrador del teléfono.
        const base = { ...datosVacios(), ...Object.fromEntries(Object.entries(v.datos).filter(([, x]) => x !== "" && x != null)) };
        if (!base.ida?.length) base.ida = datosVacios().ida;
        const borrador = leerBorrador(token);
        const inicial: DatosRutagrama = { ...base, ...(borrador ?? {}) };
        if (v.trabajo && !inicial.mapa.trabajo) inicial.mapa = { ...inicial.mapa, trabajo: v.trabajo };
        setD(inicial);
      })
      .catch((e) => setErrorCarga(e.message));
  }, [token]);

  useEffect(() => {
    if (vista?.estado === "pendiente" && !enviado) guardarBorrador(token, d);
  }, [d, token, vista, enviado]);

  const cambiar = <K extends keyof DatosRutagrama>(k: K, v: DatosRutagrama[K]) => setD((x) => ({ ...x, [k]: v }));

  const ir = (n: number) => {
    setError(null);
    setPaso(n);
    arriba();
  };
  const siguiente = () => {
    const f = faltantes(d, CLAVE_PASO[paso - 1]);
    if (f) return setError(f);
    ir(paso + 1);
  };

  const enviar = async () => {
    if (!declaro) return setError("Marca que declaras bajo fe de juramento que los datos son ciertos.");
    if (!firma) return setError("Firma en el recuadro antes de enviar.");
    setEnviando(true);
    setError(null);
    try {
      const r = await fetch(`/api/rutagrama/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...d, declaro, firma }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "No pudimos guardar tu rutagrama. Intenta de nuevo.");
      guardarBorrador(token, null);
      setEnviado(j.enviado_at ?? new Date().toISOString());
      arriba();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  };

  if (errorCarga) return <Mensaje titulo="No pudimos abrir tu rutagrama" texto={errorCarga} />;
  if (!vista) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-7 w-7 animate-spin text-[color:var(--portal-primary)]" aria-label="Cargando" />
      </div>
    );
  }
  if (enviado || vista.estado === "completado") {
    const nombre = vista.estado === "completado" ? vista.nombre : d.nombre;
    const cuando = fechaLarga(enviado ?? (vista.estado === "completado" ? vista.enviado_at : null));
    return (
      <Mensaje
        ok
        titulo={`¡Listo, ${nombre.split(" ").slice(-2).join(" ") || "gracias"}!`}
        texto={`Recursos Humanos recibió tu rutagrama el ${cuando.dia} de ${cuando.mes} de ${cuando.anio}. Te van a pedir estampar tus huellas en la planilla impresa. Si cambias de domicilio, avísale a Recursos Humanos por escrito en un lapso de 2 días hábiles.`}
      />
    );
  }

  const trabajoFijo = Boolean(vista.trabajo);
  const hoy = fechaLarga(null);

  return (
    <div className="pt-page pt-page--brand min-h-full">
      <div className="pt-shell pt-shell--narrow">
        {paso > 1 && (
          <div className="mb-6">
            <button type="button" onClick={() => ir(paso - 1)} className="pt-back">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Atrás
            </button>
          </div>
        )}
        <div className="pt-formcard">
          <div className="pt-formcard__body">
            <div className="pt-formcard__meta">
              <span className="pt-eyebrow">Rutagrama</span>
              <span className="pt-formcard__stepno">
                Paso {paso} de {PASOS.length}
              </span>
            </div>
            <Pasos actual={paso} etiquetas={PASOS} />

            {paso === 1 && (
              <section className="mt-2">
                <h1 className="pt-h1">Tu ruta al trabajo</h1>
                <p className="pt-sub">
                  La Ley Orgánica de Prevención, Condiciones y Medio Ambiente de Trabajo (LOPCYMAT, art. 69) protege los accidentes que te
                  pasen en el camino habitual entre tu casa y el trabajo. Para eso Supricom necesita saber cómo vas y cómo vuelves. Te toma unos
                  10 minutos.
                </p>
                <div className="mt-7 space-y-5">
                  <Campo id="nombre" etiqueta="Apellidos y nombres">
                    <input id="nombre" className="pt-input" autoComplete="name" value={d.nombre} onChange={(e) => cambiar("nombre", e.target.value)} />
                  </Campo>
                  <Campo id="cedula" etiqueta="Cédula de identidad">
                    <input
                      id="cedula"
                      className="pt-input"
                      inputMode="numeric"
                      placeholder="V-12345678"
                      value={d.cedula}
                      onChange={(e) => cambiar("cedula", e.target.value)}
                    />
                  </Campo>
                  <Campo id="direccion" etiqueta="Dirección de habitación" ayuda="Sector, calle, casa o edificio, y un punto de referencia.">
                    <textarea id="direccion" rows={3} className="pt-textarea" value={d.direccion} onChange={(e) => cambiar("direccion", e.target.value)} />
                  </Campo>
                </div>
              </section>
            )}

            {paso === 2 && (
              <section className="mt-2">
                <h1 className="pt-h1">Tu puesto de trabajo</h1>
                <div className="mt-7 space-y-6">
                  <Campo id="cargo" etiqueta="Cargo que ocupas">
                    <input id="cargo" className="pt-input" value={d.cargo} onChange={(e) => cambiar("cargo", e.target.value)} />
                  </Campo>
                  <fieldset>
                    <legend className="pt-label">Días que trabajas</legend>
                    <div className="mt-2 grid grid-cols-7 gap-1.5">
                      {DIAS.map((dia) => {
                        const on = d.dias.includes(dia.id);
                        return (
                          <button
                            key={dia.id}
                            type="button"
                            aria-pressed={on}
                            title={dia.nombre}
                            onClick={() => cambiar("dias", on ? d.dias.filter((x) => x !== dia.id) : DIAS.map((x) => x.id).filter((x) => x === dia.id || d.dias.includes(x)))}
                            className={`pt-choice justify-center !px-0 font-bold ${on ? "pt-choice--on" : ""}`}
                          >
                            <span className="sr-only">{dia.nombre}</span>
                            <span aria-hidden>{dia.letra}</span>
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                  <fieldset>
                    <legend className="pt-label">Turno de trabajo</legend>
                    <div className="mt-2 space-y-2">
                      {[...TURNOS, "otro"].map((t) => {
                        const esOtro = t === "otro";
                        const on = esOtro ? !TURNOS.includes(d.turno) : d.turno === t;
                        return (
                          <label key={t} className={`pt-choice ${on ? "pt-choice--on" : ""}`}>
                            <input
                              type="radio"
                              name="turno"
                              checked={on}
                              onChange={() => cambiar("turno", esOtro ? "" : t)}
                              className="accent-[color:var(--portal-primary)]"
                            />
                            {esOtro ? "Otro horario" : t}
                          </label>
                        );
                      })}
                      {!TURNOS.includes(d.turno) && (
                        <input
                          className="pt-input"
                          placeholder="Ej.: 7:00 a. m. a 3:00 p. m."
                          value={d.turno}
                          onChange={(e) => cambiar("turno", e.target.value)}
                          aria-label="Tu horario"
                        />
                      )}
                    </div>
                  </fieldset>
                </div>
              </section>
            )}

            {paso === 3 && (
              <section className="mt-2">
                <h1 className="pt-h1">¿Cómo llegas de tu casa al trabajo?</h1>
                <p className="pt-sub">
                  Anota cada tramo en orden, desde que sales de tu casa hasta que llegas. Si caminas, tomas un autobús y luego caminas otra vez,
                  son tres tramos.
                </p>
                <EditorTramos tramos={d.ida} onChange={(t) => cambiar("ida", t)} origen="tu casa" destino="el trabajo" />
                <div className="mt-6 space-y-5">
                  <Campo id="referencias_ida" etiqueta="Puntos de referencia del camino" ayuda="Lugares conocidos por donde pasas (opcional).">
                    <input id="referencias_ida" className="pt-input" value={d.referencias_ida} onChange={(e) => cambiar("referencias_ida", e.target.value)} />
                  </Campo>
                  <Campo id="tiempo" etiqueta="¿Cuánto tardas en llegar, más o menos?">
                    <div className="flex items-center gap-3">
                      <input
                        id="tiempo"
                        type="number"
                        min={1}
                        max={600}
                        inputMode="numeric"
                        className="pt-input !w-28"
                        value={d.tiempo_min ?? ""}
                        onChange={(e) => cambiar("tiempo_min", e.target.value ? Number(e.target.value) : null)}
                      />
                      <span className="text-sm text-[color:var(--portal-muted)]">minutos</span>
                    </div>
                  </Campo>
                </div>
              </section>
            )}

            {paso === 4 && (
              <section className="mt-2">
                <h1 className="pt-h1">¿Y cómo regresas a tu casa?</h1>
                <div className="mt-6 space-y-2">
                  <label className={`pt-choice ${d.vuelta_igual ? "pt-choice--on" : ""}`}>
                    <input type="radio" name="vuelta" checked={d.vuelta_igual} onChange={() => cambiar("vuelta_igual", true)} />
                    Por el mismo camino, al revés
                  </label>
                  <label className={`pt-choice ${!d.vuelta_igual ? "pt-choice--on" : ""}`}>
                    <input
                      type="radio"
                      name="vuelta"
                      checked={!d.vuelta_igual}
                      onChange={() => setD((x) => ({ ...x, vuelta_igual: false, vuelta: x.vuelta.length ? x.vuelta : invertirTramos(x.ida) }))}
                    />
                    Por otro camino
                  </label>
                </div>
                {d.vuelta_igual ? (
                  <ol className="pt-panel mt-5 space-y-1.5 text-sm">
                    {tramosVuelta(d).map((t, i) => (
                      <li key={i}>
                        {i + 1}. {describirTramo(t)}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <>
                    <EditorTramos tramos={d.vuelta} onChange={(t) => cambiar("vuelta", t)} origen="el trabajo" destino="tu casa" />
                    <div className="mt-6">
                      <Campo id="referencias_vuelta" etiqueta="Puntos de referencia del regreso" ayuda="Opcional.">
                        <input
                          id="referencias_vuelta"
                          className="pt-input"
                          value={d.referencias_vuelta}
                          onChange={(e) => cambiar("referencias_vuelta", e.target.value)}
                        />
                      </Campo>
                    </div>
                  </>
                )}
              </section>
            )}

            {paso === 5 && (
              <PasoMapa
                d={d}
                setMapa={(m) => cambiar("mapa", m)}
                centro={d.mapa.casa ?? vista.trabajo ?? CENTRO_SEDE[vista.sede] ?? CENTRO_SEDE[9]}
                trabajoFijo={trabajoFijo}
                direccionTrabajo={vista.direccionTrabajo}
              />
            )}

            {paso === 6 && (
              <section className="mt-2">
                <h1 className="pt-h1">Revisa y firma</h1>
                <dl className="pt-panel mt-6 space-y-2 text-sm">
                  <Resumen etiqueta="Trabajador" valor={`${d.nombre} · ${d.cedula}`} />
                  <Resumen etiqueta="Vivienda" valor={d.direccion} />
                  <Resumen etiqueta="Puesto" valor={`${d.cargo} · ${d.turno} · ${DIAS.filter((x) => d.dias.includes(x.id)).map((x) => x.nombre.slice(0, 3)).join(", ")}`} />
                  <Resumen etiqueta="Ida" valor={d.ida.map(describirTramo).join(" · ")} />
                  <Resumen etiqueta="Regreso" valor={d.vuelta_igual ? "Por el mismo camino, al revés" : d.vuelta.map(describirTramo).join(" · ")} />
                  <Resumen etiqueta="Tiempo" valor={`${d.tiempo_min} minutos`} />
                  <Resumen etiqueta="Mapa" valor={`Ruta de ida con ${d.mapa.ida.length} punto${d.mapa.ida.length === 1 ? "" : "s"} marcado${d.mapa.ida.length === 1 ? "" : "s"}`} />
                </dl>
                <label className={`pt-choice mt-6 items-start ${declaro ? "pt-choice--on" : ""}`}>
                  <input type="checkbox" checked={declaro} onChange={(e) => setDeclaro(e.target.checked)} className="mt-1" />
                  <span className="text-sm">
                    Bajo fe de juramento declaro que los datos que he suministrado en este formulario son ciertos y si cambiare de domicilio me
                    comprometo a notificar por escrito a la empresa en un lapso de 2 días hábiles, eximiendo a la misma de responsabilidad alguna en
                    caso del incumplimiento de la notificación.
                  </span>
                </label>
                <p className="pt-label mt-6">Firma del trabajador</p>
                <div className="mt-2">
                  <Firma onChange={setFirma} />
                </div>
                <p className="mt-4 text-sm text-[color:var(--portal-muted)]">
                  {vista.ciudad}, {hoy.dia} de {hoy.mes} de {hoy.anio}
                </p>
              </section>
            )}

            <AvisoError texto={error} />

            <div className="mt-8">
              {paso < PASOS.length ? (
                <button type="button" onClick={siguiente} className="pt-cta">
                  Continuar
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
              ) : (
                <button type="button" onClick={enviar} className="pt-cta" disabled={enviando}>
                  {enviando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
                  Enviar mi rutagrama
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ piezas */

function Campo({ id, etiqueta, ayuda, children }: { id: string; etiqueta: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="pt-label">
        {etiqueta}
      </label>
      {children}
      {ayuda && <p className="pt-hint">{ayuda}</p>}
    </div>
  );
}

function Resumen({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[7rem_1fr]">
      <dt className="font-semibold">{etiqueta}</dt>
      <dd className="text-[color:var(--pt-ink-soft)]">{valor}</dd>
    </div>
  );
}

function Mensaje({ titulo, texto, ok = false }: { titulo: string; texto: string; ok?: boolean }) {
  return (
    <div className="pt-page pt-page--brand min-h-full">
      <div className="pt-shell pt-shell--narrow">
        <div className="pt-formcard">
          <div className="pt-formcard__body text-center">
            {ok ? (
              <CheckCircle2 className="mx-auto h-12 w-12 text-[color:var(--pt-mint)]" aria-hidden />
            ) : (
              <AlertCircle className="mx-auto h-12 w-12 text-[color:var(--portal-muted)]" aria-hidden />
            )}
            <h1 className="pt-h1 mt-4">{titulo}</h1>
            <p className="pt-sub mx-auto">{texto}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function EditorTramos({ tramos, onChange, origen, destino }: { tramos: Tramo[]; onChange: (t: Tramo[]) => void; origen: string; destino: string }) {
  const poner = (i: number, cambios: Partial<Tramo>) => onChange(tramos.map((t, j) => (j === i ? { ...t, ...cambios } : t)));
  const mover = (i: number, a: number) => {
    const x = [...tramos];
    [x[i], x[a]] = [x[a], x[i]];
    onChange(x);
  };
  return (
    <div className="mt-6 space-y-4">
      {tramos.map((t, i) => (
        <div key={i} className="pt-panel space-y-4">
          <div className="flex items-center justify-between gap-2">
            <span className="pt-panel__eyebrow">Tramo {i + 1}</span>
            <div className="flex gap-1">
              <BotonIcono titulo="Subir" onClick={() => mover(i, i - 1)} disabled={i === 0}>
                <ArrowUp className="h-4 w-4" />
              </BotonIcono>
              <BotonIcono titulo="Bajar" onClick={() => mover(i, i + 1)} disabled={i === tramos.length - 1}>
                <ArrowDown className="h-4 w-4" />
              </BotonIcono>
              <BotonIcono titulo="Quitar tramo" onClick={() => onChange(tramos.filter((_, j) => j !== i))} disabled={tramos.length === 1}>
                <Trash2 className="h-4 w-4" />
              </BotonIcono>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(Object.keys(MEDIOS) as Medio[]).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={t.medio === m}
                onClick={() => poner(i, { medio: m, ...(conVehiculo(m) ? {} : { vehiculo: undefined, maneja: undefined }) })}
                className={`pt-choice !items-start !gap-0 flex-col text-left ${t.medio === m ? "pt-choice--on" : ""}`}
              >
                <span className="text-sm font-semibold leading-tight">{MEDIOS[m]}</span>
                <span className="text-xs text-[color:var(--portal-muted)]">{AYUDA_MEDIO[m]}</span>
              </button>
            ))}
          </div>
          {conVehiculo(t.medio) && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="pt-label !mt-0" htmlFor={`veh-${origen}-${i}`}>
                  Tipo de vehículo
                </label>
                <select
                  id={`veh-${origen}-${i}`}
                  className="pt-input"
                  value={t.vehiculo ?? ""}
                  onChange={(e) => poner(i, { vehiculo: (e.target.value || undefined) as Tramo["vehiculo"] })}
                >
                  <option value="">Elegir…</option>
                  {Object.entries(VEHICULOS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <span className="pt-label !mt-0">¿Lo manejas tú?</span>
                <div className="mt-1 flex gap-2">
                  {[true, false].map((v) => (
                    <button
                      key={String(v)}
                      type="button"
                      aria-pressed={Boolean(t.maneja) === v}
                      onClick={() => poner(i, { maneja: v })}
                      className={`pt-choice flex-1 justify-center ${Boolean(t.maneja) === v ? "pt-choice--on" : ""}`}
                    >
                      {v ? "Sí" : "No"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="pt-label !mt-0" htmlFor={`desde-${origen}-${i}`}>
                Desde
              </label>
              <input
                id={`desde-${origen}-${i}`}
                className="pt-input"
                placeholder={i === 0 ? `Ej.: ${origen === "tu casa" ? "mi casa, calle 5" : "la empresa"}` : "Ej.: la parada de la avenida"}
                value={t.desde}
                onChange={(e) => poner(i, { desde: e.target.value })}
              />
            </div>
            <div>
              <label className="pt-label !mt-0" htmlFor={`hasta-${origen}-${i}`}>
                Hasta
              </label>
              <input
                id={`hasta-${origen}-${i}`}
                className="pt-input"
                placeholder={i === tramos.length - 1 ? `Ej.: ${destino}` : "Ej.: la parada de la avenida"}
                value={t.hasta}
                onChange={(e) => poner(i, { hasta: e.target.value })}
              />
            </div>
          </div>
        </div>
      ))}
      <button
        type="button"
        className="pt-back"
        disabled={tramos.length >= 12}
        onClick={() => onChange([...tramos, { medio: "caminando", desde: tramos[tramos.length - 1]?.hasta ?? "", hasta: "" }])}
      >
        <Plus className="h-4 w-4" aria-hidden />
        Agregar otro tramo
      </button>
    </div>
  );
}

function BotonIcono({ titulo, onClick, disabled, children }: { titulo: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={titulo}
      onClick={onClick}
      disabled={disabled}
      className="flex h-11 w-11 items-center justify-center rounded-lg text-[color:var(--portal-muted)] hover:bg-black/5 disabled:opacity-30"
    >
      {children}
    </button>
  );
}

type Resultado = { nombre: string; punto: Punto };

function PasoMapa({
  d,
  setMapa,
  centro,
  trabajoFijo,
  direccionTrabajo,
}: {
  d: DatosRutagrama;
  setMapa: (m: DatosRutagrama["mapa"]) => void;
  centro: Punto;
  trabajoFijo: boolean;
  direccionTrabajo: string;
}) {
  const [modo, setModo] = useState<ModoMapa>(d.mapa.casa ? "ida" : "casa");
  const [enfoque, setEnfoque] = useState<{ punto: Punto; zoom: number; n: number } | null>(null);
  const [q, setQ] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<Resultado[] | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const vuelta = useMemo(() => rutaVuelta(d), [d]);

  // Al poner la casa (o el trabajo) se pasa sola a la ruta de ida.
  const cambiarMapa = (m: DatosRutagrama["mapa"]) => {
    if (modo === "casa" && m.casa && !d.mapa.casa) setModo(m.trabajo ? "ida" : "trabajo");
    if (modo === "trabajo" && m.trabajo && !d.mapa.trabajo) setModo("ida");
    setMapa(m);
  };

  const buscar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim().length < 3) return;
    setBuscando(true);
    setAviso(null);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=ve,pa&accept-language=es&q=${encodeURIComponent(q.trim())}`;
      const r = await fetch(url, { headers: { Accept: "application/json" } });
      const j: any[] = await r.json();
      setResultados(j.map((x) => ({ nombre: x.display_name, punto: [Number(x.lat), Number(x.lon)] as Punto })));
    } catch {
      setAviso("No pudimos buscar esa dirección. Mueve el mapa con el dedo hasta tu zona.");
    } finally {
      setBuscando(false);
    }
  };

  const miUbicacion = () => {
    if (!navigator.geolocation) return setAviso("Tu teléfono no comparte la ubicación. Busca tu zona o mueve el mapa.");
    setAviso(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const punto: Punto = [Math.round(p.coords.latitude * 1e6) / 1e6, Math.round(p.coords.longitude * 1e6) / 1e6];
        cambiarMapa({ ...d.mapa, casa: punto });
        setEnfoque({ punto, zoom: 17, n: Date.now() });
      },
      () => setAviso("No pudimos leer tu ubicación. Revisa el permiso del navegador o márcala a mano."),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const rutaActiva = modo === "vuelta" ? "vuelta" : "ida";
  const modos: { id: ModoMapa; texto: string; listo: boolean }[] = [
    { id: "casa", texto: "Tu casa", listo: Boolean(d.mapa.casa) },
    ...(trabajoFijo ? [] : [{ id: "trabajo" as ModoMapa, texto: "El trabajo", listo: Boolean(d.mapa.trabajo) }]),
    { id: "ida", texto: "Ruta de ida", listo: d.mapa.ida.length > 0 },
    ...(d.vuelta_igual ? [] : [{ id: "vuelta" as ModoMapa, texto: "Ruta de regreso", listo: d.mapa.vuelta.length > 0 }]),
  ];

  const instruccion =
    modo === "casa"
      ? "Toca el mapa donde está tu casa."
      : modo === "trabajo"
        ? "Toca el mapa donde está tu sitio de trabajo."
        : `Toca el mapa siguiendo las calles por donde ${modo === "vuelta" ? "regresas" : "vas"}, desde ${modo === "vuelta" ? "el trabajo" : "tu casa"} hasta ${modo === "vuelta" ? "tu casa" : "el trabajo"}: cada toque es un punto del camino.`;

  return (
    <section className="mt-2">
      <h1 className="pt-h1">Dibuja tu ruta en el mapa</h1>
      <p className="pt-sub">
        Es el croquis de la planilla. Marca tu casa y después toca el mapa a lo largo del camino que haces.
        {trabajoFijo && direccionTrabajo && ` El trabajo ya está marcado (${direccionTrabajo}).`}
      </p>

      <form onSubmit={buscar} className="mt-6 flex gap-2">
        <input className="pt-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busca tu urbanización o calle" aria-label="Buscar dirección" />
        <button type="submit" className="pt-choice shrink-0 justify-center" aria-label="Buscar" disabled={buscando}>
          {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </button>
      </form>
      {resultados && (
        <ul className="pt-panel mt-2 space-y-1 text-sm">
          {!resultados.length && <li>No encontramos esa dirección. Prueba con el nombre de la urbanización o mueve el mapa.</li>}
          {resultados.map((r, i) => (
            <li key={i}>
              <button
                type="button"
                className="w-full rounded-md px-2 py-2 text-left hover:bg-black/5"
                onClick={() => {
                  setEnfoque({ punto: r.punto, zoom: 16, n: Date.now() });
                  setResultados(null);
                }}
              >
                {r.nombre}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={miUbicacion} className="pt-back mt-3">
        <LocateFixed className="h-4 w-4" aria-hidden />
        Estoy en mi casa: usar mi ubicación
      </button>

      <div className="mt-5 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Qué marcar en el mapa">
        {modos.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={modo === m.id}
            onClick={() => setModo(m.id)}
            className={`pt-choice text-sm ${modo === m.id ? "pt-choice--on" : ""}`}
          >
            {m.id === "casa" ? <Home className="h-4 w-4" aria-hidden /> : <Route className="h-4 w-4" aria-hidden />}
            {m.texto}
            {m.listo && <CheckCircle2 className="h-4 w-4 text-[color:var(--pt-mint)]" aria-label="listo" />}
          </button>
        ))}
      </div>
      <p className="mt-3 text-sm font-semibold">{instruccion}</p>

      <div className="mt-3">
        <Mapa mapa={d.mapa} rutaVuelta={vuelta} modo={modo} onChange={cambiarMapa} centro={centro} enfoque={enfoque} alto={420} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-[color:var(--portal-muted)]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-1 w-5 rounded" style={{ background: COLOR_IDA }} /> Ida
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-1 w-5 rounded border-t-2 border-dashed" style={{ borderColor: COLOR_VUELTA }} /> Regreso
          {d.vuelta_igual && " (el mismo camino)"}
        </span>
      </div>
      {(modo === "ida" || modo === "vuelta") && (
        <div className="mt-3 flex flex-wrap gap-4">
          <button
            type="button"
            className="pt-back"
            disabled={!d.mapa[rutaActiva].length}
            onClick={() => setMapa({ ...d.mapa, [rutaActiva]: d.mapa[rutaActiva].slice(0, -1) })}
          >
            <Undo2 className="h-4 w-4" aria-hidden />
            Deshacer último punto
          </button>
          <button
            type="button"
            className="pt-back"
            disabled={!d.mapa[rutaActiva].length}
            onClick={() => setMapa({ ...d.mapa, [rutaActiva]: [] })}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            Borrar la ruta
          </button>
        </div>
      )}
      {aviso && <p className="pt-hint mt-3">{aviso}</p>}
    </section>
  );
}
