"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Aviso, FilaVacia, Tarjeta } from "@/components/administracion/comunes";
import type { Comprobante, EstadoComprobante, OrigenPagos, PagoBinance } from "@/lib/administracion/binance";
import { ETIQUETA_ESTADO } from "@/lib/administracion/binanceEstados";
import { Bitcoin, Download, FileSpreadsheet, Loader2, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type Respuesta = {
  comprobantes: Comprobante[];
  sinComprobante: PagoBinance[];
  errorBinance: string | null;
  origen: OrigenPagos;
  movimientos: number;
};

type Subida = { nombre: string; ok: boolean; texto: string };
type TipoArchivo = "comprobante" | "estado";

const CLASE_ESTADO: Record<EstadoComprobante, string> = {
  conciliado: "bg-emerald-100 text-emerald-800",
  manual: "bg-emerald-100 text-emerald-800",
  por_monto_hora: "bg-amber-100 text-amber-800",
  monto_distinto: "bg-red-100 text-red-800",
  no_encontrado: "bg-red-100 text-red-800",
  sin_verificar: "bg-slate-100 text-slate-700",
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
  const [subiendo, setSubiendo] = useState<{ hecho: number; total: number; tipo: TipoArchivo } | null>(null);
  const [subidas, setSubidas] = useState<Subida[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const inputEstado = useRef<HTMLInputElement>(null);

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

  const subir = async (archivos: FileList | null, tipo: TipoArchivo) => {
    if (!archivos?.length) return;
    const lista = [...archivos];
    const resultados: Subida[] = [];
    setSubidas([]);
    for (let i = 0; i < lista.length; i++) {
      setSubiendo({ hecho: i, total: lista.length, tipo });
      const form = new FormData();
      form.append("archivo", lista[i]);
      form.append("semana", semana);
      if (tipo === "estado") form.append("tipo", "estado");
      try {
        const json = await (await fetch("/api/administracion/binance", { method: "POST", body: form })).json();
        resultados.push(
          json.success && json.estado
            ? {
                nombre: lista[i].name,
                ok: true,
                texto: `${json.recibidos} pagos recibidos (${json.nuevos} nuevos, ${json.repetidos} ya estaban)`,
              }
            : json.success
            ? { nombre: lista[i].name, ok: true, texto: `${json.orderId} · ${cifra(json.monto)} ${json.moneda} · ${json.fechaEstimada ? "sin fecha, quedó en esta semana" : fechaHora(json.fecha)}` }
            : { nombre: lista[i].name, ok: false, texto: json.error || "Error" },
        );
      } catch {
        resultados.push({ nombre: lista[i].name, ok: false, texto: "No se pudo subir" });
      }
      setSubidas([...resultados]);
    }
    setSubiendo(null);
    if (input.current) input.current.value = "";
    if (inputEstado.current) inputEstado.current.value = "";
    cargar();
  };

  const asignar = async (c: Comprobante, valor: string) => {
    const json = await (
      await fetch("/api/administracion/binance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id, movimiento_id: valor ? Number(valor) : null }),
      })
    ).json();
    if (!json.success) setError(json.error || "No se pudo guardar");
    cargar();
  };

  const borrarEstado = async () => {
    if (!confirm("¿Borrar el estado de cuenta de esta semana para volver a subirlo?")) return;
    await fetch(`/api/administracion/binance?estado=${semana}`, { method: "DELETE" });
    cargar();
  };

  const eliminar = async (c: Comprobante) => {
    if (!confirm(`¿Quitar el comprobante ${c.orderId}?`)) return;
    await fetch(`/api/administracion/binance?id=${c.id}`, { method: "DELETE" });
    cargar();
  };

  const comprobantes = datos?.comprobantes || [];
  const sinComprobante = datos?.sinComprobante || [];
  const esConciliado = (c: Comprobante) => c.estado === "conciliado" || c.estado === "manual";
  const conciliados = comprobantes.filter(esConciliado);
  const conProblema = comprobantes.filter((c) => !esConciliado(c));
  // Pagos para amarrar a mano un comprobante: los libres, primero los de su
  // monto, y el que ya tiene (elegirlo confirma el que propuso el panel).
  const opcionesPago = (c: Comprobante) => {
    const libres = [...sinComprobante, ...(c.binance ? [c.binance] : [])];
    const mismo = (p: PagoBinance) => p.moneda === c.moneda && Math.abs(p.monto - c.monto) < 1e-6;
    return libres.sort((a, b) => Number(mismo(b)) - Number(mismo(a)) || a.fecha.localeCompare(b.fecha));
  };
  // El estado de cuenta no trae ID de orden: su id es interno y no se muestra.
  const idBinance = (id?: string) => (datos?.origen === "estado" || !id ? "" : id);

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Bitcoin className="h-7 w-7 text-amber-500" />
            Conciliación Binance
          </h1>
          <p className="text-gray-500 text-sm">
            Sube el estado de cuenta y los comprobantes de la semana; el panel los cruza por monto, moneda y hora
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
          {/* Lo arma el servidor: el Excel lleva la imagen de cada comprobante y su línea del estado de cuenta. */}
          {datos && (
            <Button asChild variant="outline" size="sm" className="h-9">
              <a href={`/api/administracion/binance/excel?semana=${semana}`}>
                <Download className="h-4 w-4 mr-2" />
                Excel
              </a>
            </Button>
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
        <Aviso>
          Esta semana no tiene estado de cuenta: súbelo con «Subir estado de cuenta» (capturas o PDF de los movimientos
          de Binance Pay) para conciliar. La consulta directa a Binance tampoco respondió ({datos.errorBinance}).
        </Aviso>
      )}
      <input
        ref={input}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => subir(e.target.files, "comprobante")}
      />
      <input
        ref={inputEstado}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => subir(e.target.files, "estado")}
      />
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
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
                <CardTitle className="text-base">Comprobantes de la semana</CardTitle>
                <Button size="sm" className="h-9" disabled={!!subiendo} onClick={() => input.current?.click()}>
                  {subiendo?.tipo === "comprobante" ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  {subiendo?.tipo === "comprobante"
                    ? `Leyendo ${subiendo.hecho + 1} de ${subiendo.total}`
                    : "Subir comprobantes"}
                </Button>
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
                        <TableCell className="whitespace-nowrap">
                          {c.fechaEstimada && !c.binance ? "Sin fecha" : fechaHora(c.fecha)}
                        </TableCell>
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
                            <span className="block text-amber-700">
                              {idBinance(c.binance.id) ? `Binance: ${c.binance.id}` : "Sin hora en el comprobante"}
                            </span>
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
                          <Badge variant="outline" className={`border-0 ${CLASE_ESTADO[c.estado]}`}>
                            {ETIQUETA_ESTADO[c.estado]}
                          </Badge>
                          {datos.origen === "estado" && c.estado !== "conciliado" && (
                            <select
                              value={c.estado === "manual" ? String(c.movimientoId) : ""}
                              onChange={(e) => asignar(c, e.target.value)}
                              className="mt-1 block w-full max-w-[260px] border rounded-md px-2 py-1 text-xs bg-white"
                              aria-label="Amarrar a un pago del estado de cuenta"
                            >
                              <option value="">
                                {c.estado === "manual" ? "Soltar" : "Amarrar a un pago…"}
                              </option>
                              {opcionesPago(c).map((p) => (
                                <option key={p.id} value={p.id.slice(1)}>
                                  {fechaHora(p.fecha)} · {cifra(p.monto)} {p.moneda} · {p.pagador || "—"}
                                </option>
                              ))}
                            </select>
                          )}
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
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
                <div>
                  <CardTitle className="text-base">Estado de cuenta: pagos sin comprobante</CardTitle>
                  <p className="text-xs text-gray-500 mt-1">
                    {datos.origen === "estado"
                      ? `Estado de cuenta cargado: ${datos.movimientos} pagos recibidos en la semana.`
                      : "Esta semana todavía no tiene estado de cuenta."}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {datos.origen === "estado" && (
                    <Button variant="ghost" size="sm" className="h-9 text-gray-500" onClick={borrarEstado}>
                      <Trash2 className="h-4 w-4 mr-1" />
                      Borrar y volver a subir
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9"
                    disabled={!!subiendo}
                    onClick={() => inputEstado.current?.click()}
                  >
                    {subiendo?.tipo === "estado" ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                    )}
                    {subiendo?.tipo === "estado"
                      ? `Leyendo ${subiendo.hecho + 1} de ${subiendo.total}`
                      : "Subir estado de cuenta"}
                  </Button>
                </div>
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
                        <TableCell className="font-mono text-xs">{idBinance(p.id) || "—"}</TableCell>
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
