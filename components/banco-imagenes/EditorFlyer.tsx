"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, GripVertical } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import DescargaFlyer from "@/components/banco-imagenes/DescargaFlyer";
import DescargaMultiple from "@/components/banco-imagenes/DescargaMultiple";
import { armarFlyer, BADGE_POS_INICIAL, type FlyerADescargar } from "@/lib/banco-imagenes/descargas";
import { cn } from "@/lib/utils";

export interface ProductImage {
  id: number;
  odoo_product_id: number | null;
  product_code: string | null;
  model: string | null;
  brand: string | null;
  category: string | null;
  price: number | null;
  image_path: string;
  created_by: string;
  created_at: string;
}

interface Ajustes {
  priceMode: "odoo" | "custom";
  customPrice: string;
  badgePos: { x: number; y: number };
}

const inicial = (img: ProductImage): Ajustes => ({
  priceMode: "odoo",
  customPrice: String(img.price || ""),
  badgePos: { ...BADGE_POS_INICIAL },
});

export const dinero = (n: number) =>
  `$${n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Editor del precio de uno o varios flyers: etiqueta roja que se arrastra sobre
 * el flyer, precio de Odoo u otro, y descarga con o sin precio. Con varios
 * flyers cada uno guarda sus ajustes al pasar al siguiente.
 */
export function EditorFlyer({ flyers, onClose }: { flyers: ProductImage[]; onClose: () => void }) {
  const [indice, setIndice] = useState(0);
  const [ajustes, setAjustes] = useState<Record<number, Ajustes>>({});
  const imgRef = useRef<HTMLImageElement>(null);
  const arrastre = useRef<{ x: number; y: number } | null>(null);
  const tiraRef = useRef<HTMLDivElement>(null);

  const abierto = flyers.length > 0;
  const varios = flyers.length > 1;
  const activo = flyers[Math.min(indice, flyers.length - 1)];
  const actual: Ajustes | null = activo ? ajustes[activo.id] || inicial(activo) : null;

  // Al abrir con otra selección se empieza de cero.
  useEffect(() => {
    setIndice(0);
    setAjustes({});
  }, [flyers]);

  const cambiar = (cambio: Partial<Ajustes>) => {
    if (!activo || !actual) return;
    setAjustes((prev) => ({ ...prev, [activo.id]: { ...actual, ...cambio } }));
  };

  useEffect(() => {
    const mover = (e: PointerEvent) => {
      if (!arrastre.current || !imgRef.current) return;
      const r = imgRef.current.getBoundingClientRect();
      const x = ((e.clientX - r.left - arrastre.current.x) / r.width) * 100;
      const y = ((e.clientY - r.top - arrastre.current.y) / r.height) * 100;
      cambiar({ badgePos: { x: Math.max(3, Math.min(97, x)), y: Math.max(3, Math.min(97, y)) } });
    };
    const soltar = () => {
      arrastre.current = null;
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    return () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
    };
  });

  useEffect(() => {
    const t = tiraRef.current?.querySelectorAll<HTMLElement>("[data-thumb]")[indice];
    t?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [indice]);

  if (!activo || !actual) return null;

  const precio = actual.priceMode === "odoo" ? Number(activo.price || 0) : parseFloat(actual.customPrice) || 0;

  const flyerAbierto = (conPrecio: boolean): FlyerADescargar => ({
    image_path: activo.image_path,
    product_code: activo.product_code,
    precio: conPrecio ? precio : null,
    badgePos: actual.badgePos,
  });
  const todos = (conPrecio: boolean) => flyers.map((f) => armarFlyer(f, ajustes[f.id], conPrecio));

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="!h-[96vh] !max-h-[96vh] !w-[98vw] !max-w-[98vw] gap-0 overflow-hidden rounded-3xl p-0">
        <DialogTitle className="sr-only">{activo.model || "Flyer"}</DialogTitle>
        <div className="flex h-full flex-col md:flex-row">
          <div className="relative min-h-[50vh] min-w-0 flex-1 select-none overflow-hidden bg-[#0b1222]">
            <div className="absolute inset-0 flex items-center justify-center p-6 md:p-8">
              <div className="relative" style={{ lineHeight: 0 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={imgRef}
                  src={activo.image_path}
                  alt={activo.model || "Flyer"}
                  draggable={false}
                  className="block max-h-full max-w-full rounded-xl object-contain shadow-2xl"
                  style={{ maxHeight: "calc(96vh - 4rem)" }}
                />
                {precio > 0 && (
                  <div
                    className="absolute z-10 cursor-grab touch-none active:cursor-grabbing"
                    style={{ left: `${actual.badgePos.x}%`, top: `${actual.badgePos.y}%`, transform: "translate(-50%, -50%)" }}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      if (!imgRef.current) return;
                      const r = imgRef.current.getBoundingClientRect();
                      arrastre.current = {
                        x: e.clientX - r.left - (actual.badgePos.x / 100) * r.width,
                        y: e.clientY - r.top - (actual.badgePos.y / 100) * r.height,
                      };
                    }}
                  >
                    <div className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-gradient-to-r from-red-500 to-red-600 px-4 py-2 text-lg font-extrabold text-white shadow-[0_6px_22px_rgba(239,68,68,.55)] ring-2 ring-white/35">
                      <GripVertical className="h-3.5 w-3.5 shrink-0 opacity-60" />
                      {dinero(precio)}
                    </div>
                    <p className="pointer-events-none mt-1 text-center text-[10px] text-white/50">arrastra para mover</p>
                  </div>
                )}
              </div>
            </div>

            {varios && (
              <>
                <button
                  type="button"
                  aria-label="Flyer anterior"
                  onClick={() => setIndice((i) => Math.max(0, i - 1))}
                  disabled={indice === 0}
                  className="absolute left-3 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/25 disabled:opacity-20"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  aria-label="Flyer siguiente"
                  onClick={() => setIndice((i) => Math.min(flyers.length - 1, i + 1))}
                  disabled={indice === flyers.length - 1}
                  className="absolute right-3 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/25 disabled:opacity-20"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
                <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs font-semibold text-white">
                  {indice + 1} / {flyers.length}
                </div>
              </>
            )}
          </div>

          <div className="flex w-full shrink-0 flex-col overflow-hidden border-l bg-white md:w-[320px]">
            {varios && (
              <div ref={tiraRef} className="flex shrink-0 gap-2 overflow-x-auto bg-slate-900 p-3" style={{ scrollbarWidth: "none" }}>
                {flyers.map((f, i) => (
                  <button
                    key={f.id}
                    type="button"
                    data-thumb=""
                    onClick={() => setIndice(i)}
                    aria-label={`Flyer ${i + 1}`}
                    className={cn(
                      "relative h-14 w-14 shrink-0 overflow-hidden rounded-lg transition",
                      i === indice ? "ring-2 ring-blue-400 ring-offset-2 ring-offset-slate-900" : "opacity-50 hover:opacity-80",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.image_path} alt="" className="h-full w-full object-cover" />
                    {i === indice && (
                      <span className="absolute left-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full bg-blue-600">
                        <Check className="h-2.5 w-2.5 text-white" />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto p-5">
              <div>
                <small className="font-mono text-xs text-slate-400">{activo.product_code || "Sin código"}</small>
                <h3 className="mt-0.5 line-clamp-3 text-base font-bold text-slate-900">{activo.model || "Flyer"}</h3>
              </div>

              <label
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-2xl border-2 p-3",
                  actual.priceMode === "odoo" ? "border-blue-600 bg-blue-50" : "border-slate-200",
                )}
              >
                <input
                  type="radio"
                  name="precio-flyer"
                  checked={actual.priceMode === "odoo"}
                  onChange={() => cambiar({ priceMode: "odoo" })}
                  className="accent-blue-600"
                />
                <div>
                  <span className="block text-xs text-slate-500">Precio de Odoo</span>
                  <b className="text-[22px] font-extrabold text-blue-600">
                    {activo.price ? dinero(Number(activo.price)) : "Sin precio"}
                  </b>
                </div>
              </label>

              <label
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-2xl border-2 p-3",
                  actual.priceMode === "custom" ? "border-blue-600 bg-blue-50" : "border-slate-200",
                )}
              >
                <input
                  type="radio"
                  name="precio-flyer"
                  checked={actual.priceMode === "custom"}
                  onChange={() => cambiar({ priceMode: "custom" })}
                  className="accent-blue-600"
                />
                <div className="flex-1">
                  <span className="block text-xs text-slate-500">Otro precio</span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={actual.customPrice}
                    onFocus={() => cambiar({ priceMode: "custom" })}
                    onChange={(e) => cambiar({ priceMode: "custom", customPrice: e.target.value })}
                    placeholder="0,00"
                    className="mt-1.5 rounded-xl text-lg font-bold"
                  />
                </div>
              </label>
              <p className="text-center text-xs text-slate-400">Arrastra la etiqueta roja para moverla sobre el flyer.</p>
            </div>

            <div className="shrink-0 space-y-2 border-t bg-slate-50 p-5">
              <DescargaFlyer obtenerFlyer={flyerAbierto} claseConPrecio="rounded-full bg-blue-600 hover:bg-blue-700" />
              {varios && (
                <DescargaMultiple
                  obtenerFlyers={todos}
                  etiqueta={`Descargar los ${flyers.length} flyers`}
                  className="h-10 w-full rounded-full text-xs"
                  avisoEnBloque
                />
              )}
              {varios && indice < flyers.length - 1 && (
                <Button
                  variant="outline"
                  onClick={() => setIndice(indice + 1)}
                  className="h-9 w-full rounded-full border-dashed text-xs text-slate-500"
                >
                  <ChevronRight className="mr-1 h-3.5 w-3.5" />
                  Siguiente flyer
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
