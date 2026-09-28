"use client";

import { fechaCorta } from "@/lib/fecha";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import AdjuntosGaleria from "@/components/rma/AdjuntosGaleria";
import { CheckCircle2, Loader2, PackageCheck, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Productos de un envío de servicio técnico (issue #331). RMA recibe el envío
 * como un solo caso pero lo atiende producto por producto: cada uno con su
 * estado, diagnóstico, notas y fotos. El estado del caso lo calcula el
 * servidor a partir de ellos.
 *
 * Con `soloAgregar` se muestra solo el botón para agregar un producto: es lo
 * que ve un caso de un producto, que sigue con su pantalla de siempre.
 */

export const statusColors: Record<string, string> = {
  recibido: "bg-blue-100 text-blue-700 border-blue-200",
  reparado: "bg-green-100 text-green-700 border-green-200",
  nota_credito: "bg-purple-100 text-purple-700 border-purple-200",
  no_procesado: "bg-red-100 text-red-700 border-red-200",
  reingresado: "bg-cyan-100 text-cyan-700 border-cyan-200",
  nc_revision: "bg-orange-100 text-orange-700 border-orange-200",
};

export const statusLabels: Record<string, string> = {
  recibido: "Recibido",
  reparado: "Reparado",
  nota_credito: "Nota de Crédito",
  no_procesado: "No Procesado",
  reingresado: "Reingresado",
  nc_revision: "NC en revisión",
};

// nc_revision: nota de crédito esperando al Super Admin, el equipo sigue en el taller.
const PENDIENTES = ["recibido", "reingresado", "nc_revision"];

const garantiaColores: Record<string, string> = {
  en_garantia: "bg-emerald-100 text-emerald-700 border-emerald-200",
  vida_util: "bg-violet-100 text-violet-700 border-violet-200",
  vencida: "bg-amber-100 text-amber-800 border-amber-200",
  no_aplica: "bg-amber-100 text-amber-800 border-amber-200",
};
const garantiaTextos: Record<string, string> = {
  en_garantia: "En garantía",
  vida_util: "Vida útil",
  vencida: "Garantía vencida",
  // Equipo que no se compró en Supricom (portal /externo).
  no_aplica: "Sin garantía (equipo externo)",
};

export type ProductoEnvio = {
  id: number;
  orden: number;
  product_code: string | null;
  hardware: string | null;
  brand: string | null;
  model: string | null;
  serial: string | null;
  reported_fault: string | null;
  status: string;
  diagnosis: string | null;
  notes: string | null;
  garantia_estado: string | null;
  garantia_vence: string | null;
  despachado_at: string | null;
};

type Props = {
  caseId: number;
  caseNumber: string;
  locale: string;
  items: ProductoEnvio[];
  adjuntos: any[];
  onCambio: () => void;
  soloAgregar?: boolean;
  /** Equipo externo: Supricom no lo vendió, no hay nota de crédito posible. */
  sinNotaCredito?: boolean;
};

const PRODUCTO_VACIO = { brand: "", model: "", product_code: "", hardware: "", serial: "", reported_fault: "" };

export default function ProductosEnvio({ caseId, caseNumber, locale, items, adjuntos, onCambio, soloAgregar, sinNotaCredito }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  // Cambio de estado de un producto
  const [estadoDe, setEstadoDe] = useState<ProductoEnvio | null>(null);
  const [nuevoEstado, setNuevoEstado] = useState("");
  const [notasCambio, setNotasCambio] = useState("");
  // Edición de diagnóstico, notas y datos
  const [editando, setEditando] = useState<ProductoEnvio | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  // Agregar / quitar
  const [agregando, setAgregando] = useState(false);
  const [nuevo, setNuevo] = useState(PRODUCTO_VACIO);
  const [quitando, setQuitando] = useState<ProductoEnvio | null>(null);
  // Entrega parcial
  const [entregando, setEntregando] = useState(false);
  const [aEntregar, setAEntregar] = useState<number[]>([]);

  const [guardando, setGuardando] = useState(false);

  async function llamar(url: string, method: string, body?: unknown): Promise<boolean> {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(data.error || "No se pudo guardar.");
        return false;
      }
      return true;
    } catch {
      setError("No se pudo guardar.");
      return false;
    } finally {
      setGuardando(false);
    }
  }

  async function guardarEstado() {
    if (!estadoDe || !nuevoEstado) return;
    // La nota de crédito no se pone a mano: se solicita y le llega al Super
    // Admin (lib/rma/notaCredito.ts).
    if (nuevoEstado === "nota_credito") {
      router.push(`/${locale}/rma/nota-credito/solicitar?case=${caseNumber}&item=${estadoDe.id}`);
      return;
    }
    const ok = await llamar(`/api/rma/${caseId}/items/${estadoDe.id}`, "PUT", {
      status: nuevoEstado,
      change_notes: notasCambio,
    });
    if (!ok) return;
    setEstadoDe(null);
    setNuevoEstado("");
    setNotasCambio("");
    onCambio();
  }

  async function guardarEdicion() {
    if (!editando) return;
    const ok = await llamar(`/api/rma/${caseId}/items/${editando.id}`, "PUT", form);
    if (!ok) return;
    setEditando(null);
    onCambio();
  }

  async function agregar() {
    const ok = await llamar(`/api/rma/${caseId}/items`, "POST", nuevo);
    if (!ok) return;
    setAgregando(false);
    setNuevo(PRODUCTO_VACIO);
    onCambio();
  }

  async function quitar() {
    if (!quitando) return;
    const ok = await llamar(`/api/rma/${caseId}/items/${quitando.id}`, "DELETE");
    if (!ok) return;
    setQuitando(null);
    onCambio();
  }

  async function entregar() {
    const ok = await llamar(`/api/rma/${caseId}`, "PUT", { marcar_entregado: true, item_ids: aEntregar });
    if (!ok) return;
    setEntregando(false);
    setAEntregar([]);
    onCambio();
  }

  const atendidos = items.filter((i) => !PENDIENTES.includes(i.status)).length;
  const sinEntregar = items.filter((i) => !i.despachado_at);

  const dialogoAgregar = (
    <Dialog open={agregando} onOpenChange={(o) => { setAgregando(o); if (!o) setError(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar producto al envío</DialogTitle>
          <DialogDescription>
            Otro equipo que llegó en el mismo envío. Se atiende por separado, con su propio estado.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="mb-1 block">Marca</Label>
            <Input value={nuevo.brand} onChange={(e) => setNuevo({ ...nuevo, brand: e.target.value })} />
          </div>
          <div>
            <Label className="mb-1 block">Código</Label>
            <Input value={nuevo.product_code} onChange={(e) => setNuevo({ ...nuevo, product_code: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Label className="mb-1 block">Modelo / producto *</Label>
            <Input value={nuevo.model} onChange={(e) => setNuevo({ ...nuevo, model: e.target.value })} />
          </div>
          <div>
            <Label className="mb-1 block">Categoría</Label>
            <Input value={nuevo.hardware} onChange={(e) => setNuevo({ ...nuevo, hardware: e.target.value })} />
          </div>
          <div>
            <Label className="mb-1 block">Serial</Label>
            <Input className="font-mono" value={nuevo.serial} onChange={(e) => setNuevo({ ...nuevo, serial: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Label className="mb-1 block">Falla reportada *</Label>
            <Textarea rows={3} value={nuevo.reported_fault} onChange={(e) => setNuevo({ ...nuevo, reported_fault: e.target.value })} />
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setAgregando(false)}>Cancelar</Button>
          <Button onClick={agregar} disabled={guardando || !nuevo.model.trim() || !nuevo.reported_fault.trim()}>
            {guardando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Agregar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (soloAgregar) {
    return (
      <>
        <Button variant="outline" size="sm" onClick={() => setAgregando(true)}>
          <Plus className="w-4 h-4 mr-1" />
          Agregar producto
        </Button>
        {dialogoAgregar}
      </>
    );
  }

  return (
    <Card className="rounded-3xl border-none shadow-sm">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle className="text-lg font-semibold text-slate-900">
            Productos del envío ({items.length})
          </CardTitle>
          <p className="text-xs text-slate-500 mt-1">
            {atendidos} de {items.length} atendidos
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {sinEntregar.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                // Por defecto, los que ya terminaron y no han salido.
                setAEntregar(sinEntregar.filter((i) => !PENDIENTES.includes(i.status)).map((i) => i.id));
                setEntregando(true);
              }}
            >
              <PackageCheck className="w-4 h-4 mr-1" />
              Entregar productos
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setAgregando(true)}>
            <Plus className="w-4 h-4 mr-1" />
            Agregar producto
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && !estadoDe && !editando && !agregando && !quitando && !entregando && (
          <p className="text-sm text-red-600">{error}</p>
        )}
        {items.map((item) => {
          const fotos = adjuntos.filter((a) => a.item_id === item.id);
          return (
            <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-400">Producto {item.orden}</p>
                  <p className="font-semibold text-slate-900 break-words">{item.model || item.hardware || "—"}</p>
                  <p className="text-xs text-slate-500">
                    {[item.brand, item.product_code, item.hardware].filter(Boolean).join(" · ") || "—"}
                  </p>
                  {item.serial && <p className="text-xs font-mono text-slate-600 mt-0.5 break-all">{item.serial}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {item.garantia_estado && garantiaTextos[item.garantia_estado] && (
                    <Badge className={`${garantiaColores[item.garantia_estado]} border text-[11px]`}>
                      {garantiaTextos[item.garantia_estado]}
                    </Badge>
                  )}
                  <Badge className={`${statusColors[item.status] || ""} border text-[11px]`}>
                    {statusLabels[item.status] || item.status}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <Label className="text-xs font-medium text-slate-400 uppercase">Falla reportada</Label>
                  <p className="text-slate-700 mt-1 whitespace-pre-wrap">{item.reported_fault || "—"}</p>
                </div>
                <div>
                  <Label className="text-xs font-medium text-slate-400 uppercase">Diagnóstico</Label>
                  <p className="text-slate-700 mt-1 whitespace-pre-wrap">{item.diagnosis || "—"}</p>
                </div>
                {item.notes && (
                  <div className="sm:col-span-2">
                    <Label className="text-xs font-medium text-slate-400 uppercase">Notas</Label>
                    <p className="text-slate-700 mt-1 whitespace-pre-wrap">{item.notes}</p>
                  </div>
                )}
              </div>

              {fotos.length > 0 && <AdjuntosGaleria adjuntos={fotos} />}

              {item.despachado_at && (
                <p className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Entregado el {fechaCorta(item.despachado_at)}
                </p>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => { setEstadoDe(item); setNuevoEstado(""); setNotasCambio(""); setError(null); }}
                >
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  Cambiar estado
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditando(item);
                    setError(null);
                    setForm({
                      brand: item.brand || "",
                      model: item.model || "",
                      product_code: item.product_code || "",
                      serial: item.serial || "",
                      diagnosis: item.diagnosis || "",
                      notes: item.notes || "",
                    });
                  }}
                >
                  <Pencil className="w-4 h-4 mr-1" />
                  Diagnóstico y datos
                </Button>
                {items.length > 1 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() => { setQuitando(item); setError(null); }}
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Quitar
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>

      {/* Cambiar estado */}
      <Dialog open={!!estadoDe} onOpenChange={(o) => { if (!o) setEstadoDe(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar estado</DialogTitle>
            <DialogDescription>{estadoDe?.model || estadoDe?.hardware}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {Object.entries(statusLabels)
                .filter(([k]) => k !== estadoDe?.status && k !== "nc_revision")
                .filter(([k]) => !(sinNotaCredito && k === "nota_credito"))
                // Solo se pide de un equipo que sigue en revisión.
                .filter(([k]) => k !== "nota_credito" || ["recibido", "reingresado"].includes(estadoDe?.status || ""))
                .map(([k, label]) => (
                  <Button
                    key={k}
                    variant={nuevoEstado === k ? "default" : "outline"}
                    className={nuevoEstado === k ? "bg-blue-600 text-white" : ""}
                    onClick={() => setNuevoEstado(k)}
                  >
                    {k === "nota_credito" ? "Solicitar nota de crédito" : label}
                  </Button>
                ))}
            </div>
            <div>
              <Label className="mb-2 block">Notas del cambio</Label>
              <Textarea rows={3} value={notasCambio} onChange={(e) => setNotasCambio(e.target.value)} />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEstadoDe(null)}>Cancelar</Button>
            <Button onClick={guardarEstado} disabled={!nuevoEstado || guardando}>
              {guardando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diagnóstico y datos */}
      <Dialog open={!!editando} onOpenChange={(o) => { if (!o) setEditando(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Diagnóstico y datos</DialogTitle>
            <DialogDescription>{editando?.model || editando?.hardware}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              ["brand", "Marca"],
              ["product_code", "Código"],
              ["model", "Modelo / producto"],
              ["serial", "Serial"],
            ].map(([k, label]) => (
              <div key={k} className={k === "model" ? "sm:col-span-2" : undefined}>
                <Label className="mb-1 block">{label}</Label>
                <Input
                  className={k === "serial" ? "font-mono" : undefined}
                  value={form[k] ?? ""}
                  onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                />
              </div>
            ))}
            <div className="sm:col-span-2">
              <Label className="mb-1 block">Diagnóstico</Label>
              <Textarea rows={3} value={form.diagnosis ?? ""} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label className="mb-1 block">Notas</Label>
              <Textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button onClick={guardarEdicion} disabled={guardando}>
              {guardando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quitar */}
      <Dialog open={!!quitando} onOpenChange={(o) => { if (!o) setQuitando(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quitar producto del envío</DialogTitle>
            <DialogDescription>
              {quitando?.model || quitando?.hardware} deja de ser parte de este envío. Sus fotos quedan en el caso.
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuitando(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={quitar} disabled={guardando}>
              {guardando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Quitar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Entrega parcial */}
      <Dialog open={entregando} onOpenChange={(o) => { if (!o) setEntregando(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Entregar productos</DialogTitle>
            <DialogDescription>
              Marca los que el cliente se lleva ahora. El envío queda entregado cuando sale el último.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {sinEntregar.map((i) => (
              <label key={i.id} className="flex items-start gap-2 rounded-xl border border-slate-200 px-3 py-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={aEntregar.includes(i.id)}
                  onChange={(e) =>
                    setAEntregar((p) => (e.target.checked ? [...p, i.id] : p.filter((x) => x !== i.id)))
                  }
                />
                <span className="min-w-0 text-sm">
                  <span className="font-medium text-slate-800 break-words">{i.model || i.hardware}</span>
                  <span className="ml-2 text-xs text-slate-500">{statusLabels[i.status] || i.status}</span>
                  {i.serial && <span className="block font-mono text-xs text-slate-500">{i.serial}</span>}
                </span>
              </label>
            ))}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEntregando(false)}>Cancelar</Button>
            <Button onClick={entregar} disabled={guardando || !aEntregar.length}>
              {guardando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Marcar como entregados
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {dialogoAgregar}
    </Card>
  );
}
