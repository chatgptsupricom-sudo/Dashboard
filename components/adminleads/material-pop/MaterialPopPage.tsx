"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  ClipboardCheck,
  ClipboardList,
  History,
  Package,
  PackageMinus,
  PackagePlus,
  Users,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CatalogTab } from "./CatalogTab";
import { EntriesTab } from "./EntriesTab";
import { ExitsTab } from "./ExitsTab";
import { HistoryTab } from "./HistoryTab";
import { AlertsTab } from "./AlertsTab";
import { BrandClientsTab } from "./BrandClientsTab";
import { RequestsTab } from "./RequestsTab";
import { InventoryTab } from "./InventoryTab";
import { nivelStock } from "./ProductCard";
import { ProductFormDialog } from "./ProductFormDialog";
import { ExcelImportDialog } from "./ExcelImportDialog";
import { useAuthStore } from "@/lib/stores/auth.store";
import type { PopCategory, PopProduct, PopUom } from "@/lib/adminleads/material-pop/types";
import { leerJson } from "@/lib/adminleads/material-pop/respuesta";
import { cn } from "@/lib/utils";

const TABS = ["catalog", "inventory", "entries", "exits", "history", "requests", "brand-clients", "alerts"];

const SOMBRA = "shadow-[0_1px_2px_rgba(15,23,42,.04),0_10px_30px_rgba(15,23,42,.06)]";

export function MaterialPopPage() {
  const [products, setProducts] = useState<PopProduct[]>([]);
  const [categories, setCategories] = useState<PopCategory[]>([]);
  const [uoms, setUoms] = useState<PopUom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("catalog");
  const [pendientes, setPendientes] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PopProduct | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  // Botón Entrada/Salida de una tarjeta: abre la pestaña con el producto puesto.
  const [preEntrada, setPreEntrada] = useState<{ id: number } | null>(null);
  const [preSalida, setPreSalida] = useState<{ id: number } | null>(null);
  const { user } = useAuthStore();
  // Inventario físico: solo el adminLeads de Valencia (y el SuperAdmin). BI y
  // Marketing y Electrodomésticos ven el módulo pero no ajustan stock.
  const rol = String(user?.role || "").toLowerCase();
  const veInventario = rol === "superadmin" || (rol === "adminleads" && Number(user?.cids) === 9);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [prodRes, catRes, uomRes] = await Promise.all([
        fetch("/api/adminleads/material-pop/products"),
        fetch("/api/adminleads/material-pop/categories"),
        fetch("/api/adminleads/material-pop/uoms"),
      ]);

      const prodJson = await leerJson(prodRes);
      const catJson = await leerJson(catRes);
      const uomJson = await leerJson(uomRes);

      if (!prodRes.ok) throw new Error(prodJson?.error || "Error cargando productos");
      if (!catRes.ok) throw new Error(catJson?.error || "Error cargando categorías");
      if (!uomRes.ok) throw new Error(uomJson?.error || "Error cargando unidades");

      setProducts(prodJson.products || []);
      setCategories(catJson.categories || []);
      setUoms(uomJson.uoms || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // El correo de solicitud nueva enlaza con ?tab=requests: se abre directo en
  // la pestaña. Se lee al montar y no en el useState para no desencajar el
  // HTML del servidor con el del navegador.
  useEffect(() => {
    const inicial = new URLSearchParams(window.location.search).get("tab");
    if (inicial && TABS.includes(inicial)) setTab(inicial);
  }, []);

  // Contador de solicitudes por revisar, para que la pestaña avise sin tener
  // que entrar a mirar.
  const loadPendientes = useCallback(() => {
    fetch("/api/adminleads/material-pop/requests?status=pendiente")
      .then((r) => r.json())
      .then((j) => setPendientes(j?.pendientes || 0))
      .catch(() => setPendientes(0));
  }, []);

  useEffect(() => {
    loadPendientes();
  }, [loadPendientes, tab]);

  const alertCount = products.filter((p) => p.has_alert).length;
  const unidades = products.reduce((s, p) => s + p.stock_total, 0);
  const oficina = products.reduce((s, p) => s + p.stock_office, 0);
  const almacen = unidades - oficina;
  const atencion = products
    .filter((p) => nivelStock(p) !== "ok")
    .sort((a, b) => a.stock_total - b.stock_total);

  const abrirNuevo = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const trigger =
    "flex-none gap-1.5 rounded-full px-4 py-2 font-medium text-slate-500 data-[state=active]:bg-[#0F172A] data-[state=active]:text-white data-[state=active]:shadow-none";
  const contador = "rounded-full px-1.5 text-[11px] font-semibold";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Material POP</h1>
        <p className="text-sm text-slate-500">
          Inventario de material publicitario en oficina y almacén
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div>
            <p className="text-sm font-semibold text-red-800">
              No se pudo cargar el inventario
            </p>
            <p className="mt-0.5 text-xs text-red-700">{error}</p>
          </div>
        </div>
      )}

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        {/* Héroe: inventario total */}
        <div className="relative grid min-w-0 gap-3.5 overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#1e3a8a_0%,#2563eb_55%,#60a5fa_100%)] px-6 py-5 text-white shadow-[0_18px_40px_rgba(37,99,235,.28)]">
          <span className="pointer-events-none absolute -right-24 -top-32 h-[340px] w-[340px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,.22),transparent_70%)]" />
          <span className="pointer-events-none absolute -bottom-32 right-36 h-[220px] w-[220px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,.22),transparent_70%)]" />
          <div className="relative flex flex-wrap items-center justify-between gap-2.5">
            <span className="rounded-full border border-white/30 bg-white/20 px-2.5 py-1 text-xs font-semibold">
              Inventario total
            </span>
            <small className="text-xs opacity-85">
              {products.length} {products.length === 1 ? "producto activo" : "productos activos"}
            </small>
          </div>
          <div className="relative flex items-baseline gap-2.5">
            <b className="text-[40px] font-bold leading-none tracking-tighter tabular-nums sm:text-[52px]">
              {unidades.toLocaleString("es-VE")}
            </b>
            <span className="opacity-90">unidades</span>
          </div>
          <div className="relative flex h-2 overflow-hidden rounded-full bg-white/25" aria-hidden="true">
            <i className="block h-full bg-violet-300" style={{ width: `${unidades ? (oficina / unidades) * 100 : 0}%` }} />
            <i className="block h-full bg-white" style={{ width: `${unidades ? (almacen / unidades) * 100 : 0}%` }} />
          </div>
          <div className="relative flex flex-wrap gap-4 text-[13px]">
            <span className="inline-flex items-center gap-1.5">
              <i className="h-2 w-2 rounded-full bg-violet-300" />
              Oficina <b>{oficina.toLocaleString("es-VE")}</b>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="h-2 w-2 rounded-full bg-white" />
              Almacén <b>{almacen.toLocaleString("es-VE")}</b>
            </span>
          </div>
          <div className="relative flex flex-wrap gap-2">
            <button
              type="button"
              onClick={abrirNuevo}
              className="h-[38px] rounded-full bg-white px-4 text-[13px] font-semibold text-blue-600 hover:bg-blue-50"
            >
              + Nuevo producto
            </button>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="h-[38px] rounded-full border border-white/35 bg-white/15 px-4 text-[13px] font-semibold hover:bg-white/25"
            >
              Importar Excel
            </button>
          </div>
        </div>

        {/* Lo que necesita atención */}
        <div className={cn("grid min-w-0 content-start gap-3 rounded-3xl bg-white px-5 py-4", SOMBRA)}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900">Necesitan atención</h2>
            <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-600">
              {atencion.length}
            </span>
          </div>
          {atencion.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">
              {loading ? "Cargando…" : "Todo con stock suficiente"}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {atencion.slice(0, 4).map((p) => {
                const agotado = nivelStock(p) === "agotado";
                return (
                  <li key={p.id} className="flex items-center gap-2.5 px-1.5 py-2">
                    <span
                      className={cn(
                        "grid h-8 w-8 flex-none place-items-center rounded-[10px]",
                        agotado ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700",
                      )}
                    >
                      <Package className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <b className="block truncate text-[13px] font-semibold text-slate-900">{p.name}</b>
                      <small className="text-xs text-slate-500">
                        {agotado ? "Sin stock" : p.stock_office <= 0 ? "Sin stock en oficina" : "Stock bajo"}
                      </small>
                    </div>
                    <span className={cn("ml-auto font-bold tabular-nums", agotado ? "text-red-600" : "text-slate-900")}>
                      {p.stock_total}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <div className="min-w-0 overflow-x-auto pb-1">
          <TabsList className={cn("h-auto w-max gap-1 rounded-full bg-white p-1.5", SOMBRA)}>
            <TabsTrigger value="catalog" className={trigger}>
              <Boxes className="h-4 w-4" />
              Catálogo
              <span className={cn(contador, "opacity-70")}>{products.length}</span>
            </TabsTrigger>
            {veInventario && (
              <TabsTrigger value="inventory" className={trigger}>
                <ClipboardCheck className="h-4 w-4" />
                Inventario
              </TabsTrigger>
            )}
            <TabsTrigger value="entries" className={trigger}>
              <PackagePlus className="h-4 w-4" />
              Entradas
            </TabsTrigger>
            <TabsTrigger value="exits" className={trigger}>
              <PackageMinus className="h-4 w-4" />
              Salidas
            </TabsTrigger>
            <TabsTrigger value="history" className={trigger}>
              <History className="h-4 w-4" />
              Historial
            </TabsTrigger>
            <TabsTrigger value="requests" className={trigger}>
              <ClipboardList className="h-4 w-4" />
              Solicitudes
              {pendientes > 0 && (
                <span className={cn(contador, "bg-amber-100 text-amber-700")}>{pendientes}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="brand-clients" className={trigger}>
              <Users className="h-4 w-4" />
              Clientes por marca
            </TabsTrigger>
            <TabsTrigger value="alerts" className={trigger}>
              <AlertTriangle className="h-4 w-4" />
              Alertas
              {alertCount > 0 && (
                <span className={cn(contador, "bg-red-100 text-red-700")}>{alertCount}</span>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="catalog">
          <CatalogTab
            products={products}
            categories={categories}
            loading={loading}
            onRefresh={loadAll}
            onNew={abrirNuevo}
            onImport={() => setImportOpen(true)}
            onEdit={(p) => {
              setEditing(p);
              setFormOpen(true);
            }}
            onEntrada={(p) => {
              setPreEntrada({ id: p.id });
              setTab("entries");
            }}
            onSalida={(p) => {
              setPreSalida({ id: p.id });
              setTab("exits");
            }}
          />
        </TabsContent>

        {veInventario && (
          <TabsContent value="inventory">
            <InventoryTab products={products} categories={categories} onDone={loadAll} />
          </TabsContent>
        )}

        <TabsContent value="entries">
          <EntriesTab
            products={products}
            onDone={loadAll}
            onGoToCatalog={() => setTab("catalog")}
            preseleccion={preEntrada}
          />
        </TabsContent>

        <TabsContent value="exits">
          <ExitsTab
            products={products}
            onDone={loadAll}
            onGoToCatalog={() => setTab("catalog")}
            preseleccion={preSalida}
          />
        </TabsContent>

        <TabsContent value="history">
          <HistoryTab onGoToCatalog={() => setTab("catalog")} />
        </TabsContent>

        <TabsContent value="requests">
          <RequestsTab
            onStockChange={() => {
              loadAll();
              loadPendientes();
            }}
          />
        </TabsContent>

        <TabsContent value="brand-clients">
          <BrandClientsTab />
        </TabsContent>

        <TabsContent value="alerts">
          <AlertsTab products={products} onGoToCatalog={() => setTab("catalog")} />
        </TabsContent>
      </Tabs>

      <ProductFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        product={editing}
        categories={categories}
        uoms={uoms}
        onSaved={loadAll}
      />

      <ExcelImportDialog open={importOpen} onOpenChange={setImportOpen} onImported={loadAll} />
    </div>
  );
}
