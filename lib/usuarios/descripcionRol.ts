/**
 * Qué puede hacer cada rol, en lenguaje sencillo, para el correo de bienvenida
 * que sale al asignarle un rol a alguien (lib/usuarios/avisoRol.ts).
 *
 * Las secciones salen de `rolePermissions` (lib/types.ts), las mismas que
 * arman el menú (components/dashboard/sidebar.tsx): así una sección nueva de
 * un rol aparece sola en el correo en cuanto tenga su etiqueta aquí. Una
 * sección sin etiqueta no sale (las de RRHH que todavía no existen, o ids
 * viejos); `node scripts/check-descripcion-rol.cjs` avisa cuáles faltan.
 */
import { UserRole, rolePermissions } from "@/lib/types";

type Area =
  | "General"
  | "Ventas"
  | "Leads"
  | "Marketing"
  | "Cuentas por Cobrar"
  | "Administración"
  | "Compras"
  | "Almacén y Seguridad"
  | "Servicio Técnico (RMA)"
  | "Recursos Humanos y Procesos"
  | "Inteligencia de Negocio"
  | "Marcas";

/** Orden en que salen las áreas en el correo. */
const ORDEN_AREAS: Area[] = [
  "General",
  "Ventas",
  "Leads",
  "Marketing",
  "Marcas",
  "Cuentas por Cobrar",
  "Administración",
  "Compras",
  "Almacén y Seguridad",
  "Servicio Técnico (RMA)",
  "Recursos Humanos y Procesos",
  "Inteligencia de Negocio",
];

type Seccion = { area: Area; nombre: string; detalle: string };

/** id de sección (rolePermissions / menú) → nombre del menú y qué se hace ahí. */
export const SECCIONES: Record<string, Seccion> = {
  // General
  dashboard: { area: "General", nombre: "Dashboard", detalle: "su página de inicio con los indicadores de su área" },
  sales_dashboard: { area: "General", nombre: "Dashboard", detalle: "su página de inicio con los indicadores de su área" },
  alert: { area: "General", nombre: "Alertas", detalle: "avisos de lo que necesita atención" },
  graficas: { area: "General", nombre: "Centro de mando", detalle: "gráficas de ventas, cobranza, inventario, RMA y RRHH" },
  actividad: { area: "General", nombre: "Actividades", detalle: "sus tareas y actividades del día" },
  users: { area: "General", nombre: "Usuarios", detalle: "dar, cambiar o quitar el rol de cada persona en el panel" },
  agenteia: { area: "General", nombre: "Agente IA", detalle: "hacerle preguntas en lenguaje natural sobre los datos de Odoo y del panel" },
  politicas: { area: "General", nombre: "Políticas y Acuerdos", detalle: "leer las políticas, acuerdos y circulares de la empresa y marcarlas como leídas" },
  solicitudes_personal: { area: "General", nombre: "Solicitudes de personal", detalle: "pedir un colaborador nuevo para su área y seguir la búsqueda" },
  stoplight_reports: { area: "General", nombre: "Stoplight", detalle: "el semáforo de indicadores semanales contra sus metas" },
  inventory: { area: "General", nombre: "Inventario", detalle: "existencias de productos por sede" },
  catalogo: { area: "General", nombre: "Catálogo", detalle: "productos con su disponibilidad, precio e imágenes" },
  audit: { area: "General", nombre: "Auditoría de Odoo", detalle: "revisar movimientos y cambios hechos en Odoo" },
  auditoria_panel: { area: "General", nombre: "Auditoría del panel", detalle: "quién hizo qué dentro del panel" },
  auditoria_nc: { area: "General", nombre: "Auditoría de notas de crédito", detalle: "notas de crédito, facturas anuladas y reabiertas" },
  calidad_odoo: { area: "General", nombre: "Calidad de datos de Odoo", detalle: "errores y datos desordenados que hay que corregir en Odoo" },
  notas_credito: { area: "General", nombre: "Notas de crédito", detalle: "revisar, preaprobar o aprobar las solicitudes de nota de crédito que le correspondan" },
  reports: { area: "General", nombre: "Reportes", detalle: "reportes generales" },
  integraciondepago: { area: "Cuentas por Cobrar", nombre: "Integración de Pagos", detalle: "los pagos aplicados a cada factura, como el reporte de Odoo, de cualquier mes" },

  // Ventas
  clientes: { area: "Ventas", nombre: "Clientes", detalle: "su cartera de clientes" },
  leads: { area: "Ventas", nombre: "Leads", detalle: "los prospectos que se le asignan para contactar y cerrar" },
  cierres: { area: "Ventas", nombre: "Cierres", detalle: "registrar el resultado de sus leads" },
  top_clientes: { area: "Ventas", nombre: "Top clientes", detalle: "sus clientes que más compran" },
  metodo_retiro: { area: "Ventas", nombre: "Método de retiro", detalle: "indicar cómo se lleva el cliente cada pedido (sucursal, ruta, encomienda o transporte)" },
  rma_seller: { area: "Ventas", nombre: "RMA de mis clientes", detalle: "seguir los equipos de sus clientes en servicio técnico" },
  semaforo_clientes: { area: "Ventas", nombre: "Semáforo de clientes", detalle: "qué clientes compran menos que de costumbre (verde, amarillo o rojo)" },
  spiff: { area: "Ventas", nombre: "Spiff", detalle: "incentivos por marca" },
  planificacion_visitas: { area: "Ventas", nombre: "Planificación de visitas", detalle: "planificar y registrar las visitas a clientes" },
  banco_imagenes_seller: { area: "Ventas", nombre: "Banco de Flyers", detalle: "ver y descargar los flyers de los productos" },
  material_pop_seller: { area: "Ventas", nombre: "Material POP", detalle: "pedir material publicitario para sus clientes" },
  cuota: { area: "Ventas", nombre: "Cuota", detalle: "la cuota de venta de cada vendedor y cuánto lleva" },
  MapaClientes: { area: "Ventas", nombre: "Mapa de clientes", detalle: "dónde están los clientes en el mapa" },
  seller_map: { area: "Ventas", nombre: "Mapa de clientes", detalle: "dónde están los clientes en el mapa" },
  reporte_diario: { area: "Ventas", nombre: "Reporte diario", detalle: "las ventas del día por vendedor" },
  reporte_ventas: { area: "Ventas", nombre: "Reporte de ventas", detalle: "ventas del período y clientes inactivos" },
  reportes_comerciales: { area: "Ventas", nombre: "Reportes comerciales", detalle: "reportes por marca para los proveedores" },
  metas_marca: { area: "Ventas", nombre: "Metas por marca", detalle: "metas de venta por marca y su cumplimiento" },
  stock_marca: { area: "Ventas", nombre: "Stock por marca", detalle: "existencia contra lo vendido de cada marca" },
  sorteo_caracas: { area: "Ventas", nombre: "Sorteo de clientes", detalle: "la ruleta del sorteo de clientes" },
  opiniones: { area: "Ventas", nombre: "Opiniones", detalle: "lo que opinan los clientes en las encuestas" },
  estado_cuenta: { area: "Cuentas por Cobrar", nombre: "Estado de cuenta", detalle: "el estado de cuenta de un cliente, con descarga a Excel" },

  // Leads
  adminleads: { area: "Leads", nombre: "Dashboard de Leads", detalle: "cuántos leads entran, de dónde y cuántos se venden" },
  monitoreo_leads: { area: "Leads", nombre: "Monitoreo de Leads", detalle: "asignar y reasignar leads a los vendedores y seguir su avance" },
  cierres_adminleads: { area: "Leads", nombre: "Cierres", detalle: "los leads cerrados por los vendedores" },
  recompra_adminleads: { area: "Leads", nombre: "Recompra", detalle: "qué clientes que llegaron por un lead volvieron a comprar" },
  compras_mes_adminleads: { area: "Leads", nombre: "Clientes del mes", detalle: "los clientes que compraron en el mes" },
  configuracion_leads: { area: "Leads", nombre: "Configuración de Leads", detalle: "qué vendedores reciben leads" },

  // Marketing
  catalogo_adminleads: { area: "Marketing", nombre: "Catálogo", detalle: "productos con su disponibilidad para el contenido" },
  catalogo_disenador: { area: "Marketing", nombre: "Catálogo", detalle: "productos con su disponibilidad para el contenido" },
  llegadas_disenador: { area: "Marketing", nombre: "Llegadas", detalle: "los productos que están por llegar a su sede" },
  banco_imagenes: { area: "Marketing", nombre: "Banco de Flyers", detalle: "subir y organizar los flyers de los productos" },
  vista_custom: { area: "Marketing", nombre: "Plan de Contenido", detalle: "el plan de publicaciones por marca" },
  frecuencia_cpm: { area: "Marketing", nombre: "Frecuencia CPM", detalle: "la frecuencia de pauta por marca y mes" },
  catalogo_disenos: { area: "Marketing", nombre: "Catálogo de Diseños", detalle: "los diseños propios, con carga por carpeta" },
  editor_ia_disenador: { area: "Marketing", nombre: "Editor con IA", detalle: "editar imágenes con inteligencia artificial" },
  material_pop: { area: "Marketing", nombre: "Material POP", detalle: "el inventario de material publicitario y las solicitudes de los vendedores" },
  mapa_clientes_disenador: { area: "Marketing", nombre: "Mapa de clientes", detalle: "cuántos clientes hay por estado y ciudad" },

  // Marcas
  gerencia_marca: { area: "Marcas", nombre: "Gerencia de Marca", detalle: "asignar las marcas de cada Gerente de Marca" },
  gm_dashboard: { area: "Marcas", nombre: "Dashboard", detalle: "el resumen de sus marcas" },
  gm_inventario: { area: "Marcas", nombre: "Inventario por marca", detalle: "existencia, disponible, por llegar y valor al costo" },
  gm_antiguedad: { area: "Marcas", nombre: "Antigüedad", detalle: "cuánto tiempo lleva el inventario en el almacén y cuánto se vendió cada mes" },
  gm_ventas: { area: "Marcas", nombre: "Ventas por marca", detalle: "lo facturado y lo cobrado por número de parte" },
  gm_banco_imagenes: { area: "Marcas", nombre: "Banco de Flyers", detalle: "los flyers de los productos de sus marcas" },

  // Cuentas por Cobrar
  cuentas_por_cobrar: { area: "Cuentas por Cobrar", nombre: "Cuentas por Cobrar", detalle: "la cartera de clientes, lo vencido y la cobranza" },
  cxc_alerts: { area: "Cuentas por Cobrar", nombre: "Alertas CxC", detalle: "clientes y facturas que necesitan atención" },
  cxc_contado_credito: { area: "Cuentas por Cobrar", nombre: "Contado/Crédito", detalle: "ventas de contado contra crédito y lo cobrado" },
  cxc_pago_clientes: { area: "Cuentas por Cobrar", nombre: "Pago de Clientes", detalle: "cómo y cuándo pagan los clientes" },
  cxc_clasificacion_clientes: { area: "Cuentas por Cobrar", nombre: "Clasificación de clientes", detalle: "clientes buenos y malos pagadores" },
  cxc_tiempo_cobro: { area: "Cuentas por Cobrar", nombre: "Tiempo de cobro", detalle: "cuántos días pasan desde la factura hasta el pago" },
  cxc_incobrables: { area: "Cuentas por Cobrar", nombre: "Incobrables", detalle: "las facturas marcadas como incobrables, con su justificación" },
  cxc_sobregiro: { area: "Cuentas por Cobrar", nombre: "Sobregiro", detalle: "cuánto usa cada cliente de su límite de crédito y su historial" },
  cxc_facturado_detallado: { area: "Cuentas por Cobrar", nombre: "Facturado detallado", detalle: "el reporte de facturación de Odoo de cualquier mes" },
  cxc_binance: { area: "Cuentas por Cobrar", nombre: "Conciliación Binance", detalle: "subir los comprobantes de Binance de los clientes" },
  referencia_comercial: { area: "Cuentas por Cobrar", nombre: "Referencia comercial", detalle: "emitir la referencia comercial de un cliente" },
  cxc_search: { area: "Cuentas por Cobrar", nombre: "Buscar facturas", detalle: "buscar cualquier factura" },
  cxc_top_clients: { area: "Cuentas por Cobrar", nombre: "Top clientes / vendedor", detalle: "los clientes que más deben por vendedor" },

  // Administración
  salud_financiera: { area: "Administración", nombre: "Salud Administrativa", detalle: "el índice de salud administrativa y sus alertas" },
  gastos_presupuesto: { area: "Administración", nombre: "Gastos y Presupuesto", detalle: "los gastos contra el presupuesto" },
  admin_cxp: { area: "Administración", nombre: "Cuentas por Pagar", detalle: "lo que se le debe a los proveedores y cuándo vence" },
  admin_tesoreria: { area: "Administración", nombre: "Tesorería y Bancos", detalle: "el saldo de cada banco y caja, cobros y pagos" },
  admin_binance: { area: "Administración", nombre: "Conciliación Binance", detalle: "cruzar los comprobantes de Binance con el estado de cuenta" },
  admin_bancos: { area: "Administración", nombre: "Conciliación bancaria", detalle: "cruzar el estado de cuenta del banco con los cobros de Odoo" },
  admin_intercompania: { area: "Administración", nombre: "Pagos entre sedes", detalle: "los pagos entre las sedes y a qué facturas se aplicaron" },
  admin_fiscal: { area: "Administración", nombre: "Fiscal", detalle: "retenciones, libros fiscales e impuestos del mes" },
  admin_contabilidad: { area: "Administración", nombre: "Contabilidad y cierre", detalle: "estado de resultados, balance y la lista de cierre del mes" },

  // Compras
  compras: { area: "Compras", nombre: "Compras", detalle: "los reportes de Compras" },
  sugeridos: { area: "Compras", nombre: "Sugerencia de compras", detalle: "qué comprar según lo que se vende y lo que hay" },
  moq: { area: "Compras", nombre: "MOQ", detalle: "cantidades mínimas de compra" },
  menor_rotacion: { area: "Compras", nombre: "Menor rotación", detalle: "los productos que menos se venden" },
  mayor_rotacion: { area: "Compras", nombre: "Mayor rotación", detalle: "los productos que más se venden y su riesgo de quiebre" },
  cobertura: { area: "Compras", nombre: "Cobertura", detalle: "para cuántos días alcanza el inventario" },
  rotacion_categoria: { area: "Compras", nombre: "Rotación por categoría", detalle: "la rotación de cada categoría" },
  tendencia: { area: "Compras", nombre: "Tendencia", detalle: "cómo vienen las ventas de cada producto" },
  pareto_80_20: { area: "Compras", nombre: "Pareto 80/20", detalle: "los productos que hacen la mayor parte de la venta" },
  clasificacion_clientes_compras: { area: "Compras", nombre: "Clasificación de clientes", detalle: "la actividad comercial de cada cliente" },
  ordenes_compra: { area: "Compras", nombre: "Órdenes de compra", detalle: "crear órdenes de compra y mandarlas a aprobación" },
  recepcion_packing: { area: "Compras", nombre: "Packing list", detalle: "cargar los packing list de lo que viene en camino" },

  // Almacén y Seguridad
  seguridad: { area: "Almacén y Seguridad", nombre: "Seguridad", detalle: "recepción y despacho de equipos de RMA" },
  seguridad_ingresos: { area: "Almacén y Seguridad", nombre: "Ingresos de RMA", detalle: "registrar los equipos que llegan a servicio técnico" },
  seguridad_despachos: { area: "Almacén y Seguridad", nombre: "Despachos de RMA", detalle: "registrar los equipos que salen de servicio técnico" },
  seguridad_por_llegar: { area: "Almacén y Seguridad", nombre: "Por llegar", detalle: "los equipos que se esperan en servicio técnico" },
  seguridad_mercancia_ingreso: { area: "Almacén y Seguridad", nombre: "Ingreso de mercancía", detalle: "registrar la mercancía que entra por el portón" },
  seguridad_mercancia_egreso: { area: "Almacén y Seguridad", nombre: "Egreso de mercancía", detalle: "verificar en el portón la mercancía que sale" },
  seguridad_almacenistas: { area: "Almacén y Seguridad", nombre: "Almacenistas", detalle: "la calificación de los almacenistas" },
  almacen_egresos: { area: "Almacén y Seguridad", nombre: "Egresos", detalle: "preparar la mercancía que sale y entregarla a Seguridad" },
  almacen_ordenes: { area: "Almacén y Seguridad", nombre: "Órdenes de despacho", detalle: "las órdenes de despacho por preparar" },
  almacen_recepcion: { area: "Almacén y Seguridad", nombre: "Recepción", detalle: "contar y recibir los contenedores por packing list o factura" },
  almacen_personal: { area: "Almacén y Seguridad", nombre: "Personal", detalle: "registrar almacenistas y choferes" },
  almacen_unidades: { area: "Almacén y Seguridad", nombre: "Unidades", detalle: "los camiones de la empresa" },
  almacen_mantenimiento: { area: "Almacén y Seguridad", nombre: "Mantenimiento", detalle: "el mantenimiento de camiones y montacargas" },
  almacen_actas_rma: { area: "Almacén y Seguridad", nombre: "Actas de RMA", detalle: "las actas de entrada y salida de equipos de RMA" },

  // RMA
  rma: { area: "Servicio Técnico (RMA)", nombre: "Servicio técnico", detalle: "los casos de RMA" },
  rma_por_llegar: { area: "Servicio Técnico (RMA)", nombre: "Por llegar", detalle: "los tickets cuyo equipo todavía no llegó" },
  rma_buscar_factura: { area: "Servicio Técnico (RMA)", nombre: "Buscar factura", detalle: "saber si un equipo se compró en la empresa, por factura o serial" },
  rma_inventario_supricom: { area: "Servicio Técnico (RMA)", nombre: "Inventario Supricom", detalle: "los equipos en servicio técnico vendidos por la empresa" },
  rma_inventario_externo: { area: "Servicio Técnico (RMA)", nombre: "Inventario externo", detalle: "los equipos en servicio técnico no vendidos por la empresa" },
  rma_nota_credito: { area: "Servicio Técnico (RMA)", nombre: "Nota de crédito", detalle: "pedir una nota de crédito para un equipo que no se puede reparar" },
  rma_personal: { area: "Servicio Técnico (RMA)", nombre: "Personal", detalle: "registrar a los técnicos de RMA" },

  // RRHH y Procesos
  asistencia: { area: "Recursos Humanos y Procesos", nombre: "Asistencia", detalle: "cargar el reporte del biométrico y ver retardos y ausencias" },
  seleccion_personal: { area: "Recursos Humanos y Procesos", nombre: "Selección de personal", detalle: "seguir cada búsqueda y sus candidatos fase por fase" },
  rutagrama: { area: "Recursos Humanos y Procesos", nombre: "Rutagrama", detalle: "mandar a los nuevos ingresos el enlace para su ruta casa-trabajo e imprimir la planilla" },
  organigrama: { area: "Recursos Humanos y Procesos", nombre: "Organigrama", detalle: "el organigrama y las actividades de cada cargo" },
  flujogramas: { area: "Recursos Humanos y Procesos", nombre: "Flujogramas", detalle: "dibujar los diagramas de procesos" },
  manuales: { area: "Recursos Humanos y Procesos", nombre: "Manuales", detalle: "crear y editar los manuales de procesos" },

  // Inteligencia de Negocio
  bi_dias_promedio: { area: "Inteligencia de Negocio", nombre: "Días promedio", detalle: "días de cobro, de inventario y de pago" },
  bi_por_llegar: { area: "Inteligencia de Negocio", nombre: "Por llegar", detalle: "los productos en camino y si ya se vendieron antes" },
  bi_rotacion_productos: { area: "Inteligencia de Negocio", nombre: "Rotación productos", detalle: "la rotación de cada producto, con su costo" },
  bi_reportes: { area: "Inteligencia de Negocio", nombre: "Reportes", detalle: "facturación, productos y clientes de cada mes" },
  bi_clasificacion: { area: "Inteligencia de Negocio", nombre: "Clasificación", detalle: "clasificar productos y clientes" },
};

/** Una frase por rol, lo primero que lee en el correo. */
const RESUMEN: Partial<Record<UserRole, string>> = {
  [UserRole.SUPER_ADMIN]: "Tiene acceso a todo el panel: todas las áreas y sedes, la configuración y los usuarios.",
  [UserRole.SELLER]: "Gestiona su cartera de clientes y sus leads, y consulta sus propias ventas, cuota y cobranza.",
  [UserRole.ADMIN_LEADS]: "Administra los leads que llegan por las redes sociales, los asigna a los vendedores y gestiona el contenido de marketing.",
  [UserRole.GERENTE_VENTA]: "Supervisa las ventas, cuotas, cobranza y clientes de su sede y de sus vendedores.",
  [UserRole.GERENTE_OPERACIONES]: "Supervisa las ventas, leads, cobranza y operación de su sede, y administra los usuarios del panel.",
  [UserRole.ASISTENTE_VENTAS]: "Apoya al equipo de ventas con reportes, cuotas, estados de cuenta y el método de retiro de los pedidos.",
  [UserRole.ADMINISTRACION]: "Gestiona la administración de su sede: salud administrativa, bancos, pagos, fiscal, contabilidad y cuentas por cobrar.",
  [UserRole.CUENTAS_POR_COBRAR]: "Gestiona la cobranza de su sede: cartera, pagos de clientes, estados de cuenta y alertas.",
  [UserRole.RECURSOS_HUMANOS]: "Gestiona la selección de personal, la asistencia y la documentación del personal.",
  [UserRole.COMPRAS]: "Define las compras con los reportes de rotación e inventario y gestiona las órdenes de compra y los packing list.",
  [UserRole.RMA]: "Gestiona los casos de servicio técnico, desde la llegada del equipo hasta su entrega.",
  [UserRole.DISENADOR]: "Elabora el contenido y los diseños de los productos y gestiona el banco de flyers.",
  [UserRole.SEGURIDAD]: "Registra en el portón la mercancía y los equipos de servicio técnico que entran y salen.",
  [UserRole.ALMACEN]: "Prepara los despachos, recibe los contenedores y gestiona el personal y las unidades del almacén.",
  [UserRole.PROCESOS]: "Documenta los procesos de la empresa: manuales, organigrama, flujogramas y políticas.",
  [UserRole.IT]: "Revisa las solicitudes de nota de crédito en el paso que le corresponde.",
  [UserRole.INTELIGENCIA_NEGOCIO]: "Consulta los tableros y reportes de las tres sedes para análisis. Su acceso es de solo lectura: no modifica datos.",
  [UserRole.GERENTE_MARCA]: "Da seguimiento al inventario, la antigüedad y las ventas de las marcas que se le asignen, en Valencia y Caracas. Su acceso es de solo lectura.",
  [UserRole.MARKETING_ELECTRO]: "Consulta los tableros de ventas, marcas, inventario y marketing de las tres sedes para análisis. Su acceso es de solo lectura.",
};

const RESUMEN_GENERICO = "Ingresa al panel con las secciones de su rol.";

/** El rol de la tabla `roles` (`name`) como UserRole; "vendedor" es el viejo de seller. */
export function rolDelPanel(nombre: string | null | undefined): UserRole | null {
  const n = String(nombre ?? "").toLowerCase().trim();
  if (n === "vendedor") return UserRole.SELLER;
  return (Object.values(UserRole) as string[]).find((r) => r.toLowerCase() === n) as UserRole | undefined ?? null;
}

export type GrupoSecciones = { area: string; secciones: { nombre: string; detalle: string }[] };

export type DescripcionRol = { resumen: string; grupos: GrupoSecciones[] };

/** Resumen + secciones del rol agrupadas por área, sin repetir nombres. */
export function describirRol(nombreRol: string | null | undefined): DescripcionRol {
  const rol = rolDelPanel(nombreRol);
  if (!rol) return { resumen: RESUMEN_GENERICO, grupos: [] };

  const porArea = new Map<Area, { nombre: string; detalle: string }[]>();
  const vistos = new Set<string>();
  for (const id of rolePermissions[rol].sections) {
    const s = SECCIONES[id];
    if (!s) continue;
    const clave = `${s.area}|${s.nombre}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    if (!porArea.has(s.area)) porArea.set(s.area, []);
    porArea.get(s.area)!.push({ nombre: s.nombre, detalle: s.detalle });
  }

  const grupos = ORDEN_AREAS.filter((a) => porArea.has(a)).map((area) => ({
    area,
    secciones: porArea.get(area)!,
  }));
  return { resumen: RESUMEN[rol] ?? RESUMEN_GENERICO, grupos };
}
