// Preguntas de la encuesta pública "Queremos conocer su opinión" (repo
// LandignPage-Calificaciones, lib/auditoria.ts). La landing guarda la CLAVE de
// cada opción; aquí está el texto para mostrarla. Si allá cambia una opción,
// hay que reflejarlo aquí.
//
// Sin imports de servidor: lo usan tanto el API como el componente cliente.

export type Tono = "positivo" | "neutral" | "negativo";

export interface OpcionPregunta {
  value: string;
  label: string;
  tono: Tono;
}

export interface Pregunta {
  campo: "p4" | "p5" | "p6" | "p9" | "p10" | "p11";
  titulo: string;
  bloque: "ventas" | "rma";
  opciones: OpcionPregunta[];
}

export const PREGUNTAS: Pregunta[] = [
  {
    campo: "p4",
    bloque: "ventas",
    titulo: "Tiempo de respuesta en cotizaciones y consultas de inventario",
    opciones: [
      { value: "inmediato", label: "Inmediato / Menos de 30 min", tono: "positivo" },
      { value: "1_2_horas", label: "Entre 1 y 2 horas", tono: "neutral" },
      { value: "medio_dia", label: "Más de medio día", tono: "negativo" },
      { value: "irregular", label: "Irregular / Debo insistir", tono: "negativo" },
    ],
  },
  {
    campo: "p5",
    bloque: "ventas",
    titulo: "Precisión técnica y asesoría sobre catálogo",
    opciones: [
      { value: "conoce_especificaciones", label: "Conoce especificaciones y ofrece alternativas", tono: "positivo" },
      { value: "solo_precios", label: "Solo confirma precios básicos", tono: "neutral" },
      { value: "fallas_especificaciones", label: "Ha presentado fallas en especificaciones", tono: "negativo" },
    ],
  },
  {
    campo: "p6",
    bloque: "ventas",
    titulo: "Seguimiento post-facturación y confirmación de despacho",
    opciones: [
      { value: "excelente", label: "Excelente estatus de entrega", tono: "positivo" },
      { value: "basico", label: "Básico (solo factura)", tono: "neutral" },
      { value: "deficiente", label: "Deficiente (no confirma salida)", tono: "negativo" },
    ],
  },
  {
    campo: "p9",
    bloque: "rma",
    titulo: "Tiempo total de diagnóstico y resolución de la garantía",
    opciones: [
      { value: "rapido", label: "Rápido y en plazos", tono: "positivo" },
      { value: "aceptable", label: "Aceptable (inmovilizó inventario)", tono: "neutral" },
      { value: "lento", label: "Excesivamente lento", tono: "negativo" },
    ],
  },
  {
    campo: "p10",
    bloque: "rma",
    titulo: "Claridad en la comunicación y justificación técnica del caso",
    opciones: [
      { value: "clara", label: "Clara y formal", tono: "positivo" },
      { value: "confusa", label: "Confusa / Poca claridad", tono: "neutral" },
      { value: "nula", label: "Nula (presión constante)", tono: "negativo" },
    ],
  },
  {
    campo: "p11",
    bloque: "rma",
    titulo: "Resolución final de los casos tramitados",
    opciones: [
      { value: "sin_trabas", label: "Reemplazo/NC sin trabas", tono: "positivo" },
      { value: "con_demoras", label: "Solución aceptable con demoras", tono: "neutral" },
      { value: "no_satisfactorio", label: "Dictamen no satisfactorio", tono: "negativo" },
    ],
  },
];

export function opcionDe(pregunta: Pregunta, value: string | null): OpcionPregunta | null {
  return pregunta.opciones.find((o) => o.value === value) ?? null;
}

export interface RespuestaOpinion {
  id: number;
  fecha: string;
  razonSocial: string;
  email: string | null;
  ejecutivo: string;
  sede: string | null;
  p4: string | null;
  p5: string | null;
  p6: string | null;
  observacionVentas: string | null;
  tramitoRma: boolean;
  p9: string | null;
  p10: string | null;
  p11: string | null;
  comentarioRma: string | null;
  mejora: string | null;
}

export const NO_ESTOY_SEGURO = "No estoy seguro";
