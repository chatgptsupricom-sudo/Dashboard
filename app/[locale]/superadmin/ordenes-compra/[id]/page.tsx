"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, ArrowLeft, Check, Loader2, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { OrdenEstadoBadge } from "@/components/compras/OrdenEstadoBadge";
import { OrdenForm, type OrdenFormValue } from "@/components/compras/OrdenForm";
import { ESTADO_LABEL, type OrdenDetalle } from "@/lib/compras/ordenes-types";

function detalleToForm(o: OrdenDetalle): OrdenFormValue {
  return {
    company_id: String(o.company_id),
    supplier_odoo_id: o.supplier_odoo_id ? String(o.supplier_odoo_id) : "",
    supplier_name: o.supplier_name ?? "",
    currency: o.currency || "USD",
    expected_date: o.expected_date ? o.expected_date.slice(0, 10) : "",
    notes: o.notes ?? "",
    lines: (o.lines ?? []).map((l) => ({
      id: l.id,
      product_odoo_id: l.product_odoo_id,
      product_code: l.product_code ?? "",
      description: l.description,
      quantity: Number(l.quantity),
      unit_price: Number(l.unit_price),
    })),
  };
}

export default function OrdenSuperadminDetallePage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const locale = (params?.locale as string) || "es";
  const id = params?.id as string;
  const base = `/${locale}/superadmin/ordenes-compra`;

  const [orden, setOrden] = useState<OrdenDetalle | null>(null);
  const [form, setForm] = useState<OrdenFormValue | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [rechazarAbierto, setRechazarAbierto] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/compras/ordenes/${id}`);
      const json = await r.json();
      if (!r.ok || !json.success) throw new Error(json.error || "No encontrada");
      // Mismo contrato #153 que usa la vista de compras: { success, order, lines, history }
      const detalle: OrdenDetalle = {
        ...json.order,
        lines: json.lines ?? [],
        history: json.history ?? [],
      };
      setOrden(detalle);
      setForm(detalleToForm(detalle));
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
      setOrden(null);
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const accion = async (
    tipo: "aprobar" | "rechazar" | "reabrir",
    body?: Record<string, any>,
  ) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/compras/ordenes/${id}/${tipo}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const json = await r.json();
      if (!r.ok || !json.success) {
        // 409: otra persona ya cambio el estado -- avisar y refrescar en
        // vez de dejar el boton colgado con datos viejos.
        throw new Error(json.error || "No se pudo completar la acción");
      }
      const mensajes = {
        aprobar: "Orden aprobada",
        rechazar: "Orden rechazada",
        reabrir: "Orden reabierta a borrador",
      };
      toast({ title: mensajes[tipo] });
      setRechazarAbierto(false);
      setMotivoRechazo("");
      cargar();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
      cargar();
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh] text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Cargando orden…
      </div>
    );
  }
  if (!orden || !form) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-slate-500">
        <AlertTriangle className="h-10 w-10 text-red-400 mb-3" />
        Orden no encontrada.
        <Link href={base} className="mt-3 underline text-sm">
          Volver al listado
        </Link>
      </div>
    );
  }

  const esEnviada = orden.status === "enviada";
  const esAprobada = orden.status === "aprobada";

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={base}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono">
          {orden.order_number}
        </h1>
        <OrdenEstadoBadge estado={orden.status} />
        <span className="text-sm text-slate-400">Creada por {orden.created_by}</span>
      </div>

      {orden.status === "rechazada" && orden.rejection_reason && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40 px-4 py-3">
          <p className="text-sm font-semibold text-red-700 dark:text-red-300">
            Orden rechazada
          </p>
          <p className="text-sm text-red-600 dark:text-red-300/90 mt-0.5">
            {orden.rejection_reason}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 rounded-2xl border-slate-200 dark:border-slate-800">
          <CardContent className="p-6">
            <OrdenForm
              value={form}
              onChange={setForm}
              disabled
              extraActions={
                <>
                  {esAprobada && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => accion("reabrir")}
                    >
                      <RotateCcw className="h-4 w-4 mr-1" /> Reabrir a borrador
                    </Button>
                  )}
                  {esEnviada && (
                    <>
                      <Button
                        variant="outline"
                        className="text-red-600"
                        disabled={busy}
                        onClick={() => setRechazarAbierto(true)}
                      >
                        <X className="h-4 w-4 mr-1" /> Rechazar
                      </Button>
                      <Dialog open={rechazarAbierto} onOpenChange={setRechazarAbierto}>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Rechazar orden</DialogTitle>
                            <DialogDescription>
                              El motivo lo va a ver quien la creó, para que pueda corregirla y
                              reenviarla.
                            </DialogDescription>
                          </DialogHeader>
                          <Textarea
                            value={motivoRechazo}
                            onChange={(e) => setMotivoRechazo(e.target.value)}
                            placeholder="Motivo del rechazo…"
                            rows={3}
                            autoFocus
                          />
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setRechazarAbierto(false)}>
                              Cancelar
                            </Button>
                            <Button
                              variant="destructive"
                              disabled={busy || !motivoRechazo.trim()}
                              onClick={() => accion("rechazar", { reason: motivoRechazo.trim() })}
                            >
                              {busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                              Rechazar
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button disabled={busy}>
                            <Check className="h-4 w-4 mr-1" /> Aprobar
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>¿Aprobar esta orden?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Compras podrá proceder con la compra a {orden.supplier_name}.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => accion("aprobar")}>
                              Aprobar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  )}
                </>
              }
            />
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 dark:border-slate-800 h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold text-slate-700 dark:text-slate-200">
              Historial
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-3">
            {(orden.history ?? []).length === 0 && (
              <p className="text-sm text-slate-400">Sin movimientos.</p>
            )}
            {(orden.history ?? []).map((h) => (
              <div key={h.id} className="text-sm border-l-2 border-slate-200 dark:border-slate-700 pl-3">
                <p className="font-medium text-slate-700 dark:text-slate-200">
                  {h.from_status ? `${ESTADO_LABEL[h.from_status]} → ` : ""}
                  {ESTADO_LABEL[h.to_status]}
                </p>
                <p className="text-xs text-slate-400">
                  {h.changed_by} · {new Date(h.created_at).toLocaleString("es")}
                </p>
                {h.comment && (
                  <p className="text-xs text-slate-500 mt-0.5">{h.comment}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
