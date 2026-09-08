// Tipos de datos del Stoplight Report — extraídos de
// components/superadmin/StoplightReport.tsx (audit #23).

export interface SellerData {
  nombre: string;
  cuotaMensual: number;
  facturadoMensual: number;
  semanas: { facturado: number; cuotaSemanal: number }[];
}

export interface KpiData {
  metaMensual: number;
  totalCuotaMensual: number;
  totalFacturadoMensual: number;
  porcentajeCumplimiento: number;
  // Avance del mes de la cuota: facturado ÷ cuota prorrateada a hoy (100% = al día).
  avanceMesCuota?: number | null;
  diasUtilesTranscurridos?: number;
  totalDiasUtilesMes?: number;
  numSemanas: number;
  weekHeaders: string[];
  sellers: SellerData[];
  semanaGlobal: string[];
  metas: Record<string, number>;
  pesos: Record<string, number>;
  semanaVarCosto: (string | null)[];
  semanaRotacion: (string | null)[];
  semanaQuiebre: (string | null)[];
  semanaInv90: (string | null)[];
  semanaForecast: (string | null)[];
  semanaPropuestas: (string | null)[];
  avgVarCosto: number;
  avgRotacion: number;
  avgQuiebre: number;
  avgInv90: number;
  avgForecast: number;
  avgPropuestas: number;
  // Promedios y series de la sección Ventas (los trae /api/vendedores/stoplight
  // y /api/superadmin/stoplight, siempre; el default es 0 / []). Estaban en uso
  // sin declarar.
  avgCumplimiento: number;
  avgMargen: number;
  avgVisitas: number;
  avgEfectividad: number;
  avgActivacion: number;
  avgClientes: number;
  avgCobertura: number;
  semanaMargen: (string | null)[];
  semanaVisitas: (string | null)[];
  semanaEfectividad: (string | null)[];
  semanaActivacion: (string | null)[];
  semanaClientes: (string | null)[];
  semanaCobertura: (string | null)[];
}

export interface SellerDetail {
  sellerId: number;
  nombre: string;
  cuotaMensual: number;
  cuotaDiaria: number;
  totalFacturado: number;
  porcentajeMensual: number;
  cumple: boolean;
  dias: { fecha: string; diaSemana: string; esFeriado: boolean; esDiaUtil: boolean; facturado: number; cuotaDiaria: number; cumple: boolean }[];
  semanas: { numero: number; inicio: string; fin: string; facturado: number; cuotaSemanal: number; diasUtiles: number; porcentaje: number }[];
}
