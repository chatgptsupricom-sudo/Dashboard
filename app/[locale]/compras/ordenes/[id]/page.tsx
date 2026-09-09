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
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, ArrowLeft, Loader2, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { OrdenEstadoBadge } from "@/components/compras/OrdenEstadoBadge";
import {
  OrdenForm,
  formToPayload,
  type OrdenFormValue,
} from "@/components/compras/OrdenForm";
import {
  ESTADO_LABEL,
  esEditable,
  type OrdenDetalle,
} from "@/lib/compras/ordenes-types";

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

export default function OrdenDetallePage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const locale = (params?.locale as string) || "es";
  const id = params?.id as string;
  const base = `/${locale}/compras/ordenes`;

  const [orden, setOrden] = useState<OrdenDetalle | null>(null);
  const [form, setForm] = useState<OrdenFormValue | null>(null);
  const [me, setMe] = useState<{ id: number; role: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/compras/ordenes/${id}`);
      const json = await r.json();
      if (!r.ok || !json.success) throw new Error(json.error || "No encontrada");
      // Contrato #153: { success, order, lines, history }
      const detalle: OrdenDetalle = {
        ...json.order,
        lines: json.lines ?? json.order.lines ?? [],
        history: json.history ?? json.order.history ?? [],
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
    fetch("/api/auth/verify")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.user && setMe({ id: Number(j.user.id), role: String(j.user.role || "").toLowerCase() }))
      .catch(() => {});
  }, [cargar]);

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

  const soySuperadmin = me?.role === "superadmin";
  const soyCreador = me != null && String(me.id) === String(orden.created_by_id);
  const editable = esEditable(orden.status) && (soyCreador || soySuperadmin);

  const guardar = async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/compras/ordenes/${orden.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formToPayload(form)),
      });
      const json = await r.json();
      if (!r.ok || !json.success) throw new Error(json.error || "No se pudo guardar");
      toast({ title: "Cambios guardados" });
      cargar();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    } finally {
      setBusy(false);
    }
  };

  const accionEstado = async (accion: "enviar" | "eliminar") => {
    setBusy(true);
    try {
      const method = accion === "eliminar" ? "DELETE" : "POST";
      const url =
        accion === "eliminar"
          ? `/api/compras/ordenes/${orden.id}`
          : `/api/compras/ordenes/${orden.id}/enviar`;
      const r = await fetch(url, { method });
      const json = await r.json();
      if (!r.ok || !json.success) throw new Error(json.error || "Acción fallida");
      if (accion === "eliminar") {
        toast({ title: "Orden eliminada" });
        router.push(base);
        return;
      }
      toast({ title: "Orden enviada a aprobación" });
      cargar();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    } finally {
      setBusy(false);
    }
  };

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
        <span className="text-sm text-slate-400">
          Creada por {orden.created_by}
        </span>
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
              disabled={!editable}
              saving={busy}
              onSubmit={editable ? guardar : undefined}
              submitLabel="Guardar cambios"
              extraActions={
                editable ? (
                  <>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" className="text-red-600" disabled={busy}>
                          <Trash2 className="h-4 w-4 mr-1" /> Eliminar
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>¿Eliminar esta orden?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta acción no se puede deshacer.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => accionEstado("eliminar")}>
                            Eliminar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button disabled={busy}>
                          <Send className="h-4 w-4 mr-1" /> Enviar a aprobación
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Enviar a aprobación</AlertDialogTitle>
                          <AlertDialogDescription>
                            Guarda los cambios antes de enviar. Una vez enviada no
                            podrás editarla hasta que el superadmin la apruebe o
                            rechace.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => accionEstado("enviar")}>
                            Enviar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                ) : null
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
