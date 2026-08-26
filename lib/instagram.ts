// lib/instagram.ts
// Integracion con Instagram Graph API para el informe mensual de redes sociales.
//
// PERMISOS:
// El perfil y el listado de publicaciones solo necesitan `instagram_basic`.
// Las metricas de Insights (views, reach, profile_views, website_clicks,
// demografia) necesitan ademas `instagram_manage_insights`; sin el la API
// responde "(#10) Application does not have permission for this action".
//
// Cada bloque devuelve { available, reason, ... } en vez de lanzar: si Meta
// niega o cambia algo, el informe se genera igual con lo que si hay y marca
// el resto con el motivo exacto que devolvio la API.

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v21.0";
const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** Marca los bloques que dependen de `instagram_manage_insights`. */
export const IG_INSIGHTS_PERMISSION = "instagram_manage_insights";

export interface IgAccount {
  ig_user_id: string;
  username: string;
  pais: string;
  ad_account_id: string;
}

export interface IgProfile {
  username: string;
  name: string | null;
  followers_count: number;
  follows_count: number;
  media_count: number;
}

/** Envoltorio comun: `available: false` + motivo legible cuando la API niega el dato. */
export interface IgBlock<T> {
  available: boolean;
  reason: string | null;
  data: T;
}

export interface IgAccountMetrics {
  views: number;
  reach: number;
  profile_views: number;
  website_clicks: number;
  total_interactions: number;
  accounts_engaged: number;
}

export interface IgDemographics {
  gender: Array<{ label: string; value: number }>;
  age: Array<{ label: string; value: number }>;
  city: Array<{ label: string; value: number }>;
}

export interface IgMediaItem {
  id: string;
  format: "FEED" | "REELS" | "STORY" | "OTRO";
  timestamp: string;
  like_count: number;
  comments_count: number;
  /** Metricas de Insights por publicacion; null si la API no las entrego. */
  views: number | null;
  reach: number | null;
  interactions: number | null;
  likes: number | null;
  comments: number | null;
  saved: number | null;
  shares: number | null;
}

export interface IgContentBreakdown {
  total_publicaciones: number;
  posts_por_dia: number;
  por_formato: Array<{
    formato: string;
    cantidad: number;
    porcentaje: number;
    interacciones: number;
    porcentaje_interacciones: number;
    visualizaciones: number | null;
    porcentaje_visualizaciones: number | null;
  }>;
  interacciones_totales: number;
  /** Desglose de las interacciones; null si Insights no las entrego. */
  interacciones_desglose: {
    likes: number;
    comentarios: number;
    guardados: number;
    compartidos: number;
  } | null;
  visualizaciones_totales: number | null;
  /** true si las interacciones salen de Insights y no de likes + comentarios. */
  con_insights: boolean;
}

function isPermissionError(err: any): boolean {
  const code = err?.code;
  const sub = err?.error_subcode;
  // 10 = app sin permiso para la accion; 200/299 = permiso faltante sobre el objeto;
  // 100 + subcode 33 = objeto no visible con los permisos actuales.
  return code === 10 || code === 200 || code === 299 || (code === 100 && sub === 33);
}

function permissionReason(err: any): string {
  return isPermissionError(err)
    ? `Requiere el permiso ${IG_INSIGHTS_PERMISSION} en la app de Meta (respuesta: ${err?.message || "sin detalle"})`
    : err?.message || "Error desconocido consultando Instagram";
}

async function graphGet(path: string, params: Record<string, string>): Promise<any> {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error("META_ACCESS_TOKEN no configurado");

  const qs = new URLSearchParams({ ...params, access_token: token });
  const res = await fetch(`${GRAPH_BASE_URL}/${path}?${qs}`);
  const data = await res.json();

  if (data.error) {
    const e: any = new Error(data.error.message);
    e.code = data.error.code;
    e.error_subcode = data.error.error_subcode;
    throw e;
  }
  return data;
}

/**
 * Descubre las cuentas de Instagram Business vinculadas a cada cuenta publicitaria.
 * Se puede fijar manualmente con META_IG_ACCOUNTS para evitar el descubrimiento:
 *   [{"ig_user_id":"178414...","username":"supricom_venezuela","pais":"Venezuela"}]
 */
export async function getIgAccounts(
  adAccounts: Array<{ id: string; pais: string }>,
): Promise<IgAccount[]> {
  const manual = process.env.META_IG_ACCOUNTS;
  if (manual) {
    try {
      const parsed = JSON.parse(manual.replace(/\n/g, "").trim());
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((a: any) => ({
          ig_user_id: String(a.ig_user_id),
          username: a.username || "",
          pais: a.pais || "Venezuela",
          ad_account_id: a.ad_account_id || "",
        }));
      }
    } catch {
      console.warn("[Instagram] META_IG_ACCOUNTS mal formado, se ignora");
    }
  }

  const accounts: IgAccount[] = [];
  for (const ad of adAccounts) {
    try {
      const data = await graphGet(`${ad.id}/connected_instagram_accounts`, {
        fields: "id,username",
      });
      for (const ig of data.data || []) {
        accounts.push({
          ig_user_id: ig.id,
          username: ig.username || "",
          pais: ad.pais,
          ad_account_id: ad.id,
        });
      }
    } catch (err: any) {
      console.error(`[Instagram] No se pudo resolver IG de ${ad.id}:`, err?.message);
    }
  }
  return accounts;
}

export async function fetchIgProfile(igUserId: string): Promise<IgProfile | null> {
  try {
    const data = await graphGet(igUserId, {
      fields: "username,name,followers_count,follows_count,media_count",
    });
    return {
      username: data.username || "",
      name: data.name || null,
      followers_count: parseInt(data.followers_count) || 0,
      follows_count: parseInt(data.follows_count) || 0,
      media_count: parseInt(data.media_count) || 0,
    };
  } catch (err: any) {
    console.error(`[Instagram] Perfil ${igUserId}:`, err?.message);
    return null;
  }
}

const EMPTY_METRICS: IgAccountMetrics = {
  views: 0,
  reach: 0,
  profile_views: 0,
  website_clicks: 0,
  total_interactions: 0,
  accounts_engaged: 0,
};

/**
 * Metricas agregadas de la cuenta en el periodo (Slides 1, 2 y 8 del informe).
 * Requiere `instagram_manage_insights`.
 */
export async function fetchIgAccountInsights(
  igUserId: string,
  since: string,
  until: string,
): Promise<IgBlock<IgAccountMetrics>> {
  const sum = (values: any[]) =>
    (values || []).reduce((acc, v) => acc + (parseInt(v.value) || 0), 0);

  const metrics = { ...EMPTY_METRICS };
  let firstError: any = null;

  // La Graph API separa las metricas en dos grupos que NO se pueden pedir
  // juntos. `reach` es serie temporal y devuelve `values[]` (se suman los dias).
  // El resto exige metric_type=total_value y devuelve `total_value.value`;
  // pedirlas sin ese parametro falla con:
  //   (#100) The following metrics (views,profile_views,website_clicks)
  //   should be specified with parameter metric_type=total_value
  try {
    const data = await graphGet(`${igUserId}/insights`, {
      metric: "reach",
      period: "day",
      since,
      until,
    });
    for (const m of data.data || []) {
      if (m.name === "reach") metrics.reach = sum(m.values);
    }
  } catch (err: any) {
    firstError = err;
  }

  try {
    const data = await graphGet(`${igUserId}/insights`, {
      metric:
        "views,profile_views,website_clicks,total_interactions,accounts_engaged",
      period: "day",
      metric_type: "total_value",
      since,
      until,
    });
    for (const m of data.data || []) {
      const total = parseInt(m.total_value?.value) || sum(m.values);
      if (m.name === "views") metrics.views = total;
      if (m.name === "profile_views") metrics.profile_views = total;
      if (m.name === "website_clicks") metrics.website_clicks = total;
      if (m.name === "total_interactions") metrics.total_interactions = total;
      if (m.name === "accounts_engaged") metrics.accounts_engaged = total;
    }
  } catch (err: any) {
    firstError = firstError || err;
  }

  if (firstError) {
    return { available: false, reason: permissionReason(firstError), data: metrics };
  }
  return { available: true, reason: null, data: metrics };
}

/**
 * Demografia de seguidores (Slide 4: genero, edad, ciudades).
 * Requiere `instagram_manage_insights`.
 */
export async function fetchIgDemographics(
  igUserId: string,
): Promise<IgBlock<IgDemographics>> {
  const empty: IgDemographics = { gender: [], age: [], city: [] };
  const result: IgDemographics = { gender: [], age: [], city: [] };
  let firstError: any = null;

  for (const breakdown of ["gender", "age", "city"] as const) {
    try {
      const data = await graphGet(`${igUserId}/insights`, {
        metric: "follower_demographics",
        period: "lifetime",
        metric_type: "total_value",
        breakdown,
        timeframe: "this_month",
      });
      const results = data.data?.[0]?.total_value?.breakdowns?.[0]?.results || [];
      result[breakdown] = results
        .map((r: any) => {
          const raw = (r.dimension_values || [])[0] || "";
          return {
            label: breakdown === "gender" ? (GENERO_LABELS[raw] ?? raw) : raw,
            value: parseInt(r.value) || 0,
          };
        })
        .sort((a: any, b: any) => b.value - a.value);
    } catch (err: any) {
      firstError = firstError || err;
    }
  }

  if (firstError && result.gender.length === 0 && result.age.length === 0 && result.city.length === 0) {
    return { available: false, reason: permissionReason(firstError), data: empty };
  }
  return { available: true, reason: null, data: result };
}

/** La API devuelve el genero como F / M / U (sin especificar). */
const GENERO_LABELS: Record<string, string> = {
  F: "Mujeres",
  M: "Hombres",
  U: "No especificado",
};

/**
 * Seguidores ganados en el periodo. La Graph API limita `follower_count` a los
 * ultimos 30 dias excluyendo el dia actual: para meses anteriores devuelve
 * available:false y el informe cae al snapshot guardado.
 */
export async function fetchIgFollowerGains(
  igUserId: string,
  since: string,
  until: string,
): Promise<IgBlock<number | null>> {
  try {
    const data = await graphGet(`${igUserId}/insights`, {
      metric: "follower_count",
      period: "day",
      since,
      until,
    });
    const values = data.data?.[0]?.values || [];
    const total = values.reduce(
      (acc: number, v: any) => acc + (parseInt(v.value) || 0),
      0,
    );
    return { available: values.length > 0, reason: null, data: total };
  } catch (err: any) {
    return { available: false, reason: permissionReason(err), data: null };
  }
}

function normalizeFormat(media: any): IgMediaItem["format"] {
  const product = media.media_product_type;
  if (product === "REELS") return "REELS";
  if (product === "STORY") return "STORY";
  if (product === "FEED" || product === "AD") return "FEED";
  return "OTRO";
}

/**
 * Publicaciones del periodo. Disponible con `instagram_basic`, sin permisos extra.
 * Alimenta produccion de contenido, mix de formatos e interacciones por formato.
 */
export async function fetchIgMedia(
  igUserId: string,
  since: string,
  until: string,
): Promise<IgBlock<IgMediaItem[]>> {
  const desde = new Date(`${since}T00:00:00Z`).getTime();
  const hasta = new Date(`${until}T23:59:59Z`).getTime();
  const items: IgMediaItem[] = [];

  try {
    let after: string | null = null;
    // La cuenta tiene miles de publicaciones historicas: se pagina desde la mas
    // reciente y se corta al pasar el inicio del periodo.
    for (let page = 0; page < 25; page++) {
      const params: Record<string, string> = {
        fields: "id,media_type,media_product_type,timestamp,like_count,comments_count",
        limit: "100",
      };
      if (after) params.after = after;

      const data: any = await graphGet(`${igUserId}/media`, params);
      const batch = data.data || [];
      if (batch.length === 0) break;

      let olderThanRange = false;
      for (const m of batch) {
        const ts = new Date(m.timestamp).getTime();
        if (ts < desde) {
          olderThanRange = true;
          continue;
        }
        if (ts > hasta) continue;
        items.push({
          id: m.id,
          format: normalizeFormat(m),
          timestamp: m.timestamp,
          like_count: parseInt(m.like_count) || 0,
          comments_count: parseInt(m.comments_count) || 0,
          views: null,
          reach: null,
          interactions: null,
          likes: null,
          comments: null,
          saved: null,
          shares: null,
        });
      }

      after = data.paging?.cursors?.after || null;
      if (olderThanRange || !data.paging?.next || !after) break;
    }

    await enrichWithMediaInsights(items);
    return { available: true, reason: null, data: items };
  } catch (err: any) {
    return { available: false, reason: permissionReason(err), data: [] };
  }
}

/**
 * Completa cada publicacion con sus Insights (una llamada por publicacion, en
 * tandas para no disparar decenas de requests en paralelo). Requiere
 * `instagram_manage_insights`; si falla, los items quedan con null y el
 * desglose cae a likes + comentarios.
 */
async function enrichWithMediaInsights(items: IgMediaItem[]): Promise<void> {
  const LOTE = 8;
  for (let i = 0; i < items.length; i += LOTE) {
    const lote = items.slice(i, i + LOTE);
    await Promise.all(
      lote.map(async (item) => {
        // No todos los formatos aceptan el mismo juego de metricas, asi que se
        // prueba del set completo al minimo y se usa el primero que responda.
        const SETS = [
          "views,reach,total_interactions,likes,comments,saved,shares",
          "views,reach,total_interactions",
          "reach",
        ];
        for (const metric of SETS) {
          try {
            const data = await graphGet(`${item.id}/insights`, { metric });
            for (const m of data.data || []) {
              const value = parseInt(m.values?.[0]?.value) || 0;
              if (m.name === "views") item.views = value;
              if (m.name === "reach") item.reach = value;
              if (m.name === "total_interactions") item.interactions = value;
              if (m.name === "likes") item.likes = value;
              if (m.name === "comments") item.comments = value;
              if (m.name === "saved") item.saved = value;
              if (m.name === "shares") item.shares = value;
            }
            break;
          } catch {
            // Se prueba el set siguiente; si ninguno responde queda en null.
          }
        }
      }),
    );
  }
}

const FORMAT_LABELS: Record<IgMediaItem["format"], string> = {
  FEED: "Publicaciones (Feed)",
  REELS: "Reels",
  STORY: "Historias",
  OTRO: "Otros",
};

/** Agrupa las publicaciones por formato y calcula el ritmo de publicacion. */
export function buildContentBreakdown(
  media: IgMediaItem[],
  dias: number,
): IgContentBreakdown {
  const diasEfectivos = Math.max(1, dias);

  // Si Insights respondio para al menos una publicacion se usan sus
  // interacciones (incluyen guardados y compartidos); si no, likes+comentarios.
  const conInsights = media.some((m) => m.interactions !== null);

  const grupos = new Map<
    string,
    { cantidad: number; interacciones: number; visualizaciones: number }
  >();
  let interaccionesTotales = 0;
  let visualizacionesTotales = 0;

  for (const m of media) {
    const key = FORMAT_LABELS[m.format];
    const interacciones = conInsights
      ? (m.interactions ?? 0)
      : m.like_count + m.comments_count;
    const visualizaciones = m.views ?? 0;
    interaccionesTotales += interacciones;
    visualizacionesTotales += visualizaciones;

    const g = grupos.get(key) || {
      cantidad: 0,
      interacciones: 0,
      visualizaciones: 0,
    };
    g.cantidad += 1;
    g.interacciones += interacciones;
    g.visualizaciones += visualizaciones;
    grupos.set(key, g);
  }

  // Desglose: solo tiene sentido si Insights respondio al menos una vez.
  const sumar = (campo: "likes" | "comments" | "saved" | "shares") =>
    media.reduce((acc, m) => acc + (m[campo] ?? 0), 0);
  const hayDesglose = media.some((m) => m.likes !== null);
  const interacciones_desglose = hayDesglose
    ? {
        likes: sumar("likes"),
        comentarios: sumar("comments"),
        guardados: sumar("saved"),
        compartidos: sumar("shares"),
      }
    : null;

  const total = media.length;
  const pct = (parte: number, entero: number) =>
    entero > 0 ? Math.round((parte / entero) * 1000) / 10 : 0;

  const por_formato = Array.from(grupos.entries())
    .map(([formato, g]) => ({
      formato,
      cantidad: g.cantidad,
      porcentaje: pct(g.cantidad, total),
      interacciones: g.interacciones,
      porcentaje_interacciones: pct(g.interacciones, interaccionesTotales),
      visualizaciones: conInsights ? g.visualizaciones : null,
      porcentaje_visualizaciones: conInsights
        ? pct(g.visualizaciones, visualizacionesTotales)
        : null,
    }))
    .sort((a, b) => b.cantidad - a.cantidad);

  return {
    total_publicaciones: total,
    posts_por_dia: Math.round((total / diasEfectivos) * 10) / 10,
    por_formato,
    interacciones_totales: interaccionesTotales,
    interacciones_desglose,
    visualizaciones_totales: conInsights ? visualizacionesTotales : null,
    con_insights: conInsights,
  };
}

export interface IgSnapshot {
  cuenta: { ig_user_id: string; username: string; pais: string } | null;
  perfil: IgProfile | null;
  metricas: IgBlock<IgAccountMetrics>;
  demografia: IgBlock<IgDemographics>;
  contenido: IgBlock<IgContentBreakdown>;
  seguidores_ganados: IgBlock<number | null>;
}

/** Reune en una sola llamada todo lo que el informe necesita de Instagram. */
export async function buildIgSnapshot(
  account: IgAccount,
  since: string,
  until: string,
  /** Dias transcurridos del periodo; por defecto, el largo del rango. */
  dias?: number,
): Promise<IgSnapshot> {
  const [perfil, metricas, demografia, media, ganados] = await Promise.all([
    fetchIgProfile(account.ig_user_id),
    fetchIgAccountInsights(account.ig_user_id, since, until),
    fetchIgDemographics(account.ig_user_id),
    fetchIgMedia(account.ig_user_id, since, until),
    fetchIgFollowerGains(account.ig_user_id, since, until),
  ]);

  return {
    cuenta: {
      ig_user_id: account.ig_user_id,
      username: account.username || perfil?.username || "",
      pais: account.pais,
    },
    perfil,
    metricas,
    demografia,
    contenido: {
      available: media.available,
      reason: media.reason,
      data: buildContentBreakdown(
        media.data,
        dias ??
          Math.round(
            (new Date(`${until}T00:00:00Z`).getTime() -
              new Date(`${since}T00:00:00Z`).getTime()) /
              86400000,
          ) + 1,
      ),
    },
    seguidores_ganados: ganados,
  };
}
