"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, PackagePlus, Send } from "lucide-react";
import {
  MovementLines,
  lineaVacia,
  type MovementLine,
} from "@/components/adminleads/material-pop/MovementLines";
import { OdooClientSelect } from "@/components/adminleads/material-pop/OdooClientSelect";
import type { PopProduct } from "@/lib/adminleads/material-pop/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Solicitud = {
  id: number;
  code: string;
  clientName: string;
  deliveryCondition: "inmediata" | "al_comprar";
  odooOrderName: string | null;
  status: "pendiente" | "aprobada" | "rechazada" | "entregada" | "cancelada";
  notes: string | null;
  reviewNotes: string | null;
  reviewedByName: string | null;
  createdAt: string | null;
  items: {
    productId: number;
    code: string;
    name: string;
    brand: string | null;
    imageUrl: string | null;
    quantity: number;
    approvedQuantity: number | null;
  }[];
};

type OrdenOdoo = {
  id: number;
  name: string;
  cliente: string;
  fecha: string | null;
  estado: string;
  total: number;
};

const ESTILO_ESTADO: Record<Solicitud["status"], string> = {
  pendiente: "bg-amber-50 text-amber-700 border-amber-200",
  aprobada: "bg-emerald-50 text-emerald-700 border-emerald-200",
  entregada: "bg-slate-100 text-slate-600 border-slate-200",
  rechazada: "bg-red-50 text-red-700 border-red-200",
  cancelada: "bg-slate-100 text-slate-400 border-slate-200",
};

const fmtFecha = (s: string | null) => {
  if (!s) return "";
  const solo = String(s).split(/[ T]/)[0];
  const [y, m, d] = solo.split("-");
  return `${d}-${m}-${y}`;
};

/**
 * Solicitud de material POP del vendedor.
 *
 * El stock que se ve acá es informativo: quien decide es el adminLeads, que
 * puede aprobar menos de lo pedido si no alcanza.
 */
export function SellerPopPage() {
  const { toast } = useToast();

  const [products, setProducts] = useState<PopProduct[]>([]);
  const [requests, setRequests] = useState<Solicitud[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [lines, setLines] = useState<MovementLine[]>([lineaVacia()]);
  const [client, setClient] = useState<any>(null);
  const [condicion, setCondicion] = useState<"inmediata" | "al_comprar">("inmediata");
  const [orden, setOrden] = useState("");
  const [ordenes, setOrdenes] = useState<OrdenOdoo[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [prodRes, reqRes] = await Promise.all([
        fetch("/api/adminleads/material-pop/products"),
        fetch("/api/vendedores/material-pop/requests"),
      ]);
      const prodJson = await prodRes.json();
      const reqJson = await reqRes.json();
      if (!prodRes.ok) throw new Error(prodJson?.error || "Error cargando productos");
      if (!reqRes.ok) throw new Error(reqJson?.error || "Error cargando solicitudes");
      setProducts(prodJson.products || []);
      setRequests(reqJson.requests || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Órdenes del vendedor para el cliente elegido, para no tipear el número.
  useEffect(() => {
    if (!client?.id) {
      setOrdenes([]);
      return;
    }
    fetch(`/api/vendedores/material-pop/odoo-orders?clientId=${client.id}`)
      .then((r) => r.json())
      .then((j) => setOrdenes(j?.orders || []))
      .catch(() => setOrdenes([]));
  }, [client?.id]);

  async function enviar() {
    setFormError(null);
    const conProducto = lines.filter((l) => l.productId !== null);
    if (conProducto.length === 0) {
      setFormError("Agrega al menos un producto");
      return;
    }
    const items = conProducto.map((l) => ({
      productId: l.productId,
      quantity: Number(l.quantity),
    }));
    if (items.some((it) => !Number.isFinite(it.quantity) || it.quantity <= 0)) {
      setFormError("Cantidad inválida");
      return;
    }
    if (!client) {
      setFormError("Selecciona el cliente que recibe el material");
      return;
    }
    if (condicion === "al_comprar" && !orden.trim()) {
      setFormError("Indica la orden de Odoo: el material se entrega contra la compra");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/vendedores/material-pop/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          clientId: client.id,
          clientName: client.name,
          deliveryCondition: condicion,
          odooOrderName: orden.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFormError(json?.error || "No se pudo enviar la solicitud");
        return;
      }
      toast({
        title: `Solicitud ${json.code} enviada`,
        description: "Queda pendiente de aprobación.",
      });
      setLines([lineaVacia()]);
      setClient(null);
      setOrden("");
      setNotes("");
      setCondicion("inmediata");
      await cargar();
    } catch (e: any) {
      setFormError(e.message || "Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  async function cancelar(id: number) {
    if (!confirm("¿Cancelar esta solicitud? Si ya estaba aprobada, el material queda libre.")) return;
    const res = await fetch("/api/vendedores/material-pop/requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "cancelar" }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast({ title: json?.error || "No se pudo cancelar", variant: "destructive" });
      return;
    }
    await cargar();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Material POP</h1>
        <p className="text-sm text-slate-500">
          Solicita material publicitario para tus clientes · lo aprueba AdminLeads
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="p-10 text-center text-slate-400">
          <Loader2 className="mx-auto h-5 w-5 animate-spin" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Nueva solicitud */}
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <PackagePlus className="h-5 w-5 text-violet-600" />
              <h2 className="font-semibold text-slate-900">Nueva solicitud</h2>
            </div>

            <MovementLines products={products} lines={lines} onChange={setLines} />

            <div>
              <Label>Cliente que recibe el material</Label>
              <div className="mt-1.5">
                <OdooClientSelect value={client} onChange={setClient} />
              </div>
            </div>

            <div>
              <Label>¿Cuándo se entrega?</Label>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                {(
                  [
                    ["inmediata", "De una vez"],
                    ["al_comprar", "Cuando compre"],
                  ] as const
                ).map(([valor, etiqueta]) => (
                  <button
                    key={valor}
                    type="button"
                    onClick={() => setCondicion(valor)}
                    className={cn(
                      "rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
                      condicion === valor
                        ? "border-violet-300 bg-violet-50 text-violet-700"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                    )}
                  >
                    {etiqueta}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label>
                Orden en Odoo {condicion === "al_comprar" ? "(obligatoria)" : "(opcional)"}
              </Label>
              {ordenes.length > 0 && (
                <select
                  value={ordenes.some((o) => o.name === orden) ? orden : ""}
                  onChange={(e) => setOrden(e.target.value)}
                  className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                >
                  <option value="">Elegir una de mis órdenes…</option>
                  {ordenes.map((o) => (
                    <option key={o.id} value={o.name}>
                      {o.name} · {o.estado} · $ {o.total.toLocaleString("es-VE")} ·{" "}
                      {fmtFecha(o.fecha)}
                    </option>
                  ))}
                </select>
              )}
              <Input
                value={orden}
                onChange={(e) => setOrden(e.target.value)}
                placeholder="Ej: S-05457"
                className="mt-1.5"
              />
              <p className="mt-1 text-xs text-slate-400">
                {client
                  ? "Se valida contra Odoo: tiene que existir y ser de este cliente."
                  : "Elige primero el cliente para ver tus órdenes."}
              </p>
            </div>

            <div>
              <Label>Notas</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Para qué es, cuándo lo necesitas…"
                className="mt-1.5"
              />
            </div>

            {formError && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
            )}

            <Button onClick={enviar} disabled={saving} className="w-full gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Enviar solicitud
            </Button>
          </div>

          {/* Mis solicitudes */}
          <div className="space-y-3">
            <h2 className="font-semibold text-slate-900">Mis solicitudes</h2>
            {requests.length === 0 && (
              <p className="rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
                Todavía no has solicitado material
              </p>
            )}
            {requests.map((r) => (
              <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {r.code} · {r.clientName}
                    </p>
                    <p className="text-xs text-slate-500">
                      {fmtFecha(r.createdAt)}
                      {r.odooOrderName ? ` · Orden ${r.odooOrderName}` : ""}
                      {r.deliveryCondition === "al_comprar" ? " · se entrega al comprar" : ""}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "rounded-lg border px-2 py-0.5 text-xs font-semibold capitalize",
                      ESTILO_ESTADO[r.status],
                    )}
                  >
                    {r.status}
                  </span>
                </div>

                <ul className="mt-3 space-y-1 text-sm">
                  {r.items.map((it) => (
                    <li key={it.productId} className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2 text-slate-700">
                        {it.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={it.imageUrl}
                            alt={it.name}
                            loading="lazy"
                            className="h-8 w-8 shrink-0 rounded-md border border-slate-200 bg-white object-contain"
                          />
                        ) : (
                          <span className="h-8 w-8 shrink-0 rounded-md bg-slate-100" />
                        )}
                        <span className="min-w-0 truncate">
                          <span className="font-mono text-[11px] text-slate-400">{it.code}</span>{" "}
                          {it.name}
                          {it.brand ? <span className="text-slate-400"> · {it.brand}</span> : null}
                        </span>
                      </span>
                      <span className="shrink-0 text-slate-600">
                        {it.approvedQuantity != null && it.approvedQuantity !== it.quantity ? (
                          <>
                            <span className="text-slate-400 line-through">{it.quantity}</span>{" "}
                            <strong>{it.approvedQuantity}</strong>
                          </>
                        ) : (
                          it.quantity
                        )}
                      </span>
                    </li>
                  ))}
                </ul>

                {r.reviewNotes && (
                  <p
                    className={cn(
                      "mt-3 rounded-lg px-3 py-2 text-xs",
                      r.status === "rechazada"
                        ? "bg-red-50 text-red-700"
                        : "bg-slate-50 text-slate-600",
                    )}
                  >
                    {r.reviewedByName ? `${r.reviewedByName}: ` : ""}
                    {r.reviewNotes}
                  </p>
                )}

                {/* Aprobada tiene material reservado: cancelar lo libera para
                    otro vendedor. Entregada ya no se toca desde acá. */}
                {(r.status === "pendiente" || r.status === "aprobada") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 h-7 text-xs text-slate-500"
                    onClick={() => cancelar(r.id)}
                  >
                    {r.status === "aprobada" ? "Ya no lo necesito" : "Cancelar solicitud"}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
