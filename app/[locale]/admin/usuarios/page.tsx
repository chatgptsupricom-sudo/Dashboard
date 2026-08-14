"use client";

import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export default function UserManagement() {
  const [users, setUsers] = useState<any[]>([]);
  const [dbRoles, setDbRoles] = useState<string[]>([]); // Roles desde la DB
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState("");
  const [odooRoleFilter, setOdooRoleFilter] = useState("Todos");
  const [panelRoleFilter, setPanelRoleFilter] = useState("Todos");
  const [statusFilter, setStatusFilter] = useState("Todos");

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Hook para manejar el tamaño de página responsivo
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width >= 1280)
        setItemsPerPage(10); // Desktop
      else if (width >= 1024)
        setItemsPerPage(7); // Laptop
      else if (width >= 768)
        setItemsPerPage(4); // Tablet
      else setItemsPerPage(3); // Mobile
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = () => {
    setLoading(true);
    fetch("/api/superadmin/users")
      .then((res) => res.json())
      .then((data) => {
        // Ahora la data trae { users, availableRoles }
        if (data.users) setUsers(data.users);
        if (data.availableRoles) setDbRoles(data.availableRoles);
      })
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  };

  // Lógica de filtrado con useMemo para rendimiento
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch =
        u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesOdooRole =
        odooRoleFilter === "Todos" || u.role === odooRoleFilter;
      const matchesPanelRole =
        panelRoleFilter === "Todos" || u.panelRole === panelRoleFilter;
      const matchesStatus =
        statusFilter === "Todos" || u.odooStatus === statusFilter;
      return (
        matchesSearch && matchesOdooRole && matchesPanelRole && matchesStatus
      );
    });
  }, [users, searchTerm, odooRoleFilter, panelRoleFilter, statusFilter]);

  // Cálculos de paginación
  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const paginatedData = filteredUsers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  // Reiniciar página cuando cambian los filtros
  useEffect(
    () => setCurrentPage(1),
    [searchTerm, odooRoleFilter, panelRoleFilter, statusFilter],
  );

  if (loading)
    return (
      <div className="p-10 text-center font-bold text-slate-400 uppercase animate-pulse">
        Sincronizando Usuarios...
      </div>
    );

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
              placeholder="Buscar usuario..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* SELECT DINÁMICO DE ROLES (MYSQL) */}
          <select
            className="bg-slate-50 border-none rounded-2xl text-xs font-bold px-4 py-2.5 "
            value={panelRoleFilter}
            onChange={(e) => setPanelRoleFilter(e.target.value)}
          >
            <option value="Todos">Todos los Roles Panel</option>
            {dbRoles.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
            <option value="Sin Acceso">Sin Acceso</option>
          </select>

          {/* Filtro Rol Odoo */}
          <select
            className="bg-slate-50 border-none rounded-2xl text-xs font-bold px-4 py-2.5 text-slate-600 focus:ring-2 focus:ring-blue-500"
            value={odooRoleFilter}
            onChange={(e) => setOdooRoleFilter(e.target.value)}
          >
            <option value="Todos">Rol Odoo (Todos)</option>
            <option value="Interno">Internos</option>
            <option value="Portal">Portal</option>
          </select>

          {/* FILTRO ESTADO (ODOO) */}
          <select
            className="bg-slate-50 border-none rounded-2xl text-xs font-bold px-4 py-2.5 text-slate-600"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="Todos">Todos los Estados</option>
            <option value="Activo">Activo</option>
            <option value="Inactivo">Inactivo</option>
          </select>
        </div>
      </div>

      {/* TABLA DE USUARIOS */}
      <div className="bg-white rounded-3xl shadow-sm overflow-hidden border border-slate-100 flex flex-col min-h-[450px]">
        <div className="flex-1 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50/50 text-slate-400 uppercase text-[10px] font-black tracking-widest">
              <tr>
                <th className="px-6 py-5">Nombre</th>
                <th className="px-6 py-5">Correo</th>
                <th className="px-6 py-5 ">Rol Panel</th>
                <th className="px-6 py-5">Rol Odoo</th>
                <th className="px-6 py-5">Última Sesión</th>
                <th className="px-6 py-5 text-right">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {paginatedData.map((user) => (
                <tr
                  key={user.id}
                  className="hover:bg-slate-50/30 transition-colors"
                >
                  <td className="px-6 py-4 font-bold text-slate-700 text-sm">
                    {user.name}
                  </td>
                  <td className="px-6 py-4 text-slate-500 text-sm">
                    {user.email}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase shadow-sm border ${
                        user.panelRole === "Admin"
                          ? "bg-red-50 text-red-600 border-red-100"
                          : user.panelRole === "Sin Acceso"
                            ? "bg-slate-100 text-slate-400 border-slate-200"
                            : "bg-purple-50 text-purple-600 border-purple-100"
                      }`}
                    >
                      {user.panelRole}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase ${
                        user.role === "Interno"
                          ? "bg-blue-50 text-blue-600"
                          : "bg-cyan-50 text-cyan-600"
                      }`}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-400 text-[11px] italic">
                    {user.lastLogin}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${user.odooStatus === "Activo" ? "bg-green-500" : "bg-red-400"}`}
                      />
                      <span
                        className={`text-[11px] font-bold ${user.odooStatus === "Activo" ? "text-green-600" : "text-red-500"}`}
                      >
                        {user.odooStatus}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredUsers.length === 0 && (
            <div className="p-10 text-center text-slate-400 text-sm font-medium">
              Sin resultados.
            </div>
          )}
        </div>

        {/* PAGINACIÓN PROFESIONAL */}
        <div className="p-4 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Mostrando {paginatedData.length} de {filteredUsers.length} usuarios
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
    </div>
  );
}
