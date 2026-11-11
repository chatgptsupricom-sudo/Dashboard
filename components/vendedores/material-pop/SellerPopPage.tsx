"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Loader2, Package, Search, Trash2 } from "lucide-react";
import type { MovementLine } from "@/components/adminleads/material-pop/MovementLines";
import { OdooClientSelect } from "@/components/adminleads/material-pop/OdooClientSelect";
import { tinteDeMarca } from "@/components/adminleads/material-pop/ProductCard";
import { esMarcaUsoInterno, type PopProduct } from "@/lib/adminleads/material-pop/types";
import { Input } from "@/components/ui/input";
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
  pendiente: "bg-amber-50 text-amber-700",
  aprobada: "bg-emerald-50 text-emerald-700",
  entregada: "bg-slate-100 text-slate-600",
  rechazada: "bg-red-50 text-red-700",
  cancelada: "bg-slate-100 text-slate-400",
};

// Paso del seguimiento (Enviada, Aprobada, Entregada). Rechazada y cancelada no llevan.
const PASO: Partial<Record<Solicitud["status"], number>> = { pendiente: 1, aprobada: 2, entregada: 3 };

const SOMBRA = "shadow-[0_1px_2px_rgba(15,23,42,.04),0_10px_30px_rgba(15,23,42,.06)]";

const fmtFecha = (s: string | null) => {
  if (!s) return "";
  const solo = String(s).split(/[ T]/)[0];
  const [y, m, d] = solo.split("-");
  return `${d}-${m}-${y}`;
};

function Segmento<T extends string>({
  valor,
  opciones,
  onChange,
}: {
  valor: T;
  opciones: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-full bg-slate-100 p-1">
      {opciones.map(([v, etiqueta]) => (
        <button
          key={v}
          type="button"
          aria-pressed={valor === v}
          onClick={() => onChange(v)}
          className={cn(
            "h-[34px] rounded-full text-[13px] font-medium text-slate-500 transition-colors",
            valor === v && "bg-white font-semibold text-violet-700 shadow-[0_1px_3px_rgba(15,23,42,.08)]",
          )}
        >
          {etiqueta}
        </button>
      ))}
    </div>
  );
}

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

  const [query, setQuery] = useState("");
  const [marca, setMarca] = useState("");
  // Lo elegido. La cantidad queda como texto para poder borrarla y escribir otra.
  const [lines, setLines] = useState<MovementLine[]>([]);
  // Para un cliente de Odoo o de uso interno (la oficina, quien lo pide).
  const [destino, setDestino] = useState<"cliente" | "interno">("cliente");
  const [client, setClient] = useState<any>(null);
  const [condicion, setCondicion] = useState<"inmediata" | "al_comprar">("inmediata");
  const [orden, setOrden] = useState("");
  const [ordenes, setOrdenes] = useState<OrdenOdoo[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Uso interno: solo material de la marca Supricom.
  const productosElegibles =
    destino === "interno" ? products.filter((p) => esMarcaUsoInterno(p.brand)) : products;

  const marcas = useMemo(
    () =>
      Array.from(new Set(productosElegibles.map((p) => (p.brand || "").trim()).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b, "es"),
      ),
    [productosElegibles],
  );
  const marcaActiva = marcas.includes(marca) ? marca : "";

  const visibles = useMemo(() => {
    const q = query.trim().toLowerCase();
    return productosElegibles.filter(
      (p) =>
        (!marcaActiva || (p.brand || "").trim() === marcaActiva) &&
        (!q || `${p.name} ${p.code}`.toLowerCase().includes(q)),
    );
  }, [productosElegibles, marcaActiva, query]);

  const porId = (id: number | null) => products.find((p) => p.id === id);
  const enCarrito = (id: number) => lines.find((l) => l.productId === id);
  const unidades = lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0);

  // Escribir la cantidad: no pasa de lo disponible. Vacío se deja mientras se
  // escribe; al salir del campo, vacío o 0 lo saca de la solicitud.
  function setCantidad(p: PopProduct, texto: string) {
    let q = texto;
    const n = Number(texto);
    if (texto !== "" && Number.isFinite(n)) {
      const tope = Math.max(0, p.stock_available);
      if (n > tope) q = String(tope);
      if (n < 0) q = "0";
    }
    setLines((prev) =>
      prev.some((l) => l.productId === p.id)
        ? prev.map((l) => (l.productId === p.id ? { ...l, quantity: q } : l))
        : [...prev, { productId: p.id, quantity: q }],
    );
  }

  const quitar = (id: number) => setLines((prev) => prev.filter((l) => l.productId !== id));

  const limpiarSiVacio = (id: number) => {
    const l = enCarrito(id);
    if (l && !(Number(l.quantity) > 0)) quitar(id);
  };

  function sumar(p: PopProduct, delta: number) {
    const actual = Number(enCarrito(p.id)?.quantity) || 0;
    const nueva = Math.min(p.stock_available, actual + delta);
    if (nueva <= 0) quitar(p.id);
    else setCantidad(p, String(nueva));
  }

  function elegirDestino(valor: "cliente" | "interno") {
    setDestino(valor);
    if (valor !== "interno") return;
    // Lo que ya estaba elegido de otra marca sale de la solicitud.
    setLines((prev) => prev.filter((l) => esMarcaUsoInterno(porId(l.productId)?.brand)));
  }

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
    const items = lines.map((l) => ({
      productId: l.productId,
      quantity: Number(l.quantity),
    }));
    if (items.length === 0) {
      setFormError("Agrega al menos un producto");
      return;
    }
    if (items.some((it) => !Number.isFinite(it.quantity) || it.quantity <= 0)) {
      setFormError("Cantidad inválida");
      return;
    }
    const interno = destino === "interno";
    if (interno && !notes.trim()) {
      setFormError("Indica para qué es el material");
      return;
    }
    if (!interno && !client) {
      setFormError("Selecciona el cliente que recibe el material");
      return;
    }
    if (!interno && condicion === "al_comprar" && !orden.trim()) {
      setFormError("Indica la orden de Odoo: el material se entrega contra la compra");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/vendedores/material-pop/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          interno
            ? { items, usoInterno: true, notes: notes.trim() }
            : {
                items,
                clientId: client.id,
                clientName: client.name,
                deliveryCondition: condicion,
                odooOrderName: orden.trim() || null,
                notes: notes.trim() || null,
              },
        ),
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
      setLines([]);
      setClient(null);
      setOrden("");
      setNotes("");
      setCondicion("inmediata");
      setDestino("cliente");
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

  const pendientes = requests.filter((r) => r.status === "pendiente").length;
  const aprobadas = requests.filter((r) => r.status === "aprobada").length;
  const pill = "h-[34px] rounded-full border border-slate-200 bg-white px-3.5 text-[13px] font-medium text-slate-600";
  const etiqueta = "text-[13px] font-medium text-slate-900";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Material POP</h1>
        <p className="text-sm text-slate-500">
          Elige material publicitario para tus clientes o para uso interno. Lo aprueba AdminLeads.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Héroe, del color del menú lateral */}
      <section className="relative grid min-w-0 gap-4 overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#0F172A_0%,#1e293b_60%,#334155_100%)] px-6 py-5 text-white shadow-[0_18px_40px_rgba(15,23,42,.28)]">
        <span className="pointer-events-none absolute -right-24 -top-32 h-[340px] w-[340px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,.14),transparent_70%)]" />
        <span className="pointer-events-none absolute -bottom-36 right-44 h-[220px] w-[220px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,.12),transparent_70%)]" />
        <div className="relative">
          <h2 className="text-[22px] font-bold tracking-tight">Pide material para tus clientes</h2>
          <p className="mt-0.5 text-slate-300">
            Agrega productos del catálogo y envía la solicitud desde el panel de la derecha.
          </p>
        </div>
        <div className="relative grid max-w-[520px] grid-cols-3 gap-2.5">
          {(
            [
              [unidades, "En tu solicitud"],
              [pendientes, "Pendientes"],
              [aprobadas, "Aprobadas"],
            ] as const
          ).map(([n, texto]) => (
            <div key={texto} className="rounded-2xl border border-white/15 bg-white/10 px-3.5 py-2.5">
              <b className="block text-[26px] font-bold leading-tight tabular-nums">{n}</b>
              <span className="text-xs text-slate-300">{texto}</span>
            </div>
          ))}
        </div>
      </section>

      {loading ? (
        <div className="p-10 text-center text-slate-400">
          <Loader2 className="mx-auto h-5 w-5 animate-spin" />
        </div>
      ) : (
        <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          {/* Catálogo */}
          <section className="grid min-w-0 gap-3.5" aria-label="Catálogo">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative min-w-0 flex-[1_1_220px]">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por nombre o SKU"
                  aria-label="Buscar"
                  className="h-[42px] rounded-full border-slate-200 bg-white pl-10"
                />
              </div>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Marca">
                {["", ...marcas].map((b) => (
                  <button
                    key={b || "todas"}
                    type="button"
                    aria-pressed={marcaActiva === b}
                    onClick={() => setMarca(b)}
                    className={cn(pill, marcaActiva === b && "border-transparent bg-violet-600 text-white")}
                  >
                    {b || "Todas"}
                  </button>
                ))}
              </div>
            </div>

            {visibles.length === 0 ? (
              <p className="rounded-2xl border-2 border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
                Sin productos para este filtro
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] sm:gap-3.5">
                {visibles.map((p) => {
                  const linea = enCarrito(p.id);
                  const sinStock = p.stock_available <= 0;
                  const tinte = tinteDeMarca(p.brand);
                  const decimales = Boolean(p.uom_allows_decimal);
                  return (
                    <article
                      key={p.id}
                      className={cn(
                        "grid min-w-0 gap-2.5 rounded-[22px] border bg-white p-3 transition duration-200 motion-reduce:transition-none",
                        SOMBRA,
                        linea
                          ? "border-violet-300 ring-2 ring-violet-100"
                          : "border-slate-200/80",
                        sinStock ? "opacity-60" : "hover:-translate-y-0.5",
                      )}
                    >
                      <div className={cn("relative grid aspect-[4/3] place-items-center rounded-2xl", tinte.fondo, tinte.acento)}>
                        {p.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.image_url} alt={p.name} loading="lazy" className="h-full w-full object-contain p-3" />
                        ) : (
                          <Package className="h-12 w-12 opacity-80" strokeWidth={1.6} />
                        )}
                        <span
                          className={cn(
                            "absolute left-2.5 top-2.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                            sinStock ? "bg-red-600 text-white" : "bg-white text-emerald-700",
                          )}
                        >
                          {sinStock ? "Agotado" : `Disponible: ${p.stock_available}`}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <span className="inline-block rounded-md bg-violet-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-violet-700">
                          {p.code}
                        </span>
                        <h3 className="mt-1 line-clamp-2 text-sm font-semibold leading-snug text-slate-900">{p.name}</h3>
                        {p.brand && <p className="text-xs text-slate-500">{p.brand}</p>}
                      </div>
                      {sinStock ? (
                        <button
                          type="button"
                          disabled
                          className="h-9 cursor-not-allowed rounded-full border border-slate-200 bg-slate-50 text-[13px] font-semibold text-slate-500"
                        >
                          Sin stock
                        </button>
                      ) : linea ? (
                        <div className="flex items-center justify-between gap-1.5 rounded-full border border-violet-300 bg-violet-50 p-[3px]">
                          <span className="inline-flex min-w-0 items-center gap-1 truncate pl-2 text-xs font-semibold text-violet-700">
                            <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={3} />
                            <span className="truncate">Pedido</span>
                          </span>
                          <span className="inline-flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => sumar(p, -1)}
                              aria-label={`Restar ${p.name}`}
                              className="h-7 w-7 rounded-full bg-white font-bold text-violet-700"
                            >
                              −
                            </button>
                            <input
                              type="number"
                              inputMode={decimales ? "decimal" : "numeric"}
                              min={0}
                              max={p.stock_available}
                              step={decimales ? "0.01" : "1"}
                              value={linea.quantity}
                              onChange={(e) => setCantidad(p, e.target.value)}
                              onBlur={() => limpiarSiVacio(p.id)}
                              onFocus={(e) => e.target.select()}
                              aria-label={`Cantidad de ${p.name}`}
                              className="h-7 w-12 rounded-full border-0 bg-white text-center text-sm font-bold tabular-nums text-violet-700 [appearance:textfield] focus:outline-none focus:ring-2 focus:ring-violet-400 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            />
                            <button
                              type="button"
                              onClick={() => sumar(p, 1)}
                              disabled={(Number(linea.quantity) || 0) >= p.stock_available}
                              aria-label={`Sumar ${p.name}`}
                              className="h-7 w-7 rounded-full bg-white font-bold text-violet-700 disabled:opacity-40"
                            >
                              +
                            </button>
                          </span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setCantidad(p, "1")}
                          className="h-9 rounded-full border border-slate-200 bg-slate-50 text-[13px] font-semibold text-slate-900 transition-colors hover:border-transparent hover:bg-violet-600 hover:text-white"
                        >
                          + Agregar
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {/* Tu solicitud */}
          <aside className={cn("grid min-w-0 gap-3.5 rounded-3xl bg-white p-[18px] xl:sticky xl:top-6", SOMBRA)} aria-label="Tu solicitud">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">Tu solicitud</h2>
              <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-700">
                {unidades} uds
              </span>
            </div>

            {lines.length === 0 ? (
              <p className="rounded-2xl border-2 border-dashed border-slate-200 p-5 text-center text-[13px] text-slate-400">
                Agrega productos desde el catálogo
              </p>
            ) : (
              <ul className="grid gap-1.5">
                {lines.map((l) => {
                  const p = porId(l.productId);
                  if (!p) return null;
                  return (
                    <li key={p.id} className="flex items-center gap-2.5 rounded-2xl bg-slate-50 p-2">
                      <span className="grid h-[34px] w-[34px] flex-none place-items-center overflow-hidden rounded-[10px] bg-white text-violet-600">
                        {p.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.image_url} alt="" className="h-full w-full object-contain" />
                        ) : (
                          <Package className="h-[18px] w-[18px]" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <b className="block truncate text-[13px] font-semibold text-slate-900">{p.name}</b>
                        <small className="font-mono text-[11px] text-slate-500">{p.code}</small>
                      </div>
                      <span className="font-bold tabular-nums text-slate-900">× {l.quantity || 0}</span>
                      <button
                        type="button"
                        onClick={() => quitar(p.id)}
                        aria-label={`Quitar ${p.name}`}
                        className="p-0.5 text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="grid gap-1.5">
              <span className={etiqueta}>¿Para quién es?</span>
              <Segmento
                valor={destino}
                onChange={elegirDestino}
                opciones={[
                  ["cliente", "Para un cliente"],
                  ["interno", "Uso interno"],
                ] as const}
              />
            </div>

            {destino === "cliente" && (
              <>
                <div className="grid gap-1.5">
                  <span className={etiqueta}>Cliente que recibe el material</span>
                  <OdooClientSelect value={client} onChange={setClient} />
                </div>

                <div className="grid gap-1.5">
                  <span className={etiqueta}>¿Cuándo se entrega?</span>
                  <Segmento
                    valor={condicion}
                    onChange={setCondicion}
                    opciones={[
                      ["inmediata", "De una vez"],
                      ["al_comprar", "Cuando compre"],
                    ] as const}
                  />
                </div>

                <div className="grid gap-1.5">
                  <label htmlFor="pop-orden" className={etiqueta}>
                    Orden en Odoo {condicion === "al_comprar" ? "(obligatoria)" : "(opcional)"}
                  </label>
                  {ordenes.length > 0 && (
                    <select
                      value={ordenes.some((o) => o.name === orden) ? orden : ""}
                      onChange={(e) => setOrden(e.target.value)}
                      aria-label="Mis órdenes de este cliente"
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                    >
                      <option value="">Elegir una de mis órdenes…</option>
                      {ordenes.map((o) => (
                        <option key={o.id} value={o.name}>
                          {o.name} · {o.estado} · $ {o.total.toLocaleString("es-VE")} · {fmtFecha(o.fecha)}
                        </option>
                      ))}
                    </select>
                  )}
                  <Input
                    id="pop-orden"
                    value={orden}
                    onChange={(e) => setOrden(e.target.value)}
                    placeholder="Ej: S-05457"
                    className="h-10 rounded-xl"
                  />
                  <span className="text-[11px] text-slate-400">
                    {client
                      ? "Se valida contra Odoo: tiene que existir y ser de este cliente."
                      : "Elige primero el cliente para ver tus órdenes."}
                  </span>
                </div>
              </>
            )}

            <div className="grid gap-1.5">
              <label htmlFor="pop-notas" className={etiqueta}>
                {destino === "interno" ? "¿Para qué es? (obligatorio)" : "Notas"}
              </label>
              <Textarea
                id="pop-notas"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={
                  destino === "interno"
                    ? "Ej: gorra para usar en la visita a clientes de Canon"
                    : "Para qué es, cuándo lo necesitas…"
                }
                className="min-h-[70px] rounded-xl"
              />
              {destino === "interno" && (
                <span className="text-[11px] text-slate-400">
                  Se entrega a tu nombre: lo firmas tú en la nota de entrega.
                </span>
              )}
            </div>

            {formError && (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-[13px] text-red-700">{formError}</p>
            )}

            <button
              type="button"
              onClick={enviar}
              disabled={saving || lines.length === 0}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#0F172A] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Enviar solicitud
            </button>
          </aside>
        </div>
      )}

      {/* Mis solicitudes */}
      <section className="grid gap-2.5" aria-label="Mis solicitudes">
        <h2 className="text-base font-semibold text-slate-900">Mis solicitudes</h2>
        {!loading && requests.length === 0 && (
          <p className="rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
            Todavía no has solicitado material
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
          {requests.map((r) => {
            const paso = PASO[r.status];
            return (
              <div key={r.id} className={cn("grid min-w-0 content-start gap-2.5 rounded-[20px] bg-white p-4", SOMBRA)}>
                <div className="flex flex-wrap justify-between gap-2">
                  <div className="min-w-0">
                    <b className="text-sm text-slate-900">{r.code}</b>
                    <small className="block truncate text-xs text-slate-500">
                      {r.clientName}, {fmtFecha(r.createdAt)}
                      {r.odooOrderName ? ` · Orden ${r.odooOrderName}` : ""}
                      {r.deliveryCondition === "al_comprar" ? " · al comprar" : ""}
                    </small>
                  </div>
                  <span className={cn("self-start rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize", ESTILO_ESTADO[r.status])}>
                    {r.status}
                  </span>
                </div>

                {paso && (
                  <div aria-label={`Paso ${paso} de 3`}>
                    <div className="grid grid-cols-3 gap-1">
                      {[1, 2, 3].map((n) => (
                        <i key={n} className={cn("h-1 rounded-full", n <= paso ? "bg-violet-600" : "bg-slate-100")} />
                      ))}
                    </div>
                    <div className="mt-1 flex justify-between text-[11px] text-slate-400">
                      <span>Enviada</span>
                      <span>Aprobada</span>
                      <span>Entregada</span>
                    </div>
                  </div>
                )}

                <ul className="grid gap-1 text-[13px] text-slate-600">
                  {r.items.map((it) => (
                    <li key={it.productId} className="flex justify-between gap-2">
                      <span className="min-w-0 truncate">{it.name}</span>
                      <span className="shrink-0">
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
                      "rounded-xl px-3 py-2 text-xs",
                      r.status === "rechazada" ? "bg-red-50 text-red-700" : "bg-slate-50 text-slate-600",
                    )}
                  >
                    {r.reviewedByName ? `${r.reviewedByName}: ` : ""}
                    {r.reviewNotes}
                  </p>
                )}

                {/* Aprobada tiene material reservado: cancelar lo libera para
                    otro vendedor. Entregada ya no se toca desde acá. */}
                {(r.status === "pendiente" || r.status === "aprobada") && (
                  <button
                    type="button"
                    onClick={() => cancelar(r.id)}
                    className="justify-self-start text-xs font-medium text-slate-500 hover:text-red-600"
                  >
                    {r.status === "aprobada" ? "Ya no lo necesito" : "Cancelar solicitud"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
