'use client';
import { useState, useEffect } from 'react';
import { Plus, Database, Clock, Loader2, ChevronRight } from 'lucide-react';
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
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/models').then(r => r.json()).then(data => { setModels(data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 py-5 border-b border-gray-200 bg-white flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Semantiska modeller</h1>
          <p className="text-sm text-gray-500">{models.length} modell{models.length !== 1 ? 'er' : ''}</p>
        </div>
        <Link href="/models/new" className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
          <Plus className="w-4 h-4" /> Ny modell
        </Link>
      </div>
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
          <div className="space-y-3 max-w-4xl">
            {models.map(model => {
              console.log('sourceType:', model.sourceType, 'color:', sourceColors[model.sourceType]);
              return (
              <Link key={model.id} href={`/models/${model.id}`}
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
                      </div>
                      {model.description && <p className="text-sm text-gray-500 mt-0.5">{model.description}</p>}
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                        <span className="flex items-center gap-1"><Database className="w-3 h-3" />{model.sourceType}</span>
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(model.updatedAt).toLocaleDateString('sv-SE')}</span>
                        {model._count && <span>{model._count.views} vyer</span>}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-gray-500 transition-colors" />
                </div>
              </Link>
            );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
