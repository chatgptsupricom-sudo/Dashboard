"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2, Mail, Save, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Aviso, EstadoCarga, Pestanas } from "@/components/administracion/comunes";
import { TablaReporte, type Columna } from "@/components/inteligencia-negocio/reportes/comunes";
import { InsigniaEstado, fecha, num, pedir, usd } from "@/components/rotacion-inventario/comunes";
import {
  ACCIONES_LINEA,
  ESTADOS_ABIERTOS,
  ESTADOS_SOLICITUD,
  TIPOS_APOYO,
  etiquetaEstado,
  folio,
  margenRemate,
  mensajeSugerido,
  nombreSede,
  type AccionLinea,
  type ContactoMarca,
  type EstadoSolicitud,
  type EventoSolicitud,
  type LineaSolicitud,
  type Solicitud,
  type TipoApoyo,
} from "@/lib/rotacion-inventario/tipos";

type Vista = "por_enviar" | "en_curso" | "cerradas" | "todas";
type Fila = Solicitud & { folio: string; sede: string; estadoTxt: string; tiposTxt: string };

export default function Solicitudes({ sede, sedes, puedeGestionar }: { sede: string; sedes: number[]; puedeGestionar: boolean }) {
  const [lista, setLista] = useState<Solicitud[] | null>(null);
  const [error, setError] = useState<{ mensaje: string; odooCaido: boolean } | null>(null);
  const [vista, setVista] = useState<Vista>("por_enviar");
  const [abierta, setAbierta] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const j = await pedir<{ solicitudes: Solicitud[] }>(`/api/rotacion-inventario/solicitudes?sede=${sede || "todas"}`);
      setLista(j.solicitudes);
    } catch (e: any) {
      setError({ mensaje: e.message, odooCaido: false });
    }
  }, [sede]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const filas: Fila[] = useMemo(
    () =>
      (lista ?? []).map((s) => ({
        ...s,
        folio: folio(s.id),
        sede: nombreSede(s.companyId),
        estadoTxt: etiquetaEstado(s.estado),
        tiposTxt: s.tiposApoyo.map((t) => TIPOS_APOYO.find((x) => x.value === t)?.label ?? t).join(", "),
      })),
    [lista],
  );
  const enVista = (s: Solicitud, v: Vista) =>
    v === "todas" ||
    (v === "por_enviar" && s.estado === "por_enviar") ||
    (v === "en_curso" && ESTADOS_ABIERTOS.includes(s.estado) && s.estado !== "por_enviar") ||
    (v === "cerradas" && !ESTADOS_ABIERTOS.includes(s.estado));
  const visibles = filas.filter((s) => enVista(s, vista));

  const columnas: Columna<Fila>[] = [
    {
      clave: "folio",
      titulo: "Solicitud",
      mostrar: (s) => (
        <button onClick={() => setAbierta(s.id)} className="text-blue-700 hover:underline font-medium">
          {s.folio}
        </button>
      ),
    },
    { clave: "marcaNombre", titulo: "Marca" },
    ...(sedes.length > 1 ? [{ clave: "sede", titulo: "Sede" } as Columna<Fila>] : []),
    { clave: "estadoTxt", titulo: "Estado", mostrar: (s) => <InsigniaEstado estado={s.estado} /> },
    { clave: "productos", titulo: "Productos", tipo: "numero", sumar: true },
    { clave: "unidades", titulo: "Unidades", tipo: "numero", sumar: true },
    { clave: "valorCosto", titulo: "Valor a costo", tipo: "dinero", sumar: true },
    { clave: "createdAt", titulo: "Creada", tipo: "fecha" },
    { clave: "enviadaEl", titulo: "Enviada", tipo: "fecha" },
    { clave: "respuestaEl", titulo: "Respuesta", tipo: "fecha" },
    { clave: "tiposTxt", titulo: "Apoyo" },
    { clave: "montoApoyo", titulo: "Monto apoyo", tipo: "dinero", sumar: true },
    { clave: "accionAcordada", titulo: "Acción acordada", ancho: "min-w-[200px]" },
  ];

  return (
    <div className="space-y-3">
      <Pestanas<Vista>
        valor={vista}
        onChange={setVista}
        opciones={[
          { value: "por_enviar", label: "Por enviar", contador: filas.filter((s) => enVista(s, "por_enviar")).length },
          { value: "en_curso", label: "Con la marca", contador: filas.filter((s) => enVista(s, "en_curso")).length },
          { value: "cerradas", label: "Cerradas", contador: filas.filter((s) => enVista(s, "cerradas")).length },
          { value: "todas", label: "Todas" },
        ]}
      />
      <EstadoCarga cargando={!lista && !error} error={error} texto="Cargando solicitudes..." />
      {lista && vista === "por_enviar" && visibles.length > 0 && (
        <Aviso tono="azul">
          El panel arma estas solicitudes solo, una por marca y sede, con lo que pasa a rojo. Revisa los productos y envíala a la marca.
        </Aviso>
      )}
      {lista && (
        <TablaReporte<Fila>
          filas={visibles}
          columnas={columnas}
          buscarEn={(s) => `${s.folio} ${s.marcaNombre} ${s.accionAcordada ?? ""}`}
          filtros={[{ clave: "marcaNombre", titulo: "Marca" }]}
          archivo="solicitudes-marcas"
        />
      )}
      {abierta && (
        <DetalleSolicitud
          id={abierta}
          puedeGestionar={puedeGestionar}
          cerrar={(recargar) => {
            setAbierta(null);
            if (recargar) cargar();
          }}
        />
      )}
    </div>
  );
}

interface Detalle {
  solicitud: Solicitud;
  lineas: LineaSolicitud[];
  eventos: EventoSolicitud[];
  contactos: ContactoMarca | null;
  avisos: string[];
  envioPorCorreo: boolean;
  puedeGestionar: boolean;
}

type Form = {
  estado: EstadoSolicitud;
  respuestaEl: string;
  respuesta: string;
  tiposApoyo: TipoApoyo[];
  montoApoyo: string;
  accionAcordada: string;
  acordadaEl: string;
  notas: string;
};

type FormLinea = { excluida: boolean; apoyoUnitario: string; precioRemate: string; accion: AccionLinea | "" };

const aTexto = (n: number | null) => (n === null ? "" : String(n));

function DetalleSolicitud({ id, puedeGestionar, cerrar }: { id: number; puedeGestionar: boolean; cerrar: (recargar: boolean) => void }) {
  const [d, setD] = useState<Detalle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [lineas, setLineas] = useState<Record<number, FormLinea>>({});
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ texto: string; tono: "azul" | "rojo" } | null>(null);
  const [enviar, setEnviar] = useState(false);
  const [cambio, setCambio] = useState(false);
  const [verExcluidas, setVerExcluidas] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const j = await pedir<Detalle>(`/api/rotacion-inventario/solicitudes/${id}`);
      setD(j);
      const s = j.solicitud;
      setForm({
        estado: s.estado,
        respuestaEl: s.respuestaEl ?? "",
        respuesta: s.respuesta ?? "",
        tiposApoyo: s.tiposApoyo,
        montoApoyo: aTexto(s.montoApoyo),
        accionAcordada: s.accionAcordada ?? "",
        acordadaEl: s.acordadaEl ?? "",
        notas: s.notas ?? "",
      });
      setLineas(
        Object.fromEntries(
          j.lineas.map((l) => [l.id, { excluida: l.excluida, apoyoUnitario: aTexto(l.apoyoUnitario), precioRemate: aTexto(l.precioRemate), accion: l.accion ?? "" }]),
        ),
      );
    } catch (e: any) {
      setError(e.message);
    }
  }, [id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const s = d?.solicitud;
  const editable = !!(puedeGestionar && d?.puedeGestionar);
  const porEnviar = s?.estado === "por_enviar";

  const guardar = async () => {
    if (!d || !form) return;
    setGuardando(true);
    setMensaje(null);
    try {
      const cambiosLineas = d.lineas
        .map((l) => {
          const f = lineas[l.id];
          return {
            id: l.id,
            excluida: f.excluida,
            apoyoUnitario: f.apoyoUnitario === "" ? null : Number(f.apoyoUnitario),
            precioRemate: f.precioRemate === "" ? null : Number(f.precioRemate),
            accion: f.accion || null,
          };
        });
      const body: any = { lineas: cambiosLineas, notas: form.notas };
      if (!porEnviar) {
        Object.assign(body, {
          estado: form.estado,
          respuestaEl: form.respuestaEl || null,
          respuesta: form.respuesta,
          tiposApoyo: form.tiposApoyo,
          montoApoyo: form.montoApoyo === "" ? null : Number(form.montoApoyo),
          accionAcordada: form.accionAcordada,
          acordadaEl: form.acordadaEl || null,
        });
      }
      const r = await pedir<{ cambios: number }>(`/api/rotacion-inventario/solicitudes/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      setMensaje({ texto: r.cambios ? "Guardado." : "No había cambios.", tono: "azul" });
      if (r.cambios) setCambio(true);
      await cargar();
    } catch (e: any) {
      setMensaje({ texto: e.message, tono: "rojo" });
    } finally {
      setGuardando(false);
    }
  };

  const anular = async () => {
    if (!confirm("¿Anular esta solicitud? No se le envía a la marca.")) return;
    try {
      await pedir(`/api/rotacion-inventario/solicitudes/${id}`, { method: "PATCH", body: JSON.stringify({ estado: "anulada" }) });
      setCambio(true);
      await cargar();
    } catch (e: any) {
      setMensaje({ texto: e.message, tono: "rojo" });
    }
  };

  const activas = d?.lineas.filter((l) => !l.excluida) ?? [];
  const excluidas = d?.lineas.filter((l) => l.excluida) ?? [];
  const mostrar = verExcluidas ? d?.lineas ?? [] : activas;

  return (
    <Dialog open onOpenChange={(o) => !o && cerrar(cambio)}>
      <DialogContent className="sm:max-w-[min(72rem,calc(100vw-2rem))] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-6 flex flex-wrap items-center gap-2">
            {s ? `${folio(s.id)} · ${s.marcaNombre} · ${nombreSede(s.companyId)}` : "Solicitud"}
            {s && <InsigniaEstado estado={s.estado} />}
          </DialogTitle>
          <DialogDescription>
            {s
              ? `${s.creadaAuto ? "La armó el panel" : `Creada por ${s.creadoPor ?? "—"}`} el ${fecha(s.createdAt)}` +
                (s.enviadaEl ? ` · enviada el ${fecha(s.enviadaEl)} por ${s.enviadaPor ?? "—"}${s.enviadaA ? ` a ${s.enviadaA}` : ""}` : "")
              : ""}
          </DialogDescription>
        </DialogHeader>

        {!d && !error && (
          <div className="py-16 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          </div>
        )}
        {error && <Aviso tono="rojo">{error}</Aviso>}
        {d?.avisos.map((a) => <Aviso key={a}>{a}</Aviso>)}
        {mensaje && <Aviso tono={mensaje.tono}>{mensaje.texto}</Aviso>}

        {d && s && form && (
          <div className="space-y-5 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-600">
                {num(s.productos)} productos · {num(s.unidades)} unidades · <b>{usd(s.valorCosto)}</b> a costo
              </span>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button variant="outline" size="sm" asChild>
                  <a href={`/api/rotacion-inventario/solicitudes/${id}/excel`}>
                    <Download className="h-4 w-4 mr-2" /> Excel para la marca
                  </a>
                </Button>
                {editable && porEnviar && (
                  <>
                    <Button size="sm" onClick={() => setEnviar(true)} disabled={!activas.length}>
                      <Send className="h-4 w-4 mr-2" /> Enviar a la marca
                    </Button>
                    <Button size="sm" variant="ghost" onClick={anular}>
                      Anular
                    </Button>
                  </>
                )}
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    {porEnviar && editable && <th className="px-2 py-2 font-medium">Va</th>}
                    <th className="text-left px-2 py-2 font-medium">Producto</th>
                    <th className="text-right px-2 py-2 font-medium">Unid.</th>
                    <th className="text-right px-2 py-2 font-medium">Costo</th>
                    <th className="text-right px-2 py-2 font-medium">Valor</th>
                    <th className="text-right px-2 py-2 font-medium">Días s/v</th>
                    {!porEnviar && (
                      <>
                        <th className="text-right px-2 py-2 font-medium">Apoyo / u</th>
                        <th className="text-right px-2 py-2 font-medium">Costo neto</th>
                        <th className="text-right px-2 py-2 font-medium">Precio remate</th>
                        <th className="text-right px-2 py-2 font-medium">Margen</th>
                        <th className="text-left px-2 py-2 font-medium">Acción</th>
                        <th className="text-right px-2 py-2 font-medium">Disp. hoy</th>
                        <th className="text-right px-2 py-2 font-medium" title="Desde el acuerdo (o el envío)">Vendidas</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {mostrar.map((l) => {
                    const fl = lineas[l.id];
                    const { costoNeto, margen } = margenRemate(
                      l.costoUnitario,
                      fl?.apoyoUnitario === "" ? null : Number(fl?.apoyoUnitario),
                      fl?.precioRemate === "" ? null : Number(fl?.precioRemate),
                    );
                    const cambiar = (c: Partial<FormLinea>) => setLineas((x) => ({ ...x, [l.id]: { ...x[l.id], ...c } }));
                    return (
                      <tr key={l.id} className={`border-t ${fl?.excluida ? "opacity-50" : ""}`}>
                        {porEnviar && editable && (
                          <td className="px-2 py-1.5 text-center">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-blue-600"
                              checked={!fl?.excluida}
                              onChange={(e) => cambiar({ excluida: !e.target.checked })}
                              aria-label="Incluir en la solicitud"
                            />
                          </td>
                        )}
                        <td className="px-2 py-1.5 min-w-[220px]">
                          <span className="font-medium">{l.nombre}</span>
                          <span className="block text-[10px] text-slate-500">
                            {l.codigo || "sin código"} · {l.categoria}
                            {l.excluida && l.exclusion === "auto" ? " · salió solo: se vendió o ya no está en rojo" : ""}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{num(l.unidades)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{usd(l.costoUnitario, 2)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{usd(l.valorCosto)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{l.diasSinVenta}</td>
                        {!porEnviar && (
                          <>
                            <td className="px-2 py-1.5 text-right">
                              <Input
                                className="h-7 w-20 text-right text-xs ml-auto"
                                inputMode="decimal"
                                value={fl?.apoyoUnitario ?? ""}
                                onChange={(e) => cambiar({ apoyoUnitario: e.target.value })}
                                disabled={!editable}
                              />
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{usd(costoNeto, 2)}</td>
                            <td className="px-2 py-1.5 text-right">
                              <Input
                                className="h-7 w-20 text-right text-xs ml-auto"
                                inputMode="decimal"
                                value={fl?.precioRemate ?? ""}
                                onChange={(e) => cambiar({ precioRemate: e.target.value })}
                                disabled={!editable}
                              />
                            </td>
                            <td className={`px-2 py-1.5 text-right tabular-nums ${margen !== null && margen < 0 ? "text-red-600" : ""}`}>
                              {margen === null ? "—" : `${margen.toFixed(1)}%`}
                            </td>
                            <td className="px-2 py-1.5">
                              <select
                                className="h-7 rounded border bg-white px-1 text-xs"
                                value={fl?.accion ?? ""}
                                onChange={(e) => cambiar({ accion: e.target.value as AccionLinea | "" })}
                                disabled={!editable}
                              >
                                <option value="">—</option>
                                {ACCIONES_LINEA.map((a) => (
                                  <option key={a.value} value={a.value}>
                                    {a.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{num(l.disponibleHoy)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{num(l.vendidasDesdeAcuerdo)}</td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {excluidas.length > 0 && (
              <button className="text-xs text-blue-700 hover:underline" onClick={() => setVerExcluidas((v) => !v)}>
                {verExcluidas ? "Ocultar los que no van" : `Ver ${excluidas.length} que no van en la solicitud`}
              </button>
            )}

            {!porEnviar && (
              <div className="grid md:grid-cols-2 gap-4 rounded-xl border p-4">
                <div className="space-y-3">
                  <p className="font-semibold">Respuesta de la marca</p>
                  <Campo titulo="Fecha de respuesta">
                    <Input type="date" value={form.respuestaEl} onChange={(e) => setForm({ ...form, respuestaEl: e.target.value })} disabled={!editable} />
                  </Campo>
                  <Campo titulo="Qué respondió">
                    <Textarea rows={3} value={form.respuesta} onChange={(e) => setForm({ ...form, respuesta: e.target.value })} disabled={!editable} />
                  </Campo>
                  <Campo titulo="Apoyo que da">
                    <div className="flex flex-wrap gap-2">
                      {TIPOS_APOYO.map((t) => (
                        <label key={t.value} className="inline-flex items-center gap-1.5 text-xs rounded-full border px-2.5 py-1 cursor-pointer">
                          <input
                            type="checkbox"
                            className="accent-blue-600"
                            checked={form.tiposApoyo.includes(t.value)}
                            disabled={!editable}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                tiposApoyo: e.target.checked ? [...form.tiposApoyo, t.value] : form.tiposApoyo.filter((x) => x !== t.value),
                              })
                            }
                          />
                          {t.label}
                        </label>
                      ))}
                    </div>
                  </Campo>
                  <Campo titulo="Monto total del apoyo (USD)">
                    <Input inputMode="decimal" value={form.montoApoyo} onChange={(e) => setForm({ ...form, montoApoyo: e.target.value })} disabled={!editable} />
                  </Campo>
                </div>
                <div className="space-y-3">
                  <p className="font-semibold">Acuerdo y seguimiento</p>
                  <Campo titulo="Acción acordada">
                    <Textarea
                      rows={3}
                      value={form.accionAcordada}
                      onChange={(e) => setForm({ ...form, accionAcordada: e.target.value })}
                      placeholder="Ej. la marca da NC de $8/u y liquidamos a $45 hasta fin de mes"
                      disabled={!editable}
                    />
                  </Campo>
                  <Campo titulo="Fecha del acuerdo">
                    <Input type="date" value={form.acordadaEl} onChange={(e) => setForm({ ...form, acordadaEl: e.target.value })} disabled={!editable} />
                  </Campo>
                  <Campo titulo="Estado">
                    <select
                      className="h-9 w-full rounded-md border bg-white px-2 text-sm"
                      value={form.estado}
                      onChange={(e) => setForm({ ...form, estado: e.target.value as EstadoSolicitud })}
                      disabled={!editable}
                    >
                      {ESTADOS_SOLICITUD.filter((e) => e.value !== "por_enviar").map((e) => (
                        <option key={e.value} value={e.value}>
                          {e.label}
                        </option>
                      ))}
                    </select>
                  </Campo>
                  <Campo titulo="Notas internas">
                    <Textarea rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} disabled={!editable} />
                  </Campo>
                </div>
              </div>
            )}
            {porEnviar && (
              <Campo titulo="Notas internas">
                <Textarea rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} disabled={!editable} />
              </Campo>
            )}
            {editable && (
              <div className="flex justify-end">
                <Button onClick={guardar} disabled={guardando}>
                  {guardando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Guardar
                </Button>
              </div>
            )}

            {d.eventos.length > 0 && (
              <div className="rounded-xl border p-4">
                <p className="font-semibold mb-2">Historial</p>
                <ul className="space-y-2">
                  {d.eventos.map((e) => (
                    <li key={e.id} className="text-xs">
                      <span className="text-slate-500">
                        {new Date(e.createdAt).toLocaleString("es-VE", { timeZone: "America/Caracas" })} · {e.usuario ?? "Panel"}
                      </span>
                      {e.detalle && <span className="block whitespace-pre-line">{e.detalle}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {enviar && d && s && (
          <EnviarDialog
            detalle={d}
            cerrar={(enviada) => {
              setEnviar(false);
              if (enviada) {
                setCambio(true);
                setMensaje({ texto: "Solicitud enviada. Anota aquí la respuesta de la marca cuando llegue.", tono: "azul" });
                cargar();
              }
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EnviarDialog({ detalle, cerrar }: { detalle: Detalle; cerrar: (enviada: boolean) => void }) {
  const s = detalle.solicitud;
  const c = detalle.contactos;
  const [para, setPara] = useState(c?.correos ?? "");
  const [cc, setCc] = useState(c?.cc ?? "");
  const [asunto, setAsunto] = useState(`Supricom ${nombreSede(s.companyId)} · Apoyo para rotar inventario ${s.marcaNombre} (${folio(s.id)})`);
  const [mensaje, setMensaje] = useState(mensajeSugerido(s, c?.nombre));
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mandar = async (manual: boolean) => {
    setOcupado(true);
    setError(null);
    try {
      await pedir(`/api/rotacion-inventario/solicitudes/${s.id}/enviar`, {
        method: "POST",
        body: JSON.stringify({ para, cc, asunto, mensaje, manual }),
      });
      cerrar(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && cerrar(false)}>
      <DialogContent className="sm:max-w-[min(42rem,calc(100vw-2rem))]">
        <DialogHeader>
          <DialogTitle>Enviar {folio(s.id)} a {s.marcaNombre}</DialogTitle>
          <DialogDescription>
            {detalle.envioPorCorreo
              ? "Sale por correo con el Excel de los productos adjunto."
              : "El envío por correo no está configurado: descarga el Excel, mándalo tú y márcala como enviada."}
          </DialogDescription>
        </DialogHeader>
        {!c && <Aviso>Esta marca no tiene contacto guardado. Escribe el correo aquí o agrégalo en «Contactos de marcas».</Aviso>}
        {error && <Aviso tono="rojo">{error}</Aviso>}
        <div className="space-y-3 text-sm">
          <Campo titulo="Para (correos de la marca, separados por coma)">
            <Input value={para} onChange={(e) => setPara(e.target.value)} />
          </Campo>
          <Campo titulo="Copia">
            <Input value={cc} onChange={(e) => setCc(e.target.value)} />
          </Campo>
          <Campo titulo="Asunto">
            <Input value={asunto} onChange={(e) => setAsunto(e.target.value)} />
          </Campo>
          <Campo titulo="Mensaje">
            <Textarea rows={12} value={mensaje} onChange={(e) => setMensaje(e.target.value)} />
          </Campo>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => mandar(true)} disabled={ocupado}>
              Ya la envié por mi cuenta
            </Button>
            {detalle.envioPorCorreo && (
              <Button onClick={() => mandar(false)} disabled={ocupado}>
                {ocupado ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
                Enviar correo
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Campo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-slate-500">{titulo}</span>
      {children}
    </label>
  );
}
