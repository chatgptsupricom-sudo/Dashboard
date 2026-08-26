const META_BASE_URL = "https://graph.facebook.com/v21.0";

export interface MetaAdAccount {
  id: string;
  pais: string;
  nombre: string;
}

export interface MetaCampaignInsight {
  campaign_id: string;
  campaign_name: string;
  objective?: string;
  spend: string;
  impressions: string;
  reach?: string;
  frequency?: string;
  clicks: string;
  ctr: string;
  cpc: string;
  cpm?: string;
  actions?: Array<{ action_type: string; value: string }>;
  video_play_actions?: Array<{ action_type: string; value: string }>;
}

export interface NormalizedCampaign {
  campaign_id: string;
  campaign_name: string;
  pais: string;
  ad_account_id: string;
  objetivo: string;
  spend_usd: number;
  impressions: number;
  /** Personas alcanzadas (unicas), distinto de impresiones. */
  reach: number;
  frequency: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  /** Reproducciones de video, para el CPV del reporte por campana. */
  reproducciones: number;
  leads_from_ads: number;
}

/** Objetivos de campana de Meta, en el vocabulario del informe. */
const OBJETIVOS: Record<string, string> = {
  OUTCOME_SALES: "Ventas",
  OUTCOME_LEADS: "Nuevos clientes potenciales",
  OUTCOME_ENGAGEMENT: "Interacción",
  OUTCOME_TRAFFIC: "Tráfico",
  OUTCOME_AWARENESS: "Reconocimiento",
  OUTCOME_APP_PROMOTION: "Promoción de app",
  LEAD_GENERATION: "Nuevos clientes potenciales",
  CONVERSIONS: "Conversiones",
  MESSAGES: "Mensajes",
  LINK_CLICKS: "Tráfico",
  POST_ENGAGEMENT: "Interacción",
  REACH: "Alcance",
  BRAND_AWARENESS: "Reconocimiento",
};

export function getAdAccounts(): MetaAdAccount[] {
  try {
    const raw = process.env.META_AD_ACCOUNTS || "[]";
    return JSON.parse(raw.replace(/\n/g, "").trim());
  } catch {
    return [];
  }
}

export function filterByCids(
  accounts: MetaAdAccount[],
  userCids: number,
): MetaAdAccount[] {
  if (userCids === 7) {
    return accounts.filter((a) => a.pais === "Panama");
  }
  return accounts.filter((a) => a.pais === "Venezuela");
}

export async function fetchCampaignInsights(
  adAccountId: string,
  fechaInicio: string,
  fechaFin: string,
): Promise<MetaCampaignInsight[]> {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error("META_ACCESS_TOKEN no configurado");

  const params = new URLSearchParams({
    fields:
      "campaign_id,campaign_name,objective,spend,impressions,reach,frequency,clicks,ctr,cpc,cpm,actions,video_play_actions",
    level: "campaign",
    time_range: JSON.stringify({ since: fechaInicio, until: fechaFin }),
    limit: "500",
    access_token: token,
  });

  console.log(`[Meta API] GET ${adAccountId}/insights`);

  const res = await fetch(`${META_BASE_URL}/${adAccountId}/insights?${params}`);

  const data = await res.json();

  if (data.error) {
    console.error(`[Meta API] Error ${adAccountId}:`, data.error.message);
    throw new Error(data.error.message);
  }

  console.log(`[Meta API] ${adAccountId} | campaigns: ${data.data?.length || 0}`);

  if (data.data && data.data.length > 0) {
    const sample = data.data[0];
    console.log(`[Meta API] Sample: ${sample.campaign_name} spend=${sample.spend} imp=${sample.impressions}`);
  }

  return data.data || [];
}

export function normalizeCampaign(
  raw: MetaCampaignInsight,
  pais: string,
  adAccountId: string,
): NormalizedCampaign {
  const leadAction = raw.actions?.find((a) => a.action_type === "lead");
  const videoView = raw.video_play_actions?.find(
    (a) => a.action_type === "video_view",
  );
  const normalized = {
    campaign_id: raw.campaign_id,
    campaign_name: raw.campaign_name,
    pais,
    ad_account_id: adAccountId,
    objetivo: OBJETIVOS[raw.objective || ""] ?? raw.objective ?? "Sin objetivo",
    spend_usd: parseFloat(raw.spend) || 0,
    impressions: parseInt(raw.impressions) || 0,
    reach: parseInt(raw.reach || "0") || 0,
    frequency: parseFloat(raw.frequency || "0") || 0,
    clicks: parseInt(raw.clicks) || 0,
    ctr: parseFloat(raw.ctr) || 0,
    cpc: parseFloat(raw.cpc) || 0,
    cpm: parseFloat(raw.cpm || "0") || 0,
    reproducciones: videoView ? parseInt(videoView.value) || 0 : 0,
    leads_from_ads: leadAction ? parseInt(leadAction.value) || 0 : 0,
  };
  if (normalized.spend_usd > 0) {
    console.log(`[Meta] ${raw.campaign_name}: spend=$${normalized.spend_usd}, imp=${normalized.impressions}, clicks=${normalized.clicks}`);
  }
  return normalized;
}

export async function syncAllCampaigns(
  fechaInicio: string,
  fechaFin: string,
  accountsToFetch?: MetaAdAccount[],
): Promise<NormalizedCampaign[]> {
  const allAccounts = accountsToFetch || getAdAccounts();
  const allCampaigns: NormalizedCampaign[] = [];

  for (const account of allAccounts) {
    try {
      const raw = await fetchCampaignInsights(
        account.id,
        fechaInicio,
        fechaFin,
      );
      for (const campaign of raw) {
        allCampaigns.push(normalizeCampaign(campaign, account.pais, account.id));
      }
    } catch (err) {
      console.error(
        `Error fetching Meta insights for ${account.id} (${account.nombre}):`,
        err,
      );
    }
  }

  return allCampaigns;
}
