import { rutasFrecuenciaMarca } from "@/lib/customView/frecuenciaMarca";

export const dynamic = "force-dynamic";

// Frecuencia CPM de Asta (su HTML usa API_BASE = /api/plan-contenido/frecuencia-asta).
export const { GET, POST } = rutasFrecuenciaMarca("asta", "ASTA");
