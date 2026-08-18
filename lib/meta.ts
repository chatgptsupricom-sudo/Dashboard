const META_BASE_URL = "https://graph.facebook.com/v21.0";

export interface MetaAdAccount {
  id: string;
  pais: string;
  nombre: string;
}

export interface MetaCampaignInsight {
  campaign_id: string;
  campaign_name: string;
  spend: string;
  impressions: string;
  clicks: string;
  ctr: string;
  cpc: string;
  actions?: Array<{ action_type: string; value: string }>;
}

export interface NormalizedCampaign {
  campaign_id: string;
  campaign_name: string;
  pais: string;
  ad_account_id: string;
  spend_usd: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  leads_from_ads: number;
}

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

  const url = `${META_BASE_URL}/${adAccountId}/insights`;
  const body = {
    fields: ["campaign_id", "campaign_name", "spend", "impressions", "clicks", "ctr", "cpc", "actions", "cost_per_action_type", "action_values"],
    level: "campaign",
    time_range: { since: fechaInicio, until: fechaFin },
    time_increment: 0,
    access_token: token,
  };

  console.log(`[Meta API] Fetching ${adAccountId} from ${fechaInicio} to ${fechaFin}`);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (data.error) {
    console.error(`[Meta API] Error ${adAccountId}:`, JSON.stringify(data.error));
    throw new Error(data.error.message || "Meta API error");
  }

  console.log(`[Meta API] ${adAccountId} | campaigns: ${data.data?.length || 0}`);

  if (data.data && data.data.length > 0) {
    const sample = data.data[0];
    console.log(`[Meta API] Sample: campaign=${sample.campaign_name} spend=${sample.spend} imp=${sample.impressions} clicks=${sample.clicks}`);
  }

  return data.data || [];
}

export function normalizeCampaign(
  raw: MetaCampaignInsight,
  pais: string,
  adAccountId: string,
): NormalizedCampaign {
  const leadAction = raw.actions?.find((a) => a.action_type === "lead");
  const normalized = {
    campaign_id: raw.campaign_id,
    campaign_name: raw.campaign_name,
    pais,
    ad_account_id: adAccountId,
    spend_usd: parseFloat(raw.spend) || 0,
    impressions: parseInt(raw.impressions) || 0,
    clicks: parseInt(raw.clicks) || 0,
    ctr: parseFloat(raw.ctr) || 0,
    cpc: parseFloat(raw.cpc) || 0,
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
