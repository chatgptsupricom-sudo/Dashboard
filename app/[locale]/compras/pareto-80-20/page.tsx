"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Download,
  HelpCircle,
  Loader2,
  PieChart as PieChartIcon,
  Search,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { SEDES } from "@/lib/compras/constants";
import { ColumnHeader } from "@/components/compras/column-header";
import { COLUMN_TOOLTIPS } from "@/lib/compras/column-tooltips";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface ProductoPareto {
  id: number;
  codigo: string;
  name: string;
  marca: string;
  categoria: string;
  monto: number;
  unidades: number;
  pctIndividual: number;
  pctAcumulado: number;
  clase: "A" | "B" | "C";
}

interface Resumen {
  totalProductos: number;
  productosClaseA: number;
  pctProductosClaseA: number;
  pctMontoClaseA: number;
}

const CLASE_BADGE: Record<string, string> = {
  A: "bg-emerald-600 text-white",
  B: "bg-amber-500 text-white",
  C: "bg-gray-400 text-white",
};

// Las compras son menos frecuentes que las ventas: 90 dias puede dejar fuera
// productos de temporada, asi que la ventana se puede ampliar (issue #176).
const VENTANAS = [
  { value: "90", label: "Últimos 90 días" },
  { value: "180", label: "Últimos 180 días" },
  { value: "365", label: "Último año" },
];

export default function Pareto8020Page() {
  const [productos, setProductos] = useState<ProductoPareto[]>([]);
  const [resumen, setResumen] = useState<Resumen>({
    totalProductos: 0,
    productosClaseA: 0,
    pctProductosClaseA: 0,
    pctMontoClaseA: 0,
  });
  const [loading, setLoading] = useState(true);

  const [sede, setSede] = useState<string>("9");
  const [dias, setDias] = useState<string>("90");
  const [busqueda, setBusqueda] = useState<string>("");
  const [filtroMarca, setFiltroMarca] = useState<string>("TODAS");
  const [filtroClase, setFiltroClase] = useState<string>("TODAS");

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/compras/pareto-80-20?sede=${sede}&dias=${dias}`,
        );
        const result = await response.json();
        if (result.success) {
          setProductos(result.data);
          setResumen(result.resumen);
        }
      } catch (error) {
        console.error("Error fetching pareto 80/20:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [sede, dias]);

  // El .filter(Boolean) no es decorativo: un solo valor vacio hace que Radix
  // lance desde <SelectItem value=""> y se caiga TODA la pantalla (pantalla en
  // negro, sin mensaje). El origen se arregla en la API, esto es el cinturon
  // por si vuelve a colarse un nombre raro desde Odoo.
  const marcasUnicas = useMemo(
    () =>
      Array.from(new Set(productos.map((p) => p.marca).filter(Boolean))).sort(),
    [productos],
  );

  const productosFiltrados = useMemo(() => {
    return productos.filter((p) => {
      const termino = busqueda.toLowerCase();
      const coincideBusqueda =
        termino === "" ||
        p.codigo.toLowerCase().includes(termino) ||
        p.name.toLowerCase().includes(termino);
      const cumpleMarca = filtroMarca === "TODAS" || p.marca === filtroMarca;
      const cumpleClase = filtroClase === "TODAS" || p.clase === filtroClase;
      return coincideBusqueda && cumpleMarca && cumpleClase;
    });
  }, [productos, busqueda, filtroMarca, filtroClase]);

  useEffect(() => {
    setCurrentPage(1);
  }, [busqueda, filtroMarca, filtroClase, dias]);

  const totalPages = Math.ceil(productosFiltrados.length / itemsPerPage);
  const currentItems = productosFiltrados.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  // Solo los primeros ~30 para que el grafico se lea bien.
  const datosGrafico = useMemo(
    () =>
      productos.slice(0, 30).map((p) => ({
        nombre: p.codigo,
        monto: p.monto,
        pctAcumulado: p.pctAcumulado,
      })),
    [productos],
  );

  const exportarExcel = () => {
    const data = productosFiltrados.map((item) => ({
      Código: item.codigo,
      Descripción: item.name,
      Marca: item.marca,
      Categoría: item.categoria,
      [`Monto comprado (${dias}d)`]: item.monto,
      [`Unidades compradas (${dias}d)`]: item.unidades,
      "% Individual": item.pctIndividual,
      "% Acumulado": item.pctAcumulado,
      Clase: item.clase,
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Pareto_80_20");
    XLSX.writeFile(
      workbook,
      `Pareto_Compras_80_20_${new Date().toISOString().split("T")[0]}.xlsx`,
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh]">
        <Loader2 className="h-12 w-12 animate-spin text-emerald-600 mb-4" />
        <h2 className="text-xl font-semibold text-gray-700">
          Calculando curva 80/20...
        </h2>
      </div>
    );
  }


  return (
    <div className="mx-auto max-w-6xl min-w-0 space-y-6">
      {/* Cabecera */}
      <div className="flex items-start gap-3">
        <div className="hidden shrink-0 rounded-2xl bg-emerald-50 p-3 text-emerald-600 dark:bg-emerald-950/50 sm:block">
          <PieChartIcon className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
            Curva 80/20 (Pareto)
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Productos que concentran la mayor parte del gasto de compra en los
            últimos {dias} días, según órdenes de compra confirmadas. Excluye
            servicios y gastos (fletes, acarreos).
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard
          label="Productos Clase A"
          value={String(resumen.productosClaseA)}
          hint={`de ${resumen.totalProductos} analizados`}
          tone="emerald"
        />
        <KpiCard
          label="% de Productos"
          value={`${resumen.pctProductosClaseA}%`}
          hint="son Clase A"
          tone="emerald"
        />
        <KpiCard
          label="% del Gasto"
          value={`${resumen.pctMontoClaseA}%`}
          hint="lo concentra la Clase A"
          tone="blue"
        />
        <KpiCard
          label="Total Analizado"
          value={String(resumen.totalProductos)}
          hint={`SKUs comprados (${dias}d)`}
          tone="slate"
        />
      </div>

      {/* Grafico */}
      <Card className="min-w-0 rounded-3xl border-slate-200 shadow-sm dark:border-slate-800">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
            <PieChartIcon className="h-4 w-4 text-emerald-600" /> Curva de Pareto (Top 30)
          </CardTitle>
        </CardHeader>
        <CardContent className="min-w-0 px-2 sm:px-6">
          {/* El grafico necesita ancho para que quepan 30 etiquetas rotadas:
              scrollea DENTRO de su tarjeta en vez de estirar la pagina. El
              min-w-0 es imprescindible: Card es flex column y sin el, el hijo
              de min-w-[680px] estira la tarjeta (y con ella la pagina) en vez
              de scrollear. */}
          <div className="-mx-2 min-w-0 overflow-x-auto px-2 sm:mx-0 sm:px-0">
            <div className="min-w-[680px]">
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={datosGrafico} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="nombre" tick={{ fontSize: 10 }} interval={0} angle={-45} textAnchor="end" height={70} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                  <Tooltip
                    formatter={(value: number, name: string) =>
                      name === "% Acumulado" ? `${value}%` : `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
                    }
                  />
                  <Legend />
                  <Bar yAxisId="left" dataKey="monto" name="Monto comprado" fill="#10b981" radius={[3, 3, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="pctAcumulado" name="% Acumulado" stroke="#2563eb" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filtros */}
      <Card className="rounded-3xl border-slate-200 shadow-sm dark:border-slate-800">
        <CardContent className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <Select
            value={sede}
            onValueChange={(v) => {
              setSede(v);
              setCurrentPage(1);
            }}
          >
            <SelectTrigger className="w-full">
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

          <Select value={dias} onValueChange={setDias}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              {VENTANAS.map((v) => (
                <SelectItem key={v.value} value={v.value}>
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              type="text"
              placeholder="Buscar SKU o nombre…"
              className="w-full pl-9"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>

          <Select value={filtroMarca} onValueChange={setFiltroMarca}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Marca" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODAS">Todas las Marcas</SelectItem>
              {marcasUnicas.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filtroClase} onValueChange={setFiltroClase}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Clase" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODAS">Todas las Clases</SelectItem>
              <SelectItem value="A">Clase A</SelectItem>
              <SelectItem value="B">Clase B</SelectItem>
              <SelectItem value="C">Clase C</SelectItem>
            </SelectContent>
          </Select>

          <Button
            onClick={exportarExcel}
            variant="outline"
            className="w-full border-emerald-600 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400"
          >
            <Download className="mr-2 h-4 w-4" /> Exportar
          </Button>
        </CardContent>
      </Card>

      {/* Resultados */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Detalle por producto
            </h2>
            {/* Los tooltips de los encabezados solo existen en la tabla de
                escritorio; esto deja la misma explicación al alcance en móvil. */}
            <LeyendaColumnas dias={dias} />
          </div>
          <span className="text-xs text-slate-400">
            {productosFiltrados.length}{" "}
            {productosFiltrados.length === 1 ? "producto" : "productos"}
          </span>
        </div>

        {currentItems.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-white py-16 text-center text-sm text-slate-400 dark:border-slate-800 dark:bg-slate-900">
            Sin órdenes de compra confirmadas en el período seleccionado.
          </div>
        ) : (
          <>
            {/* Movil: tarjetas */}
            <div className="space-y-2.5 md:hidden">
              {currentItems.map((item, index) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-slate-100">
                        <span className="text-slate-400">
                          #{(currentPage - 1) * itemsPerPage + index + 1}
                        </span>
                        <span className="truncate font-mono">{item.codigo}</span>
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-500" title={item.name}>
                        {item.name}
                      </p>
                    </div>
                    <Badge className={`${CLASE_BADGE[item.clase]} shrink-0`}>
                      {item.clase}
                    </Badge>
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Monto ({dias}d)
                      </dt>
                      <dd className="text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">
                        ${item.monto.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Unidades ({dias}d)
                      </dt>
                      <dd className="text-sm tabular-nums text-slate-700 dark:text-slate-200">
                        {item.unidades.toLocaleString("es")}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Marca / Categoría
                      </dt>
                      <dd className="truncate text-xs text-slate-700 dark:text-slate-200" title={item.categoria}>
                        {item.marca} · {item.categoria}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        % Indiv. / Acum.
                      </dt>
                      <dd className="text-xs tabular-nums text-slate-700 dark:text-slate-200">
                        {item.pctIndividual}% · {item.pctAcumulado}%
                      </dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>

            {/* Escritorio: tabla */}
            <Card className="hidden overflow-hidden rounded-3xl border-slate-200 shadow-sm dark:border-slate-800 md:block">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="px-6">
                        <ColumnHeader label="Producto" tooltip={COLUMN_TOOLTIPS.Producto} />
                      </TableHead>
                      <TableHead className="whitespace-nowrap">
                        <ColumnHeader
                          label="Marca/Cat"
                          tooltip={COLUMN_TOOLTIPS["Marca/Cat"]}
                          className="justify-center"
                        />
                      </TableHead>
                      <TableHead className="whitespace-nowrap">
                        <ColumnHeader
                          label={`Monto comprado (${dias}d)`}
                          tooltip={COLUMN_TOOLTIPS["Monto comprado"]}
                          className="justify-center"
                        />
                      </TableHead>
                      <TableHead className="whitespace-nowrap">
                        <ColumnHeader
                          label={`Unidades (${dias}d)`}
                          tooltip={COLUMN_TOOLTIPS["Unidades compradas"]}
                          className="justify-center"
                        />
                      </TableHead>
                      <TableHead className="whitespace-nowrap">
                        <ColumnHeader
                          label="% Individual"
                          tooltip={COLUMN_TOOLTIPS["% Individual"]}
                          className="justify-center"
                        />
                      </TableHead>
                      <TableHead className="whitespace-nowrap">
                        <ColumnHeader
                          label="% Acumulado"
                          tooltip={COLUMN_TOOLTIPS["% Acumulado"]}
                          className="justify-center"
                        />
                      </TableHead>
                      <TableHead className="pr-6">
                        <ColumnHeader
                          label="Clase"
                          tooltip={COLUMN_TOOLTIPS.Clase}
                          className="justify-end"
                        />
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentItems.map((item, index) => (
                      <TableRow key={item.id}>
                        <TableCell className="max-w-[22rem] px-6">
                          <div className="flex items-center gap-2 text-sm font-semibold">
                            <span className="text-slate-400">
                              #{(currentPage - 1) * itemsPerPage + index + 1}
                            </span>
                            <span className="font-mono">{item.codigo}</span>
                          </div>
                          <div className="truncate text-xs text-slate-500" title={item.name}>
                            {item.name}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="mb-1 bg-white dark:bg-transparent">
                            {item.marca}
                          </Badge>
                          <div
                            className="mx-auto max-w-[10rem] truncate text-[10px] text-slate-500"
                            title={item.categoria}
                          >
                            {item.categoria}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-center font-bold tabular-nums text-slate-800 dark:text-slate-100">
                          ${item.monto.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                        </TableCell>
                        <TableCell className="text-center tabular-nums text-slate-600 dark:text-slate-300">
                          {item.unidades.toLocaleString("es")}
                        </TableCell>
                        <TableCell className="text-center tabular-nums text-slate-600 dark:text-slate-300">
                          {item.pctIndividual}%
                        </TableCell>
                        <TableCell className="text-center tabular-nums text-slate-600 dark:text-slate-300">
                          {item.pctAcumulado}%
                        </TableCell>
                        <TableCell className="pr-6 text-right">
                          <Badge className={CLASE_BADGE[item.clase]}>{item.clase}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </>
        )}

        {/* Paginacion */}
        {totalPages > 1 && (
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
            <p className="text-sm text-slate-500">
              {(currentPage - 1) * itemsPerPage + 1}–
              {Math.min(currentPage * itemsPerPage, productosFiltrados.length)} de{" "}
              {productosFiltrados.length}
            </p>
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 sm:flex-none"
                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                disabled={currentPage === 1}
              >
                Anterior
              </Button>
              <span className="shrink-0 text-xs tabular-nums text-slate-400">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 sm:flex-none"
                onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                disabled={currentPage === totalPages}
              >
                Siguiente
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const KPI_TONE: Record<string, { card: string; value: string }> = {
  emerald: {
    card: "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/20",
    value: "text-emerald-700 dark:text-emerald-400",
  },
  blue: {
    card: "border-blue-200 bg-blue-50/40 dark:border-blue-900 dark:bg-blue-950/20",
    value: "text-blue-700 dark:text-blue-400",
  },
  slate: {
    card: "border-slate-200 dark:border-slate-800",
    value: "text-slate-700 dark:text-slate-200",
  },
};

function KpiCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "emerald" | "blue" | "slate";
}) {
  const t = KPI_TONE[tone];
  return (
    <Card className={`min-w-0 rounded-3xl shadow-sm ${t.card}`}>
      <CardContent className="p-4">
        <p className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-500 sm:text-xs">
          {label}
        </p>
        <p className={`mt-1 text-2xl font-black tabular-nums sm:text-3xl ${t.value}`}>
          {value}
        </p>
        <p className="mt-1 truncate text-[10px] text-slate-400 sm:text-xs" title={hint}>
          {hint}
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * Leyenda de columnas accesible tambien en movil, donde la tabla (y con ella
 * los tooltips de los encabezados) no se muestra.
 */
function LeyendaColumnas({ dias }: { dias: string }) {
  const filas: { k: string; v: string }[] = [
    { k: `Monto comprado (${dias}d)`, v: COLUMN_TOOLTIPS["Monto comprado"] },
    { k: `Unidades (${dias}d)`, v: COLUMN_TOOLTIPS["Unidades compradas"] },
    { k: "% Individual", v: COLUMN_TOOLTIPS["% Individual"] },
    { k: "% Acumulado", v: COLUMN_TOOLTIPS["% Acumulado"] },
    { k: "Clase", v: COLUMN_TOOLTIPS.Clase },
  ];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Qué significa cada columna"
          className="text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-300"
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-[70vh] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto"
      >
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Qué significa cada columna
        </p>
        <dl className="mt-3 space-y-3">
          {filas.map((f) => (
            <div key={f.k}>
              <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {f.k}
              </dt>
              <dd className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                {f.v}
              </dd>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  );
}
