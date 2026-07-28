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
import { useEffect, useState } from "react";

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

  return (
    <div className="p-8 space-y-8 bg-zinc-50/30 min-h-screen">
      <div>
        <h1 className="text-2xl font-black text-zinc-900">Metas de Ventas</h1>
        <p className="text-sm text-zinc-500">
          Monitoreo y actualización de cuotas mensuales
        </p>
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
        console.error("Error de servidor:", err);
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
