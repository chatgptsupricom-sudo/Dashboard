"use client";

import { useAuthStore } from "@/lib/stores/auth.store";
import { rolePermissions, UserRole } from "@/lib/types";
import { AnimatePresence, motion } from "framer-motion";
import {
  Award,
  BarChart3,
  Bell,
  Boxes,
  BrainCircuit,
  Calendar,
  ChevronDown,
  ClipboardList,
  CreditCard,
  FileText,
  LayoutDashboard,
  LogOut,
  Map,
  Package,
  Settings2,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function Sidebar({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  const { user, logout } = useAuthStore();
  const pathname = usePathname();

  // Estados para los menús desplegables
  const [isReportsOpen, setIsReportsOpen] = useState(false);
  const [isLeadsOpen, setIsLeadsOpen] = useState(false);
  const [isAuditOpen, setIsAuditOpen] = useState(false);
  const [isComprasOpen, setIsComprasOpen] = useState(false);
  const [isVentasOpen, setIsVentasOpen] = useState(false);

  useEffect(() => {
    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    if (open && isMobile) {
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  const params = useParams();
  const locale = params?.locale || "es";
  const userName = user?.name || "Usuario";
  const router = useRouter();

  // Prevención de renderizado si no hay usuario
  if (!user) return null;

  const userRole = user.role;
  const userCids = (user as any).cids;
  const permissions = rolePermissions[userRole as UserRole];
  if (!permissions) return null;

  // Extraemos las secciones permitidas de forma segura
  const allowedSections = permissions.sections || [];

  // Definición del menú base
  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, slug: "" },
    {
      id: "actividad",
      label: "Actividades",
      icon: Calendar,
      slug: "/actividad",
    },
    { id: "alert", label: "Alertas", icon: Bell, slug: "/alert" },
    {
      id: "stoplight_reports",
      label: "Stoplight Report",
      icon: BarChart3,
      slug: "/StoplightReport",
    },
    { id: "users", label: "Usuarios", icon: Users, slug: "/usuarios" },
    {
      id: "seller_map",
      label: "Mapa Clientes",
      icon: Map,
      slug: "/vendedores",
    },
    { id: "cuota", label: "Cuota", icon: FileText, slug: "/cuota" },
    { id: "inventory", label: "Inventario", icon: Package, slug: "/inventory" },
    {
      id: "agenteia",
      label: "Agente IA",
      icon: BrainCircuit,
      slug: "/agenteia",
    },
    {
      id: "integraciondepago",
      label: "Integración De Pago",
      icon: CreditCard,
      slug: "/integraciondepago",
    },
    { id: "clientes", label: "Clientes", icon: UserCheck, slug: "/clientes" },
    { id: "catalogo", label: "Catálogo", icon: Boxes, slug: "/catalogo" },
    { id: "leads", label: "Leads", icon: UserCheck, slug: "/leads" },
    {
      id: "MapaClientes",
      label: "Mapa de Clientes",
      icon: Map,
      slug: "/mapa_clientes",
    },
    { id: "cierres", label: "Cierres", icon: FileText, slug: "/Cierres" },
    {
      id: "top_clientes",
      label: "Top Clientes",
      icon: Trophy,
      slug: "/top-clientes",
    },
    { id: "spiff", label: "Spiff", icon: Award, slug: "/spiff" },
    {
      id: "reporte_diario",
      label: "Reporte Diario",
      icon: ClipboardList,
      slug: "/reporte-diario",
    },
    {
      id: "sugeridos",
      label: "Sugerencia de compras",
      icon: Package,
      slug: "/sugeridos",
    },
    {
      id: "menor_rotacion",
      label: "Menor Rotación",
      icon: TrendingDown,
      slug: "/menor_rotacion",
    },
    {
      id: "mayor_rotacion",
      label: "Mayor Rotación",
      icon: TrendingUp,
      slug: "/mayor_rotacion",
    },
    { id: "moq", label: "MOQ", icon: Settings2, slug: "/moq" },
    {
      id: "adminleads",
      label: "Dashboard Leads",
      icon: Target,
      slug: "",
      adminLeadsOnly: true,
    },
    {
      id: "catalogo_adminleads",
      label: "Catálogo",
      icon: Boxes,
      slug: "/catalogo",
      adminLeadsOnly: true,
    },
    {
      id: "monitoreo_leads",
      label: "Monitoreo de leads",
      icon: Target,
      slug: "/monitoreo_leads",
      adminLeadsOnly: true,
    },
    {
      id: "cierres_adminleads",
      label: "Cierres",
      icon: FileText,
      slug: "/cierres",
      adminLeadsOnly: true,
    },
    {
      id: "configuracion_leads",
      label: "Configuración",
      icon: Settings2,
      slug: "/configuracion",
      adminLeadsOnly: true,
    },
  ];

  const getBasePath = () => {
    const normalizedRole = userRole?.toLowerCase().trim();
    switch (normalizedRole) {
      case "superadmin":
        return `/${locale}/superadmin`;
      case "seller":
      case "vendedor":
        return `/${locale}/vendedores`;
      case "adminleads":
        return `/${locale}/adminleads`;
      case "gerente_venta":
      case "gerenciaventas":
      case "gerencia de ventas":
        return `/${locale}/gerente_venta`;
      case "gerente_operaciones":
      case "gerencia de operaciones":
        return `/${locale}/gerente_operaciones`;
      case "compras":
        return `/${locale}/compras`;
      default:
        return `/${locale}/dashboard`;
    }
  };

  const basePath = getBasePath();

  // Verificamos permisos para desplegables específicos
  const hasReportsPermission = allowedSections.includes("reports");
  const hasAdminLeadsPermission = allowedSections.includes("adminleads"); // Controla si se ve el menú "Leads"
  const hasAuditPermission =
    allowedSections.includes("audit") ||
    allowedSections.includes("auditoria_panel");
  const hasComprasPermission =
    allowedSections.includes("compras") ||
    allowedSections.includes("sugeridos") ||
    allowedSections.includes("menor_rotacion") ||
    allowedSections.includes("mayor_rotacion");
  const isComprasRole = userRole === "compras";
  const comprasDropdownIds = ["sugeridos", "menor_rotacion", "mayor_rotacion"];
  const isSuperAdminRole = userRole === "superAdmin";
  const ventasDropdownIds = ["cuota", "MapaClientes", "seller_map", "spiff", "reporte_diario"];

  const isSellerPausado =
    (userRole === "seller" || userRole === "vendedor") &&
    (user as any).activo === 0;

  // Filtramos los items base
  const availableItems = menuItems
    .filter(
      (item) =>
        allowedSections.includes(item.id) &&
        ((item as any).adminLeadsOnly ? userRole === "adminLeads" : true) &&
        (isComprasRole ||
          !hasComprasPermission ||
          !comprasDropdownIds.includes(item.id)) &&
        (!isSuperAdminRole || !ventasDropdownIds.includes(item.id)) &&
        (item.id !== "catalogo_adminleads" || userCids === 9) &&
        !(isSellerPausado && (item.id === "leads" || item.id === "cierres")),
    )
    .map((item) => {
      if (item.id === "actividad") {
        return {
          ...item,
          href: `/${locale}/gestion/actividades?userId=${user?.uid || user?.id}`,
        };
      }
      return {
        ...item,
        href: item.slug ? `${basePath}${item.slug}` : basePath,
      };
    });

  const sortedItems = isSuperAdminRole
    ? [...availableItems].sort((a, b) => {
        if (a.id === "alert") return -1;
        if (b.id === "alert") return 1;
        return 0;
      })
    : availableItems;

  const roleAccentColors = {
    superAdmin: "text-blue-400 border-blue-500 bg-blue-500",
    seller: "text-red-400 border-red-500 bg-red-500",
    marketing: "text-amber-400 border-amber-500 bg-amber-500",
    default: "text-blue-400 border-blue-500 bg-blue-500",
  };

  const colorConfig =
    roleAccentColors[userRole as keyof typeof roleAccentColors] ||
    roleAccentColors.default;
  const [accentColor, , bgColor] = colorConfig.split(" ");

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ x: -280 }}
          animate={{ x: 0 }}
          exit={{ x: -280 }}
          transition={{ type: "spring", damping: 20, stiffness: 100 }}
          className="w-72 bg-[#0F172A] border-r border-slate-800 text-slate-300 fixed h-dvh z-[100] flex flex-col shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="p-6 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 bg-white rounded-xl flex items-center justify-center p-1">
                <img
                  src="/supricom.png"
                  alt="Logo"
                  className="w-full h-full object-contain"
                />
              </div>
              <h2 className="text-white font-bold text-lg leading-tight">
                SUPRICOM
              </h2>
            </div>
            <button
              onClick={onToggle}
              className="md:hidden p-2.5 text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 rounded-xl transition-colors"
              aria-label="Cerrar menú"
            >
              <X size={22} />
            </button>
          </div>

          {/* Menú de Navegación */}
          <nav className="flex-1 px-4 space-y-1 mt-4 overflow-y-auto">
            {/* Renderizado de Opciones Simples */}
            {sortedItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.slug
                ? pathname.includes(item.slug)
                : pathname === basePath || pathname === basePath + "/";

              return (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => {
                    if (window.matchMedia("(max-width: 767px)").matches)
                      onToggle();
                  }}
                >
                  <div
                    className={`group flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 relative ${isActive ? `bg-white/5 ${accentColor} font-semibold` : "hover:bg-slate-800/50 hover:text-white"}`}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="active-pill"
                        className={`absolute left-0 w-1 h-6 ${bgColor} rounded-r-full`}
                      />
                    )}
                    <Icon
                      size={20}
                      className={isActive ? accentColor : "text-slate-400"}
                    />
                    <span className="text-sm">{item.label}</span>
                  </div>
                </Link>
              );
            })}

            {/* NUEVO: Submenú Desplegable de LEADS */}
            {hasAdminLeadsPermission && userRole !== "adminLeads" && (
              <div className="space-y-1">
                <button
                  onClick={() => setIsLeadsOpen(!isLeadsOpen)}
                  className="w-full group flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 hover:bg-slate-800/50 hover:text-white"
                >
                  <div className="flex items-center gap-3">
                    <Target size={20} className="text-slate-400" />
                    <span className="text-sm">Leads</span>
                  </div>
                  <ChevronDown
                    size={16}
                    className={`text-slate-400 transition-transform duration-200 ${isLeadsOpen ? "rotate-180" : ""}`}
                  />
                </button>

                <AnimatePresence>
                  {isLeadsOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="pl-9 space-y-1 overflow-hidden"
                    >
                      {[
                        // Las rutas apuntan al directorio /adminleads ignorando el basePath
                        {
                          label: "Dashboard Leads",
                          href: `/${locale}/adminleads`,
                          permission: "adminleads",
                        },
                        {
                          label: "Monitoreo de leads",
                          href: `/${locale}/adminleads/monitoreo_leads`,
                          permission: "monitoreo_leads",
                        },
                        {
                          label: "Cierres",
                          href: `/${locale}/adminleads/cierres`,
                          permission: "cierres_adminleads",
                        },
                        {
                          label: "Configuración",
                          href: `/${locale}/adminleads/configuracion`,
                          permission: "configuracion_leads",
                        },
                      ].map((subItem, index) => {
                        // Verificamos si el usuario tiene permiso específico para esta sub-sección
                        if (!allowedSections.includes(subItem.permission))
                          return null;

                        const isSubActive = pathname === subItem.href;

                        return (
                          <Link
                            key={index}
                            href={subItem.href}
                            onClick={() => {
                              if (
                                window.matchMedia("(max-width: 767px)").matches
                              )
                                onToggle();
                            }}
                          >
                            <div
                              className={`px-4 py-2 text-sm rounded-lg transition-colors ${isSubActive ? `${accentColor} font-medium bg-white/5` : "text-slate-400 hover:text-white hover:bg-slate-800/30"}`}
                            >
                              {subItem.label}
                            </div>
                          </Link>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Submenú Desplegable de AUDITORIA */}
            {hasAuditPermission && (
              <div className="space-y-1">
                <button
                  onClick={() => setIsAuditOpen(!isAuditOpen)}
                  className="w-full group flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 hover:bg-slate-800/50 hover:text-white"
                >
                  <div className="flex items-center gap-3">
                    <FileText size={20} className="text-slate-400" />
                    <span className="text-sm">Auditoria</span>
                  </div>
                  <ChevronDown
                    size={16}
                    className={`text-slate-400 transition-transform duration-200 ${isAuditOpen ? "rotate-180" : ""}`}
                  />
                </button>

                <AnimatePresence>
                  {isAuditOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="pl-9 space-y-1 overflow-hidden"
                    >
                      {[
                        {
                          label: "Auditoria de Odoo",
                          href: `${basePath}/auditoria`,
                          permission: "audit",
                        },
                        {
                          label: "Auditoria del Panel",
                          href: `${basePath}/auditoria_panel`,
                          permission: "auditoria_panel",
                        },
                      ].map((subItem, index) => {
                        if (!allowedSections.includes(subItem.permission))
                          return null;

                        const isSubActive = pathname === subItem.href;

                        return (
                          <Link
                            key={index}
                            href={subItem.href}
                            onClick={() => {
                              if (
                                window.matchMedia("(max-width: 767px)").matches
                              )
                                onToggle();
                            }}
                          >
                            <div
                              className={`px-4 py-2 text-sm rounded-lg transition-colors ${isSubActive ? `${accentColor} font-medium bg-white/5` : "text-slate-400 hover:text-white hover:bg-slate-800/30"}`}
                            >
                              {subItem.label}
                            </div>
                          </Link>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Submenú Desplegable de COMPRAS (solo para roles que no son Compras) */}
            {hasComprasPermission && !isComprasRole && (
              <div className="space-y-1">
                <button
                  onClick={() => setIsComprasOpen(!isComprasOpen)}
                  className="w-full group flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 hover:bg-slate-800/50 hover:text-white"
                >
                  <div className="flex items-center gap-3">
                    <Package size={20} className="text-slate-400" />
                    <span className="text-sm">Compras</span>
                  </div>
                  <ChevronDown
                    size={16}
                    className={`text-slate-400 transition-transform duration-200 ${isComprasOpen ? "rotate-180" : ""}`}
                  />
                </button>

                <AnimatePresence>
                  {isComprasOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="pl-9 space-y-1 overflow-hidden"
                    >
                      {[
                        {
                          label: "Sugerencia de compras",
                          href: `${basePath}/sugeridos`,
                          permission: "sugeridos",
                        },
                        {
                          label: "Menor Rotacion",
                          href: `${basePath}/menor_rotacion`,
                          permission: "menor_rotacion",
                        },
                        {
                          label: "Mayor Rotacion",
                          href: `${basePath}/mayor_rotacion`,
                          permission: "mayor_rotacion",
                        },
                      ].map((subItem, index) => {
                        if (
                          !allowedSections.includes(subItem.permission) &&
                          !allowedSections.includes("compras")
                        )
                          return null;

                        const isSubActive = pathname === subItem.href;

                        return (
                          <Link
                            key={index}
                            href={subItem.href}
                            onClick={() => {
                              if (
                                window.matchMedia("(max-width: 767px)").matches
                              )
                                onToggle();
                            }}
                          >
                            <div
                              className={`px-4 py-2 text-sm rounded-lg transition-colors ${isSubActive ? `${accentColor} font-medium bg-white/5` : "text-slate-400 hover:text-white hover:bg-slate-800/30"}`}
                            >
                              {subItem.label}
                            </div>
                          </Link>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Submenú Desplegable de VENTAS (solo SuperAdmin) */}
            {isSuperAdminRole && (
              <div className="space-y-1">
                <button
                  onClick={() => setIsVentasOpen(!isVentasOpen)}
                  className="w-full group flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 hover:bg-slate-800/50 hover:text-white"
                >
                  <div className="flex items-center gap-3">
                    <TrendingUp size={20} className="text-slate-400" />
                    <span className="text-sm">Ventas</span>
                  </div>
                  <ChevronDown
                    size={16}
                    className={`text-slate-400 transition-transform duration-200 ${isVentasOpen ? "rotate-180" : ""}`}
                  />
                </button>

                <AnimatePresence>
                  {isVentasOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="pl-9 space-y-1 overflow-hidden"
                    >
                      {[
                        ...(isSuperAdminRole
                          ? [
                              {
                                label: "Reporte Diario",
                                href: `${basePath}/reporte-diario`,
                                permission: "reporte_diario",
                              },
                            ]
                          : []),
                        {
                          label: "Cuota",
                          href: `${basePath}/cuota`,
                          permission: "cuota",
                        },
                        {
                          label: "Mapa de Clientes",
                          href: `${basePath}/vendedores`,
                          permission: "seller_map",
                        },
                        {
                          label: "Spiff",
                          href: `${basePath}/spiff`,
                          permission: "spiff",
                        },
                        ...(!isSuperAdminRole
                          ? [
                              {
                                label: "Reporte Diario",
                                href: `${basePath}/reporte-diario`,
                                permission: "reporte_diario",
                              },
                            ]
                          : []),
                      ].map((subItem, index) => {
                        const isSubActive = pathname === subItem.href;

                        return (
                          <Link
                            key={index}
                            href={subItem.href}
                            onClick={() => {
                              if (
                                window.matchMedia("(max-width: 767px)").matches
                              )
                                onToggle();
                            }}
                          >
                            <div
                              className={`px-4 py-2 text-sm rounded-lg transition-colors ${isSubActive ? `${accentColor} font-medium bg-white/5` : "text-slate-400 hover:text-white hover:bg-slate-800/30"}`}
                            >
                              {subItem.label}
                            </div>
                          </Link>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Submenú Desplegable de REPORTES Original */}
            {hasReportsPermission && (
              <div className="space-y-1">
                <button
                  onClick={() => setIsReportsOpen(!isReportsOpen)}
                  className="w-full group flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 hover:bg-slate-800/50 hover:text-white"
                >
                  <div className="flex items-center gap-3">
                    <BarChart3 size={20} className="text-slate-400" />
                    <span className="text-sm">Reportes</span>
                  </div>
                  <ChevronDown
                    size={16}
                    className={`text-slate-400 transition-transform duration-200 ${isReportsOpen ? "rotate-180" : ""}`}
                  />
                </button>

                <AnimatePresence>
                  {isReportsOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="pl-9 space-y-1 overflow-hidden"
                    >
                      {[
                        { label: "Inventario", slug: "/reports/inventory" },
                        { label: "Por Vendedor", slug: "/reports/sellers" },
                        { label: "Por Cliente", slug: "/reports/clients" },
                      ].map((subItem, index) => {
                        const subHref = `${basePath}${subItem.slug}`;
                        const isSubActive = pathname === subHref;

                        return (
                          <Link
                            key={index}
                            href={subHref}
                            onClick={() => {
                              if (
                                window.matchMedia("(max-width: 767px)").matches
                              )
                                onToggle();
                            }}
                          >
                            <div
                              className={`px-4 py-2 text-sm rounded-lg transition-colors ${isSubActive ? `${accentColor} font-medium bg-white/5` : "text-slate-400 hover:text-white hover:bg-slate-800/30"}`}
                            >
                              {subItem.label}
                            </div>
                          </Link>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </nav>

          {/* Footer del Sidebar */}
          <div className="p-4 bg-slate-900/50 border-t border-slate-800/50">
            <div className="flex items-center gap-3 px-2 py-3 mb-2">
              <div
                className={`h-9 w-9 rounded-full ${bgColor} flex items-center justify-center text-xs font-bold text-white uppercase shadow-inner`}
              >
                {userName.substring(0, 2)}
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="text-sm font-bold text-white truncate">
                  {userName}
                </p>
                <p
                  className={`text-[10px] ${accentColor} truncate uppercase font-bold`}
                >
                  {userRole === "superAdmin" ? "Super Admin" : user.role}
                </p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-400 hover:text-red-400 hover:bg-red-400/5 rounded-lg transition-colors"
            >
              <LogOut size={18} /> <span>Cerrar Sesión</span>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
