// Dias festivos de Venezuela por año (Caracas / Valencia)
// Fuente: Gaceta Oficial de Venezuela
// Nota: Vacaciones colectivas (ej: 23 DIC - 4 ENE) NO se incluyen aquí,
//       solo feriados oficiales. Sábados y domingos NO se laboran.

export const FERIADOS_VENEZUELA: Record<number, string[]> = {
  2024: [
    "2024-01-01", // Año Nuevo
    "2024-02-12", // Carnaval
    "2024-02-13", // Carnaval
    "2024-03-28", // Jueves Santo
    "2024-03-29", // Viernes Santo
    "2024-04-19", // Declaración de Independencia
    "2024-05-01", // Día del Trabajador
    "2024-06-24", // Batalla de Carabobo
    "2024-07-05", // Día de la Independencia
    "2024-07-24", // Natalicio del Libertador
    "2024-10-12", // Día de la Resistencia Indígena
    "2024-12-24", // Nochebuena
    "2024-12-25", // Navidad
    "2024-12-31", // Fin de año
  ],
  2025: [
    "2025-01-01", // Año Nuevo
    "2025-02-17", // Carnaval
    "2025-02-18", // Carnaval
    "2025-04-17", // Jueves Santo
    "2025-04-18", // Viernes Santo
    "2025-04-19", // Declaración de Independencia
    "2025-05-01", // Día del Trabajador
    "2025-06-24", // Batalla de Carabobo
    "2025-07-05", // Día de la Independencia
    "2025-07-24", // Natalicio del Libertador
    "2025-10-12", // Día de la Resistencia Indígena
    "2025-12-24", // Nochebuena
    "2025-12-25", // Navidad
    "2025-12-31", // Fin de año
  ],
  2026: [
    "2026-01-01", // Año Nuevo
    "2026-02-09", // Carnaval
    "2026-02-10", // Carnaval
    "2026-04-02", // Jueves Santo
    "2026-04-03", // Viernes Santo
    "2026-04-19", // Declaración de Independencia
    "2026-05-01", // Día del Trabajador
    "2026-06-24", // Batalla de Carabobo
    "2026-07-05", // Día de la Independencia
    "2026-07-24", // Natalicio del Libertador
    "2026-10-12", // Día de la Resistencia Indígena
    "2026-12-24", // Nochebuena
    "2026-12-25", // Navidad
    "2026-12-31", // Fin de año
  ],
};

export function esFeriado(fecha: Date): boolean {
  const str = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
  const year = fecha.getFullYear();
  const feriados = FERIADOS_VENEZUELA[year] || [];
  return feriados.includes(str);
}

export function esDiaUtil(fecha: Date): boolean {
  const day = fecha.getDay();
  if (day === 0 || day === 6) return false; // Domingo o Sabado
  return !esFeriado(fecha);
}

export function contarDiasUtiles(fechaInicio: Date, fechaFin: Date): number {
  let count = 0;
  const current = new Date(fechaInicio);
  while (current <= fechaFin) {
    if (esDiaUtil(current)) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

export function obtenerSemanasDelMes(anio: number, mes: number): { inicio: Date; fin: Date; diasUtiles: number }[] {
  const semanas: { inicio: Date; fin: Date; diasUtiles: number }[] = [];
  const primerDia = new Date(anio, mes - 1, 1);
  const ultimoDia = new Date(anio, mes, 0);

  let semanaInicio = new Date(primerDia);
  while (semanaInicio <= ultimoDia) {
    let semanaFin = new Date(semanaInicio);
    semanaFin.setDate(semanaFin.getDate() + 6);
    if (semanaFin > ultimoDia) {
      semanaFin = new Date(ultimoDia);
    }
    const diasUtiles = contarDiasUtiles(semanaInicio, semanaFin);
    semanas.push({ inicio: new Date(semanaInicio), fin: new Date(semanaFin), diasUtiles });
    semanaInicio.setDate(semanaInicio.getDate() + 7);
  }

  return semanas;
}

export function obtenerSemanasDelRango(inicio: Date, fin: Date): { inicio: Date; fin: Date; diasUtiles: number }[] {
  const semanas: { inicio: Date; fin: Date; diasUtiles: number }[] = [];
  let semanaInicio = new Date(inicio);
  while (semanaInicio <= fin) {
    let semanaFin = new Date(semanaInicio);
    semanaFin.setDate(semanaFin.getDate() + 6);
    if (semanaFin > fin) semanaFin = new Date(fin);
    const diasUtiles = contarDiasUtiles(semanaInicio, semanaFin);
    semanas.push({ inicio: new Date(semanaInicio), fin: new Date(semanaFin), diasUtiles });
    semanaInicio.setDate(semanaInicio.getDate() + 7);
  }
  return semanas;
}
