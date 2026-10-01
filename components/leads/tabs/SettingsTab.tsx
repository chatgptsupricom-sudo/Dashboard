import React from 'react';
import { Plus, X } from 'lucide-react';
import { Column } from '../types';

interface SettingsTabProps {
  columns: Column[];
  handleReorderColumn: (id: string, direction: 'up' | 'down') => void;
  handleRemoveColumn: (id: string) => void;
  handleAddColumn: (e: React.FormEvent) => void;
  isAddingCol: boolean;
  setIsAddingCol: (v: boolean) => void;
  newColTitle: string;
  setNewColTitle: (v: string) => void;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  columns,
  handleReorderColumn,
  handleRemoveColumn,
  handleAddColumn,
  isAddingCol,
  setIsAddingCol,
  newColTitle,
  setNewColTitle,
}) => {
  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-zinc-200/80 shadow-xs">
        <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">Gestión de Columnas / Fases</h3>
        <div className="space-y-2 mb-6">
          {columns.map((col, index, arr) => (
            <div key={col.id} className="flex items-center gap-3 p-3 bg-zinc-50 rounded-xl border border-zinc-100">
              <span className={`w-3 h-3 rounded-full ${col.color} flex-shrink-0`} />
              <span className="text-sm font-bold text-zinc-800 flex-1">{col.title}</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleReorderColumn(col.id, 'up')}
                  disabled={index === 0}
                  className="p-1.5 rounded-lg hover:bg-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-500"
                  title="Subir"
                >▲</button>
                <button
                  onClick={() => handleReorderColumn(col.id, 'down')}
                  disabled={index === arr.length - 1}
                  className="p-1.5 rounded-lg hover:bg-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-500"
                  title="Bajar"
                >▼</button>
                {col.id !== 'NUEVO' && col.id !== 'CONTACTADO' && col.id !== 'CERRADO' && (
                  <button
                    onClick={() => { if (confirm(`¿Eliminar la fase "${col.title}"?`)) handleRemoveColumn(col.id); }}
                    className="p-1.5 rounded-lg hover:bg-red-100 text-red-400 hover:text-red-600 ml-1"
                    title="Eliminar"
                  ><X className="w-4 h-4" /></button>
                )}
              </div>
            </div>
          ))}
        </div>

        {isAddingCol ? (
          <form onSubmit={handleAddColumn} className="flex items-center gap-2">
            <input
              type="text"
              value={newColTitle}
              onChange={e => setNewColTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') { setIsAddingCol(false); setNewColTitle(''); } }}
              placeholder="Nombre de la fase..."
              className="flex-1 px-3 py-2 text-sm border rounded-xl bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-blue-300"
              autoFocus
            />
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl">Agregar</button>
            <button type="button" onClick={() => { setIsAddingCol(false); setNewColTitle(''); }} className="px-4 py-2 border text-xs font-bold rounded-xl text-zinc-600">Cancelar</button>
          </form>
        ) : (
          <button
            onClick={() => setIsAddingCol(true)}
            className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-zinc-300 hover:border-blue-400 text-zinc-500 hover:text-blue-600 text-xs font-bold rounded-xl w-full justify-center transition-colors"
          >
            <Plus className="w-4 h-4" /> Nueva Fase
          </button>
        )}
      </div>
    </div>
  );
};
