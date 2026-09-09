"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { SEDES } from "@/lib/compras/constants";
import { OrdenLineasEditor } from "@/components/compras/OrdenLineasEditor";
import {
  type OrdenLinea,
  type OrdenPayload,
  type ProveedorOdoo,
} from "@/lib/compras/ordenes-types";

const MONEDAS = ["USD", "EUR", "VES"];

export interface OrdenFormValue {
  company_id: string;
  supplier_odoo_id: string;
  supplier_name: string;
  currency: string;
  expected_date: string;
  notes: string;
  lines: OrdenLinea[];
}

export function ordenFormVacia(): OrdenFormValue {
  return {
    company_id: "9",
    supplier_odoo_id: "",
    supplier_name: "",
    currency: "USD",
    expected_date: "",
    notes: "",
    lines: [],
  };
}

export function OrdenForm({
  value,
  onChange,
  onSubmit,
  submitLabel,
  saving,
  disabled,
  extraActions,
}: {
  value: OrdenFormValue;
  onChange: (v: OrdenFormValue) => void;
  onSubmit?: () => void;
  submitLabel?: string;
  saving?: boolean;
  disabled?: boolean;
  extraActions?: React.ReactNode;
}) {
  const [proveedores, setProveedores] = useState<ProveedorOdoo[]>([]);
  const [loadingProv, setLoadingProv] = useState(false);
  const set = (patch: Partial<OrdenFormValue>) => onChange({ ...value, ...patch });

  useEffect(() => {
    setLoadingProv(true);
    fetch("/api/compras/ordenes/proveedores")
      .then((r) => r.json())
      .then((j) => setProveedores(j.success ? j.data : []))
      .catch(() => setProveedores([]))
      .finally(() => setLoadingProv(false));
  }, []);

  const puedeGuardar =
    !disabled &&
    value.company_id &&
    value.supplier_name.trim() &&
    value.lines.length > 0 &&
    value.lines.every((l) => l.description.trim() && Number(l.quantity) > 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="space-y-1.5">
          <Label>Sede</Label>
          <Select
            value={value.company_id}
            onValueChange={(v) => set({ company_id: v })}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEDES.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Proveedor</Label>
          <Select
            value={value.supplier_odoo_id || "__manual__"}
            onValueChange={(v) => {
              if (v === "__manual__") {
                set({ supplier_odoo_id: "" });
                return;
              }
              const p = proveedores.find((x) => String(x.id) === v);
              set({ supplier_odoo_id: v, supplier_name: p?.name ?? value.supplier_name });
            }}
            disabled={disabled}
          >
            <SelectTrigger>
              {loadingProv ? (
                <span className="flex items-center text-slate-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> Cargando…
                </span>
              ) : (
                <SelectValue placeholder="Elegir proveedor" />
              )}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__manual__">— Escribir manualmente —</SelectItem>
              {proveedores.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!value.supplier_odoo_id && (
            <Input
              placeholder="Nombre del proveedor"
              value={value.supplier_name}
              disabled={disabled}
              onChange={(e) => set({ supplier_name: e.target.value })}
            />
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Moneda</Label>
          <Select
            value={value.currency}
            onValueChange={(v) => set({ currency: v })}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONEDAS.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Fecha esperada</Label>
          <Input
            type="date"
            value={value.expected_date}
            disabled={disabled}
            onChange={(e) => set({ expected_date: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Notas</Label>
        <Textarea
          rows={2}
          value={value.notes}
          disabled={disabled}
          onChange={(e) => set({ notes: e.target.value })}
          placeholder="Condiciones, referencias, comentarios para el aprobador…"
        />
      </div>

      <div className="space-y-2">
        <Label>Líneas</Label>
        <OrdenLineasEditor
          lines={value.lines}
          onChange={(lines) => set({ lines })}
          currency={value.currency}
          disabled={disabled}
        />
      </div>

      {(onSubmit || extraActions) && (
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          {extraActions}
          {onSubmit && (
            <Button onClick={onSubmit} disabled={!puedeGuardar || saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {submitLabel ?? "Guardar"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function formToPayload(v: OrdenFormValue): OrdenPayload {
  return {
    company_id: Number(v.company_id),
    supplier_odoo_id: v.supplier_odoo_id ? Number(v.supplier_odoo_id) : null,
    supplier_name: v.supplier_name.trim(),
    currency: v.currency,
    expected_date: v.expected_date || null,
    notes: v.notes.trim() || null,
    lines: v.lines.map((l) => ({
      product_odoo_id: l.product_odoo_id,
      product_code: l.product_code || null,
      description: l.description.trim(),
      quantity: Number(l.quantity),
      unit_price: Number(l.unit_price),
    })),
  };
}
