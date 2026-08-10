'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Plus, Trash2, CheckCircle, TestTube } from 'lucide-react';
import Link from 'next/link';

interface Column { name: string; displayName: string; description: string; dataType: string; isKey: boolean; isMeasure: boolean; }

export default function NewViewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('fact');
  const [sql, setSql] = useState('CREATE OR REPLACE VIEW semantic_layer. AS\nSELECT\n\nFROM ');
  const [columns, setColumns] = useState<Column[]>([{ name: '', displayName: '', description: '', dataType: 'string', isKey: false, isMeasure: false }]);

  function addColumn() { setColumns(prev => [...prev, { name: '', displayName: '', description: '', dataType: 'string', isKey: false, isMeasure: false }]); }
  function updateColumn(i: number, field: keyof Column, value: any) { setColumns(prev => prev.map((c, j) => j === i ? { ...c, [field]: value } : c)); }
  function removeColumn(i: number) { setColumns(prev => prev.filter((_, j) => j !== i)); }

  async function handleSave() {
    setLoading(true);
    try {
      const res = await fetch(`/api/models/${id}/views`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, displayName, description, type, sql, columns }) });
      if (res.ok) router.push(`/models/${id}`);
    } catch {}
    setLoading(false);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 py-5 border-b border-gray-200 bg-white flex items-center gap-4">
        <Link href={`/models/${id}`} className="text-gray-400 hover:text-gray-600"><ArrowLeft className="w-5 h-5" /></Link>
        <h1 className="text-lg font-semibold text-gray-900">Ny vy</h1>
      </div>
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-3xl space-y-6">
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <h2 className="font-semibold text-gray-900">Vyinformation</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vynamn (i DB) *</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="t.ex. order_fact"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Affärsnamn *</label>
                <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="t.ex. Orderinformation"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Beskrivning</label>
                <input value={description} onChange={e => setDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
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
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-3">
            <h2 className="font-semibold text-gray-900">SQL-definition</h2>
            <textarea value={sql} onChange={e => setSql(e.target.value)} rows={8}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-900 text-green-400 resize-none" />
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Kolumner</h2>
              <button onClick={addColumn} className="flex items-center gap-1.5 text-sm text-indigo-600 hover:underline">
                <Plus className="w-4 h-4" /> Lägg till
              </button>
            </div>
            <div className="space-y-3">
              {columns.map((col, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center border border-gray-100 rounded-lg p-3 bg-gray-50">
                  <div className="col-span-3">
                    <input value={col.name} onChange={e => updateColumn(i, 'name', e.target.value)} placeholder="kolumnnamn"
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs font-mono" />
                  </div>
                  <div className="col-span-3">
                    <input value={col.displayName} onChange={e => updateColumn(i, 'displayName', e.target.value)} placeholder="Affärsnamn"
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs" />
                  </div>
                  <div className="col-span-2">
                    <select value={col.dataType} onChange={e => updateColumn(i, 'dataType', e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs">
                      <option value="string">Text</option>
                      <option value="number">Nummer</option>
                      <option value="date">Datum</option>
                      <option value="boolean">Boolean</option>
                    </select>
                  </div>
                  <div className="col-span-3 flex items-center gap-3">
                    <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                      <input type="checkbox" checked={col.isKey} onChange={e => updateColumn(i, 'isKey', e.target.checked)} /> Nyckel
                    </label>
                    <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                      <input type="checkbox" checked={col.isMeasure} onChange={e => updateColumn(i, 'isMeasure', e.target.checked)} /> Mått
                    </label>
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <button onClick={() => removeColumn(i)} className="p-1 text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Link href={`/models/${id}`} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Avbryt</Link>
            <button onClick={handleSave} disabled={loading || !name || !displayName}
              className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />} Spara vy
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
