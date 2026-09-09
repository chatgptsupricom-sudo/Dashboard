"use client";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Search } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { SEDES } from "@/lib/compras/constants";
import { OrdenEstadoBadge } from "@/components/compras/OrdenEstadoBadge";
import {
  ESTADO_LABEL,
  fmtMoneda,
  tiempoDesde,
  type OrdenEstado,
  type OrdenResumen,
} from "@/lib/compras/ordenes-types";

// Pestañas de la cola de aprobación (issue #156). "pendientes" no es un
// OrdenEstado real -- es el alias de status=enviada que ve el superadmin
// por defecto al entrar.
const PESTANAS = ["pendientes", "aprobada", "rechazada", "todas"] as const;
type Pestana = (typeof PESTANAS)[number];

const PESTANA_LABEL: Record<Pestana, string> = {
  pendientes: "Pendientes",
  aprobada: "Aprobadas",
  rechazada: "Rechazadas",
  todas: "Todas",
};

function pestanaAStatus(p: Pestana): OrdenEstado | null {
  if (p === "pendientes") return "enviada";
  if (p === "todas") return null;
  return p;
}

function sedeLabel(id: number) {
  return SEDES.find((s) => s.id === String(id))?.label ?? `Sede ${id}`;
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
    setLoading(true);
    const sp = new URLSearchParams();
    const status = pestanaAStatus(pestana);
    if (status) sp.set("status", status);
    fetch(`/api/compras/ordenes?${sp.toString()}`)
      .then((r) => r.json())
      .then((j) => setOrdenes(j.success ? j.data : []))
      .catch(() => setOrdenes([]))
      .finally(() => setLoading(false));
  }, [pestana]);

  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return ordenes;
    return ordenes.filter(
      (o) =>
        o.order_number.toLowerCase().includes(t) ||
        o.supplier_name.toLowerCase().includes(t),
    );
  }, [ordenes, q]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100">
          Órdenes de compra
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Aprueba o rechaza las órdenes que compras envió.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PESTANAS.map((p) => (
          <button
            key={p}
            onClick={() => setPestana(p)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              pestana === p
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            {PESTANA_LABEL[p]}
          </button>
        ))}
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nº o proveedor"
            className="pl-8 w-64"
          />
        </div>
      </div>

      <Card className="rounded-2xl border-slate-200 dark:border-slate-800 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nº</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead>Sede</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-center">Líneas</TableHead>
              <TableHead>Creada por</TableHead>
              <TableHead>Enviada</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-slate-400">
                  <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Cargando…
                </TableCell>
              </TableRow>
            )}
            {!loading && filtradas.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-slate-400">
                  {pestana === "pendientes" ? "No hay órdenes pendientes de aprobación." : "No hay órdenes."}
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              filtradas.map((o) => (
                <TableRow key={o.id} className="cursor-pointer">
                  <TableCell className="font-mono text-xs">
                    <Link href={`${base}/${o.id}`} className="hover:underline">
                      {o.order_number}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link href={`${base}/${o.id}`} className="block">
                      {o.supplier_name}
                    </Link>
                  </TableCell>
                  <TableCell>{sedeLabel(o.company_id)}</TableCell>
                  <TableCell>
                    <OrdenEstadoBadge estado={o.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtMoneda(o.total, o.currency)}
                  </TableCell>
                  <TableCell className="text-center">{o.lines_count}</TableCell>
                  <TableCell className="text-slate-500 text-sm">{o.created_by}</TableCell>
                  <TableCell className="text-slate-500 text-sm">
                    {tiempoDesde(o.submitted_at)}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
