"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  ChevronRight,
  ClipboardList,
  LayoutDashboard,
  Loader2,
  LogOut,
  Package,
  Search,
  Send,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useAuthStore } from "@/lib/stores/auth.store";

// Mostrador del almacen (#39).
//
// Es la pantalla que se usa de pie, con el cliente enfrente y el equipo en la
// mano. Por eso es mobile SIEMPRE, en cualquier pantalla: no hay breakpoints
// `sm:` que la ensanchen ni un "modo escritorio". Quien necesite el panel
// completo entra a /seguridad, que sigue existiendo.
//
// NO duplica los formularios de ingreso y despacho: enlaza a los de
// /seguridad/ingreso/nuevo y /seguridad/despacho/nuevo, que ya son
// mobile-first. Copiarlos habria sido mantener dos veces las mismas reglas de
// validacion contra los mismos endpoints.

type Resumen = {
  ingresos_hoy: number;
  despachos_hoy: number;
  pendientes: number;
};

type Pendiente = {
  id: number;
  fecha_entrega: string;
  cliente_nombre: string;
  hardware: string | null;
  serial: string | null;
  dias_en_taller?: number;
};

type Ticket = {
  id: number;
  case_number: string;
  client_name: string;
  hardware: string;
  serial: string;
  invoice_number: string;
  reported_fault: string;
};

type Vista = "home" | "pendientes" | "buscar";

// Dias en taller: el endpoint de pendientes no trae el campo calculado, asi
// que se deriva de la fecha. Si viene del servidor, ese valor manda.
function diasEnTaller(p: Pendiente): number {
  if (typeof p.dias_en_taller === "number") return p.dias_en_taller;
  const entrega = new Date(p.fecha_entrega);
  if (Number.isNaN(entrega.getTime())) return 0;
  const ms = Date.now() - entrega.getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

export default function MostradorPage() {
  const t = useTranslations("seguridad");
  const tm = useTranslations("seguridad.mostrador");
  const params = useParams();
  const router = useRouter();
  const locale = (params?.locale as string) || "es";
  const { user, logout } = useAuthStore();

  const base = `/${locale}/seguridad`;

  const [vista, setVista] = useState<Vista>("home");
  const [resumen, setResumen] = useState<Resumen | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch("/api/seguridad/dashboard?resumen=1");
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelado && json?.success) setResumen(json);
      } catch {
        // El resumen es informativo: si falla, los botones de accion siguen
        // sirviendo. No se bloquea la pantalla por no poder pintar 3 numeros.
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <header className="sticky top-0 z-20 bg-white border-b border-slate-200">
        <div className="mx-auto w-full max-w-md px-4 h-14 flex items-center gap-3">
          {vista === "home" ? (
            <>
              <div className="p-2 rounded-xl bg-violet-100 shrink-0">
                <Package className="w-5 h-5 text-violet-600" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-base font-bold text-slate-900 truncate">
                  {tm("title")}
                </h1>
                <p className="text-xs text-slate-500 truncate">
                  {user?.name || t("module_title")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  logout();
                  window.location.href = `/${locale}/login`;
                }}
                className="w-12 h-12 -mr-2 inline-flex items-center justify-center rounded-xl text-slate-400 active:bg-red-50 active:text-red-600 transition-colors"
                aria-label={t("logout")}
              >
                <LogOut className="w-5 h-5" />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setVista("home")}
                className="w-12 h-12 -ml-2 inline-flex items-center justify-center rounded-xl text-slate-500 active:bg-slate-100 transition-colors"
                aria-label={t("back")}
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h1 className="text-base font-bold text-slate-900 truncate">
                {vista === "pendientes" ? tm("pendientes") : tm("buscar")}
              </h1>
            </>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-md px-4 py-5">
        {vista === "home" && (
          <Home base={base} resumen={resumen} setVista={setVista} tm={tm} />
        )}
        {vista === "pendientes" && <Pendientes base={base} tm={tm} />}
        {vista === "buscar" && (
          <Buscar
            tm={tm}
            onUsar={(caseNumber) =>
              router.push(
                `${base}/ingreso/nuevo?ticket=${encodeURIComponent(caseNumber)}`,
              )
            }
          />
        )}
      </main>
    </div>
  );
}

function Home({
  base,
  resumen,
  setVista,
  tm,
}: {
  base: string;
  resumen: Resumen | null;
  setVista: (v: Vista) => void;
  tm: any;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500 px-1 pb-1">{tm("prompt")}</p>

      <BotonAccion
        as="link"
        href={`${base}/ingreso/nuevo`}
        icon={<ClipboardList className="w-6 h-6" />}
        label={tm("nuevo_ingreso")}
        primary
      />
      <BotonAccion
        as="link"
        href={`${base}/despacho/nuevo`}
        icon={<Send className="w-6 h-6" />}
        label={tm("nuevo_despacho")}
      />
      <BotonAccion
        as="button"
        onClick={() => setVista("pendientes")}
        icon={<Package className="w-6 h-6" />}
        label={tm("ver_pendientes")}
        badge={resumen?.pendientes}
      />
      <BotonAccion
        as="button"
        onClick={() => setVista("buscar")}
        icon={<Search className="w-6 h-6" />}
        label={tm("buscar_ticket")}
      />

      <section className="pt-3">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-1 mb-2">
          {tm("hoy")}
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <Contador
            label={tm("ingresos")}
            value={resumen?.ingresos_hoy}
            tone="violet"
          />
          <Contador
            label={tm("despachos")}
            value={resumen?.despachos_hoy}
            tone="emerald"
          />
        </div>
      </section>

      <Link
        href={base}
        className="mt-2 flex items-center justify-center gap-2 min-h-[48px] rounded-xl text-sm font-semibold text-slate-500 active:bg-slate-100 transition-colors"
      >
        <LayoutDashboard className="w-4 h-4" />
        {tm("ir_al_panel")}
      </Link>
    </div>
  );
}

function Pendientes({ base, tm }: { base: string; tm: any }) {
  const [items, setItems] = useState<Pendiente[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch("/api/seguridad/ingresos-pendientes");
        if (!res.ok) throw new Error();
        const json = await res.json();
        if (!cancelado) setItems(json.ingresos || []);
      } catch {
        if (!cancelado) setError(true);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  if (error) return <Aviso>{tm("error")}</Aviso>;
  if (items === null) return <Cargando />;
  if (items.length === 0) return <Aviso>{tm("sin_pendientes")}</Aviso>;

  return (
    <div className="space-y-2">
      {items.map((p) => {
        const dias = diasEnTaller(p);
        // Verde <7d, ambar 7-14d, rojo >14d: el mismo umbral de 7 dias que usa
        // la alerta del dashboard.
        const tono =
          dias > 14
            ? "bg-red-100 text-red-700"
            : dias >= 7
            ? "bg-amber-100 text-amber-700"
            : "bg-emerald-100 text-emerald-700";
        return (
          <Link
            key={p.id}
            href={`${base}/ingreso/${p.id}`}
            className="flex items-center gap-3 min-h-[64px] rounded-xl border border-slate-200 bg-white px-4 py-3 active:bg-slate-50 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900 truncate">
                {p.cliente_nombre}
              </p>
              <p className="text-xs text-slate-500 truncate">
                {p.hardware || "—"}
                {p.serial ? ` · ${p.serial}` : ""}
              </p>
            </div>
            <span
              className={`shrink-0 px-2 py-1 rounded-full text-[11px] font-bold tabular-nums ${tono}`}
            >
              {tm("dias", { count: dias })}
            </span>
            <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
          </Link>
        );
      })}
    </div>
  );
}

function Buscar({
  tm,
  onUsar,
}: {
  tm: any;
  onUsar: (caseNumber: string) => void;
}) {
  const [q, setQ] = useState("");
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buscar = useCallback(async () => {
    const valor = q.trim();
    if (!valor) return;
    setBuscando(true);
    setError(null);
    setTicket(null);
    try {
      const res = await fetch(
        `/api/seguridad/buscar-ticket/${encodeURIComponent(valor)}`,
      );
      if (!res.ok) {
        setError(tm("no_encontrado"));
        return;
      }
      const json = await res.json();
      if (json?.success && json.case) setTicket(json.case);
      else setError(tm("no_encontrado"));
    } catch {
      setError(tm("no_encontrado"));
    } finally {
      setBuscando(false);
    }
  }, [q, tm]);

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              buscar();
            }
          }}
          placeholder={tm("ticket_placeholder")}
          inputMode="numeric"
          autoFocus
          className="w-full h-14 px-4 rounded-xl border border-slate-200 bg-white text-base focus:outline-none focus:border-[color:var(--portal-primary,#741DFE)] focus:ring-2 focus:ring-violet-100"
        />
        <button
          type="button"
          onClick={buscar}
          disabled={buscando || !q.trim()}
          className="w-full min-h-[56px] inline-flex items-center justify-center gap-2 rounded-xl text-base font-bold text-white disabled:opacity-50 transition-opacity"
          style={{ backgroundColor: "var(--portal-primary,#741DFE)" }}
        >
          {buscando ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Search className="w-5 h-5" />
          )}
          {tm("buscar")}
        </button>
      </div>

      {error && (
        <p className="flex items-center gap-2 text-sm text-red-600">
          <XCircle className="w-4 h-4 shrink-0" />
          {error}
        </p>
      )}

      {ticket && (
        <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-violet-700 shrink-0" />
            <span className="font-mono text-sm font-bold text-violet-900">
              {ticket.case_number}
            </span>
          </div>
          <dl className="space-y-1.5 text-sm">
            <Dato label={tm("cliente")} value={ticket.client_name} />
            <Dato label={tm("hardware")} value={ticket.hardware} />
            <Dato label={tm("serial")} value={ticket.serial} mono />
            <Dato label={tm("falla")} value={ticket.reported_fault} />
          </dl>
          <button
            type="button"
            onClick={() => onUsar(ticket.case_number)}
            className="w-full min-h-[56px] inline-flex items-center justify-center rounded-xl text-base font-bold text-white transition-opacity active:opacity-90"
            style={{ backgroundColor: "var(--portal-primary,#741DFE)" }}
          >
            {tm("usar_ticket")}
          </button>
        </div>
      )}
    </div>
  );
}

function BotonAccion({
  as,
  href,
  onClick,
  icon,
  label,
  primary,
  badge,
}: {
  as: "link" | "button";
  href?: string;
  onClick?: () => void;
  icon: React.ReactNode;
  label: string;
  primary?: boolean;
  badge?: number;
}) {
  // min-h-[72px]: el criterio pide 48x48 como minimo y esta es la pantalla que
  // se toca con el pulgar y el equipo en la otra mano.
  const clase = `w-full min-h-[72px] flex items-center gap-4 rounded-2xl px-5 text-left transition-opacity active:opacity-80 ${
    primary
      ? "text-white"
      : "bg-white border border-slate-200 text-slate-800 active:bg-slate-50"
  }`;
  const estilo = primary
    ? { backgroundColor: "var(--portal-primary,#741DFE)" }
    : undefined;

  const contenido = (
    <>
      <span
        className={`shrink-0 ${primary ? "text-white/90" : "text-violet-600"}`}
      >
        {icon}
      </span>
      <span className="flex-1 text-base font-bold">{label}</span>
      {typeof badge === "number" && badge > 0 && (
        <span className="shrink-0 min-w-[28px] h-7 px-2 inline-flex items-center justify-center rounded-full bg-violet-100 text-violet-700 text-sm font-bold tabular-nums">
          {badge}
        </span>
      )}
      <ChevronRight
        className={`w-5 h-5 shrink-0 ${
          primary ? "text-white/70" : "text-slate-300"
        }`}
      />
    </>
  );

  if (as === "link" && href) {
    return (
      <Link href={href} className={clase} style={estilo}>
        {contenido}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={clase} style={estilo}>
      {contenido}
    </button>
  );
}

function Contador({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | undefined;
  tone: "violet" | "emerald";
}) {
  const tonos = {
    violet: "border-violet-100 bg-violet-50",
    emerald: "border-emerald-100 bg-emerald-50",
  };
  return (
    <div className={`rounded-xl border p-4 ${tonos[tone]}`}>
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className="text-3xl font-black text-slate-900 tabular-nums mt-1">
        {value ?? "—"}
      </p>
    </div>
  );
}

function Dato({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <dt className="text-slate-500 shrink-0">{label}:</dt>
      <dd className={`text-slate-900 min-w-0 ${mono ? "font-mono" : ""}`}>
        {value || "—"}
      </dd>
    </div>
  );
}

function Cargando() {
  return (
    <div className="py-16 flex justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-16 text-center text-sm text-slate-400">{children}</p>
  );
}
