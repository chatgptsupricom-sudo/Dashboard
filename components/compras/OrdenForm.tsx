"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, ChevronsUpDown, Loader2, Pencil } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { SEDES } from "@/lib/compras/constants";
import { OrdenLineasEditor } from "@/components/compras/OrdenLineasEditor";
import {
  type OrdenLinea,
  type OrdenPayload,
  type ProveedorOdoo,
} from "@/lib/compras/ordenes-types";

const MONEDAS = ["USD", "EUR", "VES"];

const microLabel =
  "text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500";
const sectionTitle =
  "text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400";

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

  // Proveedores de la sede elegida -- sin esto el select mezclaba
  // proveedores de las 3 sedes (Valencia/Caracas/Panama) sin importar cual
  // orden se estuviera armando, y era facil elegir uno de otra compania de
  // Odoo. Confirmar esa orden en Odoo fallaba recien al aprobarla
  // ("Incompatible companies"), lejos de donde se eligio el proveedor.
  useEffect(() => {
    if (disabled) return; // en modo lectura no se elige proveedor
    setLoadingProv(true);
    fetch(`/api/compras/ordenes/proveedores?sede=${value.company_id}`)
      .then((r) => r.json())
      .then((j) => setProveedores(j.success ? j.data : []))
      .catch(() => setProveedores([]))
      .finally(() => setLoadingProv(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, value.company_id]);

  // Si se cambia de sede con un proveedor de Odoo ya elegido, ese proveedor
  // puede no pertenecer a la sede nueva -- se limpia para forzar a elegir
  // uno valido en vez de dejar una combinacion que va a fallar recien al
  // aprobar. No aplica a "escribir manualmente" (sin supplier_odoo_id).
  const sedeAnterior = useRef(value.company_id);
  useEffect(() => {
    if (sedeAnterior.current !== value.company_id && value.supplier_odoo_id) {
      set({ supplier_odoo_id: "", supplier_name: "" });
    }
    sedeAnterior.current = value.company_id;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.company_id]);

  const puedeGuardar =
    !disabled &&
    !!value.company_id &&
    !!value.supplier_name.trim() &&
    value.lines.length > 0 &&
    value.lines.every((l) => l.description.trim() && Number(l.quantity) > 0);

  // En modo lectura los datos de cabecera (sede, proveedor, fecha, total) ya
  // se muestran arriba en OrdenDetalleLayout, así que aquí solo van notas +
  // productos.
  if (disabled) {
    return (
      <div className="space-y-8">
        {value.notes.trim() && (
          <section className="space-y-1.5">
            <h3 className={sectionTitle}>Notas</h3>
            <p className="whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">
              {value.notes}
            </p>
          </section>
        )}
        <section className="space-y-4">
          <h3 className={sectionTitle}>Productos</h3>
          <OrdenLineasEditor
            lines={value.lines}
            onChange={(lines) => set({ lines })}
            currency={value.currency}
            sede={value.company_id}
            disabled
          />
        </section>
        {extraActions && (
          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 dark:border-slate-800 sm:flex-row sm:flex-wrap sm:justify-end">
            {extraActions}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h3 className={sectionTitle}>Datos de la orden</h3>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="space-y-1.5">
            <span className={microLabel}>Sede</span>
            <Select
              value={value.company_id}
              onValueChange={(v) => set({ company_id: v })}
              disabled={disabled}
            >
              <SelectTrigger className="w-full">
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
          </label>

          <label className="space-y-1.5">
            <span className={microLabel}>Moneda</span>
            <Select
              value={value.currency}
              onValueChange={(v) => set({ currency: v })}
              disabled={disabled}
            >
              <SelectTrigger className="w-full">
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
          </label>

          <label className="space-y-1.5">
            <span className={microLabel}>Fecha esperada</span>
            <Input
              type="date"
              value={value.expected_date}
              disabled={disabled}
              onChange={(e) => set({ expected_date: e.target.value })}
              className="w-full"
            />
          </label>

          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
            <span className={microLabel}>Proveedor</span>
            <ProveedorField
              proveedores={proveedores}
              loading={loadingProv}
              disabled={disabled}
              supplierOdooId={value.supplier_odoo_id}
              supplierName={value.supplier_name}
              onPick={(p) =>
                set({ supplier_odoo_id: String(p.id), supplier_name: p.name })
              }
              onManual={() => set({ supplier_odoo_id: "" })}
              onNameChange={(name) => set({ supplier_name: name })}
            />
          </div>
        </div>

        <label className="block space-y-1.5">
          <span className={microLabel}>Notas</span>
          <Textarea
            rows={2}
            value={value.notes}
            disabled={disabled}
            onChange={(e) => set({ notes: e.target.value })}
            placeholder="Condiciones, referencias o comentarios para quien aprueba."
            className="resize-y"
          />
        </label>
      </section>

      <section className="space-y-4">
        <h3 className={sectionTitle}>Productos</h3>
        <OrdenLineasEditor
          lines={value.lines}
          onChange={(lines) => set({ lines })}
          currency={value.currency}
          sede={value.company_id}
          disabled={disabled}
        />
      </section>

      {(onSubmit || extraActions) && (
        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 dark:border-slate-800 sm:flex-row sm:flex-wrap sm:justify-end">
          {extraActions}
          {onSubmit && (
            <Button
              onClick={onSubmit}
              disabled={!puedeGuardar || saving}
              className="w-full sm:w-auto"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {submitLabel ?? "Guardar"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function ProveedorField({
  proveedores,
  loading,
  disabled,
  supplierOdooId,
  supplierName,
  onPick,
  onManual,
  onNameChange,
}: {
  proveedores: ProveedorOdoo[];
  loading: boolean;
  disabled?: boolean;
  supplierOdooId: string;
  supplierName: string;
  onPick: (p: ProveedorOdoo) => void;
  onManual: () => void;
  onNameChange: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const manual = !supplierOdooId;

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    const base = t
      ? proveedores.filter((p) => p.name.toLowerCase().includes(t))
      : proveedores;
    return base.slice(0, 60);
  }, [proveedores, q]);

  const triggerLabel = manual
    ? "Elegir proveedor de Odoo"
    : supplierName || (loading ? "Cargando proveedores…" : "Elegir proveedor");

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            disabled={disabled}
            className={cn(
              "w-full justify-between font-normal",
              (manual || !supplierName) && "text-slate-400",
            )}
          >
            <span className="truncate">{triggerLabel}</span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[min(34rem,calc(100vw-2rem))]" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Buscar proveedor…"
              value={q}
              onValueChange={setQ}
            />
            <CommandList>
              {loading && (
                <div className="flex items-center justify-center py-6 text-sm text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" /> Cargando…
                </div>
              )}
              {!loading && filtrados.length === 0 && (
                <CommandEmpty>Sin proveedores que coincidan.</CommandEmpty>
              )}
              {!loading && (
                <CommandGroup>
                  <CommandItem
                    value="__manual__"
                    onSelect={() => {
                      onManual();
                      setOpen(false);
                    }}
                    className="text-slate-500"
                  >
                    <Pencil className="h-4 w-4 mr-2 shrink-0" /> Escribir manualmente
                  </CommandItem>
                  {filtrados.map((p) => (
                    <CommandItem
                      key={p.id}
                      value={String(p.id)}
                      onSelect={() => {
                        onPick(p);
                        setOpen(false);
                        setQ("");
                      }}
                    >
                      <Check
                        className={cn(
                          "h-4 w-4 mr-2 shrink-0",
                          String(p.id) === supplierOdooId ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="truncate">{p.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {manual && (
        <Input
          placeholder="Nombre del proveedor"
          value={supplierName}
          disabled={disabled}
          onChange={(e) => onNameChange(e.target.value)}
        />
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
