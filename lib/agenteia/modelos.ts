// Modelos que el SuperAdmin puede elegir en la pantalla del Agente IA. Sin
// elección se usa el del servidor (AGENTE_IA_MODELO). La API valida contra
// esta lista: el navegador no puede pedir otro modelo.
export const MODELOS_AGENTE = [
  { id: "claude-opus-5-5", nombre: "Opus 5.5 · más capaz" },
  { id: "claude-sonnet-5-5", nombre: "Sonnet 5.5 · equilibrado" },
  { id: "claude-haiku-4-5-20251001", nombre: "Haiku 4.5 · rápido" },
] as const;
