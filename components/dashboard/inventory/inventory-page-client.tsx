'use client';

import { motion } from 'framer-motion';
import { Package, AlertTriangle } from 'lucide-react';

export function InventoryPageClient() {
  const inventory = [
    { id: 1, name: 'POP Stand Marca A', quantity: 45, minStock: 20, zone: 'Zona Norte' },
    { id: 2, name: 'Banners Promocionales', quantity: 12, minStock: 30, zone: 'Zona Centro' },
    { id: 3, name: 'Exhibidor de Producto', quantity: 8, minStock: 15, zone: 'Zona Sur' },
    { id: 4, name: 'Material de Punto Venta', quantity: 120, minStock: 50, zone: 'General' },
  ];

  const lowStockItems = inventory.filter((item) => item.quantity < item.minStock);

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Inventario de Stock Publicitario</h1>

        {/* Alert for low stock */}
        {lowStockItems.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-lg mb-6"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-yellow-800">{lowStockItems.length} artículos con stock bajo</p>
                <p className="text-sm text-yellow-700 mt-1">Necesitan reorden inmediata</p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Inventory Table */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-lg shadow overflow-hidden"
        >
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Artículo</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Stock Actual</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Stock Mínimo</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Zona</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {inventory.map((item) => {
                const isLowStock = item.quantity < item.minStock;
                return (
                  <motion.tr
                    key={item.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className={`${isLowStock ? 'bg-yellow-50' : ''} hover:bg-gray-50 transition`}
                  >
                    <td className="px-6 py-4 text-sm text-gray-900 font-medium">{item.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      <span className={`inline-flex items-center gap-1 ${isLowStock ? 'text-red-600 font-semibold' : ''}`}>
                        <Package size={16} />
                        {item.quantity}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{item.minStock}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{item.zone}</td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                        isLowStock
                          ? 'bg-red-100 text-red-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {isLowStock ? 'Stock Bajo' : 'OK'}
                      </span>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </motion.div>
      </motion.div>
    </div>
  );
}
