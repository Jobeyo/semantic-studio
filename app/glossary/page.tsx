'use client';
import { useState, useEffect } from 'react';
import { BookOpen, Sparkles, Plus, Trash2, Edit2, Loader2, CheckCircle, X } from 'lucide-react';

interface GlossaryTerm {
  id: number;
  name: string;
  definition: string;
  synonym: string | null;
  dataSource: string | null;
  type: string;
  createdBy: string;
  updatedBy: string | null;
  updatedAt: string;
  modelId: number | null;
}

interface Model { id: number; name: string; }

export default function GlossaryPage() {
  const [terms, setTerms] = useState<GlossaryTerm[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', definition: '', synonym: '', dataSource: '', type: 'concept' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/models').then(r => r.json()).then(m => setModels(m)).catch(() => {});
    loadTerms();
  }, []);

  async function loadTerms(modelId?: number) {
    setLoading(true);
    const url = modelId ? `/api/glossary?modelId=${modelId}` : '/api/glossary';
    const res = await fetch(url);
    if (res.ok) setTerms(await res.json());
    setLoading(false);
  }

  async function generate() {
    if (!selectedModelId) { alert('Välj en modell'); return; }
    setGenerating(true);
    const res = await fetch('/api/glossary/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId: selectedModelId }),
    });
    if (res.ok) await loadTerms(selectedModelId ?? undefined);
    else { const err = await res.json(); alert('Fel: ' + err.error); }
    setGenerating(false);
  }

  async function saveTerm() {
    if (!form.name || !form.definition) { alert('Namn och definition krävs'); return; }
    setSaving(true);
    if (editingId) {
      await fetch(`/api/glossary/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
    } else {
      await fetch('/api/glossary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, modelId: selectedModelId }),
      });
    }
    setShowAdd(false);
    setEditingId(null);
    setForm({ name: '', definition: '', synonym: '', dataSource: '', type: 'concept' });
    await loadTerms(selectedModelId ?? undefined);
    setSaving(false);
  }

  async function deleteTerm(id: number) {
    if (!confirm('Ta bort termen?')) return;
    await fetch(`/api/glossary/${id}`, { method: 'DELETE' });
    setTerms(prev => prev.filter(t => t.id !== id));
  }

  function startEdit(term: GlossaryTerm) {
    setEditingId(term.id);
    setForm({ name: term.name, definition: term.definition, synonym: term.synonym ?? '', dataSource: term.dataSource ?? '', type: term.type });
    setShowAdd(true);
  }

  const filtered = terms.filter(t =>
    (!search || t.name.toLowerCase().includes(search.toLowerCase()) || t.definition.toLowerCase().includes(search.toLowerCase())) &&
    (!filterType || t.type === filterType)
  );

  const typeLabel = (type: string) => ({ dimension: 'Dimension', measure: 'Mått', concept: 'Begrepp' }[type] ?? type);
  const typeColor = (type: string) => ({
    dimension: 'bg-purple-50 text-purple-700 border-purple-200',
    measure: 'bg-blue-50 text-blue-700 border-blue-200',
    concept: 'bg-gray-50 text-gray-700 border-gray-200',
  }[type] ?? 'bg-gray-50 text-gray-700 border-gray-200');

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 py-5 border-b border-gray-200 bg-white flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Business Glossary</h1>
          <p className="text-sm text-gray-500 mt-0.5">{terms.length} termer definierade</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={selectedModelId ?? ''} onChange={e => {
            const id = e.target.value ? parseInt(e.target.value) : null;
            setSelectedModelId(id);
            loadTerms(id ?? undefined);
          }} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">Alla modeller</option>
            {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <button onClick={generate} disabled={generating || !selectedModelId}
            className="flex items-center gap-2 px-4 py-2 border border-indigo-200 text-indigo-600 rounded-lg text-sm hover:bg-indigo-50 disabled:opacity-50">
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Generera med AI
          </button>
          <button onClick={() => { setShowAdd(true); setEditingId(null); setForm({ name: '', definition: '', synonym: '', dataSource: '', type: 'concept' }); }}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
            <Plus className="w-4 h-4" /> Lägg till term
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        {/* Filter */}
        <div className="flex gap-3 mb-6">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Sök term..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 max-w-sm" />
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">Alla typer</option>
            <option value="dimension">Dimension</option>
            <option value="measure">Mått</option>
            <option value="concept">Begrepp</option>
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <BookOpen className="w-12 h-12 opacity-30 mb-4" />
            <p className="font-medium text-gray-600 mb-1">Inga termer ännu</p>
            <p className="text-sm">Lägg till manuellt eller generera med AI</p>
          </div>
        ) : (
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Term</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Definition</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Typ</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Datakälla</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Senast ändrad</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(term => (
                  <tr key={term.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{term.name}</div>
                      {term.synonym && <div className="text-xs text-gray-400 mt-0.5">Synonym: {term.synonym}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-xs">{term.definition}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${typeColor(term.type)}`}>
                        {typeLabel(term.type)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{term.dataSource ?? '–'}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      <div>{new Date(term.updatedAt).toLocaleDateString('sv-SE')}</div>
                      <div>{new Date(term.updatedAt).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}</div>
                      <div className="text-gray-300">{term.updatedBy ?? term.createdBy}</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => startEdit(term)} className="text-gray-400 hover:text-gray-600 p-1"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => deleteTerm(term.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-8">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">{editingId ? 'Redigera term' : 'Ny term'}</h3>
              <button onClick={() => { setShowAdd(false); setEditingId(null); }} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Term *</label>
                <input value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Definition *</label>
                <textarea value={form.definition} onChange={e => setForm(p => ({...p, definition: e.target.value}))} rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Synonym</label>
                <input value={form.synonym} onChange={e => setForm(p => ({...p, synonym: e.target.value}))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Typ</label>
                <select value={form.type} onChange={e => setForm(p => ({...p, type: e.target.value}))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="concept">Begrepp</option>
                  <option value="dimension">Dimension</option>
                  <option value="measure">Mått</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Datakälla (vy.kolumn)</label>
                <input value={form.dataSource} onChange={e => setForm(p => ({...p, dataSource: e.target.value}))}
                  placeholder="t.ex. Order.amount" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => { setShowAdd(false); setEditingId(null); }} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Avbryt</button>
              <button onClick={saveTerm} disabled={saving}
                className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingId ? 'Spara' : 'Lägg till'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
