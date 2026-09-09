"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, MapPin, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { SEDES } from "@/lib/compras/constants";
import { OrdenEstadoBadge } from "@/components/compras/OrdenEstadoBadge";
import {
  ESTADO_LABEL,
  fmtMoneda,
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

function sedeLabel(id: number) {
  return SEDES.find((s) => s.id === String(id))?.label ?? `Sede ${id}`;
}

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
    setLoading(true);
    const sp = new URLSearchParams();
    if (estado !== "todas") sp.set("status", estado);
    if (sede !== "todas") sp.set("sede", sede);
    fetch(`/api/compras/ordenes?${sp.toString()}`)
      .then((r) => r.json())
      .then((j) => setOrdenes(j.success ? j.data : []))
      .catch(() => setOrdenes([]))
      .finally(() => setLoading(false));
  }, [estado, sede]);

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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100">
            Órdenes de compra
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Crea, edita y envía órdenes a aprobación.
          </p>
        </div>
        <Link href={`${base}/nueva`}>
          <Button>
            <Plus className="h-4 w-4 mr-1" /> Nueva orden
          </Button>
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTROS.map((f) => (
          <button
            key={f}
            onClick={() => setEstado(f)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              estado === f
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            {f === "todas" ? "Todas" : ESTADO_LABEL[f]}
          </button>
        ))}
        <div className="flex items-center gap-2 ml-auto">
          <Select value={sede} onValueChange={setSede}>
            <SelectTrigger className="w-44 h-9 text-sm">
              <MapPin className="h-3.5 w-3.5 text-slate-400 mr-1" />
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
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nº o proveedor"
              className="pl-8 w-64"
            />
          </div>
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
              <TableHead>Fecha esperada</TableHead>
              <TableHead>Creada por</TableHead>
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
                  No hay órdenes.
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
                  <TableCell>{o.expected_date ?? "—"}</TableCell>
                  <TableCell className="text-slate-500 text-sm">{o.created_by}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
