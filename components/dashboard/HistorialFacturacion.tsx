"use client";

// Grafica "Historial de Facturacion" de los dashboards de SuperAdmin, Gerente
// de Ventas y Gerente de Operaciones. La API manda la serie mensual completa
// (Smartbit antes del corte + Odoo despues, ver lib/smartbit.ts) y el rango se
// elige aqui sin volver a pedir datos.

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

type Punto = { month: string; total: number };
type Rango = "12" | "24" | "all";

export function HistorialFacturacion({ title, data }: { title: string; data: Punto[] }) {
  const t = useTranslations("salesHistory");
  const [rango, setRango] = useState<Rango>("all");
  const puntos = rango === "all" ? data : data.slice(-Number(rango));

  return (
    <Card className="rounded-3xl border-none shadow-sm bg-white">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-slate-700 font-bold">{title}</CardTitle>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={rango}
          onValueChange={(v) => v && setRango(v as Rango)}
        >
          <ToggleGroupItem value="12">{t("last12")}</ToggleGroupItem>
          <ToggleGroupItem value="24">{t("last24")}</ToggleGroupItem>
          <ToggleGroupItem value="all">{t("all")}</ToggleGroupItem>
        </ToggleGroup>
      </CardHeader>
      <CardContent className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={puntos} margin={{ left: 40, right: 20, top: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="month" axisLine={false} tickLine={false} minTickGap={24} />
            <YAxis
              axisLine={false}
              tickLine={false}
              tickFormatter={(value) => (value >= 1000 ? `$${(value / 1000).toFixed(0)}k` : `$${value}`)}
              width={80}
            />
            <RechartsTooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
            <Line
              type="monotone"
              dataKey="total"
              stroke="#3b82f6"
              strokeWidth={puntos.length > 24 ? 2 : 4}
              dot={puntos.length > 24 ? false : { r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
