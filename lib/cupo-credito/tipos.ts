// Cupo de crédito (/cupo-credito): consumo del límite de crédito por cliente,
// por vendedor (equipo), por zona y su histórico. Puro, sin imports del
// servidor: lo usan la API, la pantalla y `node scripts/check-cupo-credito.cjs`.
//
// La foto de hoy sale de Sobregiro (lib/cxc/sobregiro.ts → calcularSobregiro)
// y el histórico de las fotos que el cron guarda cada hora en
// `cxc_credito_fotos` (lib/cxc/historialCredito.ts). Mismas reglas que
// Sobregiro: el uso agregado solo cuenta clientes con límite y no descuenta
// saldos a favor (un anticipo de un cliente no libera el cupo de otro).

export type EstadoCupo = "excedido" | "al_limite" | "en_uso" | "sin_uso" | "sin_limite";

export interface ClienteCupo {
  partnerId: number;
  cliente: string;
  rif: string;
  companyId: number;
  sede: string;
  vendedor: string;
  vendedorId: number | null;
  zona: string;
  ciudad: string;
  plazo: string;
  limite: number;
  usado: number;
  disponible: number;
  usoPct: number | null;
  excedido: number;
  vencido: number;
  diasVencido: number;
  estado: EstadoCupo;
}

/** Consolidado de un grupo de clientes (un vendedor, una zona o todos). */
export interface Consolidado {
  /** Clientes con límite > 0. */
  conLimite: number;
  limite: number;
  /** Usado de los clientes con límite (sin saldos a favor). */
  usado: number;
  disponible: number;
  /** usado ÷ límite × 100; null sin límite asignado. */
  usoPct: number | null;
  excedidos: number;
  montoExcedido: number;
  alLimite: number;
  /** Vencido de todos los clientes del grupo (con o sin límite). */
  vencido: number;
  /** Clientes que deben sin límite asignado y cuánto. */
  sinLimite: number;
  usadoSinLimite: number;
}

export interface GrupoCupo extends Consolidado {
  clave: string;
  nombre: string;
}

export interface ZonaCupo extends GrupoCupo {
  /** Las ciudades con más uso de la zona. */
  ciudades: { nombre: string; usado: number; limite: number; clientes: number }[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function consolidar(clientes: ClienteCupo[]): Consolidado {
  let conLimite = 0, limite = 0, usado = 0, excedidos = 0, montoExcedido = 0, alLimite = 0, vencido = 0, sinLimite = 0, usadoSinLimite = 0;
  for (const c of clientes) {
    vencido += c.vencido;
    if (c.estado === "sin_limite") {
      if (c.usado >= 0.01) { sinLimite++; usadoSinLimite += c.usado; }
      continue;
    }
    conLimite++;
    limite += c.limite;
    usado += Math.max(0, c.usado);
    if (c.estado === "excedido") { excedidos++; montoExcedido += c.excedido; }
    if (c.estado === "al_limite") alLimite++;
  }
  return {
    conLimite,
    limite: r2(limite),
    usado: r2(usado),
    disponible: r2(limite - usado),
    usoPct: limite > 0 ? r2((usado / limite) * 100) : null,
    excedidos,
    montoExcedido: r2(montoExcedido),
    alLimite,
    vencido: r2(vencido),
    sinLimite,
    usadoSinLimite: r2(usadoSinLimite),
  };
}

/** Orden de los consolidados: más excedidos, más uso, más usado. */
const ordenGrupos = (a: Consolidado, b: Consolidado) =>
  b.excedidos - a.excedidos || (b.usoPct ?? -1) - (a.usoPct ?? -1) || b.usado - a.usado;

/** Clave de un vendedor: su usuario de Odoo, o el nombre si no hay. */
export const claveVendedor = (c: Pick<ClienteCupo, "vendedorId" | "vendedor">) =>
  c.vendedorId ? `u${c.vendedorId}` : `n:${c.vendedor}`;

/** El equipo: un consolidado por vendedor. */
export function porVendedor(clientes: ClienteCupo[]): GrupoCupo[] {
  const grupos = new Map<string, { nombre: string; lista: ClienteCupo[] }>();
  for (const c of clientes) {
    const k = claveVendedor(c);
    if (!grupos.has(k)) grupos.set(k, { nombre: c.vendedor || "Sin vendedor", lista: [] });
    grupos.get(k)!.lista.push(c);
  }
  return [...grupos].map(([clave, g]) => ({ clave, nombre: g.nombre, ...consolidar(g.lista) })).sort(ordenGrupos);
}

export const SIN_ZONA = "Sin ubicar";

/** Un consolidado por estado (zona geográfica) con sus ciudades. */
export function porZona(clientes: ClienteCupo[], maxCiudades = 5): ZonaCupo[] {
  const grupos = new Map<string, ClienteCupo[]>();
  for (const c of clientes) {
    const k = c.zona || SIN_ZONA;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k)!.push(c);
  }
  return [...grupos]
    .map(([nombre, lista]) => {
      const ciudades = new Map<string, { nombre: string; usado: number; limite: number; clientes: number }>();
      for (const c of lista) {
        if (c.estado === "sin_limite") continue;
        const nom = c.ciudad || "Sin ciudad";
        const k = nom.toLowerCase();
        if (!ciudades.has(k)) ciudades.set(k, { nombre: nom, usado: 0, limite: 0, clientes: 0 });
        const ci = ciudades.get(k)!;
        ci.usado += Math.max(0, c.usado);
        ci.limite += c.limite;
        ci.clientes++;
      }
      return {
        clave: nombre,
        nombre,
        ...consolidar(lista),
        ciudades: [...ciudades.values()]
          .map((ci) => ({ ...ci, usado: r2(ci.usado), limite: r2(ci.limite) }))
          .sort((a, b) => b.usado - a.usado)
          .slice(0, maxCiudades),
      };
    })
    .sort((a, b) => (a.nombre === SIN_ZONA ? 1 : b.nombre === SIN_ZONA ? -1 : b.usado - a.usado || ordenGrupos(a, b)));
}

// ---------------------------------------------------------------- histórico

/** Una fila agregada de `cxc_credito_fotos`: un día, un vendedor. */
export interface FilaHistorico {
  fecha: string;
  vendedorId: number | null;
  vendedor: string;
  limite: number;
  usado: number;
  vencido: number;
  conLimite: number;
  excedidos: number;
  alLimite: number;
  montoExcedido: number;
}

export interface PuntoHistorico {
  fecha: string;
  limite: number;
  usado: number;
  usoPct: number | null;
  vencido: number;
  conLimite: number;
  excedidos: number;
  alLimite: number;
  montoExcedido: number;
}

export interface VendedorHistorico {
  clave: string;
  nombre: string;
  inicio: PuntoHistorico | null;
  fin: PuntoHistorico | null;
  /** Cambio del uso en puntos porcentuales (fin − inicio). */
  cambioPts: number | null;
  usoPromedio: number | null;
  /** Días del período en que tuvo al menos un cliente excedido. */
  diasConExcedidos: number;
  maxExcedidos: number;
  serie: PuntoHistorico[];
}

function punto(fecha: string, filas: FilaHistorico[]): PuntoHistorico {
  const s = (k: keyof FilaHistorico) => filas.reduce((t, f) => t + (Number(f[k]) || 0), 0);
  const limite = r2(s("limite"));
  const usado = r2(s("usado"));
  return {
    fecha,
    limite,
    usado,
    usoPct: limite > 0 ? r2((usado / limite) * 100) : null,
    vencido: r2(s("vencido")),
    conLimite: s("conLimite"),
    excedidos: s("excedidos"),
    alLimite: s("alLimite"),
    montoExcedido: r2(s("montoExcedido")),
  };
}

/**
 * Las fotos viejas no tienen el id del vendedor (solo el nombre): se les
 * pone el id que tuvo ese mismo nombre en otra foto, para no partir a un
 * vendedor en dos.
 */
export function unificarVendedores(filas: FilaHistorico[]): FilaHistorico[] {
  const idPorNombre = new Map<string, number>();
  for (const f of filas) if (f.vendedorId) idPorNombre.set(f.vendedor, f.vendedorId);
  return filas.map((f) => (f.vendedorId || !idPorNombre.has(f.vendedor) ? f : { ...f, vendedorId: idPorNombre.get(f.vendedor)! }));
}

/** Serie diaria del total y de cada vendedor. */
export function armarHistorico(filasCrudas: FilaHistorico[]) {
  const filas = unificarVendedores(filasCrudas);
  const fechas = [...new Set(filas.map((f) => f.fecha))].sort();
  const porFecha = new Map<string, FilaHistorico[]>();
  const porVend = new Map<string, { nombre: string; porFecha: Map<string, FilaHistorico[]> }>();
  for (const f of filas) {
    if (!porFecha.has(f.fecha)) porFecha.set(f.fecha, []);
    porFecha.get(f.fecha)!.push(f);
    const k = claveVendedor(f);
    if (!porVend.has(k)) porVend.set(k, { nombre: f.vendedor || "Sin vendedor", porFecha: new Map() });
    const v = porVend.get(k)!;
    v.nombre = f.vendedor || v.nombre;
    if (!v.porFecha.has(f.fecha)) v.porFecha.set(f.fecha, []);
    v.porFecha.get(f.fecha)!.push(f);
  }
  const total = fechas.map((d) => punto(d, porFecha.get(d) || []));

  const vendedores: VendedorHistorico[] = [...porVend].map(([clave, v]) => {
    const serie = fechas.filter((d) => v.porFecha.has(d)).map((d) => punto(d, v.porFecha.get(d)!));
    const conUso = serie.filter((p) => p.usoPct != null);
    const inicio = conUso[0] ?? null;
    const fin = conUso[conUso.length - 1] ?? null;
    return {
      clave,
      nombre: v.nombre,
      inicio,
      fin,
      cambioPts: inicio && fin ? r2((fin.usoPct as number) - (inicio.usoPct as number)) : null,
      usoPromedio: conUso.length ? r2(conUso.reduce((t, p) => t + (p.usoPct as number), 0) / conUso.length) : null,
      diasConExcedidos: serie.filter((p) => p.excedidos > 0).length,
      maxExcedidos: serie.reduce((m, p) => Math.max(m, p.excedidos), 0),
      serie,
    };
  });
  vendedores.sort((a, b) => (b.fin?.usoPct ?? -1) - (a.fin?.usoPct ?? -1) || (b.fin?.usado ?? 0) - (a.fin?.usado ?? 0));
  return { fechas, total, vendedores };
}
