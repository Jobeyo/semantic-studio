'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ERDiagram from '@/components/ERDiagram';
import { ArrowLeft, GitBranch, Plus, Table, Sparkles, CheckCircle, Loader2, Edit2, ChevronDown, ChevronRight, Trash2, MessageSquare, X, Send } from 'lucide-react';
import { useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import Link from 'next/link';

interface Column {
  id: number;
  name: string;
  displayName: string;
  description: string | null;
  dataType: string;
  isKey: boolean;
  isMeasure: boolean;
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

interface Model {
  id: number;
  name: string;
  description: string | null;
  sourceType: string;
  sourceConfig: Record<string, unknown>;
  status: string;
  views: View[];
}

const typeColors: Record<string, string> = {
  fact: 'bg-blue-50 text-blue-600 border-blue-200',
  dimension: 'bg-purple-50 text-purple-600 border-purple-200',
  measure: 'bg-green-50 text-green-600 border-green-200',
};

const typeLabels: Record<string, string> = {
  fact: 'Faktatabell',
  dimension: 'Dimension',
  measure: 'Mått',
};

export default function ModelDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [model, setModel] = useState<Model | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedViews, setExpandedViews] = useState<Set<number>>(new Set());
  const [generatingSchema, setGeneratingSchema] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateSourceSchema, setGenerateSourceSchema] = useState('');
  const [generateTargetSchema, setGenerateTargetSchema] = useState('');
  const [availableSchemas, setAvailableSchemas] = useState<string[]>([]);
  const [generatedViews, setGeneratedViews] = useState<{name: string; displayName: string; type: string; sql: string; columns: any[]}[]>([]);
  const [showSqlReview, setShowSqlReview] = useState(false);
  const [importing, setImporting] = useState(false);
  const [syncStatus, setSyncStatus] = useState<Record<number, boolean>>({});
  const [editingName, setEditingName] = useState(false);
  const [newModelName, setNewModelName] = useState('');
  const [showDeleteModelDialog, setShowDeleteModelDialog] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [executingSql, setExecutingSql] = useState<number | null>(null);
  const [sqlPreview, setSqlPreview] = useState<{viewId: number; name: string; sql: string} | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<{role: 'user'|'assistant'; content: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatLLMInfo, setChatLLMInfo] = useState<{provider: string; model: string; dataSource: string; schema: string} | null>(null);

  useEffect(() => {
    fetch('/api/llm-providers')
      .then(r => r.json())
      .then((providers: any[]) => {
        const def = providers.find(p => p.isDefault || p.is_default);
        if (def) setChatLLMInfo({
          provider: def.type,
          model: def.config?.model ?? def.type,
          dataSource: 'PostgreSQL',
          schema: 'semantic_layer',
        });
      }).catch(() => {});
  }, []);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const [chatWidth, setChatWidth] = useState(384);
  const isResizing = useRef(false);

  function startResize(e: React.MouseEvent) {
    isResizing.current = true;
    const startX = e.clientX;
    const startW = chatWidth;
    function onMove(ev: MouseEvent) {
      if (!isResizing.current) return;
      const diff = startX - ev.clientX;
      setChatWidth(Math.max(280, Math.min(700, startW + diff)));
    }
    function onUp() {
      isResizing.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }
  const [activeTab, setActiveTab] = useState<'views' | 'sql' | 'settings' | 'er'>('views');

  useEffect(() => {
    fetch(`/api/models/${id}`).then(r => r.json()).then(data => { setModel(data); setLoading(false); }).catch(() => setLoading(false));
    fetch(`/api/models/${id}/sync-status`).then(r => r.json()).then(data => {
      const status: Record<number, boolean> = {};
      data.syncStatus?.forEach((s: any) => { status[s.id] = s.existsInDb; });
      setSyncStatus(status);
    }).catch(() => {});
  }, [id]);

  function toggleView(viewId: number) {
    setExpandedViews(prev => { const next = new Set(prev); next.has(viewId) ? next.delete(viewId) : next.add(viewId); return next; });
  }

  async function sendChat() {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = { role: 'user' as const, content: chatInput };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setChatLoading(true);
    let assistantText = '';
    try {
      const res = await fetch(`/api/models/${id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: chatInput, history: chatMessages }),
      });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      setChatMessages(prev => [...prev, { role: 'assistant', content: '' }]);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value).split('\n').filter(l => l.startsWith('data: '));
        for (const line of lines) {
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'text') {
              assistantText += event.text;
              setChatMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: assistantText }]);
              chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
            } else if (event.type === 'model_updated') {
              // Ladda om modellen och sätt till draft
              fetch(`/api/models/${id}`).then(r => r.json()).then(data => setModel(data));
              fetch(`/api/models/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'draft' }) });
            }
          } catch {}
        }
      }
    } catch (e) { console.error('Chat error:', e); }
    setChatLoading(false);
  }

  async function executeSql(viewId: number) {
    setExecutingSql(viewId);
    try {
      const res = await fetch(`/api/models/${id}/execute-sql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ viewId }),
      });
      if (res.ok) {
        setSyncStatus(prev => ({ ...prev, [viewId]: true }));
        alert('Vyn skapades i databasen!');
      } else {
        const err = await res.json();
        alert('Fel: ' + err.error);
      }
    } catch {}
    setExecutingSql(null);
  }

  async function importFromDB() {
    if (!confirm('OBS! Importera från DB ersätter ALLA befintliga vyer i Studio med vyer från semantic_layer-schemat i databasen. Fortsätta?')) return;
    setImporting(true);
    try {
      const res = await fetch(`/api/models/${id}/import`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setModel(prev => prev ? { ...prev, views: data.views } : prev);
        alert(`Importerade ${data.count} vyer från semantic_layer`);
      } else {
        const err = await res.json();
        alert('Import misslyckades: ' + err.error);
      }
    } catch (e) {
      alert('Import misslyckades');
    }
    setImporting(false);
  }

  async function openGenerateModal() {
    // Hämta tillgängliga scheman via server (har tillgång till lösenord)
    try {
      const res = await fetch(`/api/models/${id}/schemas`);
      if (res.ok) {
        const data = await res.json();
        setAvailableSchemas(data.schemas ?? []);
      }
    } catch {}
    setGenerateSourceSchema('');
    setGenerateTargetSchema((model?.sourceConfig as any)?.schema ?? 'semantic_layer');
    setShowGenerateModal(true);
  }

  async function generateWithAI() {
    if (!generateSourceSchema) { alert('Välj ett källschema'); return; }
    if (!generateTargetSchema) { alert('Välj ett målschema'); return; }
    setShowGenerateModal(false);
    setGeneratingSchema(true);
    try {
      const res = await fetch(`/api/models/${id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceSchema: generateSourceSchema, targetSchema: generateTargetSchema }),
      });
      if (res.ok) {
        const data = await res.json();
        // Visa SQL för granskning istället för att spara direkt
        setGeneratedViews(data.views);
        setShowSqlReview(true);
      }
    } catch {}
    setGeneratingSchema(false);
  }

  async function confirmGeneratedViews() {
    setShowSqlReview(false);
    // Spara vyerna till Studio
    try {
      const res = await fetch(`/api/models/${id}/generate/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ views: generatedViews }),
      });
      if (res.ok) {
        const data = await res.json();
        setModel(prev => prev ? { ...prev, views: data.views, status: 'draft' } : prev);
        setSyncStatus({});
      }
    } catch {}
  }

  async function publishModel() {
    if (!model) return;
    const unsynced = model.views.filter(v => syncStatus[v.id] === false);
    const msg = unsynced.length > 0
      ? `Publicera modellen? ${unsynced.length} nya/ej synkade vyer kommer att skapas i databasen: ${unsynced.map(v => v.name).join(', ')}`
      : 'Publicera modellen? Metadata-ändringar (namn, beskrivningar) sparas i Studio. Vyer som redan finns i databasen påverkas inte.';
    if (!confirm(msg)) return;
    // Kör SQL för alla ej synkade vyer
    for (const view of unsynced) {
      try {
        const res = await fetch(`/api/models/${id}/execute-sql`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ viewId: view.id }),
        });
        if (res.ok) setSyncStatus(prev => ({ ...prev, [view.id]: true }));
        else {
          const err = await res.json();
          alert(`Fel vid körning av ${view.name}: ${err.error}`);
          return;
        }
      } catch {
        alert(`Fel vid körning av ${view.name}`);
        return;
      }
    }
    // Sätt status till published
    await fetch(`/api/models/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'published' }) });
    setModel(prev => prev ? { ...prev, status: 'published' } : prev);
  }

  async function saveModelName() {
    if (!newModelName.trim()) return;
    setSavingName(true);
    try {
      const res = await fetch(`/api/models/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newModelName.trim() }),
      });
      if (res.ok) {
        setModel(prev => prev ? { ...prev, name: newModelName.trim() } : prev);
        setEditingName(false);
      }
    } catch {}
    setSavingName(false);
  }

  async function deleteModel() {
    setShowDeleteModelDialog(true);
  }

  async function confirmDeleteModel() {
    await fetch(`/api/models/${id}`, { method: 'DELETE' });
    window.location.href = '/models';
  }

  function showSqlPreview(viewId: number) {
    const view = model?.views.find(v => v.id === viewId);
    if (view) setSqlPreview({ viewId, name: view.name, sql: view.sql });
  }

  async function deleteView(viewId: number, viewName: string) {
    if (!confirm(`Ta bort vyn "${viewName}"? Den tas bara bort från Studio, inte från databasen.`)) return;
    await fetch(`/api/models/${id}/views/${viewId}`, { method: 'DELETE' });
    setModel(prev => prev ? { ...prev, views: prev.views.filter(v => v.id !== viewId) } : prev);
  }

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  if (!model) return <div className="flex items-center justify-center h-full text-gray-400">Modellen hittades inte</div>;

  return (
    <>
    {showDeleteModelDialog && (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-2">Ta bort modell</h3>
          <p className="text-sm text-gray-500 mb-2">Är du säker på att du vill ta bort <span className="font-medium text-gray-700">{model?.name}</span>?</p>
          <p className="text-sm text-red-500 mb-6">Detta går inte att ångra. Alla vyer och kolumner i Studio tas bort. Databasen påverkas inte.</p>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setShowDeleteModelDialog(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
              Avbryt
            </button>
            <button onClick={confirmDeleteModel} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">
              Ta bort
            </button>
          </div>
        </div>
      </div>
    )}
    <div className="flex flex-col h-full">
      <div className="px-8 py-5 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-4 mb-3">
          <Link href="/models" className="text-gray-400 hover:text-gray-600"><ArrowLeft className="w-5 h-5" /></Link>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold text-gray-900">{model.name}</h1>
              <span className={`text-xs px-2 py-0.5 rounded-full border ${model.status === 'published' ? 'bg-green-50 text-green-600 border-green-200' : 'bg-amber-50 text-amber-600 border-amber-200'}`}>
                {model.status === 'published' ? 'Publicerad' : 'Utkast'}
              </span>
            </div>
            {model.description && <p className="text-sm text-gray-500 mt-0.5">{model.description}</p>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowChat(!showChat)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${showChat ? 'bg-indigo-600 text-white' : 'border border-gray-200 hover:bg-gray-50'}`}>
              <MessageSquare className="w-4 h-4" />
              AI-assistent
            </button>
            <button onClick={importFromDB} disabled={importing}
              className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Table className="w-4 h-4 text-green-500" />}
              Importera från DB
            </button>
            <Link href={`/models/${id}/generate`}
              className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
              <Sparkles className="w-4 h-4 text-indigo-500" />
              Generera med AI
            </Link>
            {model.status !== 'published' ? (
              <button onClick={publishModel} className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
                <CheckCircle className="w-4 h-4" /> Publicera
              </button>
            ) : (
              <button onClick={async () => {
                await fetch(`/api/models/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'draft' }) });
                setModel(prev => prev ? { ...prev, status: 'draft' } : prev);
              }} className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-500 hover:bg-gray-50">
                Avpublicera
              </button>
            )}
            <Link href={`/models/${id}/views/new`} className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
              <Plus className="w-4 h-4" /> Ny vy
            </Link>
          </div>
        </div>
        <div className="flex gap-1">
          {(['views', 'sql', 'er', 'settings'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeTab === tab ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>
              {tab === 'views' ? `Vyer (${model.views.length})` : tab === 'sql' ? 'SQL-preview' : tab === 'er' ? 'ER-diagram' : 'Inställningar'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto p-8">
        {activeTab === 'views' && (
          <div className="space-y-3 max-w-4xl">
            {model.views.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <Table className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium text-gray-600 mb-1">Inga vyer ännu</p>
                <p className="text-sm mb-4">Lägg till vyer manuellt eller låt AI generera dem</p>
                <Link href={`/models/${id}/generate`}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 mx-auto">
                  <Sparkles className="w-4 h-4" />
                  Generera med AI
                </Link>
              </div>
            ) : (
              model.views.map(view => (
                <div key={view.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-gray-50" onClick={() => toggleView(view.id)}>
                    {expandedViews.has(view.id) ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                    <Table className="w-4 h-4 text-gray-400" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{view.displayName}</span>
                        <span className="text-xs text-gray-400">({view.name})</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${typeColors[view.type] ?? 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                          {typeLabels[view.type] ?? view.type}
                        </span>
                      </div>
                      {view.description && <p className="text-sm text-gray-500 mt-0.5">{view.description}</p>}
                    </div>
                    <span className="text-xs text-gray-400">{view.columns.length} kolumner</span>
                    {syncStatus[view.id] === false && (
                      <button onClick={e => { e.stopPropagation(); executeSql(view.id); }} disabled={executingSql === view.id}
                        className="flex items-center gap-1 text-xs px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-50">
                        {executingSql === view.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <></>}
                        Kör SQL i DB
                      </button>
                    )}
                    {syncStatus[view.id] === true && (
                      <button onClick={e => { e.stopPropagation(); showSqlPreview(view.id); }}
                        className="text-xs px-2 py-0.5 bg-green-50 text-green-600 border border-green-200 rounded-full hover:bg-green-100">
                        ✓ Synkad
                      </button>
                    )}
                    <Link href={`/models/${id}/views/${view.id}`} onClick={e => e.stopPropagation()}
                      className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded">
                      <Edit2 className="w-4 h-4" />
                    </Link>
                    <button onClick={e => { e.stopPropagation(); deleteView(view.id, view.displayName); }}
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  {expandedViews.has(view.id) && (
                    <div className="border-t border-gray-100">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left px-5 py-2 text-xs font-medium text-gray-500">Kolumn</th>
                            <th className="text-left px-5 py-2 text-xs font-medium text-gray-500">Affärsnamn</th>
                            <th className="text-left px-5 py-2 text-xs font-medium text-gray-500">Typ</th>
                            <th className="text-left px-5 py-2 text-xs font-medium text-gray-500">Roll</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {view.columns.map(col => (
                            <tr key={col.id} className="hover:bg-gray-50">
                              <td className="px-5 py-2.5 font-mono text-xs text-gray-600">{col.name}</td>
                              <td className="px-5 py-2.5 text-gray-900">{col.displayName}</td>
                              <td className="px-5 py-2.5 text-gray-500">{col.dataType}</td>
                              <td className="px-5 py-2.5">
                                {col.isKey && <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded mr-1">Nyckel</span>}
                                {col.isMeasure && <span className="text-xs bg-green-50 text-green-600 px-1.5 py-0.5 rounded">Mått</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'sql' && (
          <div className="max-w-4xl space-y-4">
            {model.views.length === 0 && <p className="text-gray-400 text-sm">Inga vyer att visa SQL för.</p>}
            {model.views.map(view => (
              <div key={view.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                  <span className="font-medium text-gray-900 text-sm">{view.displayName}</span>
                  <span className="text-xs text-gray-400 font-mono">{view.name}</span>
                </div>
                <pre className="p-5 text-xs font-mono text-green-400 overflow-x-auto bg-gray-900">
                  {view.sql || '-- Ingen SQL definierad'}
                </pre>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'er' && (
          <div className="h-full p-4 flex flex-col">
            <div className="flex justify-end mb-2">
              <button onClick={() => {
                if (window.confirm('Återställ layouten? Alla dina positioner nollställs.')) {
                  localStorage.removeItem(`er-diagram-positions-${model.id}`);
                  window.location.reload();
                }
              }} className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 px-3 py-1 rounded-lg">
                Återställ layout
              </button>
            </div>
            <div className="flex-1">
              <ERDiagram views={model.views} modelId={model.id} />
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-2xl space-y-4">
            <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
              <h3 className="font-semibold text-gray-900">Modellinformation</h3>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Modellnamn:</span>
                  {editingName ? (
                    <div className="flex items-center gap-2">
                      <input value={newModelName} onChange={e => setNewModelName(e.target.value)}
                        className="px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                      <button onClick={saveModelName} disabled={savingName}
                        className="flex items-center gap-1 px-3 py-1 bg-indigo-600 text-white rounded text-xs font-medium hover:bg-indigo-700 disabled:opacity-50">
                        {savingName && <Loader2 className="w-3 h-3 animate-spin" />} Spara
                      </button>
                      <button onClick={() => setEditingName(false)} className="px-3 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50">Avbryt</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{model.name}</span>
                      <button onClick={() => { setNewModelName(model.name); setEditingName(true); }}
                        className="text-xs text-indigo-600 hover:text-indigo-700">Ändra</button>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Databastyp:</span>
                  <span className="font-medium">{model.sourceType}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Status:</span>
                  <span className="font-medium">{model.status}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Vyer:</span>
                  <span className="font-medium">{model.views.length}</span>
                </div>
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
              <h3 className="font-semibold text-gray-900">Databasanslutning</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-500">Host:</span> <span className="ml-2 font-mono font-medium">{(model.sourceConfig as any)?.host}</span></div>
                <div><span className="text-gray-500">Port:</span> <span className="ml-2 font-mono font-medium">{(model.sourceConfig as any)?.port}</span></div>
                <div><span className="text-gray-500">Databas:</span> <span className="ml-2 font-mono font-medium">{(model.sourceConfig as any)?.database}</span></div>
                <div><span className="text-gray-500">Användare:</span> <span className="ml-2 font-mono font-medium">{(model.sourceConfig as any)?.user}</span></div>
                <div><span className="text-gray-500">SSL:</span> <span className="ml-2 font-medium">{(model.sourceConfig as any)?.ssl ? 'Ja' : 'Nej'}</span></div>
                <div><span className="text-gray-500">Schema:</span> <span className="ml-2 font-mono font-medium">{(model.sourceConfig as any)?.schema ?? 'semantic_layer'}</span></div>
              </div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-6">
              <h3 className="font-semibold text-red-700 mb-2">Farlig zon</h3>
              <p className="text-sm text-red-600 mb-4">Att ta bort en modell kan inte ångras.</p>
              <button onClick={() => setShowDeleteModelDialog(true)} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">
                Ta bort modell
              </button>
            </div>
          </div>
        )}
        </div>

        {/* AI Chat-sidopanel */}
        {showChat && (
          <div className="border-l border-gray-200 bg-white flex flex-col flex-shrink-0 overflow-hidden relative" style={{width: chatWidth}}>
            <div onMouseDown={startResize} className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-400 z-10 transition-colors" />
            <div className="px-4 py-3 border-b border-gray-200">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-500" />
                  <span className="font-semibold text-sm text-gray-900">AI-assistent</span>
                </div>
                <div className="flex items-center gap-2">
                  {chatMessages.length > 0 && (
                    <button onClick={() => setChatMessages([])} className="text-xs text-gray-400 hover:text-gray-600">Rensa</button>
                  )}
                  <button onClick={() => setShowChat(false)} className="text-gray-400 hover:text-gray-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {chatLLMInfo && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-gray-500">LLM: <span className="text-gray-700">{chatLLMInfo.provider} · {chatLLMInfo.model}</span></span>
                  <span className="text-xs text-gray-400">Datakälla: <span className="text-gray-600">{chatLLMInfo.dataSource}</span></span>
                  <span className="text-xs text-gray-400">Modell: <span className="text-gray-600">{chatLLMInfo.schema}</span></span>
                </div>
              )}
            </div>
            <div className="p-4 border-b border-gray-100">
              <div className="flex gap-2">
                <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChat()}
                  placeholder="Ställ en fråga om modellen..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                <button onClick={sendChat} disabled={chatLoading || !chatInput.trim()}
                  className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 flex flex-col-reverse">
              {chatMessages.length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Fråga om din modell</p>
                  <div className="mt-4 space-y-2">
                    {['Förklara modellens struktur', 'Vilka vyer saknas?', 'Förbättra kolumnnamnen'].map(q => (
                      <button key={q} onClick={() => { setChatInput(q); }}
                        className="block w-full text-left text-xs px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] px-3 py-2 rounded-xl text-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-900'}`}>
                    {msg.role === 'assistant' ? (
                      <div className="prose prose-sm max-w-none text-gray-900">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    ) : msg.content}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 px-3 py-2 rounded-xl">
                    <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                  </div>
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>

          </div>
        )}
      </div>
    </div>
  );

    </>
  );
}