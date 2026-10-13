"use client";

import { Card } from "@/components/ui/card";
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
import { ChevronDown, ChevronRight, ExternalLink, Loader2, MapPin } from "lucide-react";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { OrdenesToolbar, type ChipOption } from "@/components/compras/OrdenesToolbar";
import { SEDES } from "@/lib/compras/constants";
import { fmtMoneda } from "@/lib/compras/ordenes-types";
import {
  ESTADO_ODOO_LABEL,
  FACTURA_LABEL,
  GRUPO_DE_ESTADO,
  RECEPCION_LABEL,
  type EstadoOdoo,
  type GrupoOdoo,
  type LineaOdoo,
  type OrdenOdoo,
} from "@/lib/compras/ordenesOdoo-types";
import { cn } from "@/lib/utils";

const PESTANAS = ["solicitud", "orden", "cancelada", "todas"] as const;
type Pestana = (typeof PESTANAS)[number];

const PESTANA_LABEL: Record<Pestana, string> = {
  solicitud: "Solicitudes de cotización",
  orden: "Órdenes de compra",
  cancelada: "Canceladas",
  todas: "Todas",
};

const ESTADO_BADGE: Record<EstadoOdoo, string> = {
  draft: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  sent: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  "to approve": "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  purchase: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  done: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  cancel: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

const ODOO_URL = (process.env.NEXT_PUBLIC_ODOO_URL || "https://supricom2.odoo.com").replace(/\/$/, "");
const enlaceOdoo = (id: number) => `${ODOO_URL}/web#id=${id}&model=purchase.order&view_type=form`;

function sedeLabel(id: number) {
  return SEDES.find((s) => s.id === String(id))?.label ?? `Sede ${id}`;
}

/** Odoo guarda en UTC ("2026-10-01 14:00:00"); se muestra el día en Caracas. */
function fecha(s: string | null): string {
  if (!s) return "—";
  const d = new Date(`${s.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return s.slice(0, 10);
  return d.toLocaleDateString("es-VE", {
    timeZone: "America/Caracas",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function EstadoBadge({ estado }: { estado: EstadoOdoo }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        ESTADO_BADGE[estado] ?? ESTADO_BADGE.draft,
      )}
    >
      {ESTADO_ODOO_LABEL[estado] ?? estado}
    </span>
  );
}

/** Recepción y facturación solo dicen algo en una orden confirmada. */
function Avance({ o }: { o: OrdenOdoo }) {
  if (GRUPO_DE_ESTADO[o.state] !== "orden") return <span className="text-slate-300">—</span>;
  const recibida = o.receipt_status === "full";
  const facturada = o.invoice_status === "invoiced";
  return (
    <div className="flex flex-col gap-0.5 text-xs">
      <span className={recibida ? "text-emerald-600" : "text-amber-600"}>
        {RECEPCION_LABEL[o.receipt_status ?? ""] ?? "—"}
      </span>
      <span className={facturada ? "text-emerald-600" : "text-slate-500"}>
        {FACTURA_LABEL[o.invoice_status ?? ""] ?? "—"}
      </span>
    </div>
  );
}

function Lineas({
  o,
  lineas,
  hrefPanel,
}: {
  o: OrdenOdoo;
  lineas: LineaOdoo[] | "cargando" | "error" | undefined;
  hrefPanel: string;
}) {
  const confirmada = GRUPO_DE_ESTADO[o.state] === "orden";
  return (
    <div className="space-y-3 bg-slate-50 px-4 py-3 dark:bg-slate-900/60">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        {o.partner_ref && <span>Ref. proveedor: {o.partner_ref}</span>}
        {o.origin && <span>Origen: {o.origin}</span>}
        {o.date_approve && <span>Confirmada: {fecha(o.date_approve)}</span>}
        {o.date_planned && <span>Llegada prevista: {fecha(o.date_planned)}</span>}
        <span className="ml-auto flex gap-3">
          {o.panel_order_id && (
            <Link href={`${hrefPanel}/${o.panel_order_id}`} className="font-semibold text-blue-600 hover:underline">
              Ver en el panel
            </Link>
          )}
          <a
            href={enlaceOdoo(o.id)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:underline"
          >
            Abrir en Odoo <ExternalLink className="h-3 w-3" />
          </a>
        </span>
      </div>

      {lineas === "cargando" || lineas === undefined ? (
        <div className="flex items-center py-3 text-sm text-slate-400">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando líneas…
        </div>
      ) : lineas === "error" ? (
        <p className="py-3 text-sm text-red-600">No se pudieron leer las líneas de Odoo.</p>
      ) : lineas.length === 0 ? (
        <p className="py-3 text-sm text-slate-400">La orden no tiene líneas.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500">
              <tr className="border-b border-slate-100 dark:border-slate-800">
                <th className="px-3 py-2 text-left font-medium">Código</th>
                <th className="px-3 py-2 text-left font-medium">Producto</th>
                <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                {confirmada && <th className="px-3 py-2 text-right font-medium">Recibido</th>}
                {confirmada && <th className="px-3 py-2 text-right font-medium">Facturado</th>}
                <th className="px-3 py-2 text-right font-medium">Precio</th>
                <th className="px-3 py-2 text-right font-medium">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l) => (
                <tr key={l.id} className="border-b border-slate-50 last:border-0 dark:border-slate-900">
                  <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs">{l.product_code ?? "—"}</td>
                  <td className="max-w-[22rem] truncate px-3 py-1.5" title={l.description}>
                    {l.description}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{l.quantity}</td>
                  {confirmada && (
                    <td
                      className={cn(
                        "px-3 py-1.5 text-right tabular-nums",
                        l.qty_received >= l.quantity ? "text-emerald-600" : "text-amber-600",
                      )}
                    >
                      {l.qty_received}
                    </td>
                  )}
                  {confirmada && <td className="px-3 py-1.5 text-right tabular-nums">{l.qty_invoiced}</td>}
                  <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">
                    {fmtMoneda(l.unit_price, o.currency)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right font-medium tabular-nums">
                    {fmtMoneda(l.subtotal, o.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Todas las órdenes de compra de Odoo (solicitudes de cotización y órdenes
 * confirmadas), solo lectura. Al tocar una fila se despliegan sus líneas.
 */
export function OrdenesOdooLista({ hrefPanel }: { hrefPanel: string }) {
  const [ordenes, setOrdenes] = useState<OrdenOdoo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pestana, setPestana] = useState<Pestana>("todas");
  const [sede, setSede] = useState("todas");
  const [q, setQ] = useState("");
  const [abierta, setAbierta] = useState<number | null>(null);
  const [lineas, setLineas] = useState<Record<number, LineaOdoo[] | "cargando" | "error">>({});

  useEffect(() => {
    let vivo = true;
    fetch(`/api/compras/ordenes/odoo`)
      .then((r) => r.json())
      .then((j) => {
        if (!vivo) return;
        if (j.success) setOrdenes(j.data);
        else setError(j.error || "No se pudieron leer las órdenes de Odoo.");
      })
      .catch(() => vivo && setError("No se pudieron leer las órdenes de Odoo."))
      .finally(() => vivo && setLoading(false));
    return () => {
      vivo = false;
    };
  }, []);

  function alternar(id: number) {
    setAbierta((a) => (a === id ? null : id));
    if (lineas[id] && lineas[id] !== "error") return;
    setLineas((m) => ({ ...m, [id]: "cargando" }));
    fetch(`/api/compras/ordenes/odoo?id=${id}`)
      .then((r) => r.json())
      .then((j) => setLineas((m) => ({ ...m, [id]: j.success ? j.lineas : "error" })))
      .catch(() => setLineas((m) => ({ ...m, [id]: "error" })));
  }

  const deLaSede = useMemo(
    () => (sede === "todas" ? ordenes : ordenes.filter((o) => String(o.company_id) === sede)),
    [ordenes, sede],
  );

  const coincide = (o: OrdenOdoo, p: Pestana) => p === "todas" || GRUPO_DE_ESTADO[o.state] === (p as GrupoOdoo);

  const chips: ChipOption[] = PESTANAS.map((p) => ({
    value: p,
    label: PESTANA_LABEL[p],
    count: deLaSede.filter((o) => coincide(o, p)).length,
  }));

  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase();
    return deLaSede.filter((o) => {
      if (!coincide(o, pestana)) return false;
      if (!t) return true;
      return [o.name, o.supplier_name, o.partner_ref, o.origin].some((v) => v?.toLowerCase().includes(t));
    });
  }, [deLaSede, pestana, q]);

  const total = filtradas.reduce((s, o) => s + (o.state === "cancel" ? 0 : o.amount_total), 0);

  return (
    <div className="space-y-4">
      <OrdenesToolbar
        options={chips}
        value={pestana}
        onValue={(v) => setPestana(v as Pestana)}
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

      {loading ? (
        <div className="flex items-center justify-center rounded-3xl border border-slate-200 bg-white py-16 text-slate-400 dark:border-slate-800 dark:bg-slate-900">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Leyendo órdenes de Odoo…
        </div>
      ) : error ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 py-10 text-center text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      ) : filtradas.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white py-16 text-center text-slate-400 dark:border-slate-800 dark:bg-slate-900">
          Ninguna orden coincide con el filtro.
        </div>
      ) : (
        <>
          <p className="text-xs text-slate-500">
            {filtradas.length} {filtradas.length === 1 ? "orden" : "órdenes"}
            {pestana !== "cancelada" && <> · {fmtMoneda(total)} sin contar canceladas</>}
          </p>

          {/* Móvil: tarjetas */}
          <div className="space-y-2.5 md:hidden">
            {filtradas.map((o) => (
              <div
                key={o.id}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
              >
                <button onClick={() => alternar(o.id)} className="block w-full p-4 text-left">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {o.name}
                    </span>
                    <EstadoBadge estado={o.state} />
                  </div>
                  <p className="mt-1.5 truncate text-sm text-slate-600 dark:text-slate-300">{o.supplier_name}</p>
                  <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                    <span>
                      {sedeLabel(o.company_id)} · {o.lines_count} líneas · {fecha(o.date_order)}
                    </span>
                    <span className="text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">
                      {fmtMoneda(o.amount_total, o.currency)}
                    </span>
                  </div>
                </button>
                {abierta === o.id && <Lineas o={o} lineas={lineas[o.id]} hrefPanel={hrefPanel} />}
              </div>
            ))}
          </div>

          {/* Escritorio: tabla */}
          <Card className="hidden overflow-hidden rounded-3xl border-slate-200 shadow-sm dark:border-slate-800 md:block">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-8" />
                    <TableHead className="whitespace-nowrap">Nº</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead className="whitespace-nowrap">Sede</TableHead>
                    <TableHead className="whitespace-nowrap">Estado</TableHead>
                    <TableHead className="whitespace-nowrap">Recepción / factura</TableHead>
                    <TableHead className="whitespace-nowrap text-right">Total</TableHead>
                    <TableHead className="whitespace-nowrap text-center">Líneas</TableHead>
                    <TableHead className="whitespace-nowrap">Fecha</TableHead>
                    <TableHead>Comprador</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtradas.map((o) => (
                    <Fragment key={o.id}>
                      <TableRow className="group cursor-pointer" onClick={() => alternar(o.id)}>
                        <TableCell>
                          {abierta === o.id ? (
                            <ChevronDown className="h-4 w-4 text-slate-500" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500" />
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-xs font-medium">
                          {o.name}
                          {o.panel_order_id && (
                            <span className="ml-1.5 rounded bg-blue-50 px-1 py-0.5 font-sans text-[10px] font-semibold text-blue-600 dark:bg-blue-950 dark:text-blue-300">
                              panel
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[16rem] truncate" title={o.supplier_name}>
                          {o.supplier_name}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-slate-500">{sedeLabel(o.company_id)}</TableCell>
                        <TableCell>
                          <EstadoBadge estado={o.state} />
                        </TableCell>
                        <TableCell>
                          <Avance o={o} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">
                          {fmtMoneda(o.amount_total, o.currency)}
                        </TableCell>
                        <TableCell className="text-center text-slate-500">{o.lines_count}</TableCell>
                        <TableCell className="whitespace-nowrap text-slate-500">{fecha(o.date_order)}</TableCell>
                        <TableCell className="max-w-[12rem] truncate text-sm text-slate-500" title={o.buyer ?? ""}>
                          {o.buyer ?? "—"}
                        </TableCell>
                      </TableRow>
                      {abierta === o.id && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={10} className="p-0">
                            <Lineas o={o} lineas={lineas[o.id]} hrefPanel={hrefPanel} />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
