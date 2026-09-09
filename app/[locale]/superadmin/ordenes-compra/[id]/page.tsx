"use client";

import { Button } from "@/components/ui/button";
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
import { Check, Loader2, RotateCcw, X } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  OrdenDetalleEstados,
  OrdenDetalleLayout,
} from "@/components/compras/OrdenDetalleLayout";
import { type OrdenFormValue } from "@/components/compras/OrdenForm";
import { type OrdenDetalle } from "@/lib/compras/ordenes-types";

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
      if (!r.ok || !json.success)
        throw new Error(json.error || "No se pudo completar la acción");
      const mensajes = {
        aprobar: "Orden aprobada",
        rechazar: "Orden devuelta a compras",
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

  if (loading || !orden || !form) {
    return (
      <OrdenDetalleEstados loading={loading} notFound={!loading} backHref={base} />
    );
  }

  const esEnviada = orden.status === "enviada";
  const esAprobada = orden.status === "aprobada";

  return (
    <OrdenDetalleLayout
      orden={orden}
      form={form}
      onFormChange={setForm}
      disabled
      backHref={base}
      actions={
        <>
          {esAprobada && (
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              disabled={busy}
              onClick={() => accion("reabrir")}
            >
              <RotateCcw className="mr-1 h-4 w-4" /> Reabrir a borrador
            </Button>
          )}

          {esEnviada && (
            <>
              <Button
                variant="outline"
                className="w-full text-red-600 hover:text-red-700 sm:w-auto"
                disabled={busy}
                onClick={() => setRechazarAbierto(true)}
              >
                <X className="mr-1 h-4 w-4" /> Rechazar
              </Button>

              <Dialog open={rechazarAbierto} onOpenChange={setRechazarAbierto}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Rechazar orden</DialogTitle>
                    <DialogDescription>
                      Quien la creó verá este motivo para corregirla y volver a
                      enviarla.
                    </DialogDescription>
                  </DialogHeader>
                  <Textarea
                    value={motivoRechazo}
                    onChange={(e) => setMotivoRechazo(e.target.value)}
                    placeholder="Qué hay que corregir…"
                    rows={3}
                    autoFocus
                  />
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setRechazarAbierto(false)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={busy || !motivoRechazo.trim()}
                      onClick={() =>
                        accion("rechazar", { reason: motivoRechazo.trim() })
                      }
                    >
                      {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                      Rechazar
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button className="w-full sm:w-auto" disabled={busy}>
                    <Check className="mr-1 h-4 w-4" /> Aprobar
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
  );
}
