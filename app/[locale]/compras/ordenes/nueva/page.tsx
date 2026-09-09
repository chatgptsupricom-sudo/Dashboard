"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import {
  OrdenForm,
  formToPayload,
  ordenFormVacia,
  type OrdenFormValue,
} from "@/components/compras/OrdenForm";

export default function NuevaOrdenPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const locale = (params?.locale as string) || "es";
  const base = `/${locale}/compras/ordenes`;

  const [value, setValue] = useState<OrdenFormValue>(ordenFormVacia());
  const [saving, setSaving] = useState(false);

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
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <Link href={base}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100">
          Nueva orden de compra
        </h1>
      </div>

      <Card className="rounded-2xl border-slate-200 dark:border-slate-800">
        <CardContent className="p-6">
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
