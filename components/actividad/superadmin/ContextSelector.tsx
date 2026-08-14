"use client";

import { useAuthStore } from "@/lib/stores/auth.store";
import { useEffect } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function ContextSelector({
  onFilterChange,
  selectedUserId,
}: any) {
  const { user } = useAuthStore();
  // Llamamos a la API de superadmin, pero el filtrado ocurrirá en el frontend
  const {
    data: users,
    isLoading,
    error,
  } = useSWR("/api/superadmin/users-full", fetcher);

  // Normalización de la lista de usuarios recibida de la API
  const userList = Array.isArray(users)
    ? users
    : users?.data || users?.users || [];

  // Lógica de filtrado por jerarquía
  const filteredUsers = userList.filter((u: any) => {
    // Si eres superAdmin, ves a todos
    if (user?.role === "superAdmin") return true;

    // Convertimos a Number para comparar manzanas con manzanas
    // Si tu Gerente tiene cids: 9, verá a los de Valencia
    return Number(u.cids) === Number(user?.cids);
  });

  // Agrupación para el select
  const groupedUsers = filteredUsers.reduce((acc: any, u: any) => {
    const cidsName = u.cids_name || "Sin Empresa";
    const roleName = u.role_name || "Sin Rol";

    if (!acc[cidsName]) acc[cidsName] = {};
    if (!acc[cidsName][roleName]) acc[cidsName][roleName] = [];

    acc[cidsName][roleName].push(u);
    return acc;
  }, {});

  // Debugging para desarrollo
  useEffect(() => {
    if (error) console.error("Error cargando usuarios:", error);
    if (!isLoading)
      console.log("Usuarios filtrados para gerente:", filteredUsers);
  }, [users, error, isLoading, filteredUsers]);

  return (
    <div className="flex gap-4 p-2 bg-white rounded-2xl border shadow-sm items-center">
      <select
        className="p-2 border rounded-xl text-sm min-w-[250px] outline-none"
        value={selectedUserId || ""}
        onChange={(e) => onFilterChange({ userId: e.target.value })}
      >
        <option value="">
          {isLoading ? "Cargando usuarios..." : "Seleccionar Usuario..."}
        </option>

        {!isLoading &&
          Object.entries(groupedUsers).map(([empresa, roles]: any) => (
            <optgroup key={empresa} label={`🏢 ${empresa}`}>
              {Object.entries(roles).map(([rol, usersList]: any) =>
                usersList.map((u: any) => (
                  <option key={u.id} value={u.id}>
                    {`└─ [${rol}] ${u.name}`}
                  </option>
                )),
              )}
            </optgroup>
          ))}
      </select>
    </div>
  );
}
