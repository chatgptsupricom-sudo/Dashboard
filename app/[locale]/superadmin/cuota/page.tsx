"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useAuthStore } from "@/lib/stores/auth.store";
import { AlertCircle, Building2, Edit3, TrendingUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

const FERIADOS_2026: Record<number, string[]> = {
  2024: ["2024-01-01","2024-02-12","2024-02-13","2024-03-28","2024-03-29","2024-04-19","2024-05-01","2024-06-24","2024-07-05","2024-07-24","2024-10-12","2024-12-24","2024-12-25","2024-12-31"],
  2025: ["2025-01-01","2025-02-17","2025-02-18","2025-04-17","2025-04-18","2025-04-19","2025-05-01","2025-06-24","2025-07-05","2025-07-24","2025-10-12","2025-12-24","2025-12-25","2025-12-31"],
  2026: ["2026-01-01","2026-02-09","2026-02-10","2026-04-02","2026-04-03","2026-04-19","2026-05-01","2026-06-24","2026-07-05","2026-07-24","2026-10-12","2026-12-24","2026-12-25","2026-12-31"],
};

function contarDiasUtiles(inicio: Date, fin: Date): number {
  let count = 0;
  const cur = new Date(inicio);
  while (cur <= fin) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) {
      const str = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
      const feriados = FERIADOS_2026[cur.getFullYear()] || [];
      if (!feriados.includes(str)) count++;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

function calcularMetricas(meta: number, facturado: number) {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const totalUtiles = contarDiasUtiles(firstDay, lastDay);
  const transcurridos = contarDiasUtiles(firstDay, now);
  const restantes = Math.max(0, totalUtiles - transcurridos);
  const falta = Math.max(0, meta - facturado);
  const ventaDiaria = restantes > 0 ? parseFloat((falta / restantes).toFixed(2)) : 0;
  const meta150 = meta * 1.5;
  const faltaPara150 = parseFloat(Math.max(0, meta150 - facturado).toFixed(2));
  return { diasHabilesRestantes: restantes, ventaDiariaNecesaria: ventaDiaria, meta150, faltaPara150 };
}

export default function SuperAdminCuotaPage() {
  const t = useTranslations("superadmin.cuota");
  const [sucursales, setSucursales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingSeller, setEditingSeller] = useState<any>(null);

  const fetchData = () => {
    setLoading(true);
    fetch("/api/superadmin/cuota")
      .then((res) => res.json())
      .then((json) => {
        setSucursales(json);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchData();
  }, []);

  const totalVendedores = sucursales.reduce((sum, s) => sum + s.sellers.length, 0);

  return (
    <div className="p-8 space-y-8 bg-zinc-50/30 min-h-screen">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-zinc-900">
            {t("title")}
          </h1>
          <p className="text-sm text-zinc-500">
            {totalVendedores} {t("subtitle")}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-zinc-400">{t("cargando")}</div>
      ) : (
        <div className="space-y-10">
          {sucursales.map((sucursal) => (
            <section key={sucursal.cids}>
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2.5 bg-white rounded-xl shadow-sm border border-zinc-100">
                  <Building2 size={20} className="text-zinc-600" />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-zinc-800">
                    {sucursal.sucursal}
                  </h2>
                  <p className="text-xs text-zinc-400">
                    {sucursal.sellers.length} {sucursal.sellers.length === 1 ? t("vendedor") : t("vendedores")}
                  </p>
                </div>
                <div className="flex-1 max-w-md">
                  <div className="flex justify-between text-xs font-bold text-zinc-500 mb-1">
                    <span>{sucursal.sucursal}</span>
                    <span>{sucursal.porcentaje?.toFixed(0)}%</span>
                  </div>
                  <Progress value={Math.min(sucursal.porcentaje || 0, 100)} className="h-2.5" />
                  <div className="flex justify-between mt-1.5">
                    <span className="text-xs text-zinc-500">
                      {t("meta")}: <span className="font-bold text-zinc-700">${sucursal.totalMeta?.toLocaleString()}</span>
                    </span>
                    <span className="text-xs text-emerald-600 font-bold">
                      {t("facturado")}: ${sucursal.totalFacturado?.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {sucursal.sellers.map((seller: any) => (
                  <SellerQuotaCard
                    key={seller.id}
                    seller={seller}
                    onEdit={() => setEditingSeller(seller)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {editingSeller && (
        <EditQuotaDialog
          seller={editingSeller}
          onClose={() => setEditingSeller(null)}
          onSave={() => {
            setEditingSeller(null);
            fetchData();
          }}
        />
      )}
    </div>
  );
}

function SellerQuotaCard({
  seller,
  onEdit,
}: {
  seller: any;
  onEdit: () => void;
}) {
  const isTargetMet = seller.porcentaje >= 100;
  const metricas = calcularMetricas(seller.meta, seller.facturado);
  return (
    <Card className="rounded-3xl border-zinc-100 shadow-sm hover:shadow-xl transition-all duration-300">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <h3 className="font-black text-zinc-900 text-lg">{seller.name}</h3>
          <button
            onClick={onEdit}
            className="p-2 hover:bg-zinc-100 rounded-full transition-colors"
          >
            <Edit3 size={16} className="text-zinc-400" />
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <div className="flex justify-between text-xs font-bold text-zinc-500">
            <span>{t("progreso")}</span>
            <span>{seller.porcentaje.toFixed(0)}%</span>
          </div>
          <Progress value={Math.min(seller.porcentaje, 100)} className="h-2" />
        </div>
        <div className="grid grid-cols-2 gap-4 pt-2">
          <div className="bg-zinc-50 p-3 rounded-2xl">
            <p className="text-[10px] text-zinc-400 font-bold uppercase">
              {t("meta")}
            </p>
            <p className="text-sm font-black text-zinc-900">
              ${seller.meta.toLocaleString()}
            </p>
          </div>
          <div className="bg-zinc-50 p-3 rounded-2xl">
            <p className="text-[10px] text-zinc-400 font-bold uppercase">
              {t("facturado")}
            </p>
            <p className="text-sm font-black text-emerald-600">
              ${seller.facturado.toLocaleString()}
            </p>
          </div>
        </div>
        <div
          className={`flex items-center gap-2 text-xs font-bold p-3 rounded-xl ${isTargetMet ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}
        >
          {isTargetMet ? <TrendingUp size={14} /> : <AlertCircle size={14} />}
          <span>
            {isTargetMet
              ? `${t("supero_meta")} $${(seller.facturado - seller.meta).toLocaleString()}`
              : `${t("faltan")} $${seller.falta.toLocaleString()}`}
          </span>
        </div>
        {!isTargetMet && metricas.diasHabilesRestantes > 0 && (
          <div className="bg-blue-50 border border-blue-100 p-3 rounded-xl space-y-1">
            <p className="text-[10px] text-blue-500 font-bold uppercase">
              {t("ritmo_necesario")}
            </p>
            <p className="text-xs text-blue-700">
              <span className="font-black">${metricas.ventaDiariaNecesaria.toLocaleString()}</span>/día × {metricas.diasHabilesRestantes} {t("dias_habiles")}
            </p>
          </div>
        )}
        {seller.meta > 0 && (() => {
          const supero150 = seller.facturado >= metricas.meta150;
          return (
            <div className={`border p-3 rounded-xl space-y-1 ${supero150 ? "bg-emerald-50 border-emerald-200" : "bg-purple-50 border-purple-100"}`}>
              <p className={`text-[10px] font-bold uppercase ${supero150 ? "text-emerald-500" : "text-purple-500"}`}>
                {supero150 ? t("supero_150") : t("para_150")}
              </p>
              <p className={`text-xs ${supero150 ? "text-emerald-700" : "text-purple-700"}`}>
                {supero150
                  ? <>{t("supero_150_por")} <span className="font-black">${(seller.facturado - metricas.meta150).toLocaleString()}</span></>
                  : <>{t("faltan")} <span className="font-black">${metricas.faltaPara150.toLocaleString()}</span> {t("faltan_para")} ${metricas.meta150.toLocaleString()}</>
                }
              </p>
            </div>
          );
        })()}
      </CardContent>
    </Card>
  );
}

function EditQuotaDialog({ seller, onClose, onSave }: any) {
  const [value, setValue] = useState(seller.meta);
  const { user } = useAuthStore();

  const handleSave = async () => {
    try {
      const res = await fetch("/api/superadmin/cuota", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seller_id: parseInt(seller.id),
          cuota: parseFloat(value),
          user_email: user?.email,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || t("error_guardar"));
        return;
      }
      onSave();
    } catch (e) {
      console.error("Error de red:", e);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("editar_cuota")} {seller.name}</DialogTitle>
        </DialogHeader>
        <p id="dialog-description" className="sr-only">
          {t("dialog_description")}
        </p>
        <Input
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("cancelar")}
          </Button>
          <Button onClick={handleSave}>{t("guardar")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
