"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Aviso, NOMBRE_SEDE, fechaCorta, money } from "@/components/administracion/comunes";
import type { DetallePagoCxP, DocumentoCxP, PagoProveedor } from "@/lib/administracion/cxp";
import type { PagoFijoDelMes } from "@/lib/administracion/pagosFijosCruce";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Repeat,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

/**
 * Calendario de pagos de Cuentas por Pagar: el mes como un calendario real,
 * con los pagos fijos (los registra Administracion, se dan por pagados solos
 * cuando hay un pago en Odoo a ese proveedor en el mes), los pagos a
 * proveedores que se van registrando en Odoo y las facturas abiertas que
 * vencen ese dia. Al tocar un dia se abre su detalle en un modal, y de ahi
 * cada pago con las facturas que pago (las conciliaciones de Odoo).
 */

type Item =
  | { tipo: "fijo"; fijo: PagoFijoDelMes }
  | { tipo: "pago"; pago: PagoProveedor; deFijo: string | null }
  | { tipo: "factura"; doc: DocumentoCxP };

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const SEDES = ["valencia", "caracas", "panama"];

const ESTILO = {
  pagado: "bg-emerald-50 text-emerald-800 border-emerald-200",
  pendiente: "bg-indigo-50 text-indigo-800 border-indigo-200",
  vencido: "bg-red-50 text-red-700 border-red-200",
  pago: "bg-teal-50 text-teal-800 border-teal-200",
  factura: "bg-amber-50 text-amber-800 border-amber-200",
  facturaVencida: "bg-orange-50 text-orange-800 border-orange-300",
};
const PUNTO = {
  pagado: "bg-emerald-500",
  pendiente: "bg-indigo-500",
  vencido: "bg-red-500",
  pago: "bg-teal-500",
  factura: "bg-amber-400",
  facturaVencida: "bg-orange-500",
};

function estiloDe(item: Item, hoy: string): keyof typeof ESTILO {
  if (item.tipo === "fijo") return item.fijo.estado;
  if (item.tipo === "pago") return "pago";
  return item.doc.vence < hoy ? "facturaVencida" : "factura";
}

const sumarMes = (mes: string, n: number) => {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 7);
};

export function CalendarioPagosCxP({
  mes,
  setMes,
  hoy,
  empresa,
  documentos,
  pagos,
  fijos,
  fijosError,
  docAbierto,
  onVerDocumento,
  onCambio,
}: {
  mes: string;
  setMes: (m: string) => void;
  hoy: string;
  empresa: string;
  documentos: DocumentoCxP[];
  pagos: PagoProveedor[];
  fijos: PagoFijoDelMes[];
  fijosError: boolean;
  /** El modal de una factura esta abierto: el del dia se esconde mientras tanto. */
  docAbierto: boolean;
  onVerDocumento: (id: number) => void;
  /** Vuelve a leer los datos sin vaciar la pantalla. */
  onCambio: () => Promise<void>;
}) {
  const [a, m] = mes.split("-").map(Number);
  const diasDelMes = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const blancos = (new Date(Date.UTC(a, m - 1, 1)).getUTCDay() + 6) % 7;
  const [dia, setDia] = useState<string | null>(null);
  const [pagoVer, setPagoVer] = useState<number | null>(null);
  const [editando, setEditando] = useState<PagoFijoDelMes | "nuevo" | null>(null);
  const [actualizando, setActualizando] = useState(false);
  const [actualizadoA, setActualizadoA] = useState(() => new Date());
  useEffect(() => setActualizadoA(new Date()), [pagos, fijos]);

  const abrirDia = (fecha: string, pagoId: number | null = null) => {
    setDia(fecha);
    setPagoVer(pagoId);
  };
  const actualizar = async () => {
    setActualizando(true);
    await onCambio();
    setActualizando(false);
  };

  const porDia = useMemo(() => {
    const mapa = new Map<string, Item[]>();
    const poner = (fecha: string, item: Item) => mapa.set(fecha, [...(mapa.get(fecha) || []), item]);
    const fijoDePago = new Map(fijos.filter((f) => f.pagoId).map((f) => [f.pagoId!, f.nombre]));
    fijos.forEach((f) => poner(f.fecha, { tipo: "fijo", fijo: f }));
    pagos.forEach((p) => poner(p.fecha, { tipo: "pago", pago: p, deFijo: fijoDePago.get(p.id) ?? null }));
    documentos
      .filter((d) => d.tipo === "factura" && d.vence.startsWith(mes))
      .forEach((d) => poner(d.vence, { tipo: "factura", doc: d }));
    return mapa;
  }, [fijos, pagos, documentos, mes]);

  const totales = useMemo(() => {
    const suma = (l: { monto: number }[]) => l.reduce((s, x) => s + x.monto, 0);
    const pagados = fijos.filter((f) => f.estado === "pagado");
    const facturas = documentos.filter((d) => d.tipo === "factura" && d.vence.startsWith(mes));
    return {
      fijos: suma(fijos),
      fijosPagados: pagados.length,
      fijosPorPagar: suma(fijos.filter((f) => f.estado !== "pagado")),
      fijosVencidos: fijos.filter((f) => f.estado === "vencido").length,
      pagado: suma(pagos),
      facturas: facturas.reduce((s, d) => s + d.saldo, 0),
      nFacturas: facturas.length,
    };
  }, [fijos, pagos, documentos, mes]);

  const nombreMes = new Date(Date.UTC(a, m - 1, 15)).toLocaleDateString("es-VE", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const delDia = dia ? porDia.get(dia) || [] : [];

  const quitar = async (f: PagoFijoDelMes) => {
    if (!confirm(`¿Quitar el pago fijo "${f.nombre}"? Deja de salir desde este mes; los meses anteriores lo conservan.`)) return;
    const res = await fetch(`/api/administracion/cuentas-por-pagar/pagos-fijos?id=${f.id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!json.success) return alert(json.error || "No se pudo quitar");
    await onCambio();
  };

  return (
    <div className="p-3 sm:p-4 space-y-4">
      {fijosError && (
        <Aviso tono="rojo">No se pudieron leer los pagos fijos. Lo que viene de Odoo se muestra igual.</Aviso>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
        <Resumen
          titulo="Pagos fijos del mes"
          valor={money(totales.fijos, 2)}
          detalle={`${totales.fijosPagados} de ${fijos.length} pagados`}
          punto={PUNTO.pendiente}
        />
        <Resumen
          titulo="Fijos por pagar"
          valor={money(totales.fijosPorPagar, 2)}
          detalle={totales.fijosVencidos ? `${totales.fijosVencidos} con el día pasado` : "ninguno atrasado"}
          punto={totales.fijosVencidos ? PUNTO.vencido : PUNTO.pendiente}
        />
        <Resumen
          titulo="Pagado en Odoo"
          valor={money(totales.pagado, 2)}
          detalle={`${pagos.length} pagos a proveedores`}
          punto={PUNTO.pago}
        />
        <Resumen
          titulo="Facturas que vencen"
          valor={money(totales.facturas, 2)}
          detalle={`${totales.nFacturas} abiertas este mes`}
          punto={PUNTO.factura}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMes(sumarMes(mes, -1))} aria-label="Mes anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h3 className="text-lg font-semibold capitalize w-44 text-center">{nombreMes}</h3>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setMes(sumarMes(mes, 1))}
            // El selector de mes ofrece hasta 3 meses adelante.
            disabled={mes >= sumarMes(hoy.slice(0, 7), 3)}
            aria-label="Mes siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!hoy.startsWith(mes) && (
            <Button variant="ghost" size="sm" className="h-8" onClick={() => setMes(hoy.slice(0, 7))}>
              Hoy
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-400 hidden sm:inline">
            Odoo leído a las {actualizadoA.toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" })} · se
            actualiza solo cada 3 min
          </span>
          <Button variant="outline" size="sm" onClick={actualizar} disabled={actualizando}>
            <RefreshCw className={`h-4 w-4 mr-1 ${actualizando ? "animate-spin" : ""}`} /> Actualizar
          </Button>
          <Button size="sm" onClick={() => setEditando("nuevo")} disabled={fijosError}>
            <Plus className="h-4 w-4 mr-1" /> Nuevo pago fijo
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
        <Leyenda punto={PUNTO.pendiente} texto="Pago fijo por pagar" />
        <Leyenda punto={PUNTO.pagado} texto="Pago fijo pagado" />
        <Leyenda punto={PUNTO.vencido} texto="Pago fijo sin pagar, día pasado" />
        <Leyenda punto={PUNTO.pago} texto="Pago registrado en Odoo" />
        <Leyenda punto={PUNTO.factura} texto="Factura que vence" />
      </div>

      <div className="rounded-lg border overflow-hidden">
        <div className="grid grid-cols-7 bg-slate-50 text-xs font-medium text-gray-500 border-b">
          {DIAS.map((d) => (
            <div key={d} className="px-1 sm:px-2 py-1.5 text-center sm:text-left">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: blancos }, (_, i) => (
            <div key={`b${i}`} className="bg-slate-50/60 border-b border-r min-h-16 md:min-h-32" />
          ))}
          {Array.from({ length: diasDelMes }, (_, i) => {
            const fecha = `${mes}-${String(i + 1).padStart(2, "0")}`;
            const items = porDia.get(fecha) || [];
            // El pago de Odoo que ya cubre un pago fijo no se repite en la celda.
            const visibles = items.filter((it) => !(it.tipo === "pago" && it.deFijo));
            const elegido = fecha === dia;
            const totalDia = visibles.reduce(
              (sum, it) => sum + (it.tipo === "fijo" ? it.fijo.monto : it.tipo === "pago" ? it.pago.monto : it.doc.saldo),
              0,
            );
            const esHoy = fecha === hoy;
            const finDeSemana = (blancos + i) % 7 >= 5;
            return (
              <button
                key={fecha}
                type="button"
                onClick={() => abrirDia(fecha)}
                className={`text-left border-b border-r min-h-16 md:min-h-32 p-1 md:p-1.5 flex flex-col gap-0.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  elegido ? "bg-blue-50/70" : finDeSemana ? "bg-slate-50/60 hover:bg-slate-100" : "bg-white hover:bg-slate-50"
                }`}
                aria-label={`${fechaCorta(fecha)}: ${items.length} movimientos`}
                aria-pressed={elegido}
              >
                <span className="flex items-center justify-between gap-1">
                  <span
                    className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full ${
                      esHoy ? "bg-blue-600 text-white" : elegido ? "text-blue-700" : "text-gray-600"
                    }`}
                  >
                    {i + 1}
                  </span>
                  {totalDia > 0 && (
                    <span className="hidden xl:inline text-[10px] font-semibold text-gray-500">{money(totalDia)}</span>
                  )}
                </span>
                {/* Celular: puntos. Pantalla grande: los movimientos. */}
                <div className="flex flex-wrap gap-0.5 md:hidden">
                  {visibles.slice(0, 6).map((it, k) => (
                    <span key={k} className={`h-1.5 w-1.5 rounded-full ${PUNTO[estiloDe(it, hoy)]}`} />
                  ))}
                </div>
                <div className="hidden md:flex flex-col gap-0.5 min-w-0 w-full">
                  {visibles.slice(0, 4).map((it, k) => (
                    <Chip key={k} item={it} hoy={hoy} />
                  ))}
                  {visibles.length > 4 && <span className="text-[10px] text-blue-600 pl-1">+{visibles.length - 4} más</span>}
                </div>
              </button>
            );
          })}
          {Array.from({ length: (7 - ((blancos + diasDelMes) % 7)) % 7 }, (_, i) => (
            <div key={`f${i}`} className="bg-slate-50/60 border-b border-r min-h-16 md:min-h-32" />
          ))}
        </div>
      </div>

      {/* Se esconde mientras esta abierta una factura o el formulario: dos modales a la vez se cierran entre si. */}
      <Dialog
        open={dia !== null && !docAbierto && !editando}
        onOpenChange={(abierto) => {
          if (!abierto) {
            setDia(null);
            setPagoVer(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          {pagoVer !== null ? (
            <DetallePago
              id={pagoVer}
              empresa={empresa}
              volver={() => setPagoVer(null)}
              onVerDocumento={onVerDocumento}
              fijo={fijos.find((f) => f.pagoId === pagoVer)?.nombre ?? null}
            />
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="capitalize">
                  {dia &&
                    new Date(dia + "T12:00:00Z").toLocaleDateString("es-VE", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                      timeZone: "UTC",
                    })}
                </DialogTitle>
                <DialogDescription>
                  {delDia.length === 0 ? "Nada este día." : `${delDia.length} movimientos`}
                </DialogDescription>
              </DialogHeader>
              {delDia.length > 0 && (
                <ul className="divide-y rounded-lg border">
                  {delDia.map((it, k) => (
                    <li key={k} className="px-3 py-2.5 flex items-start gap-3 text-sm">
                      <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${PUNTO[estiloDe(it, hoy)]}`} />
                      <DetalleItem
                        item={it}
                        empresa={empresa}
                        hoy={hoy}
                        onVer={onVerDocumento}
                        onVerPago={setPagoVer}
                        onEditar={setEditando}
                        onQuitar={quitar}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <div className="rounded-lg border">
        <div className="px-3 py-2 border-b bg-slate-50 flex items-center gap-2">
          <Repeat className="h-4 w-4 text-indigo-600" />
          <span className="text-sm font-semibold">Pagos fijos de {nombreMes}</span>
        </div>
        {fijos.length === 0 ? (
          <p className="text-sm text-gray-500 p-3">
            No hay pagos fijos. Registra lo que se paga todos los meses (alquiler, servicios, vigilancia…) con «Nuevo pago
            fijo»: aparece en su día y se marca pagado solo cuando el pago al proveedor se registra en Odoo.
          </p>
        ) : (
          <ul className="divide-y">
            {fijos.map((f) => (
              <li key={f.id} className="px-3 py-2 flex items-start gap-3 text-sm">
                <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${PUNTO[f.estado]}`} />
                <DetalleItem
                  item={{ tipo: "fijo", fijo: f }}
                  empresa={empresa}
                  hoy={hoy}
                  onVer={onVerDocumento}
                  onVerPago={(id) => abrirDia(f.pagadoEl || f.fecha, id)}
                  onEditar={setEditando}
                  onQuitar={quitar}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {editando && (
        <FormPagoFijo
          fijo={editando === "nuevo" ? null : editando}
          empresa={empresa}
          mes={mes}
          onClose={() => setEditando(null)}
          onGuardado={async () => {
            await onCambio();
            setEditando(null);
          }}
        />
      )}
    </div>
  );
}

function Resumen({ titulo, valor, detalle, punto }: { titulo: string; valor: string; detalle: string; punto: string }) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        <span className={`h-2 w-2 rounded-full ${punto}`} />
        {titulo}
      </div>
      <div className="text-lg font-bold text-gray-800 mt-0.5">{valor}</div>
      <div className="text-[11px] text-gray-500">{detalle}</div>
    </div>
  );
}

function Leyenda({ punto, texto }: { punto: string; texto: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${punto}`} />
      {texto}
    </span>
  );
}

function Chip({ item, hoy }: { item: Item; hoy: string }) {
  const [texto, monto] =
    item.tipo === "fijo"
      ? [item.fijo.nombre, item.fijo.montoPagado ?? item.fijo.monto]
      : item.tipo === "pago"
        ? [item.pago.proveedor, item.pago.monto]
        : [item.doc.proveedor, item.doc.saldo];
  return (
    <span
      className={`flex items-center gap-1 rounded border px-1 py-0.5 text-[10.5px] leading-tight min-w-0 ${ESTILO[estiloDe(item, hoy)]}`}
      title={`${texto} · ${money(monto, 2)}`}
    >
      {item.tipo === "fijo" && item.fijo.estado === "pagado" && <CheckCircle2 className="h-3 w-3 shrink-0" />}
      {item.tipo === "fijo" && item.fijo.estado !== "pagado" && <Repeat className="h-3 w-3 shrink-0" />}
      <span className="truncate flex-1">{texto}</span>
      <span className="font-semibold shrink-0 hidden lg:inline">{money(monto)}</span>
    </span>
  );
}

function DetalleItem({
  item,
  empresa,
  hoy,
  onVer,
  onVerPago,
  onEditar,
  onQuitar,
}: {
  item: Item;
  empresa: string;
  hoy: string;
  onVer: (id: number) => void;
  onVerPago: (id: number) => void;
  onEditar: (f: PagoFijoDelMes) => void;
  onQuitar: (f: PagoFijoDelMes) => void;
}) {
  const sede = (s: string) => (!empresa && s ? ` · ${NOMBRE_SEDE[s] || s}` : "");
  if (item.tipo === "fijo") {
    const f = item.fijo;
    return (
      <div className="flex-1 min-w-0 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium break-words">
            {f.nombre} <span className="text-xs font-normal text-gray-400">· pago fijo, día {f.dia}</span>
          </div>
          <div className="text-xs text-gray-500 break-words">
            {f.proveedor}
            {sede(f.sede)}
            {f.notas && ` · ${f.notas}`}
          </div>
          <div className="text-xs mt-0.5">
            {f.estado === "pagado" ? (
              <span className="text-emerald-700">
                Pagado el {fechaCorta(f.pagadoEl)} por {money(f.montoPagado, 2)} (registrado en Odoo)
              </span>
            ) : f.estado === "vencido" ? (
              <span className="text-red-600">Le tocaba el {fechaCorta(f.fecha)}: no hay pago a este proveedor en Odoo este mes</span>
            ) : (
              <span className="text-indigo-700">Le toca el {fechaCorta(f.fecha)}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="font-semibold mr-1">{money(f.monto, 2)}</span>
          {f.pagoId && (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onVerPago(f.pagoId!)}>
              Ver pago
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEditar(f)} aria-label="Editar pago fijo">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600" onClick={() => onQuitar(f)} aria-label="Quitar pago fijo">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    );
  }
  if (item.tipo === "pago") {
    const p = item.pago;
    return (
      <div className="flex-1 min-w-0 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium break-words">{p.proveedor}</div>
          <div className="text-xs text-gray-500 break-words">
            Pago en Odoo · {p.diario}
            {p.referencia && ` · ${p.referencia}`}
            {sede(p.sede)}
          </div>
          {item.deFijo && <div className="text-xs text-emerald-700">Cubre el pago fijo «{item.deFijo}»</div>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-semibold">{money(p.monto, 2)}</span>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onVerPago(p.id)}>
            Ver pago
          </Button>
        </div>
      </div>
    );
  }
  const d = item.doc;
  return (
    <div className="flex-1 min-w-0 flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="font-medium break-words">{d.proveedor}</div>
        <div className="text-xs text-gray-500 break-words">
          Factura {d.numero}
          {d.referencia && ` · Ref. ${d.referencia}`}
          {sede(d.sede)}
        </div>
        <div className={`text-xs ${d.vence < hoy ? "text-orange-700" : "text-amber-700"}`}>
          {d.vence < hoy ? `Venció hace ${d.diasVencido} días y sigue abierta` : "Vence este día"}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="font-semibold">{money(d.saldo, 2)}</span>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onVer(d.id)}>
          Ver
        </Button>
      </div>
    </div>
  );
}

function FormPagoFijo({
  fijo,
  empresa,
  mes,
  onClose,
  onGuardado,
}: {
  fijo: PagoFijoDelMes | null;
  empresa: string;
  mes: string;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [sede, setSede] = useState(fijo?.sede || empresa || "");
  const [nombre, setNombre] = useState(fijo?.nombre || "");
  const [proveedor, setProveedor] = useState<{ id: number; nombre: string } | null>(
    fijo ? { id: fijo.proveedorId, nombre: fijo.proveedor } : null,
  );
  const [buscar, setBuscar] = useState("");
  const [opciones, setOpciones] = useState<{ id: number; nombre: string; rif: string }[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [monto, setMonto] = useState(fijo ? String(fijo.monto) : "");
  const [dia, setDia] = useState(fijo ? String(fijo.dia) : "");
  const [notas, setNotas] = useState(fijo?.notas || "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const q = buscar.trim();
    if (q.length < 2 || !sede) {
      setOpciones([]);
      return;
    }
    let vigente = true;
    const t = setTimeout(async () => {
      setBuscando(true);
      try {
        const res = await fetch(
          `/api/administracion/cuentas-por-pagar/pagos-fijos?empresa=${sede}&q=${encodeURIComponent(q)}`,
        );
        const json = await res.json();
        if (vigente) setOpciones(json.proveedores || []);
      } catch {
        if (vigente) setOpciones([]);
      }
      if (vigente) setBuscando(false);
    }, 300);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [buscar, sede]);

  const guardar = async () => {
    setError("");
    if (!sede) return setError("Elige la sede");
    if (!proveedor) return setError("Elige el proveedor de Odoo");
    setGuardando(true);
    try {
      const res = await fetch("/api/administracion/cuentas-por-pagar/pagos-fijos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: fijo?.id,
          empresa: sede,
          mes,
          nombre,
          proveedorId: proveedor.id,
          proveedor: proveedor.nombre,
          monto: Number(monto),
          dia: Number(dia),
          notas,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!json.success) {
        setError(json.error || "No se pudo guardar");
        setGuardando(false);
        return;
      }
      onGuardado();
    } catch {
      setError("No se pudo guardar");
      setGuardando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{fijo ? "Editar pago fijo" : "Nuevo pago fijo"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {!fijo && !empresa && (
            <label className="block space-y-1">
              <span className="text-gray-600">Sede</span>
              <select
                value={sede}
                onChange={(e) => {
                  setSede(e.target.value);
                  setProveedor(null);
                }}
                className="w-full border rounded-md px-3 py-2 bg-white"
              >
                <option value="">Elige la sede</option>
                {SEDES.map((s) => (
                  <option key={s} value={s}>
                    {NOMBRE_SEDE[s]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block space-y-1">
            <span className="text-gray-600">Nombre</span>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Alquiler del galpón" maxLength={150} />
          </label>
          <div className="space-y-1">
            <span className="text-gray-600">Proveedor en Odoo</span>
            {proveedor ? (
              <div className="flex items-center justify-between gap-2 border rounded-md px-3 py-2 bg-slate-50">
                <span className="break-words">{proveedor.nombre}</span>
                <Button variant="ghost" size="sm" className="h-7" onClick={() => setProveedor(null)}>
                  Cambiar
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Input
                  value={buscar}
                  onChange={(e) => setBuscar(e.target.value)}
                  placeholder={sede ? "Busca por nombre o RIF" : "Primero elige la sede"}
                  disabled={!sede}
                  aria-label="Buscar proveedor"
                />
                {buscando && <Loader2 className="h-4 w-4 animate-spin absolute right-2 top-2.5 text-gray-400" />}
                {opciones.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-auto rounded-md border bg-white shadow-md">
                    {opciones.map((o) => (
                      <li key={o.id}>
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-slate-50"
                          onClick={() => {
                            setProveedor({ id: o.id, nombre: o.nombre });
                            setBuscar("");
                            setOpciones([]);
                          }}
                        >
                          <div>{o.nombre}</div>
                          {o.rif && <div className="text-xs text-gray-400">{o.rif}</div>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <p className="text-[11px] text-gray-500">Se marca pagado cuando en Odoo se registra un pago a este proveedor en el mes.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-gray-600">Monto (USD)</span>
              <Input type="number" min="0" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-gray-600">Día de cada mes</span>
              <Input type="number" min="1" max="31" value={dia} onChange={(e) => setDia(e.target.value)} />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-gray-600">Notas (opcional)</span>
            <Input value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={500} />
          </label>
          {!fijo && (
            <p className="text-[11px] text-gray-500">
              Sale desde este mes en adelante (si estás viendo un mes pasado, desde el mes en curso). Si el mes no tiene
              ese día, cae el último.
            </p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ESTADO_PAGO_DOC: Record<string, string> = {
  paid: "Pagada",
  in_payment: "Pagada (por conciliar)",
  partial: "Pago parcial",
  not_paid: "Sin pagar",
  reversed: "Revertida",
};
const ESTADO_PAGO: Record<string, string> = { posted: "Publicado", draft: "Borrador", canceled: "Anulado", cancel: "Anulado" };

/** Un pago de Odoo con las facturas que pago (dentro del modal del dia). */
function DetallePago({
  id,
  empresa,
  fijo,
  volver,
  onVerDocumento,
}: {
  id: number;
  empresa: string;
  fijo: string | null;
  volver: () => void;
  onVerDocumento: (id: number) => void;
}) {
  const [pago, setPago] = useState<DetallePagoCxP | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let vigente = true;
    setPago(null);
    setError("");
    fetch(`/api/administracion/cuentas-por-pagar/pago?id=${id}&empresa=${empresa}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (!vigente) return;
        if (json.success) setPago(json.pago);
        else setError(json.error || "No se pudo leer el pago");
      })
      .catch(() => vigente && setError("No se pudo leer el pago"));
    return () => {
      vigente = false;
    };
  }, [id, empresa]);

  return (
    <>
      <DialogHeader>
        <button type="button" onClick={volver} className="flex items-center gap-1 text-xs text-blue-700 hover:underline w-fit">
          <ArrowLeft className="h-3.5 w-3.5" /> Volver al día
        </button>
        <DialogTitle className="flex flex-wrap items-center gap-2 pr-6">
          Pago {pago?.numero || ""}
          {fijo && (
            <span className="text-xs font-normal rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5">
              Pago fijo «{fijo}»
            </span>
          )}
        </DialogTitle>
        <DialogDescription>{pago ? pago.proveedor : " "}</DialogDescription>
      </DialogHeader>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!pago && !error && (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-6 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Leyendo el pago en Odoo…
        </div>
      )}

      {pago && (
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Dato titulo="Fecha" valor={fechaCorta(pago.fecha)} />
            <Dato
              titulo="Monto"
              valor={
                pago.moneda !== "USD"
                  ? `${pago.moneda} ${pago.monto.toLocaleString("es-VE", { minimumFractionDigits: 2 })} · ${money(pago.montoUsd, 2)}`
                  : money(pago.montoUsd, 2)
              }
            />
            <Dato titulo="Estado" valor={ESTADO_PAGO[pago.estado] || pago.estado} />
            <Dato titulo="Diario" valor={pago.diario || "—"} />
            <Dato titulo="Método" valor={pago.metodo || "—"} />
            <Dato titulo="Memo / referencia" valor={pago.referencia || "—"} />
            <Dato titulo="Registrado por" valor={pago.registradoPor || "—"} />
            <Dato titulo="Registrado el" valor={fechaCorta(pago.registradoEl)} />
            {!empresa && <Dato titulo="Sede" valor={NOMBRE_SEDE[pago.sede] || pago.sede} />}
          </div>

          <div>
            <div className="font-semibold mb-1.5">Facturas que pagó</div>
            {pago.documentos.length === 0 ? (
              <p className="text-gray-500 rounded-lg border p-3">
                Este pago no está aplicado a ninguna factura en Odoo (anticipo o pago sin conciliar).
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-gray-500">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Documento</th>
                      <th className="px-2 py-2 text-center font-medium hidden sm:table-cell">Fecha</th>
                      <th className="px-2 py-2 text-right font-medium hidden sm:table-cell">Total</th>
                      <th className="px-2 py-2 text-right font-medium">Aplicado</th>
                      <th className="px-2 py-2 text-right font-medium">Saldo</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {pago.documentos.map((d) => (
                      <tr key={d.id}>
                        <td className="px-3 py-2">
                          <div className="font-mono text-xs">
                            {d.numero}
                            {d.tipo === "nota_credito" && <span className="ml-1 text-[10px] text-red-600">NC</span>}
                          </div>
                          <div className="text-[11px] text-gray-400">
                            {d.referencia && `Ref. ${d.referencia} · `}
                            {ESTADO_PAGO_DOC[d.estadoPago] || (d.tipo === "otro" ? "Asiento" : d.estadoPago)}
                          </div>
                        </td>
                        <td className="px-2 py-2 text-center text-xs hidden sm:table-cell">{fechaCorta(d.fecha)}</td>
                        <td className="px-2 py-2 text-right text-xs text-gray-500 hidden sm:table-cell">{money(d.total, 2)}</td>
                        <td className="px-2 py-2 text-right font-semibold">{money(d.aplicado, 2)}</td>
                        <td className={`px-2 py-2 text-right ${d.saldo > 0.01 ? "text-amber-700" : "text-gray-400"}`}>
                          {money(d.saldo, 2)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {d.tipo !== "otro" && (
                            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onVerDocumento(d.id)}>
                              Ver factura
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {pago.sinAplicar > 0.01 && (
              <p className="text-xs text-amber-700 mt-1.5">
                {money(pago.sinAplicar, 2)} de este pago no están aplicados a ninguna factura.
              </p>
            )}
          </div>

          {pago.urlOdoo.startsWith("http") && (
            <a
              href={pago.urlOdoo}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Abrir el pago en Odoo
            </a>
          )}
        </div>
      )}
    </>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-gray-500">{titulo}</div>
      <div className="font-medium break-words">{valor}</div>
    </div>
  );
}
