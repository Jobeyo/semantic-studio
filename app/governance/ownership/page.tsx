'use client';
import { useState, useEffect } from 'react';
import { Users, Database, Edit2, Save, X, Mail, User } from 'lucide-react';

interface Model {
  id: number;
  name: string;
  description: string;
  status: string;
  owner: string | null;
  ownerEmail: string | null;
  _count: { views: number };
}

export default function OwnershipPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editOwner, setEditOwner] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/models')
      .then(r => r.json())
      .then(data => { setModels(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  function startEdit(model: Model) {
    setEditingId(model.id);
    setEditOwner(model.owner ?? '');
    setEditEmail(model.ownerEmail ?? '');
  }

  async function saveOwnership(id: number) {
    setSaving(true);
    try {
      const res = await fetch(`/api/models/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner: editOwner, ownerEmail: editEmail }),
      });
      if (res.ok) {
        setModels(prev => prev.map(m => m.id === id ? { ...m, owner: editOwner, ownerEmail: editEmail } : m));
        setEditingId(null);
      }
    } catch {}
    setSaving(false);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 py-6 border-b border-gray-200 bg-white">
        <h1 className="text-xl font-semibold text-gray-900">Ownership</h1>
        <p className="text-sm text-gray-500 mt-1">Hantera ägarskap och ansvar för datamodeller</p>
      </div>
      <div className="flex-1 overflow-y-auto p-8">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">Laddar...</div>
        ) : (
          <div className="max-w-4xl space-y-3">
            {models.map(model => (
              <div key={model.id} className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                      <Database className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{model.name}</h3>
                      <p className="text-xs text-gray-400">{model._count?.views ?? 0} vyer · {model.status}</p>
                    </div>
                  </div>
                  {editingId !== model.id && (
                    <button onClick={() => startEdit(model)}
                      className="p-1.5 text-gray-400 hover:text-indigo-600">
                      <Edit2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {editingId === model.id ? (
                  <div className="mt-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Ansvarig person</label>
                        <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2">
                          <User className="w-4 h-4 text-gray-400" />
                          <input value={editOwner} onChange={e => setEditOwner(e.target.value)}
                            placeholder="Namn" className="flex-1 text-sm outline-none" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">E-post</label>
                        <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2">
                          <Mail className="w-4 h-4 text-gray-400" />
                          <input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)}
                            placeholder="namn@foretag.se" className="flex-1 text-sm outline-none" />
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setEditingId(null)}
                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                        <X className="w-4 h-4" />
                      </button>
                      <button onClick={() => saveOwnership(model.id)} disabled={saving}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50">
                        <Save className="w-4 h-4" /> Spara
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex items-center gap-4">
                    {model.owner ? (
                      <>
                        <span className="flex items-center gap-1.5 text-sm text-gray-600">
                          <User className="w-3.5 h-3.5 text-gray-400" /> {model.owner}
                        </span>
                        {model.ownerEmail && (
                          <a href={`mailto:${model.ownerEmail}`}
                            className="flex items-center gap-1.5 text-sm text-indigo-600 hover:underline">
                            <Mail className="w-3.5 h-3.5" /> {model.ownerEmail}
                          </a>
                        )}
                      </>
                    ) : (
                      <span className="text-sm text-gray-400 italic">Ingen ansvarig satt – klicka på pennan för att lägga till</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
