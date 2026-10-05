// Modelos que se pueden elegir en la pantalla del Agente IA. Sin elección se
// usa el del servidor (AGENTE_IA_MODELO). La API valida contra esta lista: el
// navegador no puede pedir otro modelo ni uno reservado al SuperAdmin.
// Los demás roles ven solo el más económico de cada familia (Opus 5.5 cuesta
// menos que Opus 5; Sonnet 5.5 cuesta igual que Sonnet 5 y es más nuevo).
export const MODELOS_AGENTE = [
  { id: "claude-opus-5-5", nombre: "Opus 5.5", soloSuperadmin: false },
  { id: "claude-opus-5", nombre: "Opus 5", soloSuperadmin: true },
  { id: "claude-sonnet-5-5", nombre: "Sonnet 5.5", soloSuperadmin: false },
  { id: "claude-sonnet-5", nombre: "Sonnet 5", soloSuperadmin: true },
  { id: "claude-haiku-4-5-20251001", nombre: "Haiku 4.5 · rápido", soloSuperadmin: false },
] as const;

/** Modelos que puede elegir un usuario: los no SuperAdmin, uno por familia. */
export const modelosPara = (esSuperadmin: boolean) =>
  MODELOS_AGENTE.filter((m) => esSuperadmin || !m.soloSuperadmin).map(({ id, nombre }) => ({ id, nombre }));
