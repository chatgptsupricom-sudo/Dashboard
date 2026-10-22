"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Aviso, BotonExcel, FilaVacia, Tarjeta } from "@/components/administracion/comunes";
import type { Comprobante, EstadoComprobante, PagoBinance } from "@/lib/administracion/binance";
import { Bitcoin, Loader2, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type Respuesta = {
  comprobantes: Comprobante[];
  sinComprobante: PagoBinance[];
  errorBinance: string | null;
};

type Subida = { nombre: string; ok: boolean; texto: string };

const ESTADOS: Record<EstadoComprobante, { label: string; clase: string }> = {
  conciliado: { label: "Conciliado", clase: "bg-emerald-100 text-emerald-800" },
  por_monto_hora: { label: "Coincide por monto y hora (revisar ID)", clase: "bg-amber-100 text-amber-800" },
  monto_distinto: { label: "Monto distinto", clase: "bg-red-100 text-red-800" },
  no_encontrado: { label: "No está en Binance", clase: "bg-red-100 text-red-800" },
  sin_verificar: { label: "Sin verificar", clase: "bg-slate-100 text-slate-700" },
};

const DIA = 86400_000;

/** Lunes (YYYY-MM-DD) de las ultimas `n` semanas, la actual primero. */
function semanas(n = 12) {
  const hoy = new Date();
  const lunes = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));
  lunes.setUTCDate(lunes.getUTCDate() - ((lunes.getUTCDay() + 6) % 7));
  const f = (d: Date) => d.toISOString().slice(0, 10);
  const corto = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(lunes.getTime() - i * 7 * DIA);
    return { value: f(d), label: `${corto(d)} al ${corto(new Date(d.getTime() + 6 * DIA))}/${d.getUTCFullYear()}` };
  });
}

// Hora de Caracas, como se concilia la semana.
const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-VE", { timeZone: "America/Caracas", dateStyle: "short", timeStyle: "short" });

const cifra = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 8 });

/** Suma por moneda: Binance recibe USDT, USDC, BTC... y no se mezclan. */
function porMoneda(items: { monto: number; moneda: string }[]) {
  const m = new Map<string, number>();
  items.forEach((i) => m.set(i.moneda, (m.get(i.moneda) || 0) + i.monto));
  return [...m].map(([moneda, monto]) => `${cifra(monto)} ${moneda}`).join(" · ") || "0";
}

export default function BinancePage() {
  const opciones = semanas();
  const [semana, setSemana] = useState(opciones[0].value);
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState<{ hecho: number; total: number } | null>(null);
  const [subidas, setSubidas] = useState<Subida[]>([]);
  const input = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const json = await (await fetch(`/api/administracion/binance?semana=${semana}`)).json();
      if (json.success) setDatos(json);
      else setError(json.error || "No se pudo cargar");
    } catch {
      setError("No se pudo cargar");
    }
    setCargando(false);
  }, [semana]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const subir = async (archivos: FileList | null) => {
    if (!archivos?.length) return;
    const lista = [...archivos];
    const resultados: Subida[] = [];
    setSubidas([]);
    for (let i = 0; i < lista.length; i++) {
      setSubiendo({ hecho: i, total: lista.length });
      const form = new FormData();
      form.append("archivo", lista[i]);
      try {
        const json = await (await fetch("/api/administracion/binance", { method: "POST", body: form })).json();
        resultados.push(
          json.success
            ? { nombre: lista[i].name, ok: true, texto: `${json.orderId} · ${cifra(json.monto)} ${json.moneda} · ${fechaHora(json.fecha)}` }
            : { nombre: lista[i].name, ok: false, texto: json.error || "Error" },
        );
      } catch {
        resultados.push({ nombre: lista[i].name, ok: false, texto: "No se pudo subir" });
      }
      setSubidas([...resultados]);
    }
    setSubiendo(null);
    if (input.current) input.current.value = "";
    cargar();
  };

  const eliminar = async (c: Comprobante) => {
    if (!confirm(`¿Quitar el comprobante ${c.orderId}?`)) return;
    await fetch(`/api/administracion/binance?id=${c.id}`, { method: "DELETE" });
    cargar();
  };

  const comprobantes = datos?.comprobantes || [];
  const sinComprobante = datos?.sinComprobante || [];
  const conciliados = comprobantes.filter((c) => c.estado === "conciliado");
  const conProblema = comprobantes.filter((c) => c.estado !== "conciliado");
  const etiquetaSemana = opciones.find((o) => o.value === semana)?.label || semana;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Bitcoin className="h-7 w-7 text-amber-500" />
            Conciliación Binance
          </h1>
          <p className="text-gray-500 text-sm">
            Sube los comprobantes de la semana; el panel los cruza con los pagos recibidos en Binance Pay
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={semana}
            onChange={(e) => setSemana(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm bg-white"
            aria-label="Semana"
          >
            {opciones.map((o) => (
              <option key={o.value} value={o.value}>
                Semana {o.label}
              </option>
            ))}
          </select>
          <input
            ref={input}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            onChange={(e) => subir(e.target.files)}
          />
          <Button size="sm" className="h-9" disabled={!!subiendo} onClick={() => input.current?.click()}>
            {subiendo ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            {subiendo ? `Leyendo ${subiendo.hecho + 1} de ${subiendo.total}` : "Subir comprobantes"}
          </Button>
          {datos && (
            <BotonExcel
              archivo={`Conciliacion_Binance_${semana}`}
              hojas={() => [
                {
                  nombre: "Resumen",
                  filas: [
                    { Concepto: "Semana", Valor: etiquetaSemana },
                    { Concepto: "Comprobantes subidos", Valor: comprobantes.length },
                    { Concepto: "Monto de comprobantes", Valor: porMoneda(comprobantes) },
                    { Concepto: "Conciliados", Valor: conciliados.length },
                    { Concepto: "Monto conciliado", Valor: porMoneda(conciliados) },
                    { Concepto: "Con diferencia o no encontrados", Valor: conProblema.length },
                    { Concepto: "Pagos en Binance sin comprobante", Valor: sinComprobante.length },
                    { Concepto: "Monto sin comprobante", Valor: porMoneda(sinComprobante) },
                  ],
                },
                {
                  nombre: "Comprobantes",
                  filas: comprobantes.map((c) => ({
                    "Fecha comprobante": fechaHora(c.fecha),
                    "ID de orden": c.orderId,
                    "Monto comprobante": c.monto,
                    Moneda: c.moneda,
                    Estado: ESTADOS[c.estado].label,
                    "ID en Binance": c.binance?.id || "",
                    "Fecha Binance": c.binance ? fechaHora(c.binance.fecha) : "",
                    "Monto Binance": c.binance?.monto ?? "",
                    "Moneda Binance": c.binance?.moneda || "",
                    Pagador: c.binance?.pagador || "",
                    Archivo: c.archivoNombre,
                    "Subido por": c.subidoPor,
                  })),
                },
                {
                  nombre: "Sin comprobante",
                  filas: sinComprobante.map((p) => ({
                    Fecha: fechaHora(p.fecha),
                    "ID de orden": p.id,
                    Monto: p.monto,
                    Moneda: p.moneda,
                    Pagador: p.pagador,
                    Tipo: p.tipo,
                  })),
                },
              ]}
            />
          )}
        </div>
      </div>

      {subidas.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-1 text-sm">
            {subidas.map((s, i) => (
              <p key={i} className={s.ok ? "text-emerald-700" : "text-red-700"}>
                {s.ok ? "✓" : "✗"} <span className="font-medium">{s.nombre}</span>: {s.texto}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {datos?.errorBinance && (
        <Aviso tono="rojo">No se pudo consultar Binance: {datos.errorBinance}. Los comprobantes quedan sin verificar.</Aviso>
      )}
      {error && <Aviso tono="rojo">{error}</Aviso>}

      {cargando && !datos ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : (
        datos && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Tarjeta titulo="Comprobantes" valor={comprobantes.length} detalle={porMoneda(comprobantes)} />
              <Tarjeta tono="verde" titulo="Conciliados" valor={conciliados.length} detalle={porMoneda(conciliados)} />
              <Tarjeta
                tono={conProblema.length ? "rojo" : "neutro"}
                titulo="Con diferencia o no encontrados"
                valor={conProblema.length}
                detalle={porMoneda(conProblema)}
              />
              <Tarjeta
                tono={sinComprobante.length ? "ambar" : "neutro"}
                titulo="Recibido sin comprobante"
                valor={sinComprobante.length}
                detalle={porMoneda(sinComprobante)}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Comprobantes de la semana</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>ID de orden</TableHead>
                      <TableHead className="text-right">Comprobante</TableHead>
                      <TableHead className="text-right">Binance</TableHead>
                      <TableHead>Pagador</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comprobantes.length === 0 && <FilaVacia columnas={7} texto="No hay comprobantes en esta semana." />}
                    {comprobantes.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="whitespace-nowrap">{fechaHora(c.fecha)}</TableCell>
                        <TableCell className="font-mono text-xs">
                          <a
                            href={`/api/administracion/binance/imagen?id=${c.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            {c.orderId}
                          </a>
                          {c.estado === "por_monto_hora" && c.binance && (
                            <span className="block text-amber-700">Binance: {c.binance.id}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {cifra(c.monto)} {c.moneda}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {c.binance ? `${cifra(c.binance.monto)} ${c.binance.moneda}` : "—"}
                        </TableCell>
                        <TableCell>{c.binance?.pagador || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`border-0 ${ESTADOS[c.estado].clase}`}>
                            {ESTADOS[c.estado].label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => eliminar(c)} aria-label="Quitar comprobante">
                            <Trash2 className="h-4 w-4 text-gray-400" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pagos recibidos en Binance sin comprobante</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>ID de orden</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead>Pagador</TableHead>
                      <TableHead>Tipo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sinComprobante.length === 0 && <FilaVacia columnas={5} texto="Todo lo recibido tiene comprobante." />}
                    {sinComprobante.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="whitespace-nowrap">{fechaHora(p.fecha)}</TableCell>
                        <TableCell className="font-mono text-xs">{p.id}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {cifra(p.monto)} {p.moneda}
                        </TableCell>
                        <TableCell>{p.pagador || "—"}</TableCell>
                        <TableCell>{p.tipo}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )
      )}
    </div>
  );
}
