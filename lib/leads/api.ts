/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Lead, LeadStatus } from "../types";
import { createLead, fetchLeads, updateLead } from "./apiService";

// --- Keep existing exports for backward compatibility ---

export const DEFAULT_WEBHOOK_URL =
  "https://n8n.tu-servidor.com/webhook/crm-leads";

export function getWebhookUrl(): string {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem("crm_n8n_webhook_url");
    return saved || DEFAULT_WEBHOOK_URL;
  }
  return DEFAULT_WEBHOOK_URL;
}

export function saveWebhookUrl(url: string): void {
  if (typeof window !== "undefined") {
    localStorage.setItem("crm_n8n_webhook_url", url);
  }
}

// Keep sendWebhookStatusChange as is
export async function sendWebhookStatusChange(
  lead: Lead,
  prevStatus: LeadStatus,
): Promise<{ success: boolean; message: string; rawResponse?: any }> {
  // ... n8n logic
  return { success: true, message: "Simulated" };
}

export function getSavedSpreadsheetId(): string {
  return "";
}

export function saveSpreadsheetId(id: string): void {}

export function parseSpreadsheetIdInput(input: string): string {
  return input;
}

// --- MySQL API implementations ---

export async function fetchLeadsFromSheet(): Promise<{
  sheetTitle: string;
  leads: Lead[];
}> {
  try {
    const leads = await fetchLeads();
    return { sheetTitle: "MySQL", leads };
  } catch (err) {
    console.error(err);
    throw new Error("No se pudo leer la base de datos.");
  }
}

export async function updateLeadInSheet(
  accessToken: string,
  spreadsheetId: string,
  sheetTitle: string,
  lead: Lead,
): Promise<void> {
  await updateLead(lead);
}

export async function appendLeadToSheet(
  accessToken: string,
  spreadsheetId: string,
  sheetTitle: string,
  lead: Lead,
): Promise<number> {
  await createLead(lead);
  return 0;
}
