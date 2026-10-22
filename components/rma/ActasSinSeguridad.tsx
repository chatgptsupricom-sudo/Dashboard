"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, Inbox, Loader2, PackageCheck, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CheckRow, FirmaCampo, PersonaSelect, type Persona } from "@/components/seguridad/FormActa";
import { SignaturePad } from "@/components/seguridad/SignaturePad";
import { NOMBRES_SUCURSAL } from "@/lib/servicio-tecnico/sucursales";
import { fechaCorta } from "@/components/rma/estados";

/**
 * Recepción y entrega del equipo en una sede sin Seguridad
 * (lib/rma/sedesSeguridad.ts). RMA hace las mismas actas que en Valencia hace
 * Seguridad (`seguridad_ingresos` / `seguridad_despachos`, mismas APIs), pero
 * firmadas por el cliente y por RMA:
 *
 *  - Recepción: el equipo por llegar pasa a diagnóstico y arranca su plazo de
 *    48 horas, con el correo al cliente de siempre. Si lo trae el cliente,
 *    firma él; si llegó por encomienda, firma solo RMA y se adjunta la foto
 *    de la guía o del paquete.
 *  - Entrega: sale lo que RMA ya terminó (todo o algunos productos); el caso
 *    queda entregado cuando sale el último. Firma quien se lo lleva: el
 *    cliente, el chofer de la ruta o quien lo lleva a la agencia. La prueba de
 *    que le llegó al cliente se adjunta después: por ruta, la foto de la nota
 *    de entrega firmada; por agencia, la guía (se le manda por correo).
 */

type Item = {
  id: number;
  model: string | null;
  hardware: string | null;
  serial: string | null;
  status: string;
  despachado_at: string | null;
};

export type ActasCaso = {
  ingresos: { id: number; nd_numero: string | null; fecha_entrega: string; recibido_rma_nombre: string | null; created_at: string }[];
  despachos: {
    id: number;
    nd_numero: string | null;
    fecha_despacho: string;
    cliente_retira: string | null;
    almacenista_nombre: string | null;
    created_at: string;
  }[];
};

type Props = {
  caso: any;
  items: Item[];
  actas: ActasCaso;
  onCambio: () => void;
  /** Abre el diálogo de la guía de la agencia (lo tiene la pantalla del caso). */
  onAdjuntarGuia: () => void;
};

const TERMINADOS = ["reparado", "nota_credito", "no_procesado"];
const nombre = (i: { model: string | null; hardware: string | null }) => i.model || i.hardware || "Producto";

/** Hoy en Caracas, YYYY-MM-DD. */
const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Caracas" });

const campo =
  "w-full h-11 px-3 border border-slate-200 rounded-[10px] text-sm bg-white focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100";

export default function ActasSinSeguridad({ caso, items, actas, onCambio, onAdjuntarGuia }: Props) {
  const [personal, setPersonal] = useState<Persona[]>([]);
  const [abierto, setAbierto] = useState<"recepcion" | "entrega" | null>(null);

  useEffect(() => {
    fetch("/api/seguridad/catalogo/personal?rol=rma")
      .then((r) => r.json())
      .then((j) => setPersonal(j.personal || []))
      .catch(() => setPersonal([]));
  }, []);

  const ingreso = actas.ingresos[actas.ingresos.length - 1] ?? null;
  const varios = items.length > 1;

  // Recepción: solo mientras algo está por llegar (lo que RMA abre con el
  // equipo en la mano nace en diagnóstico y no la necesita).
  const porLlegar =
    !ingreso &&
    !caso.despachado_at &&
    (caso.status === "por_llegar" ||
      (caso.status === "recibido" && caso.origen === "portal") ||
      items.some((i) => i.status === "por_llegar"));

  // Entrega: lo terminado que sigue en el taller.
  const porEntregar = useMemo(() => {
    if (items.length) return items.filter((i) => !i.despachado_at && TERMINADOS.includes(i.status));
    return !caso.despachado_at && TERMINADOS.includes(caso.status)
      ? [{ id: 0, model: caso.model, hardware: caso.hardware, serial: caso.serial, status: caso.status, despachado_at: null }]
      : [];
  }, [items, caso]);

  const adjuntos: any[] = caso.adjuntos || [];
  const tieneGuia = adjuntos.some((a) => a.tipo === "guia_agencia");
  const guiaLlegada = adjuntos.find((a) => a.tipo === "llegada_encomienda");
  const notaFirmada = adjuntos.find((a) => a.tipo === "nota_entrega");
  const sede = NOMBRES_SUCURSAL[caso.company_id] || "esta sede";
  const verPrueba = (a: any) => `/api/rma/${caso.id}/prueba?adjunto=${a.id}`;

  const [subiendoNota, setSubiendoNota] = useState(false);
  const [errorNota, setErrorNota] = useState<string | null>(null);
  async function subirNota(file: File) {
    setSubiendoNota(true);
    setErrorNota(null);
    const err = await subirPrueba(caso.id, "nota_entrega", file);
    setSubiendoNota(false);
    if (err) setErrorNota(err);
    else onCambio();
  }

  return (
    <Card className="rounded-3xl border-none shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-slate-900">Recepción y entrega del equipo</CardTitle>
        <p className="text-xs text-slate-500">
          En {sede} no hay Seguridad: RMA registra cuándo llega y cuándo sale el equipo, con la firma del cliente.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Recepción */}
        <div className="rounded-xl border border-slate-200 px-4 py-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Inbox className="w-4 h-4 text-slate-400" /> Recepción
          </div>
          {actas.ingresos.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>
                Recibido el {fechaCorta(i.created_at)}
                {i.recibido_rma_nombre ? ` por ${i.recibido_rma_nombre}` : ""}
                {i.nd_numero ? ` · guía ${i.nd_numero}` : ""}
              </span>
              <a
                href={`/api/seguridad/ingreso/${i.id}/comprobante`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700 hover:underline"
              >
                <FileText className="w-3.5 h-3.5" /> Ver acta
              </a>
              {guiaLlegada && (
                <a
                  href={verPrueba(guiaLlegada)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700 hover:underline"
                >
                  <FileText className="w-3.5 h-3.5" /> Guía de la encomienda
                </a>
              )}
            </div>
          ))}
          {porLlegar ? (
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setAbierto("recepcion")}>
              Registrar recepción
            </Button>
          ) : (
            !actas.ingresos.length && (
              <p className="text-sm text-slate-500">
                {caso.despachado_at ? "Sin acta de recepción." : "El equipo ya está en el taller (sin acta de recepción)."}
              </p>
            )
          )}
        </div>

        {/* Entrega */}
        <div className="rounded-xl border border-slate-200 px-4 py-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <PackageCheck className="w-4 h-4 text-slate-400" /> Entrega
          </div>
          {actas.despachos.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>
                Entregado el {fechaCorta(d.fecha_despacho)}
                {d.cliente_retira ? ` a ${d.cliente_retira}` : ""}
                {d.almacenista_nombre ? ` · por ${d.almacenista_nombre}` : ""}
              </span>
              <a
                href={`/api/seguridad/despacho/${d.id}/comprobante`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700 hover:underline"
              >
                <FileText className="w-3.5 h-3.5" /> Ver acta
              </a>
            </div>
          ))}
          {porEntregar.length > 0 ? (
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setAbierto("entrega")}>
              Registrar entrega
            </Button>
          ) : (
            !actas.despachos.length && (
              <p className="text-sm text-slate-500">
                {caso.despachado_at
                  ? `Entregado el ${fechaCorta(caso.despachado_at)} (sin acta).`
                  : "Se entrega cuando RMA lo termine (reparado, nota de crédito o no procesado)."}
              </p>
            )
          )}
          {/* Prueba de que le llegó al cliente, cuando no lo retiró él. */}
          {actas.despachos.length > 0 && caso.entrega_metodo === "agencia" && (
            tieneGuia ? (
              <p className="flex items-center gap-2 text-sm text-slate-600">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Guía de la agencia enviada al cliente.
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1.5 text-sm text-amber-700">
                  <AlertTriangle className="w-4 h-4" /> Falta la guía de la agencia.
                </span>
                <Button size="sm" variant="outline" onClick={onAdjuntarGuia}>
                  <Upload className="w-4 h-4 mr-2" /> Adjuntar guía
                </Button>
              </div>
            )
          )}
          {actas.despachos.length > 0 && caso.entrega_metodo === "ruta" && (
            notaFirmada ? (
              <p className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Nota de entrega firmada por el cliente.
                <a
                  href={verPrueba(notaFirmada)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700 hover:underline"
                >
                  <FileText className="w-3.5 h-3.5" /> Ver
                </a>
              </p>
            ) : (
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-1.5 text-sm text-amber-700">
                    <AlertTriangle className="w-4 h-4" /> Falta la nota de entrega firmada por el cliente (la trae el chofer).
                  </span>
                  <label className="inline-flex h-8 cursor-pointer items-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium hover:bg-slate-50">
                    {subiendoNota ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                    Subir foto
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={subiendoNota}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) subirNota(f);
                      }}
                    />
                  </label>
                </div>
                {errorNota && <p className="text-sm text-red-600">{errorNota}</p>}
              </div>
            )
          )}
        </div>
      </CardContent>

      {abierto === "recepcion" && (
        <DialogoRecepcion
          caso={caso}
          items={varios ? items : []}
          personal={personal}
          onCerrar={() => setAbierto(null)}
          onListo={() => {
            setAbierto(null);
            onCambio();
          }}
        />
      )}
      {abierto === "entrega" && (
        <DialogoEntrega
          caso={caso}
          porEntregar={varios ? porEntregar : []}
          personal={personal}
          onCerrar={() => setAbierto(null)}
          onListo={() => {
            setAbierto(null);
            onCambio();
          }}
        />
      )}
    </Card>
  );
}

async function enviar(url: string, body: unknown): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) return json.error || "No se pudo guardar.";
    return null;
  } catch {
    return "Sin conexión: no se guardó.";
  }
}

async function subirPrueba(caseId: number, tipo: "llegada_encomienda" | "nota_entrega", file: File): Promise<string | null> {
  try {
    const fd = new FormData();
    fd.append("tipo", tipo);
    fd.append("file", file);
    const res = await fetch(`/api/rma/${caseId}/prueba`, { method: "POST", body: fd });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) return json.error || "No se pudo subir la foto.";
    return null;
  } catch {
    return "Sin conexión: no se subió la foto.";
  }
}

/** Botones de una sola opción (cómo llegó / cómo sale). */
function Opciones<T extends string>({
  valor,
  onChange,
  opciones,
}: {
  valor: T;
  onChange: (v: T) => void;
  opciones: [T, string][];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {opciones.map(([k, etiqueta]) => (
        <Button
          key={k}
          type="button"
          size="sm"
          variant={valor === k ? "default" : "outline"}
          className={valor === k ? "bg-blue-600 text-white hover:bg-blue-700" : ""}
          onClick={() => onChange(k)}
        >
          {etiqueta}
        </Button>
      ))}
    </div>
  );
}

function DialogoRecepcion({
  caso,
  items,
  personal,
  onCerrar,
  onListo,
}: {
  caso: any;
  items: Item[];
  personal: Persona[];
  onCerrar: () => void;
  onListo: () => void;
}) {
  const [productos, setProductos] = useState(
    items.map((i) => ({ id: i.id, producto: nombre(i), serial: i.serial || "", recibido: null as boolean | null, observacion: "" })),
  );
  const [accesorios, setAccesorios] = useState<boolean | null>(null);
  const [sinManipulacion, setSinManipulacion] = useState<boolean | null>(null);
  const [llegoPor, setLlegoPor] = useState<"cliente" | "encomienda">("cliente");
  const [entrega, setEntrega] = useState<string>(caso.client_name || "");
  const [firmaCliente, setFirmaCliente] = useState<string | null>(null);
  const [foto, setFoto] = useState<File | null>(null);
  // La foto ya subida (si el acta falló después, no se sube de nuevo).
  const [fotoSubida, setFotoSubida] = useState<File | null>(null);
  const [recibe, setRecibe] = useState("");
  const [firmaRma, setFirmaRma] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const encomienda = llegoPor === "encomienda";

  async function guardar() {
    const faltan: string[] = [];
    if (productos.some((p) => p.recibido === null)) faltan.push("indica si llegó cada producto");
    if (accesorios === null || sinManipulacion === null) faltan.push("responde la verificación");
    if (encomienda) {
      if (!foto) faltan.push("la foto de la guía o del paquete");
    } else {
      if (!entrega.trim()) faltan.push("quién entrega el equipo");
      if (!firmaCliente) faltan.push("la firma de quien entrega");
    }
    if (!recibe.trim()) faltan.push("quién recibe por RMA");
    if (!firmaRma) faltan.push("la firma de RMA");
    if (faltan.length) {
      setError(`Falta: ${faltan.join(", ")}.`);
      return;
    }
    setGuardando(true);
    setError(null);
    if (encomienda && foto && foto !== fotoSubida) {
      const errFoto = await subirPrueba(caso.id, "llegada_encomienda", foto);
      if (errFoto) {
        setGuardando(false);
        setError(errFoto);
        return;
      }
      setFotoSubida(foto);
    }
    const err = await enviar("/api/seguridad/ingreso", {
      rma_case_id: caso.id,
      fecha_entrega: hoy(),
      llego_por: llegoPor,
      recibido_rma_nombre: recibe.trim(),
      cliente_entrega_nombre: encomienda ? null : entrega.trim(),
      firma_cliente: encomienda ? null : firmaCliente,
      firma_rma: firmaRma,
      accesorios_integros: accesorios,
      sin_manipulacion: sinManipulacion,
      ...(productos.length
        ? {
            productos: productos.map((p) => ({
              rma_item_id: p.id,
              recibido: p.recibido,
              serial: p.serial,
              observacion: p.observacion,
            })),
          }
        : {}),
    });
    setGuardando(false);
    if (err) setError(err);
    else onListo();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !guardando && onCerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Registrar recepción</DialogTitle>
          <DialogDescription>
            Acta de recepción del caso {caso.case_number}. Lo que llegó pasa a diagnóstico (48 horas hábiles) y se le
            avisa al cliente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {productos.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-800">Productos del envío</p>
              {productos.map((p, idx) => (
                <div key={p.id} className="space-y-2 rounded-[10px] border border-slate-200 p-3">
                  <CheckRow
                    label={`${idx + 1}. ${p.producto}`}
                    value={p.recibido}
                    onChange={(v) => setProductos((ps) => ps.map((x) => (x.id === p.id ? { ...x, recibido: v } : x)))}
                    yes="Llegó"
                    no="No llegó"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      className={campo}
                      value={p.serial}
                      placeholder="Serial"
                      onChange={(e) =>
                        setProductos((ps) => ps.map((x) => (x.id === p.id ? { ...x, serial: e.target.value.slice(0, 200) } : x)))
                      }
                    />
                    <input
                      className={campo}
                      value={p.observacion}
                      placeholder="Observación"
                      onChange={(e) =>
                        setProductos((ps) =>
                          ps.map((x) => (x.id === p.id ? { ...x, observacion: e.target.value.slice(0, 500) } : x)),
                        )
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <CheckRow label="Accesorios íntegros" value={accesorios} onChange={setAccesorios} yes="Sí" no="No" />
            <CheckRow label="Sin manipulación" value={sinManipulacion} onChange={setSinManipulacion} yes="Sí" no="No" />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-800">Cómo llegó</p>
            <Opciones
              valor={llegoPor}
              onChange={setLlegoPor}
              opciones={[
                ["cliente", "Lo trae el cliente"],
                ["encomienda", "Por encomienda"],
              ]}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {encomienda ? (
              <div className="space-y-2 rounded-[10px] border border-slate-200 p-4">
                <label className="block text-xs font-semibold text-slate-600">
                  Foto de la guía o del paquete <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-slate-500">No hay quien firme por el cliente: la foto queda como prueba.</p>
                <input
                  type="file"
                  accept="image/*"
                  className="block w-full text-sm"
                  onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
                />
              </div>
            ) : (
              <div className="space-y-3 rounded-[10px] border border-slate-200 p-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Entrega el equipo <span className="text-red-500">*</span>
                  </label>
                  <input className={campo} value={entrega} onChange={(e) => setEntrega(e.target.value.slice(0, 200))} />
                </div>
                <FirmaCampo etiqueta="Firma de quien entrega" firmada={!!firmaCliente}>
                  <SignaturePad onChange={setFirmaCliente} height={130} />
                </FirmaCampo>
              </div>
            )}
            <div className="space-y-3 rounded-[10px] border border-slate-200 p-4">
              <PersonaRma value={recibe} onChange={setRecibe} personal={personal} label="Recibe por RMA" />
              <FirmaCampo etiqueta="Firma de RMA" firmada={!!firmaRma}>
                <SignaturePad onChange={setFirmaRma} height={130} />
              </FirmaCampo>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Guardar recepción
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type SalePor = "sucursal" | "ruta" | "agencia";

function DialogoEntrega({
  caso,
  porEntregar,
  personal,
  onCerrar,
  onListo,
}: {
  caso: any;
  porEntregar: Item[];
  personal: Persona[];
  onCerrar: () => void;
  onListo: () => void;
}) {
  const [salen, setSalen] = useState<number[]>(porEntregar.map((i) => i.id));
  const [accesorios, setAccesorios] = useState<boolean | null>(null);
  // Lo que eligió el cliente en el portal, si eligió; se puede cambiar.
  const [salePor, setSalePor] = useState<SalePor>(
    ["ruta", "agencia"].includes(caso.entrega_metodo) ? caso.entrega_metodo : "sucursal",
  );
  const [agencia, setAgencia] = useState<string>(caso.entrega_agencia || "");
  const [retira, setRetira] = useState<string>(salePor === "sucursal" ? caso.client_name || "" : "");
  const [firmaCliente, setFirmaCliente] = useState<string | null>(null);
  const [entrega, setEntrega] = useState("");
  const [firmaRma, setFirmaRma] = useState<string | null>(null);
  const [observaciones, setObservaciones] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    const faltan: string[] = [];
    if (porEntregar.length && !salen.length) faltan.push("elige qué productos salen");
    if (accesorios === null) faltan.push("responde si los accesorios están íntegros");
    if (salePor === "agencia" && !agencia.trim()) faltan.push("la agencia");
    if (!retira.trim()) faltan.push(salePor === "sucursal" ? "quién retira" : "quién se lleva el equipo");
    if (!firmaCliente) faltan.push("la firma de quien retira");
    if (!entrega.trim()) faltan.push("quién entrega por RMA");
    if (!firmaRma) faltan.push("la firma de RMA");
    if (faltan.length) {
      setError(`Falta: ${faltan.join(", ")}.`);
      return;
    }
    setGuardando(true);
    setError(null);
    const err = await enviar("/api/seguridad/despacho", {
      rma_case_id: caso.id,
      fecha_despacho: hoy(),
      sale_por: salePor,
      agencia: salePor === "agencia" ? agencia.trim() : null,
      cliente_retira: retira.trim(),
      accesorios_integros: accesorios,
      observaciones: observaciones.trim() || null,
      firmas: {
        cliente: { data: firmaCliente },
        tecnico: { nombre: entrega.trim(), data: firmaRma },
      },
      ...(porEntregar.length ? { item_ids: salen } : {}),
    });
    setGuardando(false);
    if (err) setError(err);
    else onListo();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !guardando && onCerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Registrar entrega</DialogTitle>
          <DialogDescription>
            Acta de entrega del caso {caso.case_number}. Firma quien se lleva el equipo.
            {salePor === "ruta" && " Cuando vuelva el chofer, sube la foto de la nota de entrega firmada por el cliente."}
            {salePor === "agencia" && " Después adjunta la guía de la agencia: se le manda al cliente por correo."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {porEntregar.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-800">Qué sale</p>
              {porEntregar.map((i) => (
                <label key={i.id} className="flex items-start gap-2 rounded-xl border border-slate-200 px-3 py-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={salen.includes(i.id)}
                    onChange={(e) => setSalen((p) => (e.target.checked ? [...p, i.id] : p.filter((x) => x !== i.id)))}
                  />
                  <span className="min-w-0 text-sm">
                    <span className="font-medium text-slate-800 break-words">{nombre(i)}</span>
                    {i.serial && <span className="block font-mono text-xs text-slate-500">{i.serial}</span>}
                  </span>
                </label>
              ))}
            </div>
          )}

          <CheckRow label="Accesorios íntegros" value={accesorios} onChange={setAccesorios} yes="Sí" no="No" />

          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-800">Cómo sale</p>
            <Opciones
              valor={salePor}
              onChange={(v) => {
                setSalePor(v);
                setRetira(v === "sucursal" ? caso.client_name || "" : "");
              }}
              opciones={[
                ["sucursal", "Lo retira el cliente"],
                ["ruta", "Ruta interna"],
                ["agencia", "Encomienda"],
              ]}
            />
            {salePor === "agencia" && (
              <input
                className={campo}
                value={agencia}
                placeholder="Agencia (MRW, Zoom, Tealca…)"
                onChange={(e) => setAgencia(e.target.value.slice(0, 100))}
              />
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3 rounded-[10px] border border-slate-200 p-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  {salePor === "ruta"
                    ? "Chofer de la ruta"
                    : salePor === "agencia"
                      ? "Lleva el equipo a la agencia"
                      : "Retira el equipo"}{" "}
                  <span className="text-red-500">*</span>
                </label>
                <input className={campo} value={retira} onChange={(e) => setRetira(e.target.value.slice(0, 175))} />
              </div>
              <FirmaCampo
                etiqueta={salePor === "sucursal" ? "Firma de quien retira" : "Firma de quien se lo lleva"}
                firmada={!!firmaCliente}
              >
                <SignaturePad onChange={setFirmaCliente} height={130} />
              </FirmaCampo>
            </div>
            <div className="space-y-3 rounded-[10px] border border-slate-200 p-4">
              <PersonaRma value={entrega} onChange={setEntrega} personal={personal} label="Entrega por RMA" />
              <FirmaCampo etiqueta="Firma de RMA" firmada={!!firmaRma}>
                <SignaturePad onChange={setFirmaRma} height={130} />
              </FirmaCampo>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Observaciones</label>
            <textarea
              className="w-full min-h-[70px] px-3 py-2 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value.slice(0, 5000))}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Guardar entrega
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Quién firma por RMA: del catálogo de /rma/personal, o escrito si está vacío. */
function PersonaRma({
  value,
  onChange,
  personal,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  personal: Persona[];
  label: string;
}) {
  if (personal.length) {
    return (
      <PersonaSelect
        label={label}
        value={value}
        onChange={onChange}
        opciones={personal}
        placeholder="Elige quién firma"
        vacio=""
      />
    );
  }
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1.5">
        {label} <span className="text-red-500">*</span>
      </label>
      <input className={campo} value={value} onChange={(e) => onChange(e.target.value.slice(0, 200))} />
      <p className="mt-1 text-[11px] text-slate-500">
        Para elegirlo de una lista, regístralo en Personal de RMA.
      </p>
    </div>
  );
}
