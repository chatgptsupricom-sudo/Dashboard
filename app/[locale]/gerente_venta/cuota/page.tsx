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
import { AlertCircle, Edit3, TrendingUp } from "lucide-react";
import { Building2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const FERIADOS: Record<number, string[]> = {
  2024: ["2024-01-01","2024-01-12","2024-02-12","2024-02-13","2024-03-28","2024-03-29","2024-04-19","2024-05-01","2024-06-24","2024-07-05","2024-07-29","2024-10-12","2024-11-25","2024-12-24","2024-12-25","2024-12-31"],
  2025: ["2025-01-01","2025-01-13","2025-02-17","2025-02-18","2025-04-17","2025-04-18","2025-04-19","2025-05-01","2025-06-24","2025-07-05","2025-07-28","2025-10-12","2025-12-24","2025-12-25","2025-12-31"],
  2026: ["2026-01-01","2026-01-12","2026-02-09","2026-02-10","2026-04-02","2026-04-03","2026-04-19","2026-05-01","2026-06-24","2026-07-05","2026-07-29","2026-10-12","2026-12-24","2026-12-25","2026-12-31"],
};

function contarDiasUtiles(inicio: Date, fin: Date): number {
  let count = 0;
  const cur = new Date(inicio);
  while (cur <= fin) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) {
      const str = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
      const feriados = FERIADOS[cur.getFullYear()] || [];
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

export default function CuotasPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingSeller, setEditingSeller] = useState<any>(null);

  const fetchData = () => {
    setLoading(true);
    fetch("/api/gerente_venta/cuota")
      .then((res) => res.json())
      .then((json) => {
        setData(json);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchData();
  }, []);

  const totalMeta = useMemo(
    () => data.reduce((sum: number, s: any) => sum + (s.meta || 0), 0),
    [data]
  );
  const totalFacturado = useMemo(
    () => data.reduce((sum: number, s: any) => sum + (s.facturado || 0), 0),
    [data]
  );
  const porcentajeTotal = totalMeta > 0 ? (totalFacturado / totalMeta) * 100 : 0;

  return (
    <div className="p-8 space-y-8 bg-zinc-50/30 min-h-screen">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-white rounded-xl shadow-sm border border-zinc-100">
          <Building2 size={20} className="text-zinc-600" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-black text-zinc-900">Metas de Ventas</h1>
          <p className="text-sm text-zinc-500">
            {data.length} vendedores
          </p>
        </div>
        {!loading && data.length > 0 && (
          <div className="flex-1 max-w-md">
            <div className="flex justify-between text-xs font-bold text-zinc-500 mb-1">
              <span>Total</span>
              <span>{porcentajeTotal.toFixed(0)}%</span>
            </div>
            <Progress value={Math.min(porcentajeTotal, 100)} className="h-2.5" />
            <div className="flex justify-between mt-1.5">
              <span className="text-xs text-zinc-500">
                Meta: <span className="font-bold text-zinc-700">${totalMeta.toLocaleString()}</span>
              </span>
              <span className="text-xs text-emerald-600 font-bold">
                Facturado: ${totalFacturado.toLocaleString()}
              </span>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-center py-20 text-zinc-400">Cargando...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Aplicamos el sort aquí mismo */}
          {[...data]
            .sort((a: any, b: any) => b.facturado - a.facturado)
            .map((seller: any) => (
              <SellerQuotaCard
                key={seller.id}
                seller={seller}
                onEdit={() => setEditingSeller(seller)}
              />
            ))}
        </div>
      )}

      {/* Modal de Edición */}
      {editingSeller && (
        <EditQuotaDialog
          seller={editingSeller}
          onClose={() => setEditingSeller(null)}
          onSave={() => {
            setEditingSeller(null);
            fetchData(); // Refrescar lista
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
            <span>Progreso</span>
            <span>{seller.porcentaje.toFixed(0)}%</span>
          </div>
          <Progress value={Math.min(seller.porcentaje, 100)} className="h-2" />
        </div>
        <div className="grid grid-cols-2 gap-4 pt-2">
          <div className="bg-zinc-50 p-3 rounded-2xl">
            <p className="text-[10px] text-zinc-400 font-bold uppercase">
              Meta
            </p>
            <p className="text-sm font-black text-zinc-900">
              ${seller.meta.toLocaleString()}
            </p>
          </div>
          <div className="bg-zinc-50 p-3 rounded-2xl">
            <p className="text-[10px] text-zinc-400 font-bold uppercase">
              Facturado
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
              ? `Superó meta por $${(seller.facturado - seller.meta).toLocaleString()}`
              : `Faltan $${seller.falta.toLocaleString()}`}
          </span>
        </div>
        {!isTargetMet && metricas.diasHabilesRestantes > 0 && (
          <div className="bg-blue-50 border border-blue-100 p-3 rounded-xl space-y-1">
            <p className="text-[10px] text-blue-500 font-bold uppercase">
              Ritmo necesario
            </p>
            <p className="text-xs text-blue-700">
              <span className="font-black">${metricas.ventaDiariaNecesaria.toLocaleString()}</span>/día × {metricas.diasHabilesRestantes} días hábiles
            </p>
          </div>
        )}
        {seller.meta > 0 && (() => {
          const supero150 = seller.facturado >= metricas.meta150;
          return (
            <div className={`border p-3 rounded-xl space-y-1 ${supero150 ? "bg-emerald-50 border-emerald-200" : "bg-purple-50 border-purple-100"}`}>
              <p className={`text-[10px] font-bold uppercase ${supero150 ? "text-emerald-500" : "text-purple-500"}`}>
                {supero150 ? "Superó 150%" : "Para 150%"}
              </p>
              <p className={`text-xs ${supero150 ? "text-emerald-700" : "text-purple-700"}`}>
                {supero150
                  ? <>Superó el 150% por <span className="font-black">${(seller.facturado - metricas.meta150).toLocaleString()}</span></>
                  : <>Faltan <span className="font-black">${metricas.faltaPara150.toLocaleString()}</span> para ${metricas.meta150.toLocaleString()}</>
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
      const res = await fetch("/api/gerente_venta/cuota", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seller_id: parseInt(seller.id), // Aseguramos que sea número
          cuota: parseFloat(value), // Aseguramos que sea número
          user_email: user?.email,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Error al guardar la cuota");
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
          <DialogTitle>Editar Cuota: {seller.name}</DialogTitle>
        </DialogHeader>
        {/* Agrega este elemento oculto o visible para cumplir con el requerimiento de accesibilidad */}
        <p id="dialog-description" className="sr-only">
          Formulario para modificar la meta de facturación del vendedor
          seleccionado.
        </p>
        <Input
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave}>Guardar Registro</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
