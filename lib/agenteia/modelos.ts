// Modelos que se pueden elegir en la pantalla del Agente IA. Sin elección se
// usa el del servidor (AGENTE_IA_MODELO). La API valida contra esta lista: el
// navegador no puede pedir otro modelo ni uno reservado al SuperAdmin.
export const MODELOS_AGENTE = [
  { id: "claude-opus-5-5", nombre: "Opus 5.5", soloSuperadmin: true },
  { id: "claude-opus-5", nombre: "Opus 5", soloSuperadmin: true },
  { id: "claude-fable-5-1", nombre: "Fable 5.1", soloSuperadmin: false },
  { id: "claude-sonnet-5-5", nombre: "Sonnet 5.5", soloSuperadmin: false },
  { id: "claude-sonnet-5", nombre: "Sonnet 5", soloSuperadmin: false },
  { id: "claude-haiku-4-5-20251001", nombre: "Haiku 4.5 · rápido", soloSuperadmin: false },
] as const;

/** Modelos que puede elegir un usuario: los Opus son solo del SuperAdmin. */
export const modelosPara = (esSuperadmin: boolean) =>
  MODELOS_AGENTE.filter((m) => esSuperadmin || !m.soloSuperadmin).map(({ id, nombre }) => ({ id, nombre }));
