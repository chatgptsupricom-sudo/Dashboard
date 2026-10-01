"use client";

import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SEDES } from "@/lib/compras/constants";
import { OrdenEstadoBadge } from "@/components/compras/OrdenEstadoBadge";
import {
  fmtMoneda,
  tiempoDesde,
  type OrdenResumen,
} from "@/lib/compras/ordenes-types";

function sedeLabel(id: number) {
  return SEDES.find((s) => s.id === String(id))?.label ?? `Sede ${id}`;
}

interface Props {
  ordenes: OrdenResumen[];
  loading: boolean;
  hrefBase: string;
  emptyText?: string;
  /** "compras" muestra fecha esperada; "aprobacion" muestra antigüedad de envío. */
  variant?: "compras" | "aprobacion";
}

export function OrdenesLista({
  ordenes,
  loading,
  hrefBase,
  emptyText = "No hay órdenes.",
  variant = "compras",
}: Props) {
  const router = useRouter();

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-3xl border border-slate-200 bg-white py-16 text-slate-400 dark:border-slate-800 dark:bg-slate-900">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando órdenes…
      </div>
    );
  }

  if (ordenes.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-200 bg-white py-16 text-center text-slate-400 dark:border-slate-800 dark:bg-slate-900">
        {emptyText}
      </div>
    );
  }

  const ultimaCol = variant === "aprobacion" ? "Enviada" : "Fecha esperada";

  return (
    <>
      {/* Móvil: tarjetas */}
      <div className="space-y-2.5 md:hidden">
        {ordenes.map((o) => (
          <Link
            key={o.id}
            href={`${hrefBase}/${o.id}`}
            className="block rounded-2xl border border-slate-200 bg-white p-4 transition-colors hover:border-slate-300 active:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                {o.order_number}
              </span>
              <OrdenEstadoBadge estado={o.status} />
            </div>
            <p className="mt-1.5 truncate text-sm text-slate-600 dark:text-slate-300">
              {o.supplier_name}
            </p>
            <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
              <span>
                {sedeLabel(o.company_id)} · {o.lines_count} líneas
              </span>
              <span className="text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {fmtMoneda(o.total, o.currency)}
              </span>
            </div>
            <div className="mt-1 text-xs text-slate-400">
              {ultimaCol}:{" "}
              {variant === "aprobacion"
                ? tiempoDesde(o.submitted_at)
                : o.expected_date
                  ? o.expected_date.slice(0, 10)
                  : "—"}{" "}
              · {o.created_by}
            </div>
          </Link>
        ))}
      </div>

      {/* Escritorio: tabla */}
      <Card className="hidden overflow-hidden rounded-3xl border-slate-200 shadow-sm dark:border-slate-800 md:block">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="whitespace-nowrap">Nº</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead className="whitespace-nowrap">Sede</TableHead>
                <TableHead className="whitespace-nowrap">Estado</TableHead>
                <TableHead className="whitespace-nowrap text-right">Total</TableHead>
                <TableHead className="whitespace-nowrap text-center">Líneas</TableHead>
                <TableHead className="whitespace-nowrap">{ultimaCol}</TableHead>
                <TableHead>Creada por</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordenes.map((o) => (
                <TableRow
                  key={o.id}
                  className="group cursor-pointer"
                  onClick={() => router.push(`${hrefBase}/${o.id}`)}
                >
                  <TableCell className="whitespace-nowrap font-mono text-xs font-medium">
                    <Link
                      href={`${hrefBase}/${o.id}`}
                      className="hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {o.order_number}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-[16rem] truncate" title={o.supplier_name}>
                    {o.supplier_name}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-slate-500">
                    {sedeLabel(o.company_id)}
                  </TableCell>
                  <TableCell>
                    <OrdenEstadoBadge estado={o.status} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">
                    {fmtMoneda(o.total, o.currency)}
                  </TableCell>
                  <TableCell className="text-center text-slate-500">
                    {o.lines_count}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-slate-500">
                    {variant === "aprobacion"
                      ? tiempoDesde(o.submitted_at)
                      : o.expected_date
                        ? o.expected_date.slice(0, 10)
                        : "—"}
                  </TableCell>
                  <TableCell className="max-w-[12rem] truncate text-sm text-slate-500" title={o.created_by}>
                    {o.created_by}
                  </TableCell>
                  <TableCell>
                    <ChevronRight className="h-4 w-4 text-slate-300 transition-colors group-hover:text-slate-500" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </>
  );
}
