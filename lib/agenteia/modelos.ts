// Modelos que se pueden elegir en la pantalla del Agente IA. La API valida
// contra esta lista: el navegador no puede pedir otro modelo ni uno reservado
// al SuperAdmin.
//
// Hoy hay uno solo, fijo para todos: Sonnet 5.5 con esfuerzo medio
// (lib/agenteia/agente.ts), por costo. Con un único modelo la pantalla oculta
// el selector y una elección vieja guardada en el navegador deja de valer.
// Para volver a ofrecer otros basta agregarlos aquí, ej.:
//   { id: "claude-opus-5-5", nombre: "Opus 5.5", soloSuperadmin: true },
//   { id: "claude-haiku-4-5-20251001", nombre: "Haiku 4.5 · rápido", soloSuperadmin: false },
export const MODELOS_AGENTE: readonly { id: string; nombre: string; soloSuperadmin: boolean }[] = [
  { id: "claude-sonnet-5-5", nombre: "Sonnet 5.5", soloSuperadmin: false },
];

/** Modelos que puede elegir un usuario: los reservados son solo del SuperAdmin. */
export const modelosPara = (esSuperadmin: boolean) =>
  MODELOS_AGENTE.filter((m) => esSuperadmin || !m.soloSuperadmin).map(({ id, nombre }) => ({ id, nombre }));
