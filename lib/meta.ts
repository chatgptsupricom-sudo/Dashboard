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
    return JSON.parse(process.env.META_AD_ACCOUNTS || "[]");
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
    fields: "campaign_id,campaign_name,spend,impressions,clicks,ctr,cpc,actions",
    level: "campaign",
    time_range: JSON.stringify({ since: fechaInicio, until: fechaFin }),
    access_token: token,
  });

  const res = await fetch(`${META_BASE_URL}/${adAccountId}/insights?${params}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `Meta API error ${res.status}: ${err?.error?.message || res.statusText}`,
    );
  }

  const data = await res.json();
  return data.data || [];
}

export function normalizeCampaign(
  raw: MetaCampaignInsight,
  pais: string,
  adAccountId: string,
): NormalizedCampaign {
  const leadAction = raw.actions?.find((a) => a.action_type === "lead");
  return {
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
