"use client";

import { ClipboardCheck } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { OrdenesLista } from "@/components/compras/OrdenesLista";
import { OrdenesToolbar, type ChipOption } from "@/components/compras/OrdenesToolbar";
import { type OrdenEstado, type OrdenResumen } from "@/lib/compras/ordenes-types";

// "pendientes" es el alias de status=enviada que el superadmin ve al entrar.
const PESTANAS = ["pendientes", "aprobada", "rechazada", "todas"] as const;
type Pestana = (typeof PESTANAS)[number];

const PESTANA_LABEL: Record<Pestana, string> = {
  pendientes: "Pendientes",
  aprobada: "Aprobadas",
  rechazada: "Rechazadas",
  todas: "Todas",
};

function coincide(o: OrdenResumen, p: Pestana): boolean {
  if (p === "todas") return true;
  if (p === "pendientes") return o.status === "enviada";
  return o.status === (p as OrdenEstado);
}

export default function OrdenesCompraSuperadminPage() {
  const params = useParams();
  const locale = (params?.locale as string) || "es";
  const base = `/${locale}/superadmin/ordenes-compra`;

  const [ordenes, setOrdenes] = useState<OrdenResumen[]>([]);
  const [loading, setLoading] = useState(true);
  const [pestana, setPestana] = useState<Pestana>("pendientes");
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

  const chips: ChipOption[] = PESTANAS.map((p) => ({
    value: p,
    label: PESTANA_LABEL[p],
    count: ordenes.filter((o) => coincide(o, p)).length,
  }));

  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase();
    return ordenes.filter((o) => {
      if (!coincide(o, pestana)) return false;
      if (!t) return true;
      return (
        o.order_number.toLowerCase().includes(t) ||
        o.supplier_name.toLowerCase().includes(t)
      );
    });
  }, [ordenes, pestana, q]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="hidden rounded-2xl bg-blue-50 p-3 text-blue-600 dark:bg-blue-950/50 sm:block">
          <ClipboardCheck className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100 sm:text-3xl">
            Órdenes de compra
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Aprueba o rechaza las órdenes que compras envió.
          </p>
        </div>
      </div>

      <OrdenesToolbar
        options={chips}
        value={pestana}
        onValue={(v) => setPestana(v as Pestana)}
        q={q}
        onQ={setQ}
      />

      <OrdenesLista
        ordenes={filtradas}
        loading={loading}
        hrefBase={base}
        variant="aprobacion"
        emptyText={
          pestana === "pendientes"
            ? "No hay órdenes pendientes de aprobación."
            : "Ninguna orden coincide con el filtro."
        }
      />
    </div>
  );
}
