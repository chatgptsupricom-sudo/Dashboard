"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Check, ChevronsUpDown, ExternalLink, FileSpreadsheet, Loader2, PackagePlus, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

type Estado = "en_odoo" | "archivado" | "sku_distinto" | "por_barcode" | "posible" | "no_existe";
type Seguimiento = "serial" | "lot" | "none";
type Tipo = "product" | "consu" | "service";

interface Opcion {
  id: number;
  nombre: string;
}
interface ProductoOdoo {
  id: number;
  codigo: string;
  nombre: string;
  activo: boolean;
  categoria: string;
  marca: string;
}
interface Renglon {
  codigo: string;
  descripcion: string;
  cantidad: number | null;
  precio: number | null;
}
interface Validado extends Renglon {
  estado: Estado;
  coincidencias: ProductoOdoo[];
  sugerencia: { nombre: string; categoriaId: number | null; marcaId: number | null; seguimiento: Seguimiento } | null;
  creado?: { id: number; url: string };
}
interface Formulario {
  indice: number;
  codigo: string;
  nombre: string;
  categoriaId: number | null;
  marcaId: number | null;
  tipo: Tipo;
  seguimiento: Seguimiento;
  barcode: string;
  puedeVenderse: boolean;
  puedeComprarse: boolean;
}

const ESTADOS: Record<Estado | "creado", { texto: string; clase: string; ayuda: string }> = {
  no_existe: { texto: "No está en Odoo", clase: "bg-red-100 text-red-700", ayuda: "No hay ningún producto con ese SKU" },
  posible: { texto: "Posible coincidencia", clase: "bg-amber-100 text-amber-800", ayuda: "El SKU no está, pero hay productos parecidos: revísalos antes de crear" },
  sku_distinto: { texto: "SKU con otro formato", clase: "bg-orange-100 text-orange-800", ayuda: "Está en Odoo con el mismo SKU escrito distinto (guiones, espacios, puntos)" },
  por_barcode: { texto: "Por código de barras", clase: "bg-sky-100 text-sky-800", ayuda: "El código de la factura es el código de barras de un producto" },
  archivado: { texto: "Archivado en Odoo", clase: "bg-slate-200 text-slate-700", ayuda: "Existe pero está archivado: se desarchiva en Odoo, no se crea otro" },
  en_odoo: { texto: "En Odoo", clase: "bg-emerald-100 text-emerald-700", ayuda: "El SKU está tal cual en Odoo" },
  creado: { texto: "Creado", clase: "bg-emerald-600 text-white", ayuda: "Creado desde aquí" },
};
const ORDEN: (Estado | "creado")[] = ["no_existe", "posible", "sku_distinto", "por_barcode", "archivado", "creado", "en_odoo"];
const crearPermitido = (e: Estado) => e === "no_existe" || e === "posible";

const norm = (v: unknown) =>
  String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();

function numero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v : null;
  const s = String(v ?? "").replace(/[^0-9.,-]/g, "");
  if (!s) return null;
  const t = s.includes(",") && s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Por orden de preferencia: ITEM suele ser el número de renglón, así que va al final.
const COLUMNAS_CODIGO = [/^(SKU|CODIGO|COD\b|CODE)/, /(PART|NUMERO DE PARTE|N° DE PARTE)/, /^(MODELO|MODEL|REF)/, /^ITEM/];
const ES_CODIGO = (c: string) => COLUMNAS_CODIGO.some((re) => re.test(c));
const columnaCodigo = (cab: string[]) =>
  COLUMNAS_CODIGO.map((re) => cab.findIndex((c) => re.test(c))).find((i) => i >= 0) ?? -1;
const ES_DESC = (c: string) => /^(DESCRIP|PRODUCTO|ARTICULO)/.test(c);
const ES_CANT = (c: string) => /^(CANT|QTY|QUANTITY|UNIDADES)/.test(c);
const ES_PRECIO = (c: string) => /(PRECIO|PRICE|COSTO|COST|UNIT)/.test(c) && !/TOTAL|AMOUNT|IMPORTE/.test(c);

/** Busca en la primera hoja la fila con código y descripción y lee los renglones con código. */
function leerExcel(buf: ArrayBuffer, nombreArchivo: string) {
  const wb = XLSX.read(buf, { type: "array" });
  const filas: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
  const h = filas.findIndex((f) => f.some((c) => ES_CODIGO(norm(c))) && f.some((c) => ES_DESC(norm(c))));
  if (h < 0) throw new Error("No encontré las columnas de código y descripción");
  const cab = filas[h].map(norm);
  const i = { cod: columnaCodigo(cab), desc: cab.findIndex(ES_DESC), cant: cab.findIndex(ES_CANT), precio: cab.findIndex(ES_PRECIO) };
  const renglones: Renglon[] = filas
    .slice(h + 1)
    .map((f) => ({
      codigo: String(f[i.cod] ?? "").trim(),
      descripcion: String(f[i.desc] ?? "").trim(),
      cantidad: i.cant >= 0 ? numero(f[i.cant]) : null,
      precio: i.precio >= 0 ? numero(f[i.precio]) : null,
    }))
    .filter((r) => r.codigo);
  const inv = (t: unknown) => String(t ?? "").match(/INV\d+/i)?.[0];
  const factura = filas.slice(0, h).flat().map(inv).find(Boolean) ?? inv(wb.SheetNames[0]) ?? inv(nombreArchivo) ?? "";
  return { proveedor: "", numero: factura.toUpperCase(), renglones };
}

const usd = (v: number | null) => (v == null ? "—" : `$${v.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

/** Lista con búsqueda (las marcas son cientos). */
function Combo({ opciones, valor, onChange, vacio }: { opciones: Opcion[]; valor: number | null; onChange: (id: number | null) => void; vacio: string }) {
  const [abierto, setAbierto] = useState(false);
  const elegido = opciones.find((o) => o.id === valor);
  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
          <span className={`truncate ${elegido ? "" : "text-muted-foreground"}`}>{elegido?.nombre ?? vacio}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar…" />
          <CommandList>
            <CommandEmpty>Sin resultados.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__ninguna__"
                onSelect={() => {
                  onChange(null);
                  setAbierto(false);
                }}
              >
                <span className="text-muted-foreground">{vacio}</span>
              </CommandItem>
              {opciones.map((o) => (
                <CommandItem
                  key={o.id}
                  value={`${o.nombre} ${o.id}`}
                  onSelect={() => {
                    onChange(o.id);
                    setAbierto(false);
                  }}
                >
                  <Check className={`mr-2 h-4 w-4 ${o.id === valor ? "opacity-100" : "opacity-0"}`} />
                  {o.nombre}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function ValidarFacturaPage() {
  const { toast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState("");
  const [cabecera, setCabecera] = useState({ proveedor: "", numero: "" });
  const [paso, setPaso] = useState<"" | "leyendo" | "validando">("");
  const [renglones, setRenglones] = useState<Validado[]>([]);
  const [categorias, setCategorias] = useState<Opcion[]>([]);
  const [marcas, setMarcas] = useState<Opcion[]>([]);
  const [aviso, setAviso] = useState("");
  const [filtro, setFiltro] = useState<Estado | "creado" | "todos">("todos");
  const [form, setForm] = useState<Formulario | null>(null);
  const [creando, setCreando] = useState(false);

  const estadoDe = (r: Validado): Estado | "creado" => (r.creado ? "creado" : r.estado);
  const conteo = useMemo(() => {
    const c = new Map<Estado | "creado", number>();
    for (const r of renglones) c.set(estadoDe(r), (c.get(estadoDe(r)) ?? 0) + 1);
    return c;
  }, [renglones]);
  const visibles = useMemo(
    () =>
      renglones
        .map((r, i) => ({ r, i }))
        .filter(({ r }) => filtro === "todos" || estadoDe(r) === filtro)
        .sort((a, b) => ORDEN.indexOf(estadoDe(a.r)) - ORDEN.indexOf(estadoDe(b.r)) || a.i - b.i),
    [renglones, filtro],
  );

  async function cargar(file: File) {
    setArchivo(file.name);
    setRenglones([]);
    setAviso("");
    setFiltro("todos");
    try {
      let leido: { proveedor: string; numero: string; renglones: Renglon[] };
      if (/\.(xlsx|xls|csv)$/i.test(file.name)) {
        leido = leerExcel(await file.arrayBuffer(), file.name);
      } else {
        setPaso("leyendo");
        const fd = new FormData();
        fd.append("archivo", file);
        const r = await fetch("/api/compras/validar-factura/leer", { method: "POST", body: fd });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "No se pudo leer el documento");
        leido = j;
      }
      if (!leido.renglones.length) throw new Error("La factura no trae productos con código");
      setCabecera({ proveedor: leido.proveedor, numero: leido.numero });

      setPaso("validando");
      const r = await fetch("/api/compras/validar-factura", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ renglones: leido.renglones }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "No se pudo comparar con Odoo");
      setRenglones(j.renglones);
      setCategorias(j.categorias);
      setMarcas(j.marcas);
      setAviso(j.aviso || "");
    } catch (e: any) {
      toast({ title: "No se pudo validar la factura", description: e.message, variant: "destructive" });
    } finally {
      setPaso("");
      if (input.current) input.current.value = "";
    }
  }

  function abrirCrear(i: number) {
    const r = renglones[i];
    const s = r.sugerencia;
    setForm({
      indice: i,
      codigo: r.codigo,
      nombre: s?.nombre ?? r.descripcion.toUpperCase(),
      categoriaId: s?.categoriaId ?? null,
      marcaId: s?.marcaId ?? null,
      tipo: "product",
      seguimiento: s?.seguimiento ?? "serial",
      barcode: "",
      puedeVenderse: true,
      puedeComprarse: true,
    });
  }

  async function crear() {
    if (!form) return;
    setCreando(true);
    try {
      const r = await fetch("/api/compras/validar-factura", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ producto: form, factura: cabecera.numero || archivo }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "No se pudo crear");
      setRenglones((prev) => prev.map((x, k) => (k === form.indice ? { ...x, creado: j } : x)));
      toast({ title: `${form.codigo} creado en Odoo` });
      setForm(null);
    } catch (e: any) {
      toast({ title: "No se creó el producto", description: e.message, variant: "destructive" });
    } finally {
      setCreando(false);
    }
  }

  const listo = !!form && form.codigo.trim() && form.nombre.trim().length >= 3 && form.categoriaId;
  const coincidenciasForm = form ? renglones[form.indice]?.coincidencias ?? [] : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Validar factura de compra</h1>
        <p className="text-sm text-muted-foreground">
          Carga la factura (Excel, PDF o foto): cada SKU se busca en Odoo y los productos que no están se crean desde aquí,
          revisando antes la ficha que se va a crear.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-6">
          <input
            ref={input}
            type="file"
            accept=".xlsx,.xls,.csv,.pdf,.jpg,.jpeg,.png,.webp"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && cargar(e.target.files[0])}
          />
          <Button onClick={() => input.current?.click()} disabled={!!paso || creando}>
            {paso ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Cargar factura
          </Button>
          {archivo && (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileSpreadsheet className="h-4 w-4" /> {archivo}
              {cabecera.numero && <span className="font-mono font-semibold text-foreground">{cabecera.numero}</span>}
              {cabecera.proveedor && <span>· {cabecera.proveedor}</span>}
            </span>
          )}
          {paso && (
            <span className="text-sm text-muted-foreground">
              {paso === "leyendo" ? "Leyendo la factura con IA…" : "Buscando los SKU en Odoo…"}
            </span>
          )}
        </CardContent>
      </Card>

      {aviso && (
        <p className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {aviso}
        </p>
      )}

      {renglones.length > 0 && !paso && (
        <Card>
          <CardHeader className="space-y-3">
            <CardTitle className="text-base">{renglones.length} productos en la factura</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={filtro === "todos" ? "default" : "outline"} onClick={() => setFiltro("todos")}>
                Todos ({renglones.length})
              </Button>
              {ORDEN.filter((e) => conteo.get(e)).map((e) => (
                <Button key={e} size="sm" variant={filtro === e ? "default" : "outline"} onClick={() => setFiltro(e)} title={ESTADOS[e].ayuda}>
                  {ESTADOS[e].texto} ({conteo.get(e)})
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código (SKU)</TableHead>
                  <TableHead>Descripción en la factura</TableHead>
                  <TableHead className="text-right">Cant.</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>En Odoo</TableHead>
                  <TableHead className="text-center">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map(({ r, i }) => {
                  const e = estadoDe(r);
                  return (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{r.codigo || "—"}</TableCell>
                      <TableCell className="max-w-[320px]">
                        <div className="truncate" title={r.descripcion}>{r.descripcion}</div>
                      </TableCell>
                      <TableCell className="text-right">{r.cantidad ?? "—"}</TableCell>
                      <TableCell className="text-right">{usd(r.precio)}</TableCell>
                      <TableCell>
                        <Badge className={`${ESTADOS[e].clase} whitespace-nowrap border-transparent`} title={ESTADOS[e].ayuda}>
                          {ESTADOS[e].texto}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[340px] text-xs">
                        {r.creado ? (
                          <a href={r.creado.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline">
                            Ver en Odoo <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          r.coincidencias.slice(0, 3).map((p) => (
                            <a
                              key={p.id}
                              href={`${process.env.NEXT_PUBLIC_ODOO_URL?.replace(/\/$/, "") ?? ""}/web#id=${p.id}&model=product.template&view_type=form`}
                              target="_blank"
                              rel="noreferrer"
                              className="block truncate hover:underline"
                              title={`[${p.codigo}] ${p.nombre}${p.activo ? "" : " (archivado)"}`}
                            >
                              <span className="font-mono font-semibold">{p.codigo || "sin SKU"}</span> {p.nombre}
                              {!p.activo && <span className="text-muted-foreground"> (archivado)</span>}
                            </a>
                          ))
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {!r.creado && crearPermitido(r.estado) && r.codigo && (
                          <Button size="sm" variant={r.estado === "posible" ? "outline" : "default"} onClick={() => abrirCrear(i)}>
                            <PackagePlus className="mr-1.5 h-4 w-4" />
                            {r.estado === "posible" ? "Crear igual" : "Crear en Odoo"}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!form} onOpenChange={(o) => !o && !creando && setForm(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Crear producto en Odoo</DialogTitle>
            <DialogDescription>
              Revisa y corrige la ficha antes de crearla. Nombre, categoría y marca vienen sugeridos a partir de la factura.
            </DialogDescription>
          </DialogHeader>

          {form && (
            <div className="space-y-4">
              <div className="rounded-md bg-muted p-3 text-xs">
                <span className="font-semibold">En la factura:</span> {renglones[form.indice]?.descripcion}
              </div>
              {coincidenciasForm.length > 0 && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                  <p className="mb-1 font-semibold">Productos parecidos en Odoo: verifica que no sea uno de estos.</p>
                  {coincidenciasForm.map((p) => (
                    <p key={p.id} className="truncate">
                      <span className="font-mono">{p.codigo || "sin SKU"}</span> {p.nombre}
                    </p>
                  ))}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="vf-codigo">Referencia interna (SKU)</Label>
                  <Input id="vf-codigo" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} className="font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="vf-barcode">Código de barras (opcional)</Label>
                  <Input id="vf-barcode" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="vf-nombre">Nombre del producto</Label>
                <Input id="vf-nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
                <p className="text-xs text-muted-foreground">Mayúsculas: MARCA, TIPO, MODELO y especificaciones. {form.nombre.length}/200</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Categoría</Label>
                  <Combo opciones={categorias} valor={form.categoriaId} onChange={(id) => setForm({ ...form, categoriaId: id })} vacio="Elige una categoría" />
                </div>
                <div className="space-y-1.5">
                  <Label>Marca</Label>
                  <Combo opciones={marcas} valor={form.marcaId} onChange={(id) => setForm({ ...form, marcaId: id })} vacio="Sin marca" />
                </div>
                <div className="space-y-1.5">
                  <Label>Tipo de producto</Label>
                  <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as Tipo })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="product">Almacenable</SelectItem>
                      <SelectItem value="consu">Consumible</SelectItem>
                      <SelectItem value="service">Servicio</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Seguimiento</Label>
                  <Select
                    value={form.tipo === "product" ? form.seguimiento : "none"}
                    onValueChange={(v) => setForm({ ...form, seguimiento: v as Seguimiento })}
                    disabled={form.tipo !== "product"}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="serial">Por número de serie</SelectItem>
                      <SelectItem value="lot">Por lote</SelectItem>
                      <SelectItem value="none">Sin seguimiento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={form.puedeVenderse} onCheckedChange={(v) => setForm({ ...form, puedeVenderse: v === true })} />
                  Puede venderse
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={form.puedeComprarse} onCheckedChange={(v) => setForm({ ...form, puedeComprarse: v === true })} />
                  Puede comprarse
                </label>
              </div>

              <p className="text-xs text-muted-foreground">
                Se crea con unidad «Units», precio de venta 1 (el precio real va en las listas de precios), sin empresa y con el IVA
                de ventas y compras de cada empresa, como al crearlo en Odoo. El costo y el proveedor los pone la recepción de la OC.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)} disabled={creando}>
              Cancelar
            </Button>
            <Button onClick={crear} disabled={!listo || creando}>
              {creando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar y crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
