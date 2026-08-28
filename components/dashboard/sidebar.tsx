"use client";

import { useAuthStore } from "@/lib/stores/auth.store";
import { rolePermissions, UserRole } from "@/lib/types";
import { AnimatePresence, motion } from "framer-motion";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import {
  Activity,
  Wallet,
  AlertTriangle,
  Award,
  BarChart3,
  Bell,
  Boxes,
  BrainCircuit,
  Calendar,
  Camera,
  ChevronDown,
  ClipboardList,
  CreditCard,
  DollarSign,
  FileText,
  Globe,
  LayoutDashboard,
  LogOut,
  Map,
  Megaphone,
  Package,
  PieChart,
  Search,
  Settings2,
  Shield,
  Send,
  Inbox,
  PackageCheck,
  Star,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  Truck,
  UserCheck,
  Users,
  Wrench,
  X,
} from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { connectSocket, getSocket } from "@/lib/socket-client";

function SortableItem({ id, isActive, accentColor, bgColor, children }: {
  id: string;
  isActive: boolean;
  accentColor: string;
  bgColor: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : "auto" as const,
  };
  return (
    <div ref={setNodeRef} style={style} className={`flex items-center gap-1 rounded-xl ${isDragging ? "ring-2 ring-blue-500/50" : ""}`}>
      <button
        {...attributes}
        {...listeners}
        className="p-1.5 text-slate-500 hover:text-slate-300 cursor-grab active:cursor-grabbing flex-shrink-0"
        tabIndex={-1}
      >
        <GripVertical size={14} />
      </button>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

export function Sidebar({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  const { user, logout } = useAuthStore();
  const pathname = usePathname();
  const t = useTranslations("sidebar");

  // Estados para los menús desplegables
  const [isReportsOpen, setIsReportsOpen] = useState(false);
  const [isLeadsOpen, setIsLeadsOpen] = useState(false);
  const [isAuditOpen, setIsAuditOpen] = useState(false);
  const [isComprasOpen, setIsComprasOpen] = useState(false);
  const [isVentasOpen, setIsVentasOpen] = useState(false);
  const [isCxCOpen, setIsCxCOpen] = useState(false);
  const [isMarketingOpen, setIsMarketingOpen] = useState(false);
  const [isRmaAlmacenOpen, setIsRmaAlmacenOpen] = useState(false);
  const [isMercanciaOpen, setIsMercanciaOpen] = useState(false);

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

  const [isEditingSidebar, setIsEditingSidebar] = useState(false);
  const [sidebarOrder, setSidebarOrder] = useState<string[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    const uid = user?.uid || user?.id;
    if (!uid) return;
    fetch(`/api/user/sidebar-order?userId=${uid}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data.order?.length > 0) {
          setSidebarOrder(json.data.order);
        }
      })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    const uid = user?.uid || user?.id;
    if (!uid) return;
    const socket = connectSocket(uid);
    const handler = (data: { order: string[] }) => setSidebarOrder(data.order);
    socket.on("sidebar_order_updated", handler);
    return () => { socket.off("sidebar_order_updated", handler); };
  }, [user]);

  const params = useParams();
  const locale = params?.locale || "es";
  const userName = user?.name || "Usuario";
  const router = useRouter();
  const navRef = useRef<HTMLElement>(null);

  const handleSidebarWheel = useCallback((e: React.WheelEvent) => {
    const nav = navRef.current;
    if (!nav) return;
    const { scrollTop, scrollHeight, clientHeight } = nav;
    const atTop = scrollTop === 0 && e.deltaY < 0;
    const atBottom = scrollTop + clientHeight >= scrollHeight - 1 && e.deltaY > 0;
    if (!atTop && !atBottom) {
      e.preventDefault();
      nav.scrollTop += e.deltaY;
    }
  }, []);

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
    { id: "alert", label: t("alertas"), icon: Bell, slug: "/alert" },
    { id: "cxc_alerts", label: "Alertas CxC", icon: AlertTriangle, slug: "/alertas" },
    { id: "dashboard", label: t("dashboard"), icon: LayoutDashboard, slug: "" },
    { id: "actividad", label: t("actividades"), icon: Calendar, slug: "/actividad" },
    { id: "stoplight_reports", label: t("stoplight_report"), icon: BarChart3, slug: "/StoplightReport" },
    { id: "users", label: t("usuarios"), icon: Users, slug: "/usuarios" },
    { id: "seller_map", label: t("mapa_clientes"), icon: Map, slug: "/vendedores" },
    { id: "cuota", label: t("cuota"), icon: FileText, slug: "/cuota" },
    { id: "inventory", label: t("inventario"), icon: Package, slug: "/inventory" },
    { id: "agenteia", label: t("agente_ia"), icon: BrainCircuit, slug: "/agenteia" },
    { id: "integraciondepago", label: t("integracion_pago"), icon: CreditCard, slug: "/integraciondepago" },
    { id: "clientes", label: t("clientes"), icon: UserCheck, slug: "/clientes" },
    { id: "catalogo", label: t("catalogo"), icon: Boxes, slug: "/catalogo" },
    { id: "leads", label: t("leads"), icon: UserCheck, slug: "/leads" },
    { id: "MapaClientes", label: t("mapa_de_clientes"), icon: Map, slug: "/mapa_clientes" },
    { id: "cierres", label: t("cierres"), icon: FileText, slug: "/Cierres" },
    { id: "top_clientes", label: t("top_clientes"), icon: Trophy, slug: "/top-clientes" },
    { id: "cuentas_por_cobrar", label: t("cuentas_por_cobrar"), icon: DollarSign, slug: "/cuentas-por-cobrar" },
    { id: "referencia_comercial", label: "Referencia Comercial", icon: FileText, slug: "/referencia-comercial" },
    { id: "cxc_search", label: "Buscar Facturas", icon: Search, slug: "/buscar" },
    { id: "cxc_top_clients", label: "Top Clientes / Vendedor", icon: Users, slug: "/top-clientes-vendedor" },
    { id: "spiff", label: t("spiff"), icon: Award, slug: "/spiff" },
    { id: "reporte_diario", label: t("reporte_diario"), icon: ClipboardList, slug: "/reporte-diario" },
    { id: "sugeridos", label: t("sugerencia_compras"), icon: Package, slug: "/sugeridos" },
    { id: "menor_rotacion", label: t("menor_rotacion"), icon: TrendingDown, slug: "/menor_rotacion" },
    { id: "mayor_rotacion", label: t("mayor_rotacion"), icon: TrendingUp, slug: "/mayor_rotacion" },
    { id: "moq", label: t("moq"), icon: Settings2, slug: "/moq" },
    { id: "cobertura", label: t("cobertura_stock"), icon: Shield, slug: "/cobertura" },
    { id: "rotacion_categoria", label: t("rotacion_categoria"), icon: PieChart, slug: "/rotacion-categoria" },
    { id: "tendencia", label: t("tendencia_ventas"), icon: BarChart3, slug: "/tendencia" },
    { id: "rma", label: t("rma"), icon: Wrench, slug: "/rma", absoluteHref: true },
    // Rol Almacen (issue #42): entradas planas, no un desplegable, porque
    // hoy solo tiene dos pantallas — registrar el egreso y navegar las
    // facturas de venta pendientes de despacho en Odoo. Seguridad ve la misma
    // ruta de egresos dentro de su grupo "Mercancia"; esta es la version que
    // ve Almacen, que no tiene el resto de ese grupo ni el de RMA.
    { id: "almacen_egresos", label: t("almacen_egresos"), icon: Truck, slug: "/seguridad/mercancia/egreso", absoluteHref: true },
    { id: "almacen_ordenes", label: t("almacen_ordenes"), icon: ClipboardList, slug: "/seguridad/mercancia/ordenes", absoluteHref: true },
    // Seguridad vive en /seguridad, fuera del dashboard, igual que RMA. Se
    // llega desde el panel en vez de por un subdominio propio.
    { id: "rma_nota_credito", label: t("nota_credito"), icon: FileText, slug: "/rma/nota-credito", absoluteHref: true },
    { id: "rma_salida", label: t("salida_rma"), icon: Truck, slug: "/rma/salida", absoluteHref: true },
    { id: "sales_dashboard", label: "Dashboard", icon: LayoutDashboard, slug: "/dashboard" },
    { id: "adminleads", label: t("dashboard_leads"), icon: Target, slug: "", adminLeadsOnly: true },
    { id: "catalogo_adminleads", label: t("catalogo"), icon: Boxes, slug: "/catalogo", adminLeadsOnly: true },
    { id: "monitoreo_leads", label: t("monitoreo_leads"), icon: Target, slug: "/monitoreo_leads", adminLeadsOnly: true },
    { id: "cierres_adminleads", label: t("cierres"), icon: FileText, slug: "/cierres", adminLeadsOnly: true },
    { id: "configuracion_leads", label: t("configuracion"), icon: Settings2, slug: "/configuracion", adminLeadsOnly: true },
    { id: "banco_imagenes_seller", label: "Banco de Flyers", icon: Camera, slug: "/banco-imagenes" },
    { id: "banco_imagenes", label: "Banco de Flyers", icon: Camera, slug: "/banco-imagenes" },
    { id: "vista_custom", label: "Plan de Contenido", icon: Calendar, slug: "/vista-custom" },
    { id: "catalogo_disenador", label: "Productos", icon: Boxes, slug: "/productos" },
    // absoluteHref: estas dos apuntan siempre a /administracion, sin depender del
    // basePath del rol. Asi tambien funcionan para superadmin, cuyo basePath es
    // /superadmin y generaria enlaces rotos con slugs relativos.
    { id: "salud_financiera", label: "Salud Financiera", icon: Activity, slug: "/administracion", absoluteHref: true },
    { id: "gastos_presupuesto", label: "Gastos y Presupuesto", icon: Wallet, slug: "/administracion/gastos", absoluteHref: true },
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
      case "asistente de ventas":
        return `/${locale}/gerente_venta`;
      case "gerente_operaciones":
      case "gerencia de operaciones":
      case "gerente de operaciones":
        return `/${locale}/gerente_operaciones`;
      case "compras":
        return `/${locale}/compras`;
      case "rma":
        return `/${locale}/rma`;
      case "cuentas por cobrar":
        return `/${locale}/cuentas-por-cobrar`;
      case "diseñador":
        return `/${locale}/disenador`;
      case "administración":
        // El basePath solo lo usa el item "Dashboard", que es la pantalla de
        // inicio del rol. Salud Financiera y Gastos y Presupuesto apuntan a
        // /administracion con absoluteHref, asi que no dependen de esto.
        // Antes basePath era /administracion y colisionaba con Salud
        // Financiera: ambos items resolvian a la misma URL y el sidebar los
        // marcaba activos al mismo tiempo.
        return `/${locale}/dashboard`;
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
    allowedSections.includes("mayor_rotacion") ||
    allowedSections.includes("cobertura") ||
    allowedSections.includes("rotacion_categoria") ||
    allowedSections.includes("tendencia");
  const isComprasRole = userRole === "compras";
  const comprasDropdownIds = ["sugeridos", "menor_rotacion", "mayor_rotacion", "cobertura", "rotacion_categoria", "tendencia"];
  const isSuperAdminRole = userRole === "superAdmin";
  const normalizedUserRole = userRole?.toLowerCase().trim();
  const isGerenteOperaciones = normalizedUserRole === "gerente_operaciones" || normalizedUserRole === "gerente de operaciones";
  const ventasDropdownIds = ["cuota", "MapaClientes", "seller_map", "spiff", "reporte_diario"];
  const hasVentasPermission = ventasDropdownIds.some((id) => allowedSections.includes(id));
  const hasCxCPermission = allowedSections.includes("cuentas_por_cobrar");
  const cxcDropdownIds = ["cuentas_por_cobrar", "cxc_alerts", "cxc_search", "cxc_top_clients", "referencia_comercial", "integraciondepago"];
  const showVentasDropdown = isSuperAdminRole || (isGerenteOperaciones && hasVentasPermission);
  const showCxCDropdown = (isSuperAdminRole || isGerenteOperaciones) && hasCxCPermission;

  const isSellerPausado =
    (userRole?.toLowerCase().trim() === "seller" ||
      userRole?.toLowerCase().trim() === "vendedor") &&
    (user as any).activo === 0;

  // Filtramos los items base
  const availableItems = menuItems
    .filter(
      (item) =>
        allowedSections.includes(item.id) &&
        ((item as any).adminLeadsOnly ? (userRole === "adminLeads" || userRole === "superAdmin") : true) &&
        !(userRole === "superAdmin" && ["adminleads", "monitoreo_leads", "cierres_adminleads"].includes(item.id)) &&
        !(userRole === "superAdmin" && ["banco_imagenes", "banco_imagenes_seller", "vista_custom"].includes(item.id)) &&
        (isComprasRole ||
          !hasComprasPermission ||
          !comprasDropdownIds.includes(item.id)) &&
        (!showVentasDropdown || !ventasDropdownIds.includes(item.id)) &&
        (!showCxCDropdown || !cxcDropdownIds.includes(item.id)) &&
        (item.id !== "catalogo_adminleads" || Number(userCids) === 9) &&
        (item.id !== "catalogo_disenador" || Number(userCids) === 9) &&
        !(isSellerPausado && (item.id === "leads" || item.id === "cierres")) &&
        !(item.id === "cuentas_por_cobrar" && userRole === "cuentas por cobrar")
    )
    .map((item) => {
      if (item.id === "actividad") {
        return {
          ...item,
          href: `/${locale}/gestion/actividades?userId=${user?.uid || user?.id}`,
        };
      }
      if ((item as any).absoluteHref) {
        return {
          ...item,
          href: `/${locale}${item.slug}`,
        };
      }
      if (item.id === "catalogo_disenador" && userRole?.toLowerCase().trim() === "adminleads") {
        return {
          ...item,
          href: `/${locale}/disenador/productos`,
        };
      }
      return {
        ...item,
        href: item.slug ? `${basePath}${item.slug}` : basePath,
      };
    });

  const sortedAvailableItems = sidebarOrder.length > 0
    ? [...availableItems].sort((a, b) => {
        const aIdx = sidebarOrder.indexOf(a.id);
        const bIdx = sidebarOrder.indexOf(b.id);
        const aPos = aIdx >= 0 ? aIdx : availableItems.length;
        const bPos = bIdx >= 0 ? bIdx : availableItems.length;
        return aPos - bPos;
      })
    : availableItems;

  const saveSidebarOrder = async (newOrder: string[]) => {
    setSidebarOrder(newOrder);
    const uid = user?.uid || user?.id;
    if (!uid) return;
    try {
      await fetch("/api/user/sidebar-order", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: uid, order: newOrder }),
      });
    } catch (e) {
      console.error("Error saving sidebar order:", e);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sortedAvailableItems.findIndex((i) => i.id === active.id);
    const newIndex = sortedAvailableItems.findIndex((i) => i.id === over.id);
    const reordered = arrayMove(sortedAvailableItems, oldIndex, newIndex);
    saveSidebarOrder(reordered.map((i) => i.id));
  };

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
          onWheel={handleSidebarWheel}
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
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsEditingSidebar(!isEditingSidebar)}
                className={`p-2 rounded-xl transition-colors ${isEditingSidebar ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-700"}`}
                title={isEditingSidebar ? "Guardar orden" : "Editar orden del menú"}
              >
                <GripVertical size={18} />
              </button>
              <button
                onClick={onToggle}
                className="md:hidden p-2.5 text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 rounded-xl transition-colors"
                aria-label="Cerrar menú"
              >
                <X size={22} />
              </button>
            </div>
          </div>

          {/* Menú de Navegación */}
          <nav ref={navRef} className="flex-1 px-4 space-y-1 mt-4 overflow-y-auto overscroll-contain">
            {/* Renderizado de Opciones Simples */}
            {isEditingSidebar ? (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={sortedAvailableItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                  {sortedAvailableItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname.replace(/\/+$/, "") === item.href.replace(/\/+$/, "");
                    return (
                      <SortableItem key={item.id} id={item.id} isActive={isActive} accentColor={accentColor} bgColor={bgColor}>
                        <Link href={item.href} onClick={() => { if (window.matchMedia("(max-width: 767px)").matches) onToggle(); }}>
                          <div className={`group flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 relative ${isActive ? `bg-white/5 ${accentColor} font-semibold` : "hover:bg-slate-800/50 hover:text-white"}`}>
                            {isActive && <motion.div layoutId="active-pill" className={`absolute left-0 w-1 h-6 ${bgColor} rounded-r-full`} />}
                            <Icon size={20} className={isActive ? accentColor : "text-slate-400"} />
                            <span className="text-sm">{item.label}</span>
                          </div>
                        </Link>
                      </SortableItem>
                    );
                  })}
                </SortableContext>
              </DndContext>
            ) : (
              sortedAvailableItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname.replace(/\/+$/, "") === item.href.replace(/\/+$/, "");
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={() => { if (window.matchMedia("(max-width: 767px)").matches) onToggle(); }}
                  >
                    <div className={`group flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 relative ${isActive ? `bg-white/5 ${accentColor} font-semibold` : "hover:bg-slate-800/50 hover:text-white"}`}>
                      {isActive && <motion.div layoutId="active-pill" className={`absolute left-0 w-1 h-6 ${bgColor} rounded-r-full`} />}
                      <Icon size={20} className={isActive ? accentColor : "text-slate-400"} />
                      <span className="text-sm">{item.label}</span>
                    </div>
                  </Link>
                );
              })
            )}

            {/* NUEVO: Submenú Desplegable de LEADS */}
            {hasAdminLeadsPermission && userRole !== "adminLeads" && (
              <div className="space-y-1">
                <button
                  onClick={() => setIsLeadsOpen(!isLeadsOpen)}
                  className="w-full group flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 hover:bg-slate-800/50 hover:text-white"
                >
                  <div className="flex items-center gap-3">
                    <Target size={20} className="text-slate-400" />
                    <span className="text-sm">{t("leads")}</span>
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
                          label: t("dashboard_leads"),
                          href: `/${locale}/adminleads`,
                          permission: "adminleads",
                        },
                        {
                          label: t("monitoreo_leads"),
                          href: `/${locale}/adminleads/monitoreo_leads`,
                          permission: "monitoreo_leads",
                        },
                        {
                          label: t("cierres"),
                          href: `/${locale}/adminleads/cierres`,
                          permission: "cierres_adminleads",
                        },
                        {
                          label: t("configuracion"),
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
                    <span className="text-sm">{t("auditoria")}</span>
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
                          label: t("auditoria_odoo"),
                          href: `${basePath}/auditoria`,
                          permission: "audit",
                        },
                        {
                          label: t("auditoria_panel"),
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

            {/* Recepcion y despacho de equipos RMA del almacen. */}
            {allowedSections.includes("seguridad") && (
              <div className="space-y-1">
                <button
                  onClick={() => setIsRmaAlmacenOpen(!isRmaAlmacenOpen)}
                  className="w-full group flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 hover:bg-slate-800/50 hover:text-white"
                >
                  <div className="flex items-center gap-3">
                    <ClipboardList size={20} className="text-slate-400" />
                    <span className="text-sm">{t("seg_grupo_rma")}</span>
                  </div>
                  <ChevronDown
                    size={16}
                    className={`text-slate-400 transition-transform duration-200 ${isRmaAlmacenOpen ? "rotate-180" : ""}`}
                  />
                </button>

                <AnimatePresence>
                  {isRmaAlmacenOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="pl-9 space-y-1 overflow-hidden"
                    >
                      {[
                        { label: t("seg_ingreso"), href: `/${locale}/seguridad/ingreso` },
                        { label: t("seg_egreso"), href: `/${locale}/seguridad/despacho` },
                        { label: t("seg_estadisticas"), href: `/${locale}/seguridad` },
                        { label: t("seguridad_por_llegar"), href: `/${locale}/seguridad/por-llegar` },
                      ].map((sub, index) => {
                        // Coincidencia por prefijo para que el detalle de un
                        // registro siga marcando su seccion. El panel se
                        // compara exacto o marcaria siempre.
                        const esPanel = sub.href.endsWith("/seguridad");
                        const isSubActive = esPanel
                          ? pathname === sub.href
                          : pathname.startsWith(sub.href);

                        return (
                          <Link
                            key={index}
                            href={sub.href}
                            onClick={() => {
                              if (window.matchMedia("(max-width: 767px)").matches)
                                onToggle();
                            }}
                          >
                            <div
                              className={`px-4 py-2 text-sm rounded-lg transition-colors ${isSubActive ? `${accentColor} font-medium bg-white/5` : "text-slate-400 hover:text-white hover:bg-slate-800/30"}`}
                            >
                              {sub.label}
                            </div>
                          </Link>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Carga y descarga de camiones, con la calificacion del almacenista. */}
            {allowedSections.includes("seguridad") && (
              <div className="space-y-1">
                <button
                  onClick={() => setIsMercanciaOpen(!isMercanciaOpen)}
                  className="w-full group flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 hover:bg-slate-800/50 hover:text-white"
                >
                  <div className="flex items-center gap-3">
                    <Truck size={20} className="text-slate-400" />
                    <span className="text-sm">{t("seg_grupo_mercancia")}</span>
                  </div>
                  <ChevronDown
                    size={16}
                    className={`text-slate-400 transition-transform duration-200 ${isMercanciaOpen ? "rotate-180" : ""}`}
                  />
                </button>

                <AnimatePresence>
                  {isMercanciaOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="pl-9 space-y-1 overflow-hidden"
                    >
                      {[
                        { label: t("seg_merc_ingresos"), href: `/${locale}/seguridad/mercancia/ingreso` },
                        { label: t("seg_merc_egresos"), href: `/${locale}/seguridad/mercancia/egreso` },
                        { label: t("seguridad_almacenistas"), href: `/${locale}/seguridad/almacenista` },
                      ].map((sub, index) => {
                        // Coincidencia por prefijo para que el detalle de un
                        // registro siga marcando su seccion. El panel se
                        // compara exacto o marcaria siempre.
                        const esPanel = sub.href.endsWith("/seguridad");
                        const isSubActive = esPanel
                          ? pathname === sub.href
                          : pathname.startsWith(sub.href);

                        return (
                          <Link
                            key={index}
                            href={sub.href}
                            onClick={() => {
                              if (window.matchMedia("(max-width: 767px)").matches)
                                onToggle();
                            }}
                          >
                            <div
                              className={`px-4 py-2 text-sm rounded-lg transition-colors ${isSubActive ? `${accentColor} font-medium bg-white/5` : "text-slate-400 hover:text-white hover:bg-slate-800/30"}`}
                            >
                              {sub.label}
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
                    <span className="text-sm">{t("compras")}</span>
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
                          label: t("sugerencia_compras"),
                          href: `/${locale}/compras/sugeridos`,
                          permission: "sugeridos",
                        },
                        {
                          label: t("menor_rotacion"),
                          href: `/${locale}/compras/menor_rotacion`,
                          permission: "menor_rotacion",
                        },
                        {
                          label: t("mayor_rotacion"),
                          href: `/${locale}/compras/mayor_rotacion`,
                          permission: "mayor_rotacion",
                        },
                        {
                          label: t("cobertura_stock"),
                          href: `/${locale}/compras/cobertura`,
                          permission: "cobertura",
                        },
                        {
                          label: t("rotacion_categoria"),
                          href: `/${locale}/compras/rotacion-categoria`,
                          permission: "rotacion_categoria",
                        },
                        {
                          label: t("tendencia_ventas"),
                          href: `/${locale}/compras/tendencia`,
                          permission: "tendencia",
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

            {/* Submenú Desplegable de VENTAS */}
            {showVentasDropdown && (
              <div className="space-y-1">
                <button
                  onClick={() => setIsVentasOpen(!isVentasOpen)}
                  className="w-full group flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 hover:bg-slate-800/50 hover:text-white"
                >
                  <div className="flex items-center gap-3">
                    <TrendingUp size={20} className="text-slate-400" />
                    <span className="text-sm">{t("ventas")}</span>
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
                        {
                          label: t("reporte_diario"),
                          href: `${basePath}/reporte-diario`,
                          permission: "reporte_diario",
                        },
                        {
                          label: t("cuota"),
                          href: `${basePath}/cuota`,
                          permission: "cuota",
                        },
                        {
                          label: t("mapa_de_clientes"),
                          href: isGerenteOperaciones ? `${basePath}/mapa_clientes` : `${basePath}/vendedores`,
                          permission: "seller_map",
                        },
                        {
                          label: t("spiff"),
                          href: `${basePath}/spiff`,
                          permission: "spiff",
                        },
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

            {/* Submenú Desplegable de CUENTAS POR COBRAR */}
            {showCxCDropdown && (
              <div className="space-y-1">
                <button
                  onClick={() => setIsCxCOpen(!isCxCOpen)}
                  className="w-full group flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 hover:bg-slate-800/50 hover:text-white"
                >
                  <div className="flex items-center gap-3">
                    <DollarSign size={20} className="text-slate-400" />
                    <span className="text-sm">Cuentas por Cobrar</span>
                  </div>
                  <ChevronDown
                    size={16}
                    className={`text-slate-400 transition-transform duration-200 ${isCxCOpen ? "rotate-180" : ""}`}
                  />
                </button>

                <AnimatePresence>
                  {isCxCOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="pl-9 space-y-1 overflow-hidden"
                    >
                      {[
                        {
                          label: "Cuentas por cobrar",
                          href: `/${locale}/cuentas-por-cobrar`,
                          permission: "cuentas_por_cobrar",
                        },
                        {
                          label: "Alertas",
                          href: `/${locale}/cuentas-por-cobrar/alertas`,
                          permission: "cxc_alerts",
                        },
                        {
                          label: "Stoplight Report",
                          href: `/${locale}/cuentas-por-cobrar/StoplightReport`,
                          permission: "stoplight_reports",
                        },
                        {
                          label: "Integración De Pago",
                          href: `/${locale}/cuentas-por-cobrar/integraciondepago`,
                          permission: "integraciondepago",
                        },
                        {
                          label: "Referencia Comercial",
                          href: `/${locale}/cuentas-por-cobrar/referencia-comercial`,
                          permission: "referencia_comercial",
                        },
                        {
                          label: "Buscar Facturas",
                          href: `/${locale}/cuentas-por-cobrar/buscar`,
                          permission: "cxc_search",
                        },
                        {
                          label: "Top Clientes / Vendedor",
                          href: `/${locale}/cuentas-por-cobrar/top-clientes-vendedor`,
                          permission: "cxc_top_clients",
                        },
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
                    <span className="text-sm">{t("reportes")}</span>
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
                        { label: t("inventario"), slug: "/reports/inventory" },
                        { label: t("por_vendedor"), slug: "/reports/sellers" },
                        { label: t("por_cliente"), slug: "/reports/clients" },
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

            {/* Submenú Desplegable de MARKETING (solo superadmin) */}
            {userRole === "superAdmin" && (
              <div className="space-y-1">
                <button
                  onClick={() => setIsMarketingOpen(!isMarketingOpen)}
                  className="w-full group flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 hover:bg-slate-800/50 hover:text-white"
                >
                  <div className="flex items-center gap-3">
                    <Megaphone size={20} className="text-slate-400" />
                    <span className="text-sm">Marketing</span>
                  </div>
                  <ChevronDown
                    size={16}
                    className={`text-slate-400 transition-transform duration-200 ${isMarketingOpen ? "rotate-180" : ""}`}
                  />
                </button>

                <AnimatePresence>
                  {isMarketingOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="pl-9 space-y-1 overflow-hidden"
                    >
                      {[
                        { label: "Plan de Contenido", href: `${basePath}/vista-custom` },
                        { label: "Banco de Flyers", href: `${basePath}/banco-imagenes` },
                      ].map((subItem, index) => {
                        const isSubActive = pathname === subItem.href;
                        return (
                          <Link
                            key={index}
                            href={subItem.href}
                            onClick={() => {
                              if (window.matchMedia("(max-width: 767px)").matches) onToggle();
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
                  {userRole === "superAdmin" ? t("super_admin") : user.role}
                </p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-400 hover:text-red-400 hover:bg-red-400/5 rounded-lg transition-colors"
            >
              <LogOut size={18} /> <span>{t("cerrar_sesion")}</span>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
