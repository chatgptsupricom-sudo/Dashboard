"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Download, Loader2, Lock, Search, ShoppingCart } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { SEDES } from "@/lib/compras/constants";
import { ColumnHeader } from "@/components/compras/column-header";
import {
  ACCIONES,
  CRECIMIENTO_POR_CLASE,
  ETA_DEFAULT,
  calcularSugerido,
  type Accion,
  type ResultadoSugerido,
} from "@/lib/compras/sugeridos";

/** Lo que manda el API: los datos de entrada de la hoja de analisis. */
interface FilaSugerido {
  id: number;
  codigo: string;
  name: string;
  marca: string;
  categoria: string;
  fisico: number;
  reservado: number;
  transito: number;
  ventas45d: number;
  ventas365d: number;
  moq: number;
  costo: number;
  eta: number | null;
  compraManual: number | null;
  ajustadoPor: string | null;
  ajustadoAt: string | null;
}

type FilaCalculada = FilaSugerido & { calc: ResultadoSugerido };

// Clave temporal para pasar líneas prellenadas a /compras/ordenes/nueva.
const OC_PREFILL_KEY = "oc_prefill_lines";
const POR_PAGINA = 25;

const TIPS: Record<string, string> = {
  ABC: "Por valor vendido en el año (ventas 365d × costo): A ≥ $15.000, B ≥ $5.000, C el resto.",
  Físico: "Unidades en el almacén principal de la sede.",
  Res: "Unidades reservadas para pedidos.",
  Tráns: "Unidades en órdenes de compra confirmadas que todavía no llegaron.",
  Disp: "Stock disponible = Físico + Tránsito − Reservado (como la hoja).",
  "Dem./día":
    "Demanda diaria. Si las ventas de 45 días son más del doble del promedio anual, se usa solo 45d; si no, 70% de 45d + 30% de 365d.",
  ETA: `Días hasta que llega la compra. Lo carga Compras por producto; vacío = ${ETA_DEFAULT}.`,
  Seg: "Stock de seguridad = z × (demanda × 0,15) × √ETA, con z = 2,33 (A), 1,65 (B), 1,28 (C).",
  Reorden:
    "Punto de reorden (quiebre) = demanda diaria × (ETA + 7) + stock de seguridad. Por debajo de esto hay que pedir.",
  Objetivo:
    "Stock objetivo = demanda diaria × (días deseados + ETA) + seguridad. Días deseados: 45 (A), 30 (B), 20 (C).",
  "Días inv.": "Días que alcanza el stock (Disponible + Tránsito) ÷ demanda diaria.",
  Quiebre: "Fecha estimada en que se acaba el stock con la demanda actual.",
  Recomendada: `Lo que calcula la fórmula, redondeado al MOQ. Se lleva hasta el objetivo con el % de crecimiento (A ${CRECIMIENTO_POR_CLASE.A * 100}%, B ${CRECIMIENTO_POR_CLASE.B * 100}%, C ${CRECIMIENTO_POR_CLASE.C * 100}%); en un pico inusual solo hasta el punto de reorden. Menos de 2 unidades no se compra.`,
  Manual:
    "Compra manual/puntual: reemplaza a la recomendada. 0 = bloquear la compra. Se borra sola al crear la orden de compra (el 0 queda).",
  Comprar: "Lo que se va a pedir: la compra manual si hay, si no la recomendada.",
  Valor: "Comprar × costo unitario.",
};

function fmt(n: number, dec = 0) {
  return n.toLocaleString("es-VE", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fechaQuiebre(dias: number): string {
  if (dias >= 730) return "—";
  const d = new Date();
  d.setDate(d.getDate() + Math.floor(dias));
  return d.toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

/** Lo mas urgente arriba: por accion, despues el que se quiebra antes, despues el de mas valor. */
function ordenarPorUrgencia(filas: FilaSugerido[]): FilaSugerido[] {
  return filas
    .map((f) => ({ f, c: calcularSugerido(f) }))
    .sort(
      (a, b) =>
        ACCIONES[a.c.accion].orden - ACCIONES[b.c.accion].orden ||
        a.c.diasHastaQuiebre - b.c.diasHastaQuiebre ||
        b.c.valorAComprar - a.c.valorAComprar,
    )
    .map(({ f }) => f);
}

function abcColor(abc: string) {
  return abc === "A" ? "bg-green-600" : abc === "B" ? "bg-yellow-500" : "bg-gray-400";
}

/**
 * Celda numerica editable: guarda al salir del campo o con Enter; vacio =
 * borrar. Escape vuelve al valor guardado.
 */
function CeldaEditable({
  valor,
  placeholder,
  onGuardar,
  titulo,
}: {
  valor: number | null;
  placeholder?: string;
  onGuardar: (v: number | null) => void;
  titulo: string;
}) {
  const [texto, setTexto] = useState(valor === null ? "" : String(valor));
  useEffect(() => setTexto(valor === null ? "" : String(valor)), [valor]);

  const confirmar = () => {
    const limpio = texto.trim();
    const nuevo = limpio === "" ? null : Number(limpio);
    if (nuevo !== null && (!Number.isInteger(nuevo) || nuevo < 0)) {
      setTexto(valor === null ? "" : String(valor));
      return;
    }
    if (nuevo !== valor) onGuardar(nuevo);
  };

  return (
    <Input
      type="number"
      min={0}
      step={1}
      inputMode="numeric"
      aria-label={titulo}
      title={titulo}
      placeholder={placeholder}
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setTexto(valor === null ? "" : String(valor));
      }}
      className="h-8 w-[72px] px-2 text-center text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
    />
  );
}

export default function SugeridosPage() {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const locale = (params?.locale as string) || "es";

  const [filas, setFilas] = useState<FilaSugerido[]>([]);
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState<string | null>(null);

  const [sede, setSede] = useState("9");
  const [vista, setVista] = useState<"comprar" | "todos">("comprar");
  const [busqueda, setBusqueda] = useState("");
  const [filtroABC, setFiltroABC] = useState("TODAS");
  const [filtroMarca, setFiltroMarca] = useState("TODAS");
  const [filtroCategoria, setFiltroCategoria] = useState("TODAS");
  const [filtroAccion, setFiltroAccion] = useState("TODAS");
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    let vigente = true;
    setLoading(true);
    setWarning(null);
    fetch(`/api/compras/sugeridos?sede=${sede}`)
      .then((r) => r.json())
      .then((result) => {
        if (!vigente) return;
        if (result.success) {
          setFilas(ordenarPorUrgencia(result.data));
          setWarning(result.warning || null);
        } else {
          toast({ variant: "destructive", title: "Error", description: result.error || "No se pudo cargar" });
        }
      })
      .catch((e) => console.error("[Sugeridos] Error:", e))
      .finally(() => vigente && setLoading(false));
    return () => {
      vigente = false;
    };
  }, [sede, toast]);

  // El calculo corre aca: al cambiar un ETA o una compra manual se ve al
  // instante. El orden es el de la carga, para que la fila que se esta
  // editando no salte de lugar.
  const calculadas: FilaCalculada[] = useMemo(
    () => filas.map((f) => ({ ...f, calc: calcularSugerido(f) })),
    [filas],
  );

  const enVista = useMemo(
    () =>
      vista === "todos"
        ? calculadas
        : calculadas.filter((f) => f.calc.compraFinal > 0 || f.calc.revision !== null),
    [calculadas, vista],
  );

  const trasABC = useMemo(
    () => (filtroABC === "TODAS" ? enVista : enVista.filter((f) => f.calc.abc === filtroABC)),
    [enVista, filtroABC],
  );
  // Sin vacios: un SelectItem con value "" rompe el Select de Radix.
  const marcas = useMemo(
    () => Array.from(new Set(trasABC.map((f) => f.marca).filter(Boolean))).sort(),
    [trasABC],
  );
  const trasMarca = useMemo(
    () => (filtroMarca === "TODAS" ? trasABC : trasABC.filter((f) => f.marca === filtroMarca)),
    [trasABC, filtroMarca],
  );
  const categorias = useMemo(
    () => Array.from(new Set(trasMarca.map((f) => f.categoria).filter(Boolean))).sort(),
    [trasMarca],
  );
  const filtradas = useMemo(() => {
    const t = busqueda.toLowerCase().trim();
    return trasMarca.filter(
      (f) =>
        (filtroCategoria === "TODAS" || f.categoria === filtroCategoria) &&
        (filtroAccion === "TODAS" || f.calc.accion === filtroAccion) &&
        (t === "" || f.codigo.toLowerCase().includes(t) || f.name.toLowerCase().includes(t)),
    );
  }, [trasMarca, filtroCategoria, filtroAccion, busqueda]);

  useEffect(() => {
    setFiltroMarca("TODAS");
    setFiltroCategoria("TODAS");
  }, [filtroABC]);
  useEffect(() => setFiltroCategoria("TODAS"), [filtroMarca]);
  useEffect(
    () => setPagina(1),
    [sede, vista, busqueda, filtroABC, filtroMarca, filtroCategoria, filtroAccion],
  );

  const aComprar = useMemo(() => filtradas.filter((f) => f.calc.compraFinal > 0), [filtradas]);
  const kpis = useMemo(
    () => ({
      skus: aComprar.length,
      valor: aComprar.reduce((s, f) => s + f.calc.valorAComprar, 0),
      unidades: aComprar.reduce((s, f) => s + f.calc.compraFinal, 0),
      criticos: calculadas.filter((f) => f.calc.accion === "riesgo" || f.calc.accion === "urgente").length,
      manuales: calculadas.filter((f) => f.compraManual !== null).length,
    }),
    [aComprar, calculadas],
  );

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const visibles = filtradas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  const guardarAjuste = async (
    fila: FilaSugerido,
    campo: "eta" | "compraManual",
    valor: number | null,
  ) => {
    const antes = fila[campo];
    setFilas((fs) => fs.map((f) => (f.id === fila.id ? { ...f, [campo]: valor } : f)));
    try {
      const r = await fetch("/api/compras/sugeridos/ajustes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cids: Number(sede),
          product_odoo_id: fila.id,
          codigo: fila.codigo,
          [campo === "eta" ? "eta_dias" : "compra_manual"]: valor,
        }),
      });
      const json = await r.json();
      if (!r.ok || !json.success) throw new Error(json.error || "No se pudo guardar");
      setFilas((fs) => fs.map((f) => (f.id === fila.id ? { ...f, ...json.ajuste } : f)));
    } catch (e: any) {
      setFilas((fs) => fs.map((f) => (f.id === fila.id ? { ...f, [campo]: antes } : f)));
      toast({ variant: "destructive", title: `No se guardó (${fila.codigo})`, description: e.message });
    }
  };

  const crearOrden = () => {
    const lines = aComprar.slice(0, 100).map((f) => ({
      product_odoo_id: f.id,
      product_code: f.codigo,
      description: f.name || f.codigo,
      quantity: f.calc.compraFinal,
      unit_price: Number(f.costo || 0),
    }));
    if (lines.length === 0) return;
    if (aComprar.length > 100) {
      toast({ title: "Orden con los primeros 100", description: `Hay ${aComprar.length} productos para comprar.` });
    }
    try {
      sessionStorage.setItem(OC_PREFILL_KEY, JSON.stringify({ company_id: Number(sede), lines }));
    } catch {
      /* sessionStorage no disponible: la orden se abre vacía */
    }
    router.push(`/${locale}/compras/ordenes/nueva`);
  };

  const exportarExcel = () => {
    const sedeNombre = SEDES.find((s) => s.id === sede)?.label || sede;
    const analisis = filtradas.map((f) => ({
      Codigo: f.codigo,
      Descripcion: f.name,
      Marca: f.marca,
      Categoria: f.categoria,
      Fisico: f.fisico,
      Reservado: f.reservado,
      Transito: f.transito,
      "Stock Disponible": f.calc.stockDisponible,
      "Ventas 45d": f.ventas45d,
      "Ventas 365d": f.ventas365d,
      "Demanda Diaria": Number(f.calc.demandaDiaria.toFixed(4)),
      "Clasificacion ABC": f.calc.abc,
      MOQ: f.moq,
      "Costo Unitario": f.costo,
      "ETA (dias)": f.calc.eta,
      "Dias Inventario Deseado": f.calc.diasInventarioDeseado,
      "Stock de Seguridad": f.calc.stockSeguridad,
      "Punto de Reorden": Number(f.calc.puntoReorden.toFixed(2)),
      "Stock Objetivo": Number(f.calc.stockObjetivo.toFixed(2)),
      "Dias Inventario Actual":
        f.calc.diasInventarioActual === null ? "" : Number(f.calc.diasInventarioActual.toFixed(1)),
      "Compra recomendada": f.calc.compraRecomendada,
      "Compra Manual/Puntual": f.compraManual ?? "",
      "Cantidad a Comprar": f.calc.compraFinal,
      "Valor a Comprar": Number(f.calc.valorAComprar.toFixed(2)),
      "Revisión de compra":
        f.calc.revision === "bloqueo_manual" ? "BLOQUEO MANUAL" : f.calc.revision === "revision_manual" ? "Revisión Manual" : "",
      Accion: ACCIONES[f.calc.accion].label,
      "Fecha de Quiebre": fechaQuiebre(f.calc.diasHastaQuiebre),
    }));
    const pedido = aComprar.map((f) => ({
      Codigo: f.codigo,
      Descripcion: f.name,
      Fisico: f.fisico,
      Reservado: f.reservado,
      Transito: f.transito,
      "Stock Disponible": f.calc.stockDisponible,
      "Ventas 45d": f.ventas45d,
      "Ventas 365d": f.ventas365d,
      MOQ: f.moq,
      "Costo Unitario": f.costo,
      "Cantidad a Comprar": f.calc.compraFinal,
      "Valor a Comprar": Number(f.calc.valorAComprar.toFixed(2)),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(analisis), "Analisis");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pedido), "Pedido");
    XLSX.writeFile(wb, `Sugeridos_${sedeNombre}_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  if (loading) {
    return (
      <div className="flex h-[80vh] flex-col items-center justify-center">
        <Loader2 className="mb-4 h-12 w-12 animate-spin text-blue-600" />
        <h2 className="text-xl font-semibold text-gray-700">Calculando sugeridos de compra...</h2>
        <p className="mt-2 text-sm text-gray-500">Ventas, stock, tránsito, MOQ y costos desde Odoo</p>
      </div>
    );
  }

  const th = "whitespace-nowrap px-2 text-center text-xs";

  return (
    <div className="mx-auto max-w-[1800px] space-y-5 p-4 sm:p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Sugeridos de Compra</h1>
        <p className="text-gray-500">
          Mismo cálculo que la hoja de análisis de Compras. El ETA y la compra manual se cargan en la tabla y
          se recalcula al instante.
        </p>
      </div>

      {warning && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          <strong>Advertencia:</strong> {warning}
        </div>
      )}

      <Card className="border-gray-200 bg-white shadow-sm">
        <CardContent className="grid grid-cols-1 items-center gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Select value={sede} onValueChange={setSede}>
            <SelectTrigger aria-label="Sede">
              <SelectValue placeholder="Sede" />
            </SelectTrigger>
            <SelectContent>
              {SEDES.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
            <Input
              placeholder="Buscar SKU o nombre..."
              className="w-full pl-9"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
          <Select value={filtroAccion} onValueChange={setFiltroAccion}>
            <SelectTrigger aria-label="Acción">
              <SelectValue placeholder="Acción" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODAS">Todas las acciones</SelectItem>
              {(Object.keys(ACCIONES) as Accion[]).map((a) => (
                <SelectItem key={a} value={a}>
                  {ACCIONES[a].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filtroABC} onValueChange={setFiltroABC}>
            <SelectTrigger aria-label="Clase ABC">
              <SelectValue placeholder="Clase ABC" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODAS">Todas las clases</SelectItem>
              <SelectItem value="A">A — ≥ $15.000/año</SelectItem>
              <SelectItem value="B">B — ≥ $5.000/año</SelectItem>
              <SelectItem value="C">C — resto</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filtroMarca} onValueChange={setFiltroMarca}>
            <SelectTrigger aria-label="Marca">
              <SelectValue placeholder="Marca" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODAS">Todas las marcas</SelectItem>
              {marcas.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
            <SelectTrigger aria-label="Categoría">
              <SelectValue placeholder="Categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODAS">Todas las categorías</SelectItem>
              {categorias.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={exportarExcel}
            variant="outline"
            className="w-full border-blue-600 text-blue-700 hover:bg-blue-50"
          >
            <Download className="mr-2 h-4 w-4" /> Exportar
          </Button>
          <Button onClick={crearOrden} disabled={aComprar.length === 0} className="w-full">
            <ShoppingCart className="mr-2 h-4 w-4" /> Crear orden de compra
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="border-blue-200 bg-blue-50/40 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">A comprar</p>
            <p className="mt-1 text-2xl font-bold text-blue-700">{kpis.skus} SKUs</p>
            <p className="mt-1 text-xs text-gray-400">{fmt(kpis.unidades)} unidades, con los filtros</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50/40 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">Valor a comprar</p>
            <p className="mt-1 text-2xl font-bold text-emerald-700">${fmt(kpis.valor)}</p>
            <p className="mt-1 text-xs text-gray-400">Comprar × costo unitario</p>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50/40 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">Riesgo / urgente</p>
            <p className="mt-1 text-2xl font-bold text-red-700">{kpis.criticos}</p>
            <p className="mt-1 text-xs text-gray-400">Se quiebran antes del ETA o bajo seguridad</p>
          </CardContent>
        </Card>
        <Card className="border-violet-200 bg-violet-50/40 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">Con compra manual</p>
            <p className="mt-1 text-2xl font-bold text-violet-700">{kpis.manuales}</p>
            <p className="mt-1 text-xs text-gray-400">Incluye bloqueos (0)</p>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-md">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          {(
            [
              ["comprar", "Para comprar / revisar"],
              ["todos", "Todos los productos"],
            ] as const
          ).map(([v, label]) => (
            <Button
              key={v}
              size="sm"
              variant={vista === v ? "default" : "outline"}
              onClick={() => setVista(v)}
              aria-pressed={vista === v}
            >
              {label}
            </Button>
          ))}
          <span className="ml-auto text-sm text-gray-500">{filtradas.length} productos</span>
        </div>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="text-xs">
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="sticky left-0 z-10 min-w-[240px] bg-slate-50 px-3">Producto</TableHead>
                  {[
                    "ABC",
                    "Físico",
                    "Res",
                    "Tráns",
                    "Disp",
                  ].map((h) => (
                    <TableHead key={h} className={th}>
                      <ColumnHeader label={h} tooltip={TIPS[h]} className="justify-center" />
                    </TableHead>
                  ))}
                  <TableHead className={th}>V. 45d</TableHead>
                  <TableHead className={th}>V. 365d</TableHead>
                  {["Dem./día"].map((h) => (
                    <TableHead key={h} className={th}>
                      <ColumnHeader label={h} tooltip={TIPS[h]} className="justify-center" />
                    </TableHead>
                  ))}
                  <TableHead className={th}>MOQ</TableHead>
                  <TableHead className={th}>Costo</TableHead>
                  {["ETA", "Seg", "Reorden", "Objetivo", "Días inv.", "Quiebre", "Recomendada", "Manual", "Comprar", "Valor"].map(
                    (h) => (
                      <TableHead
                        key={h}
                        className={`${th} ${h === "ETA" || h === "Manual" ? "bg-violet-50" : ""} ${h === "Comprar" ? "font-bold text-blue-700" : ""}`}
                      >
                        <ColumnHeader label={h} tooltip={TIPS[h]} className="justify-center" />
                      </TableHead>
                    ),
                  )}
                  <TableHead className="min-w-[190px] px-2 text-xs">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={23} className="py-10 text-center text-gray-500">
                      {vista === "comprar"
                        ? "Nada para comprar con estos filtros. Mira “Todos los productos”."
                        : "No hay productos con estos filtros."}
                    </TableCell>
                  </TableRow>
                ) : (
                  visibles.map((f) => {
                    const c = f.calc;
                    const accion = ACCIONES[c.accion];
                    const num = "px-2 text-center tabular-nums";
                    return (
                      <TableRow key={f.id} className="hover:bg-slate-50/70">
                        <TableCell className="sticky left-0 z-10 bg-white px-3">
                          <div className="font-semibold">{f.codigo}</div>
                          <div className="w-[220px] truncate text-gray-500" title={f.name}>
                            {f.name}
                          </div>
                          <div className="text-[10px] text-gray-400">{f.categoria}</div>
                        </TableCell>
                        <TableCell className="px-2 text-center">
                          <Badge className={`${abcColor(c.abc)} font-bold text-white`}>{c.abc}</Badge>
                        </TableCell>
                        <TableCell className={num}>{fmt(f.fisico)}</TableCell>
                        <TableCell className={num}>{f.reservado ? fmt(f.reservado) : "—"}</TableCell>
                        <TableCell className={num}>
                          {f.transito ? <span className="text-emerald-700">{fmt(f.transito)}</span> : "—"}
                        </TableCell>
                        <TableCell className={`${num} font-semibold ${c.stockDisponible <= 0 ? "text-red-600" : ""}`}>
                          {fmt(c.stockDisponible)}
                        </TableCell>
                        <TableCell className={num}>{fmt(f.ventas45d)}</TableCell>
                        <TableCell className={num}>{fmt(f.ventas365d)}</TableCell>
                        <TableCell className={num}>{fmt(c.demandaDiaria, 2)}</TableCell>
                        <TableCell className={num}>{f.moq}</TableCell>
                        <TableCell className={num}>
                          {f.costo > 0 ? (
                            `$${fmt(f.costo, 2)}`
                          ) : (
                            <span className="rounded border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                              Sin costo
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="bg-violet-50/40 px-2">
                          <div className="flex justify-center">
                            <CeldaEditable
                              valor={f.eta}
                              placeholder={String(ETA_DEFAULT)}
                              titulo={`ETA en días de ${f.codigo}`}
                              onGuardar={(v) => guardarAjuste(f, "eta", v)}
                            />
                          </div>
                        </TableCell>
                        <TableCell className={num}>{c.stockSeguridad}</TableCell>
                        <TableCell className={num}>{fmt(c.puntoReorden, 1)}</TableCell>
                        <TableCell className={num}>{fmt(c.stockObjetivo, 1)}</TableCell>
                        <TableCell className={num}>
                          {c.diasInventarioActual === null ? (
                            <span className="text-gray-400">∞</span>
                          ) : (
                            <span
                              className={
                                c.diasInventarioActual < c.eta
                                  ? "font-bold text-red-600"
                                  : c.diasInventarioActual < c.eta + 7
                                    ? "font-semibold text-orange-600"
                                    : ""
                              }
                            >
                              {fmt(c.diasInventarioActual)}d
                            </span>
                          )}
                        </TableCell>
                        <TableCell className={`${num} whitespace-nowrap`}>{fechaQuiebre(c.diasHastaQuiebre)}</TableCell>
                        <TableCell className={`${num} ${f.compraManual !== null ? "text-gray-400 line-through" : ""}`}>
                          {c.compraRecomendada || "—"}
                        </TableCell>
                        <TableCell className="bg-violet-50/40 px-2">
                          <div className="flex justify-center">
                            <CeldaEditable
                              valor={f.compraManual}
                              titulo={`Compra manual de ${f.codigo}`}
                              onGuardar={(v) => guardarAjuste(f, "compraManual", v)}
                            />
                          </div>
                          {f.ajustadoPor && f.compraManual !== null && (
                            <div className="mt-0.5 text-center text-[10px] text-gray-400" title={`Cargado por ${f.ajustadoPor}`}>
                              {f.ajustadoPor.split(" ")[0]}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className={`${num} text-sm font-bold`}>
                          {c.compraFinal > 0 ? (
                            <span className="text-blue-700">+{fmt(c.compraFinal)}</span>
                          ) : c.revision === "bloqueo_manual" ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-red-700" title="Compra bloqueada a mano (0)">
                              <Lock className="h-3 w-3" /> Bloq.
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </TableCell>
                        <TableCell className={`${num} font-semibold`}>
                          {c.valorAComprar > 0 ? `$${fmt(c.valorAComprar)}` : "—"}
                        </TableCell>
                        <TableCell className="px-2">
                          <span className={`inline-block rounded border px-2 py-0.5 text-[11px] font-medium ${accion.clase}`}>
                            {accion.label}
                          </span>
                          {c.revision === "revision_manual" && (
                            <div
                              className="mt-1 text-[10px] font-medium text-amber-700"
                              title="Está bajo el punto de reorden pero vende menos que el MOQ al año: decidir a mano"
                            >
                              Revisión manual
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between border-t p-4">
            <p className="text-sm text-gray-500">
              {filtradas.length === 0
                ? "0 productos"
                : `${(pagina - 1) * POR_PAGINA + 1}–${Math.min(pagina * POR_PAGINA, filtradas.length)} de ${filtradas.length}`}
            </p>
            {totalPaginas > 1 && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPagina((p) => Math.max(p - 1, 1))} disabled={pagina === 1}>
                  Anterior
                </Button>
                <span className="text-sm text-gray-500">
                  {pagina} / {totalPaginas}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPagina((p) => Math.min(p + 1, totalPaginas))}
                  disabled={pagina === totalPaginas}
                >
                  Siguiente
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
