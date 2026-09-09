"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  OrdenForm,
  formToPayload,
  ordenFormVacia,
  type OrdenFormValue,
} from "@/components/compras/OrdenForm";
import type { OrdenLinea } from "@/lib/compras/ordenes-types";

// Clave que usa /compras/sugeridos para prellenar líneas al crear una orden.
const OC_PREFILL_KEY = "oc_prefill_lines";

export default function NuevaOrdenPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const locale = (params?.locale as string) || "es";
  const base = `/${locale}/compras/ordenes`;

  const [value, setValue] = useState<OrdenFormValue>(ordenFormVacia());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(OC_PREFILL_KEY);
      if (!raw) return;
      sessionStorage.removeItem(OC_PREFILL_KEY);
      const lines = JSON.parse(raw) as OrdenLinea[];
      if (Array.isArray(lines) && lines.length > 0) {
        setValue((v) => ({ ...v, lines }));
        toast({
          title: "Líneas prellenadas",
          description: `${lines.length} producto(s) desde Sugeridos`,
        });
      }
    } catch {
      /* prefill inválido: se ignora */
    }
  }, [toast]);

  const guardar = async () => {
    setSaving(true);
    try {
      const r = await fetch("/api/compras/ordenes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formToPayload(value)),
      });
      const json = await r.json();
      if (!r.ok || !json.success) {
        throw new Error(json.error || "No se pudo crear la orden");
      }
      toast({ title: "Orden creada", description: json.order?.order_number });
      router.push(`${base}/${json.order.id}`);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center gap-2">
        <Link href={base}>
          <Button variant="ghost" size="icon" className="-ml-2 h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100 sm:text-3xl">
          Nueva orden de compra
        </h1>
      </div>

      <Card className="rounded-3xl border-slate-200 shadow-sm dark:border-slate-800">
        <CardContent className="p-5 sm:p-6">
          <OrdenForm
            value={value}
            onChange={setValue}
            onSubmit={guardar}
            submitLabel="Crear borrador"
            saving={saving}
          />
        </CardContent>
      </Card>
    </div>
  );
}
