'use client';

import { useAuthStore } from '@/lib/stores/auth.store';
import { UserRole, AuditLog } from '@/lib/types';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { Filter, Download } from 'lucide-react';

const mockLogs: AuditLog[] = [
  {
    id: '1',
    userId: '1',
    userName: 'Juan Pérez',
    action: 'LOGIN',
    resource: 'USER',
    status: 'success',
    timestamp: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: '2',
    userId: '2',
    userName: 'María García',
    action: 'UPDATE',
    resource: 'PRODUCT',
    newValues: { name: 'Nuevo Producto', price: 100 },
    status: 'success',
    timestamp: new Date(Date.now() - 7200000).toISOString(),
  },
  {
    id: '3',
    userId: '3',
    userName: 'Carlos López',
    action: 'CREATE',
    resource: 'USER',
    newValues: { email: 'new@supricom.com', role: 'marketing' },
    status: 'success',
    timestamp: new Date(Date.now() - 10800000).toISOString(),
  },
  {
    id: '4',
    userId: '1',
    userName: 'Juan Pérez',
    action: 'DELETE',
    resource: 'DOCUMENT',
    oldValues: { id: '123', name: 'Old File' },
    status: 'success',
    timestamp: new Date(Date.now() - 14400000).toISOString(),
  },
];

export function AuditPageClient() {
  const { user } = useAuthStore();
  const [logs, setLogs] = useState(mockLogs);
  const [filterAction, setFilterAction] = useState('');
  const [filterUser, setFilterUser] = useState('');

  const canViewAudit =
    user?.role === UserRole.PRESIDENCY ||
    user?.role === UserRole.AUDIT ||
    user?.role === UserRole.PROGRAMMERS ||
    user?.role === UserRole.MARKETING_MANAGEMENT;

  if (!canViewAudit) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-yellow-800"
      >
        <p>No tienes permisos para ver la auditoría.</p>
      </motion.div>
    );
  }

  const filteredLogs = logs.filter((log) => {
    if (filterAction && log.action !== filterAction) return false;
    if (filterUser && log.userName.toLowerCase() !== filterUser.toLowerCase()) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Registro de Auditoría</h1>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            <Download size={20} />
            Descargar Reporte
          </motion.button>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Filter size={20} className="text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">Filtros</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Acción</label>
              <select
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Todas las acciones</option>
                <option value="LOGIN">Login</option>
                <option value="CREATE">Crear</option>
                <option value="UPDATE">Actualizar</option>
                <option value="DELETE">Eliminar</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Usuario</label>
              <input
                type="text"
                value={filterUser}
                onChange={(e) => setFilterUser(e.target.value)}
                placeholder="Filtrar por usuario..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-end">
              <motion.button
                onClick={() => {
                  setFilterAction('');
                  setFilterUser('');
                }}
                whileHover={{ scale: 1.05 }}
                className="w-full bg-gray-300 text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-400"
              >
                Limpiar Filtros
              </motion.button>
            </div>
          </div>
        </div>

        {/* Logs Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Fecha/Hora</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Usuario</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Acción</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Recurso</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredLogs.map((log) => (
                <motion.tr
                  key={log.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="hover:bg-gray-50 transition"
                >
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {new Date(log.timestamp).toLocaleString('es-ES')}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 font-medium">{log.userName}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      log.action === 'LOGIN' ? 'bg-blue-100 text-blue-800' :
                      log.action === 'CREATE' ? 'bg-green-100 text-green-800' :
                      log.action === 'UPDATE' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{log.resource}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      log.status === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {log.status === 'success' ? 'Exitoso' : 'Fallido'}
                    </span>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="text-sm text-gray-600 mt-4">
          Mostrando {filteredLogs.length} de {logs.length} registros
        </div>
      </motion.div>
    </div>
  );
}
