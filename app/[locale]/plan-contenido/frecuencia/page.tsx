// ============================================================
// Página — Frecuencia CPM
// app/[locale]/plan-contenido/frecuencia/page.tsx
// ============================================================

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { headers } from "next/headers";
import { jwtVerify } from "jose";
import { FrecuenciaPanel } from "@/components/plan-contenido/frecuencia-panel";

async function getUserRole(): Promise<string | null> {
  try {
    const h = await headers();
    const cookie = h.get("cookie") || "";
    const match = cookie.match(/token=([^;]+)/);
    if (!match) return null;

    const secret = process.env.JWT_SECRET;
    if (!secret) return null;

    const { payload } = await jwtVerify(match[1], new TextEncoder().encode(secret));
    return (payload as any).role || null;
  } catch {
    return null;
  }
}

export default async function FrecuenciaPage() {
  const locale = await getLocale();
  const role = await getUserRole();

  // Solo marketing y superadmin
  if (!role || !["marketing", "superadmin"].includes(role.toLowerCase())) {
    redirect(`/${locale}/plan-contenido`);
  }

  return <FrecuenciaPanel userRole={role} />;
}
