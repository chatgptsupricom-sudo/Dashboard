'use client';

import { motion } from 'framer-motion';
import { Calendar, Plus } from 'lucide-react';

export function ActivitiesPageClient() {
  const activities = [
    { id: 1, title: 'Activación Marca A', date: '2024-05-15', zone: 'Zona Norte' },
    { id: 2, title: 'Lanzamiento Producto B', date: '2024-05-20', zone: 'Zona Centro' },
    { id: 3, title: 'Capacitación Vendedores', date: '2024-05-25', zone: 'Zona Sur' },
  ];

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Calendario de Actividades</h1>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            <Plus size={20} />
            Nueva Actividad
          </motion.button>
        </div>

        {/* Calendario visual */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-lg shadow p-6 mb-6"
        >
          <div className="flex items-center justify-between mb-4">
            <Calendar size={24} className="text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">Mayo 2024</h2>
          </div>
          <div className="grid grid-cols-7 gap-2 mb-4">
            {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((day) => (
              <div key={day} className="text-center font-semibold text-gray-600 text-sm py-2">
                {day}
              </div>
            ))}
            {Array.from({ length: 31 }).map((_, i) => (
              <motion.div
                key={i}
                whileHover={{ scale: 1.1 }}
                className={`p-2 text-center rounded ${
                  [14, 19, 24].includes(i + 1)
                    ? 'bg-blue-100 border-2 border-blue-500 font-semibold'
                    : 'bg-gray-50 border border-gray-200'
                } cursor-pointer hover:bg-gray-100 transition`}
              >
                {i + 1}
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Lista de actividades */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-3"
        >
          {activities.map((activity) => (
            <motion.div
              key={activity.id}
              whileHover={{ x: 4 }}
              className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-600 hover:shadow-lg transition"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{activity.title}</p>
                  <p className="text-sm text-gray-600 mt-1">{activity.zone}</p>
                </div>
                <p className="text-sm font-semibold text-blue-600">{activity.date}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </motion.div>
    </div>
  );
}
