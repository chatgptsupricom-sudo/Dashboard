// Tipos de roles - Actualizados para coincidir con SQL
export enum UserRole {
  SUPER_ADMIN = "superAdmin",
  MARKETING_MANAGEMENT = "marketingManagement",
  BRAND_MANAGEMENT = "brandManagement",
  MARKETING = "marketing",
  PROGRAMMERS = "programmers",
  AUDIT = "audit",
  SELLER = "seller",
  ADMIN_LEADS = "adminLeads",
  GERENTE_VENTA = "Gerencia De Ventas",
  GERENTE_OPERACIONES = "Gerente de Operaciones",
  RECURSOS_HUMANOS = "recursos humanos",
  COMPRAS = "compras",
  RMA = "rma",
  CUENTAS_POR_COBRAR = "cuentas por cobrar",
  DISENADOR = "diseñador",
  ASISTENTE_VENTAS = "asistente de ventas",
  ADMINISTRACION = "administración",
  SEGURIDAD = "seguridad",
  ALMACEN = "almacen",
}

// Permisos por rol
export type RolePermissions = {
  [K in UserRole]: {
    canViewAllSections: boolean;
    canManageUsers: boolean;
    canEditUsers: boolean;
    canDisableUsers: boolean;
    canViewAudit: boolean;
    sections: string[];
  };
};

export const rolePermissions: RolePermissions = {
  [UserRole.SUPER_ADMIN]: {
    canViewAllSections: true,
    canManageUsers: true,
    canEditUsers: true,
    canDisableUsers: true,
    canViewAudit: true,
    sections: [
      "alert", // Sistema de alertas para el SuperAdmin
      "dashboard", // Stats y KPIs generales
      "adminleads", // Clave para el menú principal (Dashboard Leads)
      "monitoreo_leads", // Clave para el submenú Monitoreo
      "cierres_adminleads", // Clave para el submenú Cierres
      "stoplight_reports", // Reportes de Stoplight
      "seguridad", // Recepción y despacho de RMA (el módulo vive en /seguridad)
      "salud_financiera", // Administración: índice de salud financiera
      "gastos_presupuesto", // Administración: gastos vs presupuesto
      "users", // Gestión de usuarios
      "reports", // Reportes
      "seller_map", // Para Christian Rodriguez
      "actividad", // Activaciones
      "inventory", // Stock publicitario
      "audit",
      "auditoria_panel", // Auditoría de acciones
      "brand_management", // Gestión de marcas
      "marketing_management", // Gestión de marketing
      "marketing", // Marketing operativo
      "agenteia", // Agente IA para pruebas internas
      "integraciondepago", // Integración De Pago
      "compras", // Agregado para que el SuperAdmin también vea compras
      "cuota", // Gestión de cuotas de vendedores
      "MapaClientes", // Mapa de Clientes
      "spiff", // Gestión de spiffs por marca
      "reporte_diario", // Reporte Diario de Ventas
      "cuentas_por_cobrar", // Cuentas por Cobrar
      "rma", // Servicio Técnico / RMA
      "banco_imagenes", // Banco de Imágenes (AdminLeads)
      "vista_custom", // Vista HTML personalizada de AdminLeads
      "catalogo_disenos", // Catálogo de Diseños del Diseñador
    ],
  },
  [UserRole.MARKETING_MANAGEMENT]: {
    canViewAllSections: false,
    canManageUsers: true,
    canEditUsers: true,
    canDisableUsers: true,
    canViewAudit: true,
    sections: ["dashboard", "users", "audit"],
  },
  [UserRole.BRAND_MANAGEMENT]: {
    canViewAllSections: false,
    canManageUsers: false,
    canEditUsers: false,
    canDisableUsers: false,
    canViewAudit: false,
    sections: [
      "dashboard",
      "seller_map",
      "activities",
      "activation_requests",
      "advertising",
      "inventory",
    ],
  },
  [UserRole.MARKETING]: {
    canViewAllSections: false,
    canManageUsers: false,
    canEditUsers: false,
    canDisableUsers: false,
    canViewAudit: false,
    sections: ["dashboard", "reports"], // Vista para Jose & Marlyn
  },
  [UserRole.PROGRAMMERS]: {
    canViewAllSections: true,
    canManageUsers: true,
    canEditUsers: true,
    canDisableUsers: true,
    canViewAudit: true,
    sections: ["dashboard", "users", "audit"],
  },
  [UserRole.AUDIT]: {
    canViewAllSections: false,
    canManageUsers: false,
    canEditUsers: false,
    canDisableUsers: false,
    canViewAudit: true,
    sections: ["audit"], // Vista para Juan & Ramon
  },
  [UserRole.SELLER]: {
    canViewAllSections: false,
    canManageUsers: false,
    canEditUsers: false,
    canDisableUsers: false,
    canViewAudit: false,
    sections: [
      "dashboard",
      "clientes",
      "leads",
      "cierres",
      "catalogo",
      "actividad",
      "top_clientes",
      "spiff",
      "banco_imagenes_seller",
    ], // IDs que deben coincidir con menuItems
  },
  [UserRole.ADMIN_LEADS]: {
    canViewAllSections: false,
    canManageUsers: false,
    canEditUsers: false,
    canDisableUsers: false,
    canViewAudit: false,
    sections: [
      "sales_dashboard",
      "adminleads",
      "monitoreo_leads",
      "cierres_adminleads",
      "configuracion_leads",
      "catalogo_adminleads",
      "catalogo_disenador",
      "banco_imagenes",
      "actividad",
      "vista_custom",
    ],
  },
  [UserRole.GERENTE_VENTA]: {
    canViewAllSections: false,
    canManageUsers: false,
    canEditUsers: false,
    canDisableUsers: false,
    canViewAudit: false,
    sections: ["dashboard", "cuota", "MapaClientes", "inventory", "actividad", "spiff", "reporte_diario", "cuentas_por_cobrar", "stoplight_reports", "estado_cuenta"],
  },
  [UserRole.ASISTENTE_VENTAS]: {
    canViewAllSections: false,
    canManageUsers: false,
    canEditUsers: false,
    canDisableUsers: false,
    canViewAudit: false,
    sections: ["dashboard", "cuota", "spiff", "reporte_diario", "catalogo", "estado_cuenta"],
  },
  [UserRole.ADMINISTRACION]: {
    canViewAllSections: false,
    canManageUsers: false,
    canEditUsers: false,
    canDisableUsers: false,
    canViewAudit: false,
    sections: [
      "dashboard",
      "salud_financiera",
      "gastos_presupuesto",
      "catalogo_disenos", // Mis Diseños, dentro del desplegable Marketing
    ],
  },
  [UserRole.GERENTE_OPERACIONES]: {
    canViewAllSections: false,
    canManageUsers: false,
    canEditUsers: false,
    canDisableUsers: false,
    canViewAudit: true,
    sections: [
      "dashboard", // Stats y KPIs generales
      "actividad", // Activaciones
      "users", // Gestión de usuarios
      "cuota", // Gestion de Cuota
      "reports", // Reportes
      "MapaClientes", // Para Christian Rodriguez
      "inventory", // Stock publicitario
      "agenteia", // Agente IA para pruebas internas
      "integraciondepago", // Integración De Pago,
      "audit", // Auditoria de Odoo
      "auditoria_panel", // Auditoría de acciones
      "spiff", // Gestión de spiffs por marca
      "cuentas_por_cobrar", // Cuentas por Cobrar
      // Alertas
      "alert", // Sistema de alertas
      // Ventas dropdown
      "reporte_diario", // Reporte Diario
      "seller_map", // Mapa de Clientes (sub-item de Ventas)
      // Leads dropdown
      "adminleads", // Leads (permiso principal del dropdown)
      "monitoreo_leads", // Monitoreo de Leads
      "cierres_adminleads", // Cierres
      "configuracion_leads", // Configuración de Leads
      // CxC dropdown sub-items
      "cxc_alerts", // Alertas CxC
      "stoplight_reports", // Stoplight Report
      "referencia_comercial", // Referencia Comercial
      "cxc_search", // Buscar Facturas
      "cxc_top_clients", // Top Clientes / Vendedor
    ],
  },
  [UserRole.RECURSOS_HUMANOS]: {
    canViewAllSections: false,
    canManageUsers: false,
    canEditUsers: false,
    canDisableUsers: false,
    canViewAudit: false,
    sections: [
      "dashboard", // KPIs globales de personal
      "asistencia", // Control de biométricos (Valencia/Caracas)
      "recibos_pago", // Emisión automatizada con firma digital
      "reclutamiento", // Banco de empleo y CVs
      "solicitudes_permiso", // Gestión de ausencias y vacaciones
      "onboarding", // Digitalización de inducciones y rutograma
      "documentacion_institucional", // Manuales, cargo y código de vestimenta
      "clima_organizacional", // Buzón de sugerencias y encuestas
    ],
  },
  // NUEVA DEFINICIÓN: Rol Compras
  [UserRole.COMPRAS]: {
    canViewAllSections: false,
    canManageUsers: false,
    canEditUsers: false,
    canDisableUsers: false,
    canViewAudit: false,
    sections: [
      "dashboard",
      "sugeridos",
      "moq",
      "menor_rotacion",
      "mayor_rotacion",
      "cobertura",
      "rotacion_categoria",
      "tendencia",
      "stoplight_reports",
    ],
  },
  [UserRole.RMA]: {
    canViewAllSections: false,
    canManageUsers: false,
    canEditUsers: false,
    canDisableUsers: false,
    canViewAudit: false,
    sections: [
      "dashboard",
      "rma",
    ],
  },
  [UserRole.CUENTAS_POR_COBRAR]: {
    canViewAllSections: false,
    canManageUsers: false,
    canEditUsers: false,
    canDisableUsers: false,
    canViewAudit: false,
    sections: [
      "dashboard",
      "cuentas_por_cobrar",
      "stoplight_reports",
      "referencia_comercial",
      "integraciondepago",
      "cxc_alerts",
      "cxc_search",
      "cxc_top_clients",
    ],
  },
  [UserRole.DISENADOR]: {
    canViewAllSections: false,
    canManageUsers: false,
    canEditUsers: false,
    canDisableUsers: false,
    canViewAudit: false,
    sections: [
      "sales_dashboard",
      "actividad",
      "catalogo_disenador",
      "catalogo_disenos", // Catálogo de Diseños propios (carga masiva por carpeta)
      "editor_ia_disenador", // Editor con IA (Seedream vía KIE)
      "vista_custom",
      "banco_imagenes_seller", // Banco de Flyers (vista/descarga)
    ],
  },
    // Rol Seguridad: el equipo de almacen/control de acceso de OSC.
    //
    // El modulo vive en /seguridad, fuera del dashboard, pero SI se llega
    // desde el sidebar del panel: se decidio integrarlo en vez de publicarlo
    // en un subdominio propio. Tres dominios sirviendo la misma aplicacion
    // eran tres despliegues que mantener sincronizados y tres logins
    // expuestos — y uno se quedo atras, sin limite de intentos en el login.
    //
    // `sections` sigue vacio porque este rol usa el layout de /seguridad, no
    // el sidebar del panel.
  [UserRole.SEGURIDAD]: {
    canViewAllSections: false,
    canManageUsers: false,
    canEditUsers: false,
    canDisableUsers: false,
    canViewAudit: false,
    // El modulo se unifico con el panel: usa el mismo layout oscuro y el mismo
    // sidebar que los demas roles. Antes tenia `sections: []` y una estetica
    // propia, heredada de cuando iba a vivir en su propio subdominio — esa
    // decision se revirtio y la apariencia se habia quedado atras.
    sections: [
      "dashboard",
      "seguridad",
      "seguridad_ingresos",
      "seguridad_despachos",
      "seguridad_por_llegar",
      "seguridad_mercancia_ingreso",
      "seguridad_mercancia_egreso",
      "seguridad_almacenistas",
    ],
  },
  // Prepara el egreso de mercancia — busca la orden de despacho, junta las
  // facturas del camion, asigna almacenista(s) — y se lo entrega a Seguridad,
  // que lo verifica en el porton (issue #44). Es DELIBERADAMENTE angosto: no
  // ve RMA (equipos de un cliente en reparacion) ni el resto de Mercancia
  // (ingresos, calificacion de almacenistas), que siguen siendo de Seguridad.
  // Separar quien carga el camion de quien lo verifica es el punto de esto.
  [UserRole.ALMACEN]: {
    canViewAllSections: false,
    canManageUsers: false,
    canEditUsers: false,
    canDisableUsers: false,
    canViewAudit: false,
    sections: [
      "dashboard",
      "almacen_egresos",
      "almacen_ordenes",
      "almacen_almacenistas",
      "almacen_choferes",
      "almacen_unidades",
    ],
  },
};

// Usuario autenticado
export interface AuthUser {
  uid: number; // ID que viene de Odoo
  id: number; // Si prefieres usar id, agrégalo aquí
  email: string;
  role: UserRole;
  odooId: number;
  avatar?: string;
  active: boolean;
  lastLogin?: string;
  name: string;
  cids?: number;
  activo?: number; // 1 = recibe leads, 0 = pausado
}

// Token JWT
export interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
  name: string;
  odooId: number;
  cids: number;
  iat?: number;
  exp?: number;
}

// Respuesta de login
export interface LoginResponse {
  token: string;
  user: AuthUser;
  expiresIn: number;
}

// Solicitud de login
export interface LoginRequest {
  email: string;
  password: string;
  rememberMe: boolean;
}

// Entrada de auditoría
export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  resource: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  timestamp: string;
  ipAddress?: string;
  userAgent?: string;
  status: "success" | "failed";
}
