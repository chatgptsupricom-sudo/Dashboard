"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface OdooProduct {
  id: number;
  default_code: string;
  name: string;
  hardware: string;
  brand: string;
  list_price: number;
}

/** Producto que viene de una solicitud: el panel llega rellenado. */
export interface Vinculo {
  etiqueta: string;
  odooProductId: number | null;
  productCode: string | null;
  nombre: string;
  marca: string | null;
  categoria: string | null;
}

const campo = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm";
const vacio = { odoo_product_id: null as number | null, product_code: "", model: "", brand: "", category: "", price: "" };

// Comprime en el navegador antes de subir: máx. 1200 px de lado, JPEG 0.85 (PNG
// sigue PNG por la transparencia). Un PNG de 5 MB baja a ~200-400 KB.
function comprimir(file: File): Promise<{ file: File; preview: string }> {
  const MAX = 1200;
  const SIN_TOCAR = 800 * 1024;
  const tal = (): Promise<{ file: File; preview: string }> =>
    new Promise((resolve) => {
      const r = new FileReader();
      r.onload = (ev) => resolve({ file, preview: ev.target?.result as string });
      r.readAsDataURL(file);
    });
  if (file.size < SIN_TOCAR) return tal();
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(tal());
    };
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        const k = Math.min(MAX / width, MAX / height);
        width = Math.round(width * k);
        height = Math.round(height * k);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(tal());
      ctx.drawImage(img, 0, 0, width, height);
      const png = file.type === "image/png";
      const mime = png ? "image/png" : "image/jpeg";
      canvas.toBlob(
        (blob) => {
          if (!blob) return resolve(tal());
          const nuevo = new File([blob], file.name.replace(/\.[^.]+$/, "") + (png ? ".png" : ".jpg"), { type: mime });
          const r = new FileReader();
          r.onload = (ev) => resolve({ file: nuevo, preview: ev.target?.result as string });
          r.readAsDataURL(nuevo);
        },
        mime,
        png ? undefined : 0.85,
      );
    };
    img.src = url;
  });
}

/**
 * Panel para subir un flyer al banco. Desde una solicitud llega con el producto
 * puesto; al guardarlo, el servidor marca solo como hecho todo lo que lo pedía.
 */
export function SubirFlyer({
  abierto,
  onCerrar,
  vinculo,
  usuario,
  onGuardado,
}: {
  abierto: boolean;
  onCerrar: () => void;
  vinculo: Vinculo | null;
  usuario: string;
  onGuardado: (solicitudesMarcadas: number) => void;
}) {
  const [form, setForm] = useState(vacio);
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<OdooProduct[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [categorias, setCategorias] = useState<{ id: number; name: string; parent: string }[]>([]);
  const [categoria, setCategoria] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [encima, setEncima] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const elegido = useRef(false);

  // Al abrir: rellenado con el producto de la solicitud, o vacío.
  useEffect(() => {
    if (!abierto) return;
    setError(null);
    setArchivo(null);
    setPreview("");
    setResultados([]);
    if (!vinculo) {
      setForm(vacio);
      setQ("");
      return;
    }
    elegido.current = true;
    setQ(vinculo.productCode || vinculo.nombre);
    setForm({
      odoo_product_id: vinculo.odooProductId,
      product_code: vinculo.productCode || "",
      model: vinculo.nombre,
      brand: vinculo.marca || "",
      category: vinculo.categoria || "",
      price: "",
    });
    // El precio de Odoo de hoy, no el de cuando se pidió.
    if (vinculo.productCode) {
      fetch(`/api/rma/products?q=${encodeURIComponent(vinculo.productCode)}`)
        .then((r) => r.json())
        .then((d: OdooProduct[]) => {
          const p = Array.isArray(d) ? d.find((x) => x.id === vinculo.odooProductId) || d[0] : null;
          if (p) setForm((f) => ({ ...f, price: String(p.list_price || "") }));
        })
        .catch(() => {});
    }
  }, [abierto, vinculo]);

  useEffect(() => {
    if (!abierto || categorias.length) return;
    fetch("/api/rma/categories")
      .then((r) => r.json())
      .then((d) => setCategorias(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [abierto, categorias.length]);

  useEffect(() => {
    if (elegido.current) {
      elegido.current = false;
      return;
    }
    const texto = q.trim();
    if (texto.length < 2) {
      setResultados([]);
      return;
    }
    let vigente = true;
    setBuscando(true);
    const t = setTimeout(() => {
      fetch(`/api/rma/products?q=${encodeURIComponent(texto)}`)
        .then((r) => r.json())
        .then((d) => vigente && setResultados(Array.isArray(d) ? d : []))
        .catch(() => vigente && setResultados([]))
        .finally(() => vigente && setBuscando(false));
    }, 300);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [q]);

  async function porCategoria() {
    if (!categoria) return;
    setBuscando(true);
    try {
      const r = await fetch(`/api/rma/products?category=${encodeURIComponent(categoria)}&limit=100`);
      const d = await r.json();
      setResultados(Array.isArray(d) ? d : []);
    } finally {
      setBuscando(false);
    }
  }

  function elegir(p: OdooProduct) {
    elegido.current = true;
    setQ(p.default_code);
    setResultados([]);
    setForm({
      odoo_product_id: p.id,
      product_code: p.default_code,
      model: p.name,
      brand: p.brand,
      category: p.hardware,
      price: String(p.list_price || ""),
    });
  }

  async function tomar(file: File | null | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("El archivo tiene que ser una imagen");
    const { file: f, preview: p } = await comprimir(file);
    setArchivo(f);
    setPreview(p);
    setError(null);
  }

  async function guardar() {
    if (!archivo) return setError("Falta la imagen del flyer");
    if (!usuario) return setError("No se pudo leer tu usuario: recarga la página");
    setGuardando(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("image", archivo);
      fd.append("created_by", usuario);
      if (form.odoo_product_id) fd.append("odoo_product_id", String(form.odoo_product_id));
      if (form.product_code) fd.append("product_code", form.product_code);
      if (form.model) fd.append("model", form.model);
      if (form.brand) fd.append("brand", form.brand);
      if (form.category) fd.append("category", form.category);
      if (form.price) fd.append("price", form.price);
      const r = await fetch("/api/adminleads/banco-imagenes", { method: "POST", body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success) return setError(d?.error || "No se pudo guardar el flyer");
      onGuardado(Number(d.solicitudes) || 0);
    } catch (e: any) {
      setError(e?.message || "Error de conexión");
    } finally {
      setGuardando(false);
    }
  }

  const fila = (k: keyof typeof vacio, etiqueta: string, tipo = "text") => (
    <div className="grid gap-1.5">
      <label htmlFor={`sf-${k}`} className="text-[13px] font-semibold">
        {etiqueta}
      </label>
      <input
        id={`sf-${k}`}
        type={tipo}
        step={tipo === "number" ? "0.01" : undefined}
        value={String(form[k] ?? "")}
        onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
        className={campo}
      />
    </div>
  );

  return (
    <Sheet open={abierto} onOpenChange={(o) => !o && onCerrar()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[460px]">
        <div className="border-b border-slate-200 px-5 py-[18px]">
          <SheetTitle className="text-[17px] font-bold">Subir flyer</SheetTitle>
        </div>
        <div className="grid flex-1 content-start gap-4 overflow-y-auto px-5 py-[18px]">
          {vinculo && <p className="rounded-xl bg-blue-50 px-3 py-2.5 text-[13px] text-blue-600">{vinculo.etiqueta}</p>}

          <div className="grid gap-1.5">
            <label htmlFor="sf-q" className="text-[13px] font-semibold">
              Producto de Odoo
            </label>
            <div className="relative">
              <input
                id="sf-q"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setForm((f) => ({ ...f, odoo_product_id: null, product_code: e.target.value }));
                }}
                placeholder="Código. Ej: M27F"
                autoComplete="off"
                className={cn(campo, "pr-9")}
              />
              {buscando ? (
                <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
              ) : (
                q && (
                  <button
                    type="button"
                    aria-label="Quitar producto"
                    onClick={() => {
                      setQ("");
                      setForm(vacio);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )
              )}
            </div>
            <div className="flex gap-2">
              <select value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoría de Odoo" className={cn(campo, "flex-1")}>
                <option value="">O busca por categoría de Odoo</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.parent ? `${c.parent} / ` : ""}
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={porCategoria}
                disabled={!categoria}
                aria-label="Ver productos de la categoría"
                className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 disabled:opacity-40"
              >
                <Search className="h-4 w-4" />
              </button>
            </div>
            {resultados.length > 0 && (
              <div className="max-h-[260px] overflow-y-auto rounded-2xl border border-slate-200">
                {resultados.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => elegir(p)}
                    className="flex w-full items-center justify-between gap-2 border-t border-slate-200 px-3 py-2.5 text-left first:border-t-0 hover:bg-slate-50"
                  >
                    <span className="min-w-0">
                      <b className="block text-[13px]">{p.default_code}</b>
                      <small className="block truncate text-xs text-slate-500">{p.name}</small>
                    </span>
                    <small className="shrink-0 text-xs text-slate-400">{p.brand}</small>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {fila("model", "Modelo")}
            {fila("brand", "Marca")}
            {fila("category", "Categoría")}
            {fila("price", "Precio de Odoo", "number")}
          </div>

          <div className="grid gap-1.5">
            <span className="text-[13px] font-semibold">
              Imagen del flyer <span className="text-xs font-normal text-slate-400">JPG o PNG, 1080 × 1350</span>
            </span>
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setEncima(true);
              }}
              onDragLeave={() => setEncima(false)}
              onDrop={(e) => {
                e.preventDefault();
                setEncima(false);
                tomar(e.dataTransfer.files?.[0]);
              }}
              className={cn(
                "relative grid min-h-[180px] cursor-pointer place-items-center overflow-hidden rounded-[18px] border-2 border-dashed border-blue-200 text-center text-blue-600",
                encima ? "bg-blue-100" : "bg-blue-50",
              )}
            >
              <input type="file" accept="image/*" className="hidden" onChange={(e) => tomar(e.target.files?.[0])} />
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Vista previa del flyer" className="absolute inset-0 h-full w-full bg-white object-contain" />
              ) : (
                <div>
                  <b className="block text-sm">Suelta la imagen aquí</b>
                  <small className="text-xs text-slate-500">o haz clic para elegirla. Se comprime antes de subir.</small>
                </div>
              )}
            </label>
          </div>
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3.5">
          <button
            type="button"
            onClick={onCerrar}
            className="h-9 rounded-full border border-slate-200 bg-white px-3.5 text-[13px] font-semibold text-slate-600"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={guardando || !archivo}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#0F172A] px-3.5 text-[13px] font-semibold text-white disabled:opacity-45"
          >
            {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Guardar flyer
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
