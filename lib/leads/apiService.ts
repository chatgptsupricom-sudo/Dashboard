import { Lead } from "./types";

export async function fetchLeads(): Promise<Lead[]> {
  const response = await fetch("/api/leads");
  if (!response.ok) throw new Error("Failed to fetch leads");
  return response.json();
}

export async function createLead(lead: Lead): Promise<void> {
  const response = await fetch("/api/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(lead),
  });
  if (!response.ok) throw new Error("Failed to create lead");
}

export async function updateLead(lead: Lead): Promise<void> {
  const response = await fetch(`/api/leads/${lead.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(lead),
  });
  if (!response.ok) throw new Error("Failed to update lead");
}

export async function deleteLead(id: string): Promise<void> {
  const response = await fetch(`/api/leads/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error("Failed to delete lead");
}
