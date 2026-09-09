"use client";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MapPin, Plus, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { SEDES } from "@/lib/compras/constants";
import { OrdenesLista } from "@/components/compras/OrdenesLista";
import { OrdenesToolbar, type ChipOption } from "@/components/compras/OrdenesToolbar";
import {
  ESTADO_LABEL,
  type OrdenEstado,
  type OrdenResumen,
} from "@/lib/compras/ordenes-types";

const FILTROS: (OrdenEstado | "todas")[] = [
  "todas",
  "borrador",
  "enviada",
  "aprobada",
  "rechazada",
];

export default function OrdenesCompraPage() {
  const params = useParams();
  const locale = (params?.locale as string) || "es";
  const base = `/${locale}/compras/ordenes`;

  const [ordenes, setOrdenes] = useState<OrdenResumen[]>([]);
  const [loading, setLoading] = useState(true);
  const [estado, setEstado] = useState<(typeof FILTROS)[number]>("todas");
  const [sede, setSede] = useState<string>("todas");
  const [q, setQ] = useState("");

  useEffect(() => {
    let vivo = true;
    setLoading(true);
    fetch(`/api/compras/ordenes`)
      .then((r) => r.json())
      .then((j) => vivo && setOrdenes(j.success ? j.data : []))
      .catch(() => vivo && setOrdenes([]))
      .finally(() => vivo && setLoading(false));
    return () => {
      vivo = false;
    };
  }, []);

  const conteos = useMemo(() => {
    const c: Record<string, number> = { todas: ordenes.length };
    for (const o of ordenes) c[o.status] = (c[o.status] ?? 0) + 1;
    return c;
  }, [ordenes]);

  const chips: ChipOption[] = FILTROS.map((f) => ({
    value: f,
    label: f === "todas" ? "Todas" : ESTADO_LABEL[f],
    count: conteos[f] ?? 0,
  }));

  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase();
    return ordenes.filter((o) => {
      if (estado !== "todas" && o.status !== estado) return false;
      if (sede !== "todas" && String(o.company_id) !== sede) return false;
      if (!t) return true;
      return (
        o.order_number.toLowerCase().includes(t) ||
        o.supplier_name.toLowerCase().includes(t)
      );
    });
  }, [ordenes, estado, sede, q]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="hidden rounded-2xl bg-blue-50 p-3 text-blue-600 dark:bg-blue-950/50 sm:block">
            <ShoppingCart className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100 sm:text-3xl">
              Órdenes de compra
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Crea, edita y envía órdenes a aprobación.
            </p>
          </div>
        </div>
        <Link href={`${base}/nueva`} className="shrink-0">
          <Button className="w-full sm:w-auto">
            <Plus className="mr-1 h-4 w-4" /> Nueva orden
          </Button>
        </Link>
      </div>

      <OrdenesToolbar
        options={chips}
        value={estado}
        onValue={(v) => setEstado(v as typeof estado)}
        q={q}
        onQ={setQ}
        extra={
          <Select value={sede} onValueChange={setSede}>
            <SelectTrigger className="h-9 w-full text-sm sm:w-44">
              <MapPin className="mr-1 h-3.5 w-3.5 shrink-0 text-slate-400" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas las sedes</SelectItem>
              {SEDES.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <OrdenesLista
        ordenes={filtradas}
        loading={loading}
        hrefBase={base}
        emptyText={
          q || estado !== "todas" || sede !== "todas"
            ? "Ninguna orden coincide con el filtro."
            : "Todavía no hay órdenes. Crea la primera."
        }
      />
    </div>
  );
}
