'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Plus, Trash2, Save } from 'lucide-react';
import Link from 'next/link';

interface Column {
  id: number;
  name: string;
  displayName: string;
  description: string | null;
  dataType: string;
  isKey: boolean;
  isMeasure: boolean;
  format: string | null;
}

interface View {
  id: number;
  name: string;
  displayName: string;
  description: string | null;
  type: string;
  sql: string;
  columns: Column[];
}

export default function EditViewPage() {
  const { id, viewId } = useParams<{ id: string; viewId: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<View | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('fact');
  const [sql, setSql] = useState('');
  const [columns, setColumns] = useState<Column[]>([]);

  useEffect(() => {
    fetch(`/api/models/${id}/views/${viewId}`)
      .then(r => r.json())
      .then(data => {
        setView(data);
        setDisplayName(data.displayName);
        setDescription(data.description ?? '');
        setType(data.type);
        setSql(data.sql);
        setColumns(data.columns);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id, viewId]);

  function updateColumn(i: number, field: keyof Column, value: any) {
    setColumns(prev => prev.map((c, j) => j === i ? { ...c, [field]: value } : c));
  }

  function addColumn() {
    setColumns(prev => [...prev, { id: -Date.now(), name: '', displayName: '', description: null, dataType: 'string', isKey: false, isMeasure: false, format: null }]);
  }

  function removeColumn(i: number) {
    setColumns(prev => prev.filter((_, j) => j !== i));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await fetch(`/api/models/${id}/views/${viewId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, description, type, sql, columns }),
      });
      router.push(`/models/${id}`);
    } catch {}
    setSaving(false);
  }

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  if (!view) return <div className="flex items-center justify-center h-full text-gray-400">Vyn hittades inte</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 py-5 border-b border-gray-200 bg-white flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/models/${id}`} className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Redigera vy</h1>
            <p className="text-sm text-gray-400 font-mono">{view.name}</p>
          </div>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Spara ändringar
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-3xl space-y-6">

          {/* Metadata */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <h2 className="font-semibold text-gray-900">Metadata</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vynamn (i DB)</label>
                <input value={view.name} disabled
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono bg-gray-50 text-gray-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Affärsnamn *</label>
                <input value={displayName} onChange={e => setDisplayName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Beskrivning</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Typ</label>
                <select value={type} onChange={e => setType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="fact">Faktatabell</option>
                  <option value="dimension">Dimension</option>
                  <option value="measure">Mått</option>
                </select>
              </div>
            </div>
          </div>

          {/* SQL */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-3">
            <h2 className="font-semibold text-gray-900">SQL-definition</h2>
            <textarea value={sql} onChange={e => setSql(e.target.value)} rows={10}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-900 text-green-400 resize-none" />
          </div>

          {/* Kolumner */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Kolumner ({columns.length})</h2>
              <button onClick={addColumn} className="flex items-center gap-1.5 text-sm text-indigo-600 hover:underline">
                <Plus className="w-4 h-4" /> Lägg till
              </button>
            </div>
            <div className="space-y-2">
              {columns.map((col, i) => (
                <div key={col.id} className="grid grid-cols-12 gap-2 items-center border border-gray-100 rounded-lg p-3 bg-gray-50">
                  <div className="col-span-3">
                    <input value={col.name} onChange={e => updateColumn(i, 'name', e.target.value)}
                      placeholder="kolumnnamn" className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                  </div>
                  <div className="col-span-3">
                    <input value={col.displayName} onChange={e => updateColumn(i, 'displayName', e.target.value)}
                      placeholder="Affärsnamn" className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                  </div>
                  <div className="col-span-3">
                    <input value={col.description ?? ''} onChange={e => updateColumn(i, 'description', e.target.value)}
                      placeholder="Beskrivning" className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                  </div>
                  <div className="col-span-1">
                    <select value={col.dataType} onChange={e => updateColumn(i, 'dataType', e.target.value)}
                      className="w-full px-1 py-1.5 border border-gray-300 rounded text-xs focus:outline-none">
                      <option value="string">Text</option>
                      <option value="number">Num</option>
                      <option value="date">Datum</option>
                      <option value="boolean">Bool</option>
                    </select>
                  </div>
                  <div className="col-span-1 flex gap-1">
                    <label className="flex items-center gap-0.5 text-xs text-gray-500 cursor-pointer" title="Nyckel">
                      <input type="checkbox" checked={col.isKey} onChange={e => updateColumn(i, 'isKey', e.target.checked)} className="w-3 h-3" /> K
                    </label>
                    <label className="flex items-center gap-0.5 text-xs text-gray-500 cursor-pointer" title="Mått">
                      <input type="checkbox" checked={col.isMeasure} onChange={e => updateColumn(i, 'isMeasure', e.target.checked)} className="w-3 h-3" /> M
                    </label>
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <button onClick={() => removeColumn(i)} className="p-1 text-red-400 hover:text-red-600">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
