'use client';

import { motion } from 'framer-motion';
import { BarChart3, TrendingUp, Users } from 'lucide-react';

export function ReportsPageClient() {
  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Reportes de Ventas</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-lg shadow p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Top 5 Zonas Más Vendidas</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">Zona Metropolitana</p>
              </div>
              <BarChart3 size={40} className="text-blue-600 opacity-20" />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-lg shadow p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Top 3 Vendedores</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">1,240 ventas</p>
              </div>
              <TrendingUp size={40} className="text-green-600 opacity-20" />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-lg shadow p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Clientes Activos</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">385 clientes</p>
              </div>
              <Users size={40} className="text-purple-600 opacity-20" />
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-lg shadow p-6 mt-6"
        >
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Filtrar Reportes</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <select className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option>Por Marca</option>
              <option>Marca A</option>
              <option>Marca B</option>
            </select>
            <select className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option>Por Tipo de Producto</option>
              <option>Categoría 1</option>
              <option>Categoría 2</option>
            </select>
            <select className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option>Por Período</option>
              <option>Este Mes</option>
              <option>Último Trimestre</option>
            </select>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
