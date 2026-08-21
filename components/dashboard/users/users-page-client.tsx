'use client';

import { useAuthStore } from '@/lib/stores/auth.store';
import { UserRole } from '@/lib/types';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { Plus, Edit2, Trash2, Check, X } from 'lucide-react';

const mockUsers = [
  { id: '1', name: 'Juan Pérez', email: 'juan@supricom.com', role: UserRole.PRESIDENCY, active: true },
  { id: '2', name: 'María García', email: 'maria@supricom.com', role: UserRole.BRAND_MANAGEMENT, active: true },
  { id: '3', name: 'Carlos López', email: 'carlos@supricom.com', role: UserRole.MARKETING, active: true },
];

export function UsersPageClient() {
  const { user } = useAuthStore();
  const [users, setUsers] = useState(mockUsers);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const canManageUsers = user?.role === UserRole.PROGRAMMERS || user?.role === UserRole.PRESIDENCY;

  if (!canManageUsers) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-yellow-800"
      >
        <p>No tienes permisos para gestionar usuarios.</p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Gestión de Usuarios</h1>
          <motion.button
            onClick={() => setShowForm(!showForm)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            <Plus size={20} />
            Nuevo Usuario
          </motion.button>
        </div>

        {/* Form */}
        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-lg shadow p-6 mb-6"
          >
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              {editingId ? 'Editar Usuario' : 'Crear Nuevo Usuario'}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                type="text"
                placeholder="Nombre completo"
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="email"
                placeholder="Correo electrónico"
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <select className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Seleccionar rol...</option>
                <option value={UserRole.PRESIDENCY}>Presidencia</option>
                <option value={UserRole.BRAND_MANAGEMENT}>Gerencia de Marca</option>
                <option value={UserRole.MARKETING}>Mercadeo</option>
                <option value={UserRole.PROGRAMMERS}>Programadores</option>
              </select>
              <input
                type="password"
                placeholder="Contraseña"
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-2 mt-4">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
              >
                {editingId ? 'Actualizar' : 'Crear'} Usuario
              </motion.button>
              <motion.button
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="bg-gray-300 text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-400"
              >
                Cancelar
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* Users Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Nombre</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Email</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Rol</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Estado</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {users.map((u) => (
                <motion.tr
                  key={u.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="hover:bg-gray-50 transition"
                >
                  <td className="px-6 py-4 text-sm text-gray-900">{u.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{u.email}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-semibold">
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {u.active ? (
                      <span className="flex items-center gap-1 text-green-600">
                        <Check size={16} /> Activo
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-red-600">
                        <X size={16} /> Inactivo
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm space-x-2">
                    <motion.button
                      onClick={() => setEditingId(u.id)}
                      whileHover={{ scale: 1.1 }}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      <Edit2 size={16} />
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      className="text-red-600 hover:text-red-900"
                    >
                      <Trash2 size={16} />
                    </motion.button>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
