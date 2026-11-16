"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

/** Fila del Excel de asignación por sede (CODIGO | DESCRIPCION | … | PRECIO DEFINITIVO). */
interface FilaExcel {
  codigo: string;
  descripcion: string;
  precio: number | null;
}

interface PrecioActual {
  codigo: string;
  productoId: number | null;
  nombreOdoo: string;
  valencia: number | null;
  caracas: number | null;
  error?: string;
}

const norm = (v: unknown) =>
  String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();

function numero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v ?? "").replace(/[^0-9.,-]/g, "");
  if (!s) return null;
  // "1.015,50" → 1015.50; "1,015.50" → 1015.50; "9,95" → 9.95
  const t = s.includes(",") && s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Busca la fila de encabezados en la primera hoja y lee los renglones hasta el primer código vacío. */
function leerExcel(buf: ArrayBuffer, nombreArchivo: string): { filas: FilaExcel[]; referencia: string } {
  const wb = XLSX.read(buf, { type: "array" });
  const filas: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
  const h = filas.findIndex((f) => f.some((c) => norm(c).startsWith("CODIGO")) && f.some((c) => norm(c).includes("PRECIO DEFINITIVO")));
  if (h < 0) throw new Error("No encontré las columnas CODIGO y PRECIO DEFINITIVO");
  const cab = filas[h].map(norm);
  const iCod = cab.findIndex((c) => c.startsWith("CODIGO"));
  const iDesc = cab.findIndex((c) => c.startsWith("DESCRIP"));
  const iPrecio = cab.findIndex((c) => c.includes("PRECIO DEFINITIVO"));

  const salida: FilaExcel[] = [];
  for (const f of filas.slice(h + 1)) {
    const codigo = String(f[iCod] ?? "").trim();
    if (!codigo) continue;
    salida.push({ codigo, descripcion: iDesc >= 0 ? String(f[iDesc] ?? "").trim() : "", precio: numero(f[iPrecio]) });
  }
  // La factura (ej. INV00965) va arriba del encabezado; si no, el nombre del archivo.
  const factura = filas.slice(0, h).flat().map((c) => String(c ?? "").trim()).find((c) => /^INV\d+/i.test(c));
  return { filas: salida, referencia: factura ? `la factura ${factura}` : nombreArchivo };
}

const usd = (v: number | null) =>
  v == null ? "—" : `$${v.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const distinto = (a: number | null, b: number | null) => a == null || b == null || Math.abs(a - b) > 0.005;

export default function ActualizacionPreciosPage() {
  const { toast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState("");
  const [referencia, setReferencia] = useState("");
  const [filas, setFilas] = useState<FilaExcel[]>([]);
  const [precios, setPrecios] = useState<Map<string, PrecioActual>>(new Map());
  const [cargando, setCargando] = useState(false);
  const [aplicando, setAplicando] = useState<Set<string>>(new Set());
  const [confirmarTodos, setConfirmarTodos] = useState(false);

  const pendiente = (f: FilaExcel) => {
    const p = precios.get(f.codigo);
    return !!p?.productoId && f.precio != null && f.precio > 0 && (distinto(p.valencia, f.precio) || distinto(p.caracas, f.precio));
  };
  const pendientes = useMemo(() => filas.filter(pendiente), [filas, precios]); // eslint-disable-line react-hooks/exhaustive-deps

  const guardarPrecios = (data: PrecioActual[] | null) => {
    if (!data) return;
    setPrecios((prev) => {
      const m = new Map(prev);
      for (const p of data) m.set(p.codigo, p);
      return m;
    });
  };

  async function cargar(file: File) {
    setCargando(true);
    setArchivo(file.name);
    setFilas([]);
    setPrecios(new Map());
    try {
      const leido = leerExcel(await file.arrayBuffer(), file.name);
      if (!leido.filas.length) throw new Error("El Excel no trae productos");
      setFilas(leido.filas);
      setReferencia(leido.referencia);
      const r = await fetch("/api/compras/actualizacion-precios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigos: leido.filas.map((f) => f.codigo) }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "No se pudo leer Odoo");
      guardarPrecios(j.data);
    } catch (e: any) {
      toast({ title: "No se pudo cargar el Excel", description: e.message, variant: "destructive" });
    } finally {
      setCargando(false);
      if (input.current) input.current.value = "";
    }
  }

  async function aplicar(lista: FilaExcel[]) {
    const codigos = lista.map((f) => f.codigo);
    setAplicando((s) => new Set([...s, ...codigos]));
    try {
      const r = await fetch("/api/compras/actualizacion-precios", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cambios: lista.map((f) => ({ codigo: f.codigo, precio: f.precio })), referencia }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "No se pudo actualizar");
      guardarPrecios(j.data);
      const fallos = (j.resultados as { codigo: string; ok: boolean; error?: string }[]).filter((x) => !x.ok);
      const ok = j.resultados.length - fallos.length;
      toast({
        title: fallos.length ? `${ok} actualizados, ${fallos.length} con error` : `${ok} precio${ok === 1 ? "" : "s"} actualizado${ok === 1 ? "" : "s"}`,
        description: fallos.slice(0, 5).map((x) => `${x.codigo}: ${x.error}`).join("\n") || undefined,
        variant: fallos.length ? "destructive" : undefined,
      });
    } catch (e: any) {
      toast({ title: "No se pudo actualizar", description: e.message, variant: "destructive" });
    } finally {
      setAplicando((s) => {
        const n = new Set(s);
        codigos.forEach((c) => n.delete(c));
        return n;
      });
    }
  }

  const ocupado = aplicando.size > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Actualización de precios</h1>
        <p className="text-sm text-muted-foreground">
          Carga el Excel de asignación por sede: se busca cada código en Odoo y el precio definitivo se pone en la lista de
          precios de Valencia («Lista de Precios») y de Caracas («Lista de Precios O»).
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-6">
          <input
            ref={input}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && cargar(e.target.files[0])}
          />
          <Button onClick={() => input.current?.click()} disabled={cargando || ocupado}>
            {cargando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Cargar Excel
          </Button>
          {archivo && (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileSpreadsheet className="h-4 w-4" /> {archivo}
            </span>
          )}
        </CardContent>
      </Card>

      {filas.length > 0 && !cargando && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">
              {filas.length} productos · {pendientes.length} con precio distinto
            </CardTitle>
            <Button onClick={() => setConfirmarTodos(true)} disabled={!pendientes.length || ocupado}>
              {ocupado && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Aplicar todos los cambios ({pendientes.length})
            </Button>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código (SKU)</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="text-right">Precio Valencia</TableHead>
                  <TableHead className="text-right">Precio Caracas</TableHead>
                  <TableHead className="text-right">Precio Definitivo</TableHead>
                  <TableHead className="text-center">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.map((f, i) => {
                  const p = precios.get(f.codigo);
                  const marca = (v: number | null | undefined) =>
                    p?.productoId && distinto(v ?? null, f.precio) ? "text-amber-600 font-medium" : "";
                  return (
                    <TableRow key={`${f.codigo}-${i}`}>
                      <TableCell className="font-mono text-xs">{f.codigo}</TableCell>
                      <TableCell className="max-w-[360px]">
                        <div className="truncate" title={f.descripcion}>{f.descripcion}</div>
                        {p?.nombreOdoo && <div className="truncate text-xs text-muted-foreground" title={p.nombreOdoo}>Odoo: {p.nombreOdoo}</div>}
                      </TableCell>
                      <TableCell className={`text-right ${marca(p?.valencia)}`}>{usd(p?.valencia ?? null)}</TableCell>
                      <TableCell className={`text-right ${marca(p?.caracas)}`}>{usd(p?.caracas ?? null)}</TableCell>
                      <TableCell className="text-right font-semibold">{usd(f.precio)}</TableCell>
                      <TableCell className="text-center">
                        {!p ? null : !p.productoId ? (
                          <Badge variant="destructive">{p.error}</Badge>
                        ) : f.precio == null || f.precio <= 0 ? (
                          <Badge variant="outline">Sin precio definitivo</Badge>
                        ) : pendiente(f) ? (
                          <Button size="sm" variant="outline" disabled={aplicando.has(f.codigo)} onClick={() => aplicar([f])}>
                            {aplicando.has(f.codigo) && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                            Aplicar cambio de precio
                          </Button>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                            <CheckCircle2 className="h-4 w-4" /> Al día
                          </span>
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

      <AlertDialog open={confirmarTodos} onOpenChange={setConfirmarTodos}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Aplicar {pendientes.length} cambios de precio?</AlertDialogTitle>
            <AlertDialogDescription>
              Se pondrá el precio definitivo en la lista de Valencia y de Caracas de Odoo para cada producto con precio distinto.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => aplicar(pendientes)}>Aplicar todos</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
