"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Loader2, PackageCheck, Printer, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Item = {
  productId: number;
  code: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  quantity: number;
  approvedQuantity: number | null;
  stockTotal: number;
  stockOffice: number;
  stockWarehouse: number;
  reservadoOtras: number;
};

type Solicitud = {
  id: number;
  code: string;
  sellerName: string;
  clientName: string;
  deliveryCondition: "inmediata" | "al_comprar";
  odooOrderName: string | null;
  status: "pendiente" | "aprobada" | "rechazada" | "entregada" | "cancelada";
  notes: string | null;
  reviewNotes: string | null;
  reviewedByName: string | null;
  createdAt: string | null;
  items: Item[];
};

type OrdenOdoo = {
  name: string;
  cliente: string;
  vendedor: string;
  fecha: string | null;
  estado: string;
  total: number;
  lineas: { producto: string; cantidad: number; subtotal: number }[];
};

const ESTILO_ESTADO: Record<Solicitud["status"], string> = {
  pendiente: "bg-amber-50 text-amber-700 border-amber-200",
  aprobada: "bg-emerald-50 text-emerald-700 border-emerald-200",
  entregada: "bg-slate-100 text-slate-600 border-slate-200",
  rechazada: "bg-red-50 text-red-700 border-red-200",
  cancelada: "bg-slate-100 text-slate-400 border-slate-200",
};

const FILTROS = [
  ["pendiente", "Pendientes"],
  ["aprobada", "Aprobadas"],
  ["entregada", "Entregadas"],
  ["", "Todas"],
] as const;

const fmtFecha = (s: string | null) => {
  if (!s) return "";
  const solo = String(s).split(/[ T]/)[0];
  const [y, m, d] = solo.split("-");
  return `${d}-${m}-${y}`;
};

/**
 * Bandeja de solicitudes de los vendedores.
 *
 * Aprobar reserva el material; el stock baja recién al registrar la entrega,
 * que genera las salidas de inventario con el cliente de la solicitud.
 */
export function RequestsTab({ onStockChange }: { onStockChange: () => void }) {
  const { toast } = useToast();
  const [filtro, setFiltro] = useState<string>("pendiente");
  const [requests, setRequests] = useState<Solicitud[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [abierta, setAbierta] = useState<number | null>(null);
  const [orden, setOrden] = useState<OrdenOdoo | null>(null);
  const [aprobadas, setAprobadas] = useState<Record<number, string>>({});
  const [motivo, setMotivo] = useState("");
  const [ubicacion, setUbicacion] = useState<"office" | "warehouse">("office");
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = filtro ? `?status=${filtro}` : "";
      const res = await fetch(`/api/adminleads/material-pop/requests${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "No se pudo cargar");
      setRequests(json.requests || []);
    } catch (e: any) {
      setError(e.message);
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [filtro]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Al abrir una solicitud se lee su orden de Odoo en el momento: si allá
  // cambió o se anuló, hay que verla como está hoy.
  useEffect(() => {
    if (abierta === null) {
      setOrden(null);
      return;
    }
    const solicitud = requests.find((r) => r.id === abierta);
    setAprobadas(
      Object.fromEntries(
        (solicitud?.items || []).map((it) => [
          it.productId,
          String(it.approvedQuantity ?? it.quantity),
        ]),
      ),
    );
    setMotivo("");
    if (!solicitud?.odooOrderName) {
      setOrden(null);
      return;
    }
    fetch(`/api/adminleads/material-pop/requests/${abierta}`)
      .then((r) => r.json())
      .then((j) => setOrden(j?.order || null))
      .catch(() => setOrden(null));
  }, [abierta, requests]);

  async function accion(
    id: number,
    action: "aprobar" | "rechazar" | "entregar" | "cancelar" | "revertir",
  ) {
    setEnviando(true);
    try {
      const body: any = { action };
      if (action === "aprobar") {
        body.approved = Object.fromEntries(
          Object.entries(aprobadas).map(([k, v]) => [k, Number(v)]),
        );
        body.notes = motivo.trim() || null;
      }
      if (action === "rechazar" || action === "revertir") body.notes = motivo.trim() || null;
      if (action === "entregar") body.location = ubicacion;

      const res = await fetch(`/api/adminleads/material-pop/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        toast({ title: json?.error || "No se pudo completar", variant: "destructive" });
        return;
      }
      const titulos: Record<string, string> = {
        aprobar: "Solicitud aprobada",
        rechazar: "Solicitud rechazada",
        entregar: "Entrega registrada",
        cancelar: "Solicitud cancelada",
        revertir: "Entrega revertida: el material volvió al stock",
      };
      toast({ title: titulos[action] });
      // Tras aprobar, la solicitud sale del filtro "Pendientes" y con ella el
      // botón de la nota de entrega, que es justo lo que hace falta en ese
      // momento. Se salta a Aprobadas con la solicitud abierta.
      if (action === "aprobar") {
        setFiltro("aprobada");
      } else {
        setAbierta(null);
      }
      await cargar();
      // Entregar y revertir mueven stock; cancelar libera la reserva. Los tres
      // cambian lo que muestra el catálogo.
      onStockChange();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
        {FILTROS.map(([valor, etiqueta]) => (
          <button
            key={etiqueta}
            type="button"
            onClick={() => setFiltro(valor)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              filtro === valor ? "bg-white text-slate-900 shadow-sm" : "text-slate-500",
            )}
          >
            {etiqueta}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {loading && (
        <div className="p-8 text-center text-slate-400">
          <Loader2 className="mx-auto h-5 w-5 animate-spin" />
        </div>
      )}

      {!loading && requests.length === 0 && (
        <p className="rounded-2xl border-2 border-dashed border-slate-200 p-10 text-center text-sm text-slate-400">
          No hay solicitudes en este estado
        </p>
      )}

      {!loading &&
        requests.map((r) => {
          const abiertaEsta = abierta === r.id;
          return (
            <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <button
                type="button"
                onClick={() => setAbierta(abiertaEsta ? null : r.id)}
                className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
              >
                <div>
                  <p className="font-semibold text-slate-900">
                    {r.code} · {r.clientName}
                  </p>
                  <p className="text-xs text-slate-500">
                    {r.sellerName} · {fmtFecha(r.createdAt)} · {r.items.length} producto
                    {r.items.length === 1 ? "" : "s"}
                    {r.odooOrderName ? ` · Orden ${r.odooOrderName}` : ""}
                    {r.deliveryCondition === "al_comprar" ? " · se entrega al comprar" : ""}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-lg border px-2 py-0.5 text-xs font-semibold capitalize",
                    ESTILO_ESTADO[r.status],
                  )}
                >
                  {r.status}
                </span>
              </button>

              {abiertaEsta && (
                <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
                  {r.notes && (
                    <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      {r.notes}
                    </p>
                  )}

                  <table className="w-full text-sm">
                    <thead className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="pb-2">Producto</th>
                        <th className="pb-2 text-right">Pedido</th>
                        <th className="pb-2 text-right">Stock</th>
                        <th className="pb-2 text-right">Reservado</th>
                        <th className="pb-2 text-right">Aprobar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.items.map((it) => {
                        const disponible = it.stockTotal - it.reservadoOtras;
                        return (
                          <tr key={it.productId} className="border-t border-slate-100">
                            <td className="py-2 pr-3">
                              <span className="flex items-start gap-2">
                                {it.imageUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={it.imageUrl}
                                    alt={it.name}
                                    loading="lazy"
                                    className="h-10 w-10 shrink-0 rounded-md border border-slate-200 bg-white object-contain"
                                  />
                                ) : (
                                  <span className="h-10 w-10 shrink-0 rounded-md bg-slate-100" />
                                )}
                                <span className="min-w-0">
                                  <span className="font-mono text-[11px] text-slate-400">
                                    {it.code}
                                  </span>{" "}
                                  {it.name}
                                  {it.brand && (
                                    <span className="text-xs text-slate-400"> · {it.brand}</span>
                                  )}
                                  <span className="block text-[11px] text-slate-400">
                                    Oficina {it.stockOffice} · Almacén {it.stockWarehouse}
                                  </span>
                                </span>
                              </span>
                            </td>
                            <td className="py-2 text-right font-medium">{it.quantity}</td>
                            <td
                              className={cn(
                                "py-2 text-right",
                                disponible < it.quantity ? "text-red-600" : "text-slate-600",
                              )}
                            >
                              {disponible}
                            </td>
                            <td className="py-2 text-right text-slate-500">
                              {it.reservadoOtras || "—"}
                            </td>
                            <td className="py-2 pl-3 text-right">
                              {r.status === "pendiente" ? (
                                <Input
                                  type="number"
                                  min="0"
                                  max={it.quantity}
                                  value={aprobadas[it.productId] ?? ""}
                                  onChange={(e) =>
                                    setAprobadas((prev) => ({
                                      ...prev,
                                      [it.productId]: e.target.value,
                                    }))
                                  }
                                  className="h-8 w-20 text-right"
                                />
                              ) : (
                                <span className="font-semibold">
                                  {it.approvedQuantity ?? "—"}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {orden && (
                    <div className="rounded-xl border border-slate-200 p-3">
                      <p className="text-sm font-semibold text-slate-800">
                        Orden {orden.name} · {orden.estado}
                      </p>
                      <p className="text-xs text-slate-500">
                        {orden.cliente} · {orden.vendedor} · {fmtFecha(orden.fecha)} · ${" "}
                        {orden.total.toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                      </p>
                      <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
                        {orden.lineas.map((l, i) => (
                          <li key={i} className="flex justify-between gap-3">
                            <span className="min-w-0 truncate">{l.producto}</span>
                            <span className="shrink-0">
                              {l.cantidad} · ${" "}
                              {l.subtotal.toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {r.odooOrderName && !orden && (
                    <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      No se pudo leer la orden {r.odooOrderName} en Odoo.
                    </p>
                  )}

                  {r.reviewNotes && r.status !== "pendiente" && (
                    <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      {r.reviewedByName ? `${r.reviewedByName}: ` : ""}
                      {r.reviewNotes}
                    </p>
                  )}

                  {r.status === "pendiente" && (
                    <>
                      <div>
                        <Label className="text-xs">Nota / motivo</Label>
                        <Textarea
                          value={motivo}
                          onChange={(e) => setMotivo(e.target.value)}
                          placeholder="Obligatorio si rechazas"
                          className="mt-1"
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          className="gap-1.5"
                          disabled={enviando}
                          onClick={() => accion(r.id, "aprobar")}
                        >
                          <Check className="h-4 w-4" />
                          Aprobar y reservar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-red-600"
                          disabled={enviando}
                          onClick={() => accion(r.id, "rechazar")}
                        >
                          <X className="h-4 w-4" />
                          Rechazar
                        </Button>
                      </div>
                    </>
                  )}

                  {r.status === "aprobada" && (
                    <div className="flex flex-wrap items-end gap-2">
                      <div>
                        <Label className="text-xs">Sale de</Label>
                        <select
                          value={ubicacion}
                          onChange={(e) => setUbicacion(e.target.value as any)}
                          className="mt-1 h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                        >
                          <option value="office">Oficina</option>
                          <option value="warehouse">Almacén</option>
                        </select>
                      </div>
                      <Button
                        size="sm"
                        className="gap-1.5"
                        disabled={enviando}
                        onClick={() => accion(r.id, "entregar")}
                      >
                        <PackageCheck className="h-4 w-4" />
                        Registrar entrega
                      </Button>
                      {/* La nota de entrega sale con la ubicación elegida
                          arriba: es el papel que respalda el traslado. */}
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() =>
                          window.open(
                            `/api/adminleads/material-pop/requests/${r.id}/nota?origen=${ubicacion}`,
                            "_blank",
                          )
                        }
                      >
                        <Printer className="h-4 w-4" />
                        Nota de entrega
                      </Button>
                      {/* Cancelar una aprobada no toca stock: solo libera la
                          reserva, que es derivada. */}
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 text-slate-600"
                        disabled={enviando}
                        onClick={() => {
                          if (confirm("¿Cancelar la solicitud y liberar el material reservado?")) {
                            accion(r.id, "cancelar");
                          }
                        }}
                      >
                        <X className="h-4 w-4" />
                        Cancelar y liberar
                      </Button>
                    </div>
                  )}

                  {r.status === "entregada" && (
                    <div className="space-y-2">
                      <div>
                        <Label className="text-xs">Motivo del reverso</Label>
                        <Textarea
                          value={motivo}
                          onChange={(e) => setMotivo(e.target.value)}
                          placeholder="Por qué vuelve el material"
                          className="mt-1"
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() =>
                            window.open(
                              `/api/adminleads/material-pop/requests/${r.id}/nota`,
                              "_blank",
                            )
                          }
                        >
                          <Printer className="h-4 w-4" />
                          Nota de entrega
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          disabled={enviando}
                          onClick={() => {
                            if (
                              confirm(
                                "¿Revertir la entrega? El material vuelve al stock con un movimiento de entrada y la solicitud queda aprobada otra vez.",
                              )
                            ) {
                              accion(r.id, "revertir");
                            }
                          }}
                        >
                          <Undo2 className="h-4 w-4" />
                          Revertir entrega
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}
