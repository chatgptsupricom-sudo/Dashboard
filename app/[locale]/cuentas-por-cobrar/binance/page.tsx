"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Aviso, FilaVacia } from "@/components/administracion/comunes";
import type { Comprobante, PagoBinance } from "@/lib/administracion/binance";
import { ETIQUETA_ESTADO } from "@/lib/administracion/binanceEstados";
import { Bitcoin, CalendarDays, Loader2, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

// Conciliación Binance para Cuentas por Cobrar: la hoja "Conciliación" del
// Excel que arma Administración, solo con los conciliados, de su sede y para
// ver. La API ya les manda solo los conciliados (/api/administracion/binance).

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

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-VE", { timeZone: "America/Caracas", dateStyle: "short", timeStyle: "short" });
// Dia (YYYY-MM-DD) en hora de Caracas: el de la fecha del pago en Binance, o la del comprobante.
const diaCaracas = (iso: string) => new Date(Date.parse(iso) - 4 * 3600_000).toISOString().slice(0, 10);
const diaDe = (c: Comprobante) => diaCaracas(c.binance?.fecha || c.fecha);
const NOMBRE_DIA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** Los 7 dias (lunes a domingo) de la semana que empieza en `lunes`. */
function diasDeSemana(lunes: string) {
  const base = Date.parse(`${lunes}T00:00:00Z`);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base + i * DIA);
    const valor = d.toISOString().slice(0, 10);
    return { valor, label: `${NOMBRE_DIA[i]} ${valor.slice(8, 10)}/${valor.slice(5, 7)}` };
  });
}

const cifra = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 8 });

// Id del movimiento del estado de cuenta ("e12" -> 12); los de la API no tienen recorte.
const idMovimiento = (p: PagoBinance | null) => (p && /^e\d+$/.test(p.id) ? p.id.slice(1) : null);

function porMoneda(items: { monto: number; moneda: string }[]) {
  const m = new Map<string, number>();
  items.forEach((i) => m.set(i.moneda, (m.get(i.moneda) || 0) + i.monto));
  return [...m].map(([moneda, monto]) => `${cifra(monto)} ${moneda}`).join(" · ") || "0";
}

/** Recorte de la línea del estado de cuenta; si no hay (PDF o anterior), un texto. */
function Linea({ pago }: { pago: PagoBinance | null }) {
  const [falla, setFalla] = useState(false);
  const id = idMovimiento(pago);
  if (!id || falla) return <span className="text-xs text-gray-400">Sin recorte</span>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/administracion/binance/recorte?id=${id}`}
      alt="Línea del estado de cuenta"
      loading="lazy"
      className="max-h-10 max-w-[320px] rounded border"
      onError={() => setFalla(true)}
    />
  );
}

export default function BinanceCxCPage() {
  const opciones = useMemo(() => semanas(), []);
  const [semana, setSemana] = useState(opciones[0].value);
  const [buscar, setBuscar] = useState("");
  const [dia, setDia] = useState<string | null>(null);
  const [conciliados, setConciliados] = useState<Comprobante[] | null>(null);
  // Conciliados de la semana que ya estan como pago en Odoo (no se muestran).
  const [registrados, setRegistrados] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      // vista=cxc: solo los conciliados que todavia no estan registrados en Odoo
      // (el ID de orden en el Memo del pago). Igual para el SuperAdmin.
      const json = await (await fetch(`/api/administracion/binance?semana=${semana}&vista=cxc`)).json();
      if (json.success) {
        setConciliados(json.conciliados || []);
        setRegistrados(json.registrados || 0);
      } else {
        setConciliados([]);
        setError(json.error || "No se pudo cargar");
      }
    } catch {
      setError("No se pudo cargar");
    }
    setCargando(false);
  }, [semana]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Otra semana: se vuelve a "Todos los días".
  useEffect(() => {
    setDia(null);
  }, [semana]);

  const semanaCompleta = conciliados || [];
  const dias = diasDeSemana(semana);
  const lista = dia ? semanaCompleta.filter((c) => diaDe(c) === dia) : semanaCompleta;
  const texto = buscar.trim().toLowerCase();
  const filtrados = texto
    ? lista.filter((c) =>
        [c.cliente, c.orderId, c.binance?.pagador || "", String(c.monto)].some((v) => v.toLowerCase().includes(texto)),
      )
    : lista;
  const etiquetaSemana = opciones.find((o) => o.value === semana)?.label;

  return (
    <div className="space-y-6">
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
          <Bitcoin className="h-7 w-7 text-amber-500" />
          Conciliación Binance
        </h1>
        <p className="text-gray-500 text-sm">Pagos por Binance que Administración ya concilió y todavía no están registrados en Odoo, por semana.</p>
      </div>

      {error && <Aviso tono="rojo">{error}</Aviso>}

      {/* minmax(0,1fr): sin eso la tabla ancha estira la columna y la pagina se desborda en pantallas angostas. */}
      <div className="grid gap-6 grid-cols-[minmax(0,1fr)] lg:grid-cols-[230px_minmax(0,1fr)] items-start">
        <Card>
          <CardContent className="p-2">
            <p className="px-3 pt-2 pb-1 text-xs font-medium text-gray-500">Semanas</p>
            <nav className="flex lg:flex-col gap-1 overflow-x-auto" aria-label="Semanas">
              {opciones.map((o) => (
                <button
                  key={o.value}
                  onClick={() => setSemana(o.value)}
                  aria-current={o.value === semana ? "true" : undefined}
                  className={`flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm text-left ${
                    o.value === semana ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <CalendarDays className="h-4 w-4 shrink-0" />
                  {o.label}
                </button>
              ))}
            </nav>
          </CardContent>
        </Card>

        <div className="space-y-3 min-w-0">
          <div className="flex gap-1 overflow-x-auto" role="group" aria-label="Filtrar por día">
            {[{ valor: null as string | null, label: "Todos" }, ...dias].map((d) => {
              const n = d.valor ? semanaCompleta.filter((c) => diaDe(c) === d.valor).length : semanaCompleta.length;
              const activo = dia === d.valor;
              return (
                <button
                  key={d.label}
                  onClick={() => setDia(d.valor)}
                  aria-pressed={activo}
                  className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm ${
                    activo ? "border-blue-600 bg-blue-50 text-blue-700 font-medium" : "bg-white text-gray-700 hover:bg-gray-50"
                  } ${n === 0 && !activo ? "opacity-50" : ""}`}
                >
                  {d.label} <span className="text-xs text-gray-400">({n})</span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-sm text-gray-600">
              {dia ? "Día" : "Semana"}{" "}
              <span className="font-medium">{dia ? dias.find((d) => d.valor === dia)?.label : etiquetaSemana}</span> ·{" "}
              {lista.length} por registrar ·{" "}
              {porMoneda(lista)}
              {registrados > 0 && <span className="text-gray-400"> · {registrados} ya registrados en Odoo</span>}
            </p>
            <div className="relative w-full sm:w-72">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
                placeholder="Buscar cliente, ID, pagador o monto"
                aria-label="Buscar"
                className="border rounded-lg pl-9 pr-3 py-2 text-sm bg-white w-full"
              />
            </div>
          </div>

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              {cargando ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="h-7 w-7 animate-spin text-blue-600" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>ID de orden</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead>Moneda</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Pagador</TableHead>
                      <TableHead>Comprobante</TableHead>
                      <TableHead>Línea del estado de cuenta</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtrados.length === 0 && <FilaVacia columnas={9} texto={dia ? "No hay conciliados por registrar ese día." : registrados > 0 ? "Todos los conciliados de esta semana ya están registrados en Odoo." : "No hay conciliados en esta semana."} />}
                    {filtrados.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="whitespace-nowrap">{fechaHora(c.binance?.fecha || c.fecha)}</TableCell>
                        <TableCell>{c.cliente || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{c.orderId}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{cifra(c.monto)}</TableCell>
                        <TableCell>{c.moneda}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="border-0 bg-emerald-100 text-emerald-800">
                            {ETIQUETA_ESTADO[c.estado]}
                          </Badge>
                        </TableCell>
                        <TableCell>{c.binance?.pagador || "—"}</TableCell>
                        <TableCell>
                          <a
                            href={`/api/administracion/binance/imagen?id=${c.id}`}
                            target="_blank"
                            rel="noreferrer"
                            title="Abrir el comprobante"
                          >
                            {/\.pdf$/i.test(c.archivoNombre || "") ? (
                              <span className="text-blue-600 hover:underline text-xs">Ver PDF</span>
                            ) : (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={`/api/administracion/binance/imagen?id=${c.id}`}
                                alt={`Comprobante ${c.orderId}`}
                                loading="lazy"
                                className="h-16 w-auto rounded border hover:ring-2 hover:ring-blue-300"
                              />
                            )}
                          </a>
                        </TableCell>
                        <TableCell>
                          <Linea pago={c.binance} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
