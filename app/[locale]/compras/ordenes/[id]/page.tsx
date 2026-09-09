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
import { useToast } from "@/hooks/use-toast";
import { Loader2, Send, Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  OrdenDetalleEstados,
  OrdenDetalleLayout,
} from "@/components/compras/OrdenDetalleLayout";
import {
  formToPayload,
  type OrdenFormValue,
} from "@/components/compras/OrdenForm";
import { esEditable, type OrdenDetalle } from "@/lib/compras/ordenes-types";

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
      .then(
        (j) =>
          j?.user &&
          setMe({
            id: Number(j.user.id),
            role: String(j.user.role || "").toLowerCase(),
          }),
      )
      .catch(() => {});
  }, [cargar]);

  if (loading || !orden || !form) {
    return (
      <OrdenDetalleEstados loading={loading} notFound={!loading} backHref={base} />
    );
  }

  const soySuperadmin = me?.role === "superadmin";
  const soyCreador = me != null && String(me.id) === String(orden!.created_by_id);
  const editable = esEditable(orden!.status) && (soyCreador || soySuperadmin);

  const guardar = async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/compras/ordenes/${orden!.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formToPayload(form!)),
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
          ? `/api/compras/ordenes/${orden!.id}`
          : `/api/compras/ordenes/${orden!.id}/enviar`;
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
    <OrdenDetalleLayout
      orden={orden!}
      form={form!}
      onFormChange={setForm}
      disabled={!editable}
      saving={busy}
      onSubmit={editable ? guardar : undefined}
      submitLabel="Guardar cambios"
      backHref={base}
      actions={
        editable ? (
          <>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full text-red-600 hover:text-red-700 sm:w-auto"
                  disabled={busy}
                >
                  <Trash2 className="mr-1 h-4 w-4" /> Eliminar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Eliminar esta orden?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Se borra el borrador y no se puede recuperar.
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
                <Button className="w-full sm:w-auto" disabled={busy}>
                  <Send className="mr-1 h-4 w-4" /> Enviar a aprobación
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Enviar a aprobación</AlertDialogTitle>
                  <AlertDialogDescription>
                    Guarda los cambios antes de enviar. Mientras esté en revisión no
                    podrás editarla; el superadmin la aprueba o la devuelve con un
                    motivo.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => accionEstado("enviar")}>
                    {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                    Enviar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : null
      }
    />
  );
}
