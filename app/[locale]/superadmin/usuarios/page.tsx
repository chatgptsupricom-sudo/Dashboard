"use client";

import { CustomSelect } from "@/components/superadmin/CustomSelect";
import { Title } from "@tremor/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
  ShieldCheck,
  UserPlus,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

export default function UserManagement() {
  const t = useTranslations("userManagement");
  const tData = useTranslations("data_labels"); // Hook para valores dinámicos
  const tRoles = useTranslations("roles"); // Asegúrate de que "roles" sea el namespace en tu JSON
  const [users, setUsers] = useState<any[]>([]);
  const [dbRoles, setDbRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros Generales
  const todosLabel = t("all_statuses");
  const [searchTerm, setSearchTerm] = useState("");
  const [odooRoleFilter, setOdooRoleFilter] = useState("Todos");
  const [panelRoleFilter, setPanelRoleFilter] = useState("Todos");
  const [statusFilter, setStatusFilter] = useState("Todos");

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Estados del Modal
  const [isOpen, setIsOpen] = useState(false);
  const [loadingModal, setLoadingModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [odooUsersClean, setOdooUsersClean] = useState<any[]>([]);
  const [searchUserModal, setSearchUserModal] = useState("");
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [selectedRole, setSelectedRole] = useState("");
  const [selectedCids, setSelectedCids] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const safeCids =
    selectedCids !== undefined && selectedCids !== "" ? selectedCids : null;

  // Obtener el locale actual para traducciones dinámicas
  const locale = useLocale(); // 'es' o 'en'

  // Mapeo de estilos para roles técnicos, usando el namespace "roles" para traducciones específicas de roles
  const roleStyles: Record<string, string> = {
    superAdmin: "bg-red-50 text-red-600 border-red-100",
    marketingManagement: "bg-blue-50 text-blue-600 border-blue-100",
    brandManagement: "bg-orange-50 text-orange-600 border-orange-100",
    marketing: "bg-teal-50 text-teal-600 border-teal-100",
    programmers: "bg-indigo-50 text-indigo-600 border-indigo-100",
    audit: "bg-purple-50 text-purple-600 border-purple-100",
    noAccess: "bg-slate-100 text-slate-400 border-slate-200",
  };

  const odooRoleStyles: Record<string, string> = {
    Interno: "bg-blue-50 text-blue-600 border-blue-100",
    Portal: "bg-cyan-50 text-cyan-600 border-cyan-100",
  };

  // Mapeo de roles técnicos a etiquetas legibles, usando el namespace "roles" para traducciones específicas de roles
  const roleMap: Record<string, string> = {
    superAdmin: tRoles("superAdmin"),
    marketingManagement: tRoles("marketingManagement"),
    brandManagement: tRoles("brandManagement"),
    marketing: tRoles("marketing"),
    programmers: tRoles("programmers"),
    audit: tRoles("audit"),
  };
  // Función para traducir roles de Odoo a etiquetas legibles, usando el namespace "data_labels" para valores dinámicos
  const getTranslatedRole = (name: string, displayName: string) => {
    return roleMap[name] || displayName || name;
  };
  // Función para traducir estado de usuarios, usando el namespace "data_labels" para valores dinámicos
  const getOdooRoleLabel = (role: string) => {
    return role === "Interno"
      ? tData("internal")
      : role === "Portal"
        ? tData("portal")
        : role;
  };

  // Función para traducir estado de usuarios, usando el namespace "data_labels" para valores dinámicos
  const getStatusLabel = (status: string) => {
    return status === "Activo" ? tData("active") : tData("inactive");
  };

  // Ajuste dinámico de items por página según el ancho de pantalla
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width >= 1280) setItemsPerPage(10);
      else if (width >= 1024) setItemsPerPage(7);
      else if (width >= 768) setItemsPerPage(4);
      else setItemsPerPage(3);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Fetch inicial de usuarios y roles
  useEffect(() => {
    fetchData();
  }, []);

  // Función para refrescar datos después de asignar roles o hacer cambios
  const fetchData = () => {
    setLoading(true);
    fetch("/api/superadmin/users")
      .then((res) => res.json())
      .then((data) => {
        if (data.users) setUsers(data.users);
        if (data.availableRoles) setDbRoles(data.availableRoles);
      })
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  };

  // Función para abrir el modal y cargar usuarios de Odoo
  const handleOpenModal = async () => {
    setIsOpen(true);
    setLoadingModal(true);
    try {
      const res = await fetch("/api/superadmin/users");
      const data = await res.json();
      setOdooUsersClean(data.availableUsers || []);
      if (data.availableRoles) setDbRoles(data.availableRoles);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingModal(false);
    }
  };

  // Función para asignar rol a un usuario seleccionado
  const handleAssignRole = async () => {
    // Diagnóstico visual
    console.log("DEBUG - Usuario seleccionado:", selectedUser);

    if (!selectedUser) {
      console.error("❌ No se seleccionó ningún usuario");
      return;
    }
    if (!selectedRole) {
      console.error("❌ No se seleccionó ningún rol");
      return;
    }

    // Rescate inteligente: busca el email en varias posibles ubicaciones
    const emailToUse =
      selectedUser.subLabel || selectedUser.email || selectedUser.login;

    if (!emailToUse) {
      console.error(
        "❌ El usuario seleccionado no tiene un email válido. Objeto:",
        selectedUser,
      );
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        email: emailToUse,
        role: selectedRole,
        cids: selectedCids,
        odooId: selectedUser.key,
      };

      const res = await fetch("/api/superadmin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setIsOpen(false);
        setSelectedUser(null);
        setSelectedRole("");
        setSelectedCids("");
        setSelectedCity("");
        fetchData();
      } else {
        const errorData = await res.json();
        console.error("❌ Error de la API:", errorData);
      }
    } catch (err) {
      console.error("❌ Error de red:", err);
    } finally {
      setSubmitting(false);
    }
  };

  // Filtrado de usuarios de Odoo para el modal, basado en búsqueda por nombre o email
  const filteredOdooUsersModal = useMemo(() => {
    return odooUsersClean.filter(
      (u) =>
        u.name.toLowerCase().includes(searchUserModal.toLowerCase()) ||
        u.email.toLowerCase().includes(searchUserModal.toLowerCase()),
    );
  }, [odooUsersClean, searchUserModal]);

  // Filtrado principal de usuarios para la tabla, basado en búsqueda y filtros seleccionados
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch =
        u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesOdooRole =
        odooRoleFilter === "Todos" || u.role === odooRoleFilter;

      // ✅ MODIFICADO: Valida de manera flexible tanto el name técnico como el display_name del rol
      const matchesPanelRole =
        panelRoleFilter === "Todos" ||
        u.panelRole === panelRoleFilter ||
        u.panelRoleName === panelRoleFilter;

      const matchesStatus =
        statusFilter === "Todos" || u.odooStatus === statusFilter;
      return (
        matchesSearch && matchesOdooRole && matchesPanelRole && matchesStatus
      );
    });
  }, [users, searchTerm, odooRoleFilter, panelRoleFilter, statusFilter]);

  // Cálculo de paginación
  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  // Aseguramos que currentPage no exceda el total de páginas después de filtrar
  const paginatedData = filteredUsers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  // Resetear página a 1 cada vez que cambian los filtros o la búsqueda
  useEffect(
    () => setCurrentPage(1),
    [searchTerm, odooRoleFilter, panelRoleFilter, statusFilter],
  );

  // Renderizado de carga
  if (loading)
    return (
      <div className="p-10 text-center font-bold text-slate-400 uppercase animate-pulse">
        {t("loading.users")}
      </div>
    );

  // Renderizado principal
  return (
    <div className="space-y-4">
      {/* BARRA DE FILTROS */}
      <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex flex-wrap gap-3 items-center flex-1">
          <div className="relative min-w-[250px]">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={18}
            />
            <input
              type="text"
              placeholder={t("search")}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 transition-all outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <select
            className="bg-slate-50 border-none rounded-2xl text-xs font-bold px-4 py-2.5 outline-none cursor-pointer text-slate-700"
            value={panelRoleFilter}
            onChange={(e) => setPanelRoleFilter(e.target.value)}
          >
            <option value="Todos">{t("all_panel_roles")}</option>
            {dbRoles.map((role) => (
              <option key={`role-opt-${role.name}`} value={role.name}>
                {getTranslatedRole(role.name, role.displayName)}
              </option>
            ))}
            <option value="Sin Acceso">{t("no_access")}</option>
          </select>

          <select
            className="bg-slate-50 border-none rounded-2xl text-xs font-bold px-4 py-2.5 text-slate-600 outline-none cursor-pointer"
            value={odooRoleFilter}
            onChange={(e) => setOdooRoleFilter(e.target.value)}
          >
            <option value="Todos">{t("odoo_roles_all")}</option>
            <option value="Interno">{tData("internal")}</option>
            <option value="Portal">{tData("portal")}</option>
          </select>

          <select
            className="bg-slate-50 border-none rounded-2xl text-xs font-bold px-4 py-2.5 text-slate-600 outline-none cursor-pointer"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="Todos">{t("all_statuses")}</option>
            <option value="Activo">{tData("active")}</option>
            <option value="Inactivo">{tData("inactive")}</option>
          </select>
        </div>

        <button
          onClick={handleOpenModal}
          className="flex items-center gap-2 bg-blue-600 hover:bg-slate-900 text-white font-black text-xs uppercase tracking-widest px-5 py-3 rounded-2xl shadow-md transition-all active:scale-95"
        >
          <UserPlus size={15} />
          {t("assign_role")}
        </button>
      </div>

      {/* TABLA PRINCIPAL */}
      <div className="bg-white rounded-3xl shadow-sm overflow-hidden border border-slate-100 flex flex-col min-h-[450px] ">
        <div className="flex-1 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50/50 text-slate-400 uppercase text-[10px] font-black tracking-widest">
              <tr>
                {/* Añadimos 'text-center' a todos los headers */}
                <th className="px-6 py-5 text-center">{t("columns.name")}</th>
                <th className="px-6 py-5 text-center">{t("columns.email")}</th>
                <th className="px-6 py-5 text-center">
                  {t("columns.panel_role")}
                </th>
                <th className="px-6 py-5 text-center">
                  {t("columns.odoo_role")}
                </th>
                <th className="px-6 py-5 text-center">
                  {t("columns.last_session")}
                </th>
                <th className="px-6 py-5 text-center">{t("columns.status")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {paginatedData.map((user) => (
                <tr key={user.id}>
                  <td className="px-6 py-4 font-bold text-slate-700 text-sm text-center">
                    {user.name}
                  </td>
                  <td className="px-6 py-4 text-slate-500 text-sm text-center">
                    {user.email}
                  </td>

                  {/* PANEL ROLE (Centrado) */}
                  <td className="px-6 py-4 flex justify-center">
                    <span
                      className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase shadow-sm border ${
                        user.panelRole === t("no_access")
                          ? roleStyles.noAccess
                          : roleStyles[user.panelRoleName] ||
                            "bg-slate-50 text-slate-600 border-slate-200"
                      }`}
                    >
                      {user.panelRole === t("no_access")
                        ? t("no_access")
                        : user.panelRole}
                    </span>
                  </td>

                  {/* ODOO ROLE (Centrado con colores) */}
                  <td className="px-6 py-4">
                    <div className="flex justify-center">
                      <span
                        className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase border ${odooRoleStyles[user.role] || "bg-slate-50 text-slate-600 border-slate-200"}`}
                      >
                        {getOdooRoleLabel(user.role)}
                      </span>
                    </div>
                  </td>

                  <td className="px-6 py-4 text-slate-400 text-[11px] italic text-center">
                    {user.lastLogin === t("never") ? t("never") : user.lastLogin}
                  </td>

                  {/* STATUS (Centrado) */}
                  <td className="px-6 py-4">
                    <div className="flex justify-center">
                      <span
                        className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase shadow-sm border ${
                          user.odooStatus === t("active")
                            ? "bg-green-100 text-green-800 border-green-200"
                            : "bg-red-100 text-red-800 border-red-200"
                        }`}
                      >
                        {getStatusLabel(user.odooStatus)}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredUsers.length === 0 && (
            <div className="p-10 text-center text-slate-400 text-sm font-medium">
              {t("no_results")}
            </div>
          )}
        </div>

        {/* PAGINACIÓN */}
        <div className="p-4 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            {t("showing_users", {
              count: paginatedData.length,
              total: filteredUsers.length,
            })}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-2 rounded-xl bg-white border border-slate-200 disabled:opacity-30 hover:bg-slate-50 transition-all shadow-sm"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-black text-slate-600 px-3">
              {currentPage} / {totalPages || 1}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
              className="p-2 rounded-xl bg-white border border-slate-200 disabled:opacity-30 hover:bg-slate-50 transition-all shadow-sm"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* VENTANA MODAL ASIGNACIÓN DE PRIVILEGIOS */}
      {/* VENTANA MODAL ASIGNACIÓN DE PRIVILEGIOS */}
      <AnimatePresence>
        {isOpen && createPortal(
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              // Cambia bg-slate-950/20 por un fondo sólido si no quieres ver nada de atrás
              className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-[2.5rem] w-full max-w-md shadow-2xl relative z-[51] border border-slate-100 flex flex-col min-h-[400px] overflow-hidden"
              // 'overflow-hidden' es clave para que los bordes redondeados no muestren contenido detrás
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 bg-blue-50 text-blue-600 rounded-xl">
                    <ShieldCheck size={18} />
                  </div>
                  <Title className="text-sm font-black text-slate-800 uppercase tracking-tight">
                    {t("modal.title")}
                  </Title>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {loadingModal ? (
                <div className="flex-1 flex flex-col items-center justify-center p-12 space-y-2">
                  <Loader2 className="animate-spin text-blue-600" size={24} />
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {t("loading.users")}
                  </span>
                </div>
              ) : (
                <div className="p-6 space-y-6 flex-1 w-full overflow-visible">
                  {/* 1. Selector de Usuario */}
                  <CustomSelect
                    label={t("modal.select_user")}
                    placeholder={t("modal.select_user")}
                    value={selectedUser}
                    options={odooUsersClean.map((u) => ({
                      key: u.id,
                      label: u.name,
                      subLabel: u.email, // <--- AHORA SÍ RECIBIRÁ EL EMAIL CORRECTAMENTE
                      cids: Array.isArray(u.company_ids)
                        ? u.company_ids.join(",")
                        : "",
                    }))}
                    onSelect={(opt: any) => {
                      setSelectedUser(opt);
                      setSelectedCids(opt.cids || "");
                      setSelectedCity(opt.cids || "");
                    }}
                    searchable={true}
                  />

                  {/* 2. Selector de Ciudad (Sede) */}
                  {selectedRole !== "1" && (
                    <div className="space-y-1.5 w-full">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">
                        {t("modal.select_city") || "Sede / Ciudad"}
                      </label>
                      <select
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                        value={selectedCity}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSelectedCity(val);
                          setSelectedCids(val);
                        }}
                      >
                        <option value="">{t("modal.select_city")}</option>
                        <option value="10">Caracas</option>
                        <option value="9">Valencia</option>
                        <option value="7">Panamá</option>
                      </select>
                    </div>
                  )}

                  {/* 3. Selector de Rol */}
                  <CustomSelect
                    label={t("modal.select_role_label")}
                    placeholder={t("modal.select_role_placeholder")}
                    value={
                      selectedRole
                        ? {
                            key: selectedRole,
                            label: dbRoles.find((r) => r.key === selectedRole)
                              ?.displayName,
                          }
                        : null
                    }
                    options={dbRoles.map((r) => ({
                      key: r.key,
                      label: r.displayName || r.name,
                    }))}
                    onSelect={(opt: any) => setSelectedRole(opt.key)}
                    searchable={false}
                  />
                </div>
              )}

              {/* Botones de control */}
              <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-2.5">
                <button
                  disabled={submitting}
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:bg-slate-200/40 transition-colors"
                >
                  {t("modal.cancel")}
                </button>
                <button
                  disabled={!selectedUser || !selectedRole || submitting}
                  onClick={handleAssignRole}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-slate-950 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors shadow-md disabled:opacity-40 flex items-center gap-1.5"
                >
                  {submitting ? (
                    <Loader2 className="animate-spin" size={12} />
                  ) : (
                    <Check size={12} />
                  )}
                  {t("modal.confirm")}
                </button>
              </div>
            </motion.div>
          </div>,
          document.body,
        )}
      </AnimatePresence>
    </div>
  );
}
