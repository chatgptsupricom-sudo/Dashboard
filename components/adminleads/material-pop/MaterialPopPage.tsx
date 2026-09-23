"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  History,
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
import type { PopCategory, PopProduct, PopUom } from "@/lib/adminleads/material-pop/types";

export function MaterialPopPage() {
  const [products, setProducts] = useState<PopProduct[]>([]);
  const [categories, setCategories] = useState<PopCategory[]>([]);
  const [uoms, setUoms] = useState<PopUom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("catalog");

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [prodRes, catRes, uomRes] = await Promise.all([
        fetch("/api/adminleads/material-pop/products"),
        fetch("/api/adminleads/material-pop/categories"),
        fetch("/api/adminleads/material-pop/uoms"),
      ]);

      const prodJson = await prodRes.json();
      const catJson = await catRes.json();
      const uomJson = await uomRes.json();

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

  const alertCount = products.filter((p) => p.has_alert).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Material POP
          </h1>
          <p className="text-sm text-slate-500">
            Inventario de material publicitario · Oficina y Almacén
          </p>
        </div>
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

      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-slate-100 p-1">
          <TabsTrigger value="catalog" className="gap-2 px-3 py-2">
            <Boxes className="h-4 w-4" />
            Catálogo
            <span className="rounded-md bg-slate-200 px-1.5 text-[11px] font-semibold text-slate-600">
              {products.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="entries" className="gap-2 px-3 py-2">
            <PackagePlus className="h-4 w-4" />
            Entradas
          </TabsTrigger>
          <TabsTrigger value="exits" className="gap-2 px-3 py-2">
            <PackageMinus className="h-4 w-4" />
            Salidas
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2 px-3 py-2">
            <History className="h-4 w-4" />
            Historial
          </TabsTrigger>
          <TabsTrigger value="brand-clients" className="gap-2 px-3 py-2">
            <Users className="h-4 w-4" />
            Clientes por marca
          </TabsTrigger>
          <TabsTrigger value="alerts" className="gap-2 px-3 py-2">
            <AlertTriangle className="h-4 w-4" />
            Alertas
            {alertCount > 0 && (
              <span className="rounded-md bg-red-100 px-1.5 text-[11px] font-semibold text-red-700">
                {alertCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="catalog">
          <CatalogTab
            products={products}
            categories={categories}
            uoms={uoms}
            loading={loading}
            onRefresh={loadAll}
          />
        </TabsContent>

        <TabsContent value="entries">
          <EntriesTab
            products={products}
            onDone={loadAll}
            onGoToCatalog={() => setTab("catalog")}
          />
        </TabsContent>

        <TabsContent value="exits">
          <ExitsTab
            products={products}
            onDone={loadAll}
            onGoToCatalog={() => setTab("catalog")}
          />
        </TabsContent>

        <TabsContent value="history">
          <HistoryTab onGoToCatalog={() => setTab("catalog")} />
        </TabsContent>

        <TabsContent value="brand-clients">
          <BrandClientsTab />
        </TabsContent>

        <TabsContent value="alerts">
          <AlertsTab products={products} onGoToCatalog={() => setTab("catalog")} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
