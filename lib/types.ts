// Tipos de roles - Actualizados para coincidir con SQL
export enum UserRole {
  SUPER_ADMIN = "superAdmin", // Cambiado de 'presidency' para coincidir con SQL
  MARKETING_MANAGEMENT = "marketingManagement", // Sincronizado con cammelCase de SQL
  BRAND_MANAGEMENT = "brandManagement", // Sincronizado con cammelCase de SQL
  MARKETING = "marketing", // Rol Marketing
  PROGRAMMERS = "programmers", // Rol Programador
  AUDIT = "audit", // Rol Auditor
  SELLER = "seller", // Rol Vendedores
  ADMIN_LEADS = "adminLeads", // Rol Administrador de Leads
  GERENTE_VENTA = "Gerencia De Ventas", // Rol Gerente de Venta
  GERENTE_OPERACIONES = "Gerente de Operations", // Rol Gerente de Operaciones
  RECURSOS_HUMANOS = "recursos humanos", // Sincronizado con minúsculas y middleware de SQL
  COMPRAS = "compras", // NUEVO: Rol Compras (ID 11 en tu base de datos)
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
    ], // IDs que deben coincidir con menuItems
  },
  [UserRole.ADMIN_LEADS]: {
    canViewAllSections: false,
    canManageUsers: false,
    canEditUsers: false,
    canDisableUsers: false,
    canViewAudit: false,
    sections: [
      "adminleads",
      "monitoreo_leads",
      "cierres_adminleads",
      "configuracion_leads",
      "catalogo_adminleads",
      "actividad",
    ],
  },
  [UserRole.GERENTE_VENTA]: {
    canViewAllSections: false,
    canManageUsers: false,
    canEditUsers: false,
    canDisableUsers: false,
    canViewAudit: false,
    sections: ["dashboard", "cuota", "MapaClientes", "inventory", "actividad", "spiff", "reporte_diario"],
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
      "dashboard", // KPIs de compras, alertas de quiebre de stock
      "sugeridos", // Productos con baja rotación o bajo stock
      "moq",
      "menor_rotacion",
      "mayor_rotacion",
      "cobertura", // Cobertura de stock (días de inventario)
      "rotacion_categoria", // Clasificación ABC por categoría
      "tendencia", // Tendencia de ventas histórica
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
