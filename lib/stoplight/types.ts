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
  /** Resumen de metas de venta por marca del mes (null si no hay). */
  metasPorMarca?: { marcas: number } | null;
  /** Planes de visita del mes (Cobertura territorial); null si no hay. */
  coberturaTerritorial?: { planificadas: number; realizadas: number } | null;
  avgCicloReposicion: number | null;
  semanaMargen: (string | null)[];
  semanaVisitas: (string | null)[];
  semanaEfectividad: (string | null)[];
  semanaActivacion: (string | null)[];
  semanaClientes: (string | null)[];
  semanaCobertura: (string | null)[];
  /**
   * Valor real del mes por KPI (margen %, $ facturado, clientes…), para que
   * la vista Resumen muestre "hoy vs meta" en las unidades del KPI y no solo
   * el % de la meta cumplida. Un KPI sin entrada (o con semanas cargadas a
   * mano) se muestra solo con su % de meta.
   */
  reales?: Record<string, ValorReal>;
}

export interface ValorReal {
  valor: number;
  /** Meta en las mismas unidades (la del mes si `acumulado`). null = sin meta. */
  meta: number | null;
  unidad: "%" | "$" | "" | "dias";
  /** Se va sumando en el mes (facturado, clientes, visitas): a hoy se espera la parte prorrateada. */
  acumulado?: boolean;
  /** Mejor cuanto más bajo (la meta es un tope). */
  menosEsMejor?: boolean;
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
