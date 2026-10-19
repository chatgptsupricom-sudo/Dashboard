import type { Disposicion, TipoNodo } from "@/lib/organigrama/tipos";

// Organigrama de SUPRICOM a oct-2026, para no cargarlo a mano.

export type Semilla = {
  cargo: string;
  area?: string;
  nota?: string;
  tipo?: TipoNodo;
  staff?: boolean;
  disposicion?: Disposicion;
  personas?: string[];
  hijos?: Semilla[];
};

export const ORGANIGRAMA_INICIAL: Semilla = {
  area: "Gerencia General",
  cargo: "Gerente General",
  tipo: "direccion",
  disposicion: "fila",
  personas: ["Hercilio Camacho"],
  hijos: [
    {
      cargo: "Seguridad y Control de Acceso",
      nota: "Staff de Gerencia General",
      staff: true,
      personas: ["Luis Pacheco", "Ermes Vargas"],
    },
    {
      area: "Administración",
      cargo: "Gerente de Administración",
      tipo: "area",
      personas: ["María Eugenia Segovia"],
      hijos: [
        {
          cargo: "Gerente de Recursos Humanos",
          personas: ["Sandy Cruces"],
          hijos: [{ cargo: "Asistente de Recursos Humanos", personas: ["Mariana Pinto"] }],
        },
        { cargo: "Coordinador Contable-Administrativo", personas: ["Victor Molina"] },
        {
          cargo: "Administrador(a)",
          personas: ["Gloria Montero"],
          hijos: [{ cargo: "Asistente Administrativo", personas: ["Yusneydi Martínez"] }],
        },
        { cargo: "Asistente de Facturación", personas: ["Karent Caro"] },
        {
          cargo: "Jefe(a) de Crédito y Cobranzas",
          personas: ["Leslhy Quiñones"],
          hijos: [{ cargo: "Asistente de Crédito y Cobranzas", personas: ["Dameris Rojas"] }],
        },
      ],
    },
    { area: "Compras", cargo: "Especialista en Compras", tipo: "area", personas: ["Oscar Martínez"] },
    {
      area: "Operaciones",
      cargo: "Gerente de Operaciones",
      tipo: "area",
      personas: ["Bladimir Vásquez"],
      hijos: [
        { cargo: "Servicio Técnico", personas: ["David Rodríguez"] },
        { cargo: "Servicios Generales", personas: ["Ceciliana Colmenares"] },
      ],
    },
    {
      area: "Ventas",
      cargo: "Gerente de Ventas",
      tipo: "area",
      personas: ["Arquimides Retali"],
      hijos: [
        {
          cargo: "Representante de Ventas",
          personas: [
            "Maryori Villanueva",
            "Arturo Aray",
            "Daniela Suárez",
            "Gabriel Sánchez",
            "José López",
            "Daniel Espinoza",
          ],
        },
        { cargo: "Asistente de Ventas", personas: ["Daniela Rivas"] },
        { cargo: "Técnico en Capacitación", personas: ["Carlos Sosa"] },
      ],
    },
    {
      area: "Almacén",
      cargo: "Jefe de Almacén",
      tipo: "area",
      personas: ["Juan Villanueva", "Danyela Cárdenas"],
      hijos: [
        { cargo: "Chofer", personas: ["Cecilio Verastegui"] },
        { cargo: "Chofer-Almacenista", personas: ["Isaac Castillo", "Simón Pinto"] },
        {
          cargo: "Almacenista",
          personas: ["Marlon Quintero", "Gustavo Linares", "Luis Perales", "Leonardo León", "Ricardo Marin"],
        },
      ],
    },
    {
      area: "Marketing",
      cargo: "Gerente de Marketing",
      tipo: "area",
      disposicion: "fila",
      personas: ["Gabriel Camacho"],
      hijos: [
        {
          area: "Programación",
          cargo: "Desarrollador Full Stack",
          nota: "Coordinador",
          tipo: "area",
          personas: ["Riccardo Fusco"],
          hijos: [
            { cargo: "Analista de Automatización de Aplicaciones", personas: ["Dario Medina"] },
            { cargo: "Diseñador Web", personas: ["Lino Gouveia"] },
          ],
        },
        {
          area: "Subárea",
          cargo: "Comunicación y Diseño",
          tipo: "area",
          hijos: [
            { cargo: "Community Manager (Mercadólogo)", personas: ["José Poggioli"] },
            { cargo: "Diseñador(a) Gráfico(a)", personas: ["Marlyn Baute", "María Ruiz"] },
          ],
        },
      ],
    },
    { area: "IT", cargo: "Especialista de IT", tipo: "area", personas: ["Rangel Hernández"] },
    { area: "Auditoría", cargo: "Auditor", tipo: "area", personas: ["Carlos Urrutia"] },
  ],
};

// Organigrama propuesto (estructura hacia el futuro, oct-2026). Sin personas:
// es la estructura, no quién ocupa cada cargo. La Vicepresidencia de Finanzas
// lleva Administración y Finanzas; el resto de las áreas cuelga de la
// Dirección General.
export const ORGANIGRAMA_PROPUESTO: Semilla = {
  area: "Presidencia",
  cargo: "Presidente",
  tipo: "direccion",
  disposicion: "fila",
  hijos: [
    { area: "Staff de Presidencia", cargo: "Seguridad y Control de Acceso", staff: true },
    {
      area: "Vicepresidencia",
      cargo: "Vicepresidenta de Finanzas",
      tipo: "area",
      hijos: [
        {
          area: "Administración y Finanzas",
          cargo: "Coordinador Contable-Administrativo",
          tipo: "area",
          hijos: [
            { cargo: "Administrador(a)", hijos: [{ cargo: "Asistente Administrativo" }] },
            { cargo: "Asistente de Facturación" },
            { cargo: "Jefe(a) de Crédito y Cobranzas", hijos: [{ cargo: "Asistente de Crédito y Cobranzas" }] },
          ],
        },
      ],
    },
    {
      area: "Dirección General",
      cargo: "Director General",
      tipo: "area",
      disposicion: "fila",
      hijos: [
        { area: "Staff de Dirección General", cargo: "Auditor", staff: true },
        {
          area: "Compras",
          cargo: "Gerente de Compras",
          tipo: "area",
          hijos: [{ cargo: "Especialista en Compras", nota: "Nuevo ingreso" }],
        },
        {
          area: "Servicios Generales",
          cargo: "Gerente de Servicios Generales",
          tipo: "area",
          hijos: [{ cargo: "Servicio Técnico" }, { cargo: "Servicios Generales" }],
        },
        {
          area: "Ventas",
          cargo: "Gerente de Ventas",
          tipo: "area",
          hijos: [{ cargo: "Representante de Ventas" }, { cargo: "Asistente de Ventas" }, { cargo: "Técnico en Capacitación" }],
        },
        {
          area: "Almacén",
          cargo: "Jefe de Almacén",
          tipo: "area",
          hijos: [{ cargo: "Chofer" }, { cargo: "Chofer-Almacenista" }, { cargo: "Almacenista" }],
        },
        {
          area: "Marketing",
          cargo: "Gerente de Marketing",
          nota: "Por definir",
          tipo: "area",
          hijos: [{ cargo: "Mercadólogo" }, { cargo: "Diseñador(a) Gráfico(a)" }],
        },
        {
          area: "Programación",
          cargo: "Coordinador de Programación",
          tipo: "area",
          hijos: [{ cargo: "Analista de Automatización de Aplicaciones" }, { cargo: "Diseñador Web" }],
        },
        { area: "IT", cargo: "Especialista de IT", tipo: "area" },
        {
          area: "Recursos Humanos",
          cargo: "Gerente de Recursos Humanos",
          tipo: "area",
          hijos: [{ cargo: "Asistente de Recursos Humanos" }],
        },
      ],
    },
  ],
};
