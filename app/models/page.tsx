'use client';
import { useState, useEffect } from 'react';
import { usePageHeader } from '@/contexts/PageHeaderContext';
import { Plus, Database, Clock, Loader2, ChevronRight, Trash2 } from 'lucide-react';
import Link from 'next/link';

interface Model {
  id: number;
  name: string;
  description: string | null;
  sourceType: string;
  status: string;
  updatedAt: string;
  _count?: { views: number };
}

const statusColors: Record<string, string> = {
  draft: 'bg-amber-50 text-amber-600 border-amber-200',
  published: 'bg-green-50 text-green-600 border-green-200',
  archived: 'bg-gray-50 text-gray-500 border-gray-200',
};

const statusLabels: Record<string, string> = {
  draft: 'Utkast',
  published: 'Publicerad',
  archived: 'Arkiverad',
};

const sourceColors: Record<string, string> = {
  postgres: '#336791',
  sqlserver: '#e74c3c',
  mysql: '#f29111',
  sqlite: '#003B57',
};

export default function ModelsPage() {
  const [deletingModel, setDeletingModel] = useState<{id: number; name: string} | null>(null);
  const { setHeader } = usePageHeader();
  const [models, setModels] = useState<Model[]>([]);
  useEffect(() => { setHeader('Semantiska modeller', `${models.length} modell${models.length !== 1 ? 'er' : ''}`); }, [models.length]);
  const [loading, setLoading] = useState(true);

  async function deleteModel(e: React.MouseEvent, modelId: number, modelName: string) {
    e.preventDefault();
    e.stopPropagation();
    setDeletingModel({id: modelId, name: modelName});
  }

  async function confirmDeleteModel() {
    if (!deletingModel) return;
    const modelId = deletingModel.id;
    setDeletingModel(null);
    await fetch(`/api/models/${modelId}`, { method: 'DELETE' });
    setModels(prev => prev.filter(m => m.id !== modelId));
  }

  useEffect(() => {
    fetch('/api/models').then(r => r.json()).then(data => { setModels(data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  return (
    <>
    {deletingModel && (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-2">Ta bort modell</h3>
          <p className="text-sm text-gray-500 mb-2">Ta bort <span className="font-medium text-gray-700">"{deletingModel.name}"</span>?</p>
          <p className="text-sm text-amber-600 mb-6">Vyerna i databasen påverkas inte – bara metadata i Studio tas bort.</p>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setDeletingModel(null)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Avbryt</button>
            <button onClick={confirmDeleteModel} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">Ta bort</button>
          </div>
        </div>
      </div>
    )}
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-8">

        {loading ? (
          <div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
        ) : models.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Database className="w-12 h-12 text-gray-200 mb-4" />
            <h3 className="font-semibold text-gray-900 mb-2">Inga modeller ännu</h3>
            <p className="text-sm text-gray-500 mb-6">Skapa din första semantiska modell</p>
            <Link href="/models/new" className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
              <Plus className="w-4 h-4" /> Skapa modell
            </Link>
          </div>
        ) : (
          <>
          <div className="flex gap-6 w-full">
            <div className="flex-1 space-y-3">
            {models.map(model => {
              console.log('sourceType:', model.sourceType, 'color:', sourceColors[model.sourceType]);
              return (
              <Link key={model.id} href={model._count?.views === 0 ? `/models/new?resume=${model.id}` : `/models/${model.id}`}
                className="block bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow group">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: sourceColors[model.sourceType] ?? '#6b7280' }}>
                      <Database size={20} stroke="white" strokeWidth={1.5} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900">{model.name}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${statusColors[model.status]}`}>{statusLabels[model.status] ?? model.status}</span>
                        {model._count?.views === 0 && (
                          <span className="text-xs px-2 py-0.5 rounded-full border bg-gray-50 text-gray-400 border-gray-200">Ofärdig</span>
                        )}
                      </div>
                      {model.description && <p className="text-sm text-gray-500 mt-0.5">{model.description}</p>}
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                        <span className="flex items-center gap-1"><Database className="w-3 h-3" />{model.sourceType}</span>
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(model.updatedAt).toLocaleDateString('sv-SE')}</span>
                        {model._count && <span>{model._count.views} vyer</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={e => deleteModel(e, model.id, model.name)}
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-gray-500 transition-colors" />
                  </div>
                </div>
              </Link>
            );
            })}
            </div>
            <div className="w-40 flex-shrink-0">
              <Link href="/models/new" className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 w-full justify-center">
                <Plus className="w-4 h-4" /> Ny modell
              </Link>
            </div>
          </div>
          </>
        )}
      </div>
    </div>
    </>
  );
}
