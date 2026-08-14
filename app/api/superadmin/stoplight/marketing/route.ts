import { query } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "GzC8WCMdNfmi9qX7Oj01U/FTwaOAOwMh5EYE8VukFM8=",
);

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

const SITES = [
  { name: "supicom.com.ve", url: "https://www.supicom.com.ve/" },
  { name: "supricom.com.pa", url: "https://www.supricom.com.pa/" },
  { name: "supricom.com", url: "https://www.supricom.com/" },
];

async function getValidAccessToken(): Promise<string | null> {
  const rows = await query("SELECT access_token, refresh_token, token_expiry FROM google_tokens WHERE provider = 'google'", []);
  const tokenRow = (rows.rows as any[])[0];
  if (!tokenRow) return null;

  const now = new Date();
  const expiry = new Date(tokenRow.token_expiry);

  if (now < expiry) {
    return tokenRow.access_token;
  }

  if (!tokenRow.refresh_token) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: tokenRow.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  const data = await res.json();
  if (data.error) {
    console.error("Error refreshing token:", data);
    return null;
  }

  const newExpiry = new Date();
  newExpiry.setSeconds(newExpiry.getSeconds() + (data.expires_in || 3600));

  await query(
    "UPDATE google_tokens SET access_token = ?, token_expiry = ? WHERE provider = 'google'",
    [data.access_token, newExpiry]
  );

  return data.access_token;
}

async function fetchGA4Properties(accessToken: string): Promise<{ propertyId: string; displayName: string }[]> {
  try {
    const res = await fetch("https://analyticsadmin.googleapis.com/v1alpha/accountSummaries?pageSize=200", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const properties: { propertyId: string; displayName: string }[] = [];
    for (const account of data.accountSummaries || []) {
      for (const prop of account.propertySummaries || []) {
        const id = prop.property?.replace("properties/", "") || "";
        if (id) properties.push({ propertyId: id, displayName: prop.displayName || "" });
      }
    }
    return properties;
  } catch {
    return [];
  }
}

async function fetchGA4Weekly(propertyId: string, accessToken: string, semanas: { inicio: string; fin: string }[]) {
  const results: { totalUsers: number; sessions: number; pageviews: number; bounceRate: number; avgDuration: number }[] = [];

  for (const semana of semanas) {
    try {
      const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
      const body = {
        dateRanges: [{ startDate: semana.inicio, endDate: semana.fin }],
        metrics: [
          { name: "totalUsers" },
          { name: "sessions" },
          { name: "screenPageViews" },
          { name: "bounceRate" },
          { name: "averageSessionDuration" },
        ],
      };

      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        results.push({ totalUsers: 0, sessions: 0, pageviews: 0, bounceRate: 0, avgDuration: 0 });
        continue;
      }

      const data = await res.json();
      const row = data.rows?.[0];
      const mv = row?.metricValues || [];
      results.push({
        totalUsers: Number(mv.find((m: any) => m.metricName === "totalUsers")?.value) || 0,
        sessions: Number(mv.find((m: any) => m.metricName === "sessions")?.value) || 0,
        pageviews: Number(mv.find((m: any) => m.metricName === "screenPageViews")?.value) || 0,
        bounceRate: Number(mv.find((m: any) => m.metricName === "bounceRate")?.value) || 0,
        avgDuration: Number(mv.find((m: any) => m.metricName === "averageSessionDuration")?.value) || 0,
      });
    } catch {
      results.push({ totalUsers: 0, sessions: 0, pageviews: 0, bounceRate: 0, avgDuration: 0 });
    }
  }

  return results;
}

async function fetchGA4Totals(propertyId: string, accessToken: string, startDate: string, endDate: string) {
  try {
    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
    const body = {
      dateRanges: [{ startDate, endDate }],
      metrics: [
        { name: "totalUsers" },
        { name: "sessions" },
        { name: "screenPageViews" },
        { name: "bounceRate" },
        { name: "averageSessionDuration" },
      ],
    };
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const row = data.rows?.[0];
    const mv = row?.metricValues || [];
    return {
      totalUsers: Number(mv.find((m: any) => m.metricName === "totalUsers")?.value) || 0,
      sessions: Number(mv.find((m: any) => m.metricName === "sessions")?.value) || 0,
      pageviews: Number(mv.find((m: any) => m.metricName === "screenPageViews")?.value) || 0,
      bounceRate: Number(mv.find((m: any) => m.metricName === "bounceRate")?.value) || 0,
      avgDuration: Number(mv.find((m: any) => m.metricName === "averageSessionDuration")?.value) || 0,
    };
  } catch {
    return null;
  }
}

async function fetchSearchConsoleData(siteUrl: string, accessToken: string, startDate: string, endDate: string) {
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const body = { startDate, endDate, dimensions: ["date"], rowLimit: 31 };

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) return null;
  return res.json();
}

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userRole = ((payload.role as string) || "").toLowerCase().trim();
    if (userRole !== "superadmin" && userRole !== "gerencia de ventas" && userRole !== "compras" && userRole !== "gerente de operaciones") return NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 });

    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      return NextResponse.json({ success: true, connected: false, message: "Google no conectado", data: null });
    }

    const url = new URL(request.url);
    const mesParam = url.searchParams.get("mes");
    const startDateParam = url.searchParams.get("startDate");
    const endDateParam = url.searchParams.get("endDate");
    const now = new Date();
    const mes = mesParam || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const [anioStr, mesStr] = mes.split("-");
    const anio = parseInt(anioStr, 10);
    const mesNum = parseInt(mesStr, 10);
    const startDate = startDateParam || `${anio}-${String(mesNum).padStart(2, "0")}-01`;
    const endDate = endDateParam || `${anio}-${String(mesNum).padStart(2, "0")}-${new Date(anio, mesNum, 0).getDate()}`;
    const rangeEnd = new Date(endDate);

    const semanas: { inicio: string; fin: string }[] = [];
    let current = new Date(startDate);
    while (current <= rangeEnd) {
      const semanaInicio = new Date(current);
      let semanaFin = new Date(current);
      semanaFin.setDate(semanaFin.getDate() + 6);
      if (semanaFin > rangeEnd) {
        semanaFin = new Date(rangeEnd);
      }
      semanas.push({
        inicio: semanaInicio.toISOString().split("T")[0],
        fin: semanaFin.toISOString().split("T")[0],
      });
      current = new Date(semanaFin);
      current.setDate(current.getDate() + 1);
    }

    const numSemanas = semanas.length;
    const hoy = new Date();
    const semanaActiva = (i: number) => {
      const inicio = new Date(semanas[i].inicio);
      return inicio <= hoy;
    };

    const ga4Properties = await fetchGA4Properties(accessToken);
    console.log("[Marketing] GA4 properties found:", ga4Properties.length, ga4Properties.map(p => p.propertyId));

    let ga4WeeklyData: { totalUsers: (number | null)[]; sessions: (number | null)[]; pageviews: (number | null)[]; bounceRate: (number | null)[] } = {
      totalUsers: Array(numSemanas).fill(null),
      sessions: Array(numSemanas).fill(null),
      pageviews: Array(numSemanas).fill(null),
      bounceRate: Array(numSemanas).fill(null),
    };
    let ga4Totals = { totalUsers: 0, sessions: 0, pageviews: 0, bounceRate: 0, avgDuration: 0 };

    for (const prop of ga4Properties) {
      const weekly = await fetchGA4Weekly(prop.propertyId, accessToken, semanas);
      const totals = await fetchGA4Totals(prop.propertyId, accessToken, startDate, endDate);

      if (totals) {
        ga4Totals.totalUsers += totals.totalUsers;
        ga4Totals.sessions += totals.sessions;
        ga4Totals.pageviews += totals.pageviews;
        ga4Totals.bounceRate += totals.bounceRate;
        ga4Totals.avgDuration += totals.avgDuration;
      }

      for (let i = 0; i < numSemanas; i++) {
        if (semanaActiva(i) && weekly[i]) {
          ga4WeeklyData.totalUsers[i] = (ga4WeeklyData.totalUsers[i] || 0) + weekly[i].totalUsers;
          ga4WeeklyData.sessions[i] = (ga4WeeklyData.sessions[i] || 0) + weekly[i].sessions;
          ga4WeeklyData.pageviews[i] = (ga4WeeklyData.pageviews[i] || 0) + weekly[i].pageviews;
          ga4WeeklyData.bounceRate[i] = (ga4WeeklyData.bounceRate[i] || 0) + weekly[i].bounceRate;
        }
      }
    }

    if (ga4Properties.length > 1) {
      ga4Totals.bounceRate = Math.round(ga4Totals.bounceRate / ga4Properties.length * 100) / 100;
      for (let i = 0; i < numSemanas; i++) {
        if (ga4WeeklyData.bounceRate[i] !== null) {
          ga4WeeklyData.bounceRate[i] = Math.round((ga4WeeklyData.bounceRate[i] || 0) / ga4Properties.length * 100) / 100;
        }
      }
    }

    const siteResults: any[] = [];

    for (const site of SITES) {
      const scData = await fetchSearchConsoleData(site.url, accessToken, startDate, endDate).catch(() => null);

      let totalClicks = 0;
      let totalImpressions = 0;
      let avgCtr = 0;
      let avgPosition = 0;
      const scWeeklyClicks: (number | null)[] = Array(numSemanas).fill(null);
      const scWeeklyImpressions: (number | null)[] = Array(numSemanas).fill(null);
      const scWeeklyPositionSum: (number | null)[] = Array(numSemanas).fill(null);
      const scWeeklyPositionCount: number[] = Array(numSemanas).fill(0);

      if (scData?.rows) {
        for (const row of scData.rows) {
          totalClicks += row.clicks || 0;
          totalImpressions += row.impressions || 0;
          avgCtr += row.ctr || 0;
          avgPosition += row.position || 0;
        }
        const rowCount = scData.rows.length;
        avgCtr = rowCount > 0 ? Math.round((avgCtr / rowCount) * 100) : 0;
        avgPosition = rowCount > 0 ? Math.round((avgPosition / rowCount) * 10) / 10 : 0;

        for (const row of scData.rows) {
          const rowDate = row.keys?.[0] || "";
          for (let i = 0; i < numSemanas; i++) {
            if (semanaActiva(i) && rowDate >= semanas[i].inicio && rowDate <= semanas[i].fin) {
              scWeeklyClicks[i] = (scWeeklyClicks[i] || 0) + (row.clicks || 0);
              scWeeklyImpressions[i] = (scWeeklyImpressions[i] || 0) + (row.impressions || 0);
              scWeeklyPositionSum[i] = (scWeeklyPositionSum[i] || 0) + (row.position || 0);
              scWeeklyPositionCount[i]++;
              break;
            }
          }
        }
      }

      const scWeeklyPosition: (number | null)[] = scWeeklyPositionSum.map((sum, i) =>
        sum !== null && scWeeklyPositionCount[i] > 0
          ? Math.round((sum / scWeeklyPositionCount[i]) * 10) / 10
          : null
      );

      siteResults.push({
        siteName: site.name,
        siteUrl: site.url,
        searchConsole: {
          totalClicks, totalImpressions, avgCtr, avgPosition,
          weeklyClicks: scWeeklyClicks,
          weeklyImpressions: scWeeklyImpressions,
          weeklyPosition: scWeeklyPosition,
        },
      });
    }

    const totalClicksAll = siteResults.reduce((sum, s) => sum + s.searchConsole.totalClicks, 0);
    const totalImpressionsAll = siteResults.reduce((sum, s) => sum + s.searchConsole.totalImpressions, 0);
    const overallCtr = totalImpressionsAll > 0 ? Math.round((totalClicksAll / totalImpressionsAll) * 100) : 0;
    const avgPositionAll = siteResults.length > 0
      ? Math.round(siteResults.reduce((sum, s) => sum + s.searchConsole.avgPosition, 0) / siteResults.length * 10) / 10
      : 0;

    const weekClicksAll: (number | null)[] = Array(numSemanas).fill(null);
    const weekImpressionsAll: (number | null)[] = Array(numSemanas).fill(null);
    const weekPositionSum: (number | null)[] = Array(numSemanas).fill(null);
    const weekPositionCount: number[] = Array(numSemanas).fill(0);
    for (const site of siteResults) {
      for (let i = 0; i < numSemanas; i++) {
        if (site.searchConsole.weeklyClicks[i] !== null) {
          weekClicksAll[i] = (weekClicksAll[i] || 0) + (site.searchConsole.weeklyClicks[i] || 0);
        }
        if (site.searchConsole.weeklyImpressions[i] !== null) {
          weekImpressionsAll[i] = (weekImpressionsAll[i] || 0) + (site.searchConsole.weeklyImpressions[i] || 0);
        }
        if (site.searchConsole.weeklyPosition[i] !== null) {
          weekPositionSum[i] = (weekPositionSum[i] || 0) + (site.searchConsole.weeklyPosition[i] || 0);
          weekPositionCount[i]++;
        }
      }
    }
    const weekPositionAll: (number | null)[] = weekPositionSum.map((sum, i) =>
      sum !== null && weekPositionCount[i] > 0
        ? Math.round((sum / weekPositionCount[i]) * 10) / 10
        : null
    );

    const weekHeaders = semanas.map((s) => {
      const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
      const d1 = new Date(s.inicio);
      const d2 = new Date(s.fin);
      return `${d1.toLocaleDateString("es-VE", opts)} - ${d2.toLocaleDateString("es-VE", opts)}`;
    });

    // ========================================
    // Odoo Email Marketing (mass_mailing)
    // ========================================
    let emailOpenRate: number | null = null;
    let emailWeeklyOpenRate: (number | null)[] = Array(numSemanas).fill(null);
    let emailTotalSent = 0;
    let emailTotalOpened = 0;
    let emailDebug = { mailingsFound: 0, statsFound: 0, error: null as string | null };

    try {
      const mailings = (await callOdooRPC<any[]>(
        "mail.mass_mailing",
        "search_read",
        [[
          ["create_date", ">=", startDate],
          ["create_date", "<=", endDate],
        ]],
        {
          fields: ["id", "name", "create_date", "sent_date", "state", "mailing_model_id"],
          limit: 500,
        }
      )) || [];

      emailDebug.mailingsFound = mailings.length;

      if (mailings.length > 0) {
        const mailingIds = mailings.map((m: any) => m.id);

        const stats = (await callOdooRPC<any[]>(
          "mail.mass_mailing.stat",
          "search_read",
          [[["mass_mailing_id", "in", mailingIds]]],
          {
            fields: ["mass_mailing_id", "total", "delivered", "opened", "clicked", "bounced"],
            limit: 5000,
          }
        )) || [];

        emailDebug.statsFound = stats.length;

        const statsByMailing: Record<number, any> = {};
        stats.forEach((s: any) => {
          const mid = Array.isArray(s.mass_mailing_id) ? s.mass_mailing_id[0] : s.mass_mailing_id;
          if (!statsByMailing[mid]) statsByMailing[mid] = { total: 0, delivered: 0, opened: 0 };
          statsByMailing[mid].total += Number(s.total) || 0;
          statsByMailing[mid].delivered += Number(s.delivered) || 0;
          statsByMailing[mid].opened += Number(s.opened) || 0;
        });

        let totalSent = 0;
        let totalOpened = 0;
        const weekSent: number[] = Array(numSemanas).fill(0);
        const weekOpened: number[] = Array(numSemanas).fill(0);

        for (const mailing of mailings) {
          const stat = statsByMailing[mailing.id];
          if (!stat) continue;

          const sent = stat.delivered || stat.total;
          const opened = stat.opened;
          totalSent += sent;
          totalOpened += opened;

          const mailingDate = (mailing.sent_date || mailing.create_date || "").split(" ")[0];
          for (let i = 0; i < semanas.length; i++) {
            if (mailingDate >= semanas[i].inicio && mailingDate <= semanas[i].fin) {
              weekSent[i] += sent;
              weekOpened[i] += opened;
              break;
            }
          }
        }

        emailTotalSent = totalSent;
        emailTotalOpened = totalOpened;
        emailOpenRate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0;

        for (let i = 0; i < numSemanas; i++) {
          if (weekSent[i] > 0) {
            emailWeeklyOpenRate[i] = Math.round((weekOpened[i] / weekSent[i]) * 100);
          }
        }
      }
    } catch (e: any) {
      console.error("Error fetching Odoo email marketing:", e.message);
      emailDebug.error = e.message;
    }

    return NextResponse.json({
      success: true,
      connected: true,
      data: {
        mes,
        weekHeaders,
        numSemanas,
        totalSites: SITES.length,
        ga4Properties: ga4Properties.map(p => ({ id: p.propertyId, name: p.displayName })),
        ga4: ga4Totals,
        ga4Weekly: ga4WeeklyData,
        sites: siteResults,
        totals: {
          totalClicks: totalClicksAll,
          totalImpressions: totalImpressionsAll,
          overallCtr,
          avgPosition: avgPositionAll,
        },
        weekly: {
          clicks: weekClicksAll,
          impressions: weekImpressionsAll,
          position: weekPositionAll,
        },
        emailMarketing: {
          openRate: emailOpenRate,
          totalSent: emailTotalSent,
          totalOpened: emailTotalOpened,
          weeklyOpenRate: emailWeeklyOpenRate,
          debug: emailDebug,
        },
      },
    });
  } catch (error: any) {
    console.error("Error en API marketing:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
