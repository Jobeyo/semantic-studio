'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, TestTube, CheckCircle, Sparkles, ChevronRight, Edit2 } from 'lucide-react';
import Link from 'next/link';

type Step = 'source-db' | 'source-schema' | 'review' | 'sql';

interface GeneratedView {
  name: string;
  displayName: string;
  description: string;
  type: string;
  sql: string;
  columns: any[];
}

export default function GeneratePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [step, setStep] = useState<Step>('source-db');
  const [model, setModel] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Källdatabas
  const [useSameDb, setUseSameDb] = useState(true);
  const [srcHost, setSrcHost] = useState('');
  const [srcPort, setSrcPort] = useState('5432');
  const [srcDatabase, setSrcDatabase] = useState('');
  const [srcUser, setSrcUser] = useState('');
  const [srcPassword, setSrcPassword] = useState('');
  const [srcSsl, setSrcSsl] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ok: boolean; message: string} | null>(null);

  // Källschema
  const [sourceSchemas, setSourceSchemas] = useState<string[]>([]);
  const [selectedSourceSchema, setSelectedSourceSchema] = useState('');
  const [loadingSchemas, setLoadingSchemas] = useState(false);

  // Generering
  const [generating, setGenerating] = useState(false);
  const [generatedViews, setGeneratedViews] = useState<GeneratedView[]>([]);
  const [saving, setSaving] = useState(false);

  // Varna om användaren försöker lämna utan att spara
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (generatedViews.length > 0 && !saving) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [generatedViews, saving]);

  useEffect(() => {
    fetch(`/api/models/${id}`)
      .then(r => r.json())
      .then(data => {
        setModel(data);
        setLoading(false);
      });
  }, [id]);

  async function testConnection() {
    setTesting(true); setTestResult(null);
    const body = useSameDb
      ? { sourceType: model.sourceType, host: model.sourceConfig.host, port: model.sourceConfig.port, database: model.sourceConfig.database, user: model.sourceConfig.user, ssl: model.sourceConfig.ssl }
      : { sourceType: 'postgres', host: srcHost, port: parseInt(srcPort), database: srcDatabase, user: srcUser, password: srcPassword, ssl: srcSsl };
    try {
      const res = await fetch('/api/connections/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      setTestResult({ ok: data.ok, message: data.ok ? `Ansluten! ${data.version ?? ''}` : data.error });
    } catch { setTestResult({ ok: false, message: 'Anslutning misslyckades' }); }
    setTesting(false);
  }

  async function loadSourceSchemas() {
    setLoadingSchemas(true);
    try {
      if (useSameDb) {
        const res = await fetch(`/api/models/${id}/schemas`);
        if (res.ok) { const data = await res.json(); setSourceSchemas(data.schemas ?? []); }
      } else {
        const res = await fetch('/api/connections/schemas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourceType: 'postgres', host: srcHost, port: parseInt(srcPort), database: srcDatabase, user: srcUser, password: srcPassword, ssl: srcSsl }),
        });
        if (res.ok) { const data = await res.json(); setSourceSchemas(data.schemas ?? []); }
      }
    } catch {}
    setLoadingSchemas(false);
  }

  async function generate() {
    setGenerating(true);
    try {
      const body: any = {
        sourceSchema: selectedSourceSchema,
        targetSchema: model.sourceConfig.schema ?? 'semantic_layer',
      };
      if (useSameDb) {
        body.sourceDb = { host: model.sourceConfig.host, port: model.sourceConfig.port, database: model.sourceConfig.database, user: model.sourceConfig.user, ssl: model.sourceConfig.ssl };
      } else {
        body.sourceDb = { host: srcHost, port: parseInt(srcPort), database: srcDatabase, user: srcUser, password: srcPassword, ssl: srcSsl };
      }
      const res = await fetch(`/api/models/${id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        setGeneratedViews(data.views);
        setStep('sql');
      } else {
        const err = await res.json();
        alert('Fel: ' + err.error);
      }
    } catch { alert('Generering misslyckades'); }
    setGenerating(false);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/models/${id}/generate/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ views: generatedViews }),
      });
      if (res.ok) router.push(`/models/${id}`);
      else alert('Kunde inte spara');
    } catch {}
    setSaving(false);
  }

  const steps = [
    { key: 'source-db', label: 'Källdatabas' },
    { key: 'source-schema', label: 'Källschema' },
    { key: 'sql', label: 'Granska SQL' },
  ];

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 py-5 border-b border-gray-200 bg-white flex items-center gap-4">
        <Link href={`/models/${id}`} className="text-gray-400 hover:text-gray-600"><ArrowLeft className="w-5 h-5" /></Link>
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Generera semantiskt lager med AI</h1>
          <p className="text-sm text-gray-500">{model.name}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-2xl mx-auto">

          {/* Steg-indikator */}
          {step !== 'sql' && (
            <div className="flex items-center gap-3 mb-8">
              {steps.filter(s => s.key !== 'sql').map((s, i) => (
                <div key={s.key} className="flex items-center gap-3">
                  <div className={`flex items-center gap-2 text-sm font-medium ${step === s.key ? 'text-indigo-600' : 'text-gray-400'}`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${step === s.key ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400'}`}>{i + 1}</div>
                    {s.label}
                  </div>
                  {i < 1 && <div className="w-8 h-px bg-gray-200" />}
                </div>
              ))}
            </div>
          )}

          {/* Steg 1: Källdatabas */}
          {step === 'source-db' && (
            <div className="space-y-4">
              {/* Måldatabas – readonly */}
              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium text-green-700">Måldatabas (från modellen)</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs font-mono text-green-800">
                  <span>Host: {model.sourceConfig.host}</span>
                  <span>Port: {model.sourceConfig.port}</span>
                  <span>Databas: {model.sourceConfig.database}</span>
                  <span>Schema: {model.sourceConfig.schema ?? 'semantic_layer'}</span>
                </div>
              </div>

              {/* Källdatabas */}
              <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
                <h2 className="font-semibold text-gray-900">Källdatabas</h2>
                <div className="flex gap-3">
                  <button onClick={() => setUseSameDb(true)}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${useSameDb ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    Samma som mål
                  </button>
                  <button onClick={() => setUseSameDb(false)}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${!useSameDb ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    Annan databas
                  </button>
                </div>

                {useSameDb ? (
                  <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
                    Använder samma anslutning som måldatabasen.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Host *</label>
                      <input value={srcHost} onChange={e => setSrcHost(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
                      <input value={srcPort} onChange={e => setSrcPort(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Databas *</label>
                      <input value={srcDatabase} onChange={e => setSrcDatabase(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Användare *</label>
                      <input value={srcUser} onChange={e => setSrcUser(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Lösenord</label>
                      <input type="password" value={srcPassword} onChange={e => setSrcPassword(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                    <div className="col-span-2">
                      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                        <input type="checkbox" checked={srcSsl} onChange={e => setSrcSsl(e.target.checked)} /> Använd SSL
                      </label>
                    </div>
                  </div>
                )}

                {testResult && (
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${testResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    <CheckCircle className="w-4 h-4" />{testResult.message}
                  </div>
                )}

                <div className="flex justify-between items-center pt-2">
                  <button onClick={testConnection} disabled={testing || (!useSameDb && !srcHost)}
                    className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">
                    {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <TestTube className="w-4 h-4" />} Testa anslutning
                  </button>
                  <button onClick={() => { setStep('source-schema'); loadSourceSchemas(); }}
                    className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
                    Nästa →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Steg 2: Källschema */}
          {step === 'source-schema' && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
              <h2 className="font-semibold text-gray-900">Välj källschema</h2>
              <p className="text-sm text-gray-500">Välj det schema där rådata finns. AI analyserar tabellerna och föreslår ett semantiskt lager.</p>

              {loadingSchemas ? (
                <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
                  <Loader2 className="w-4 h-4 animate-spin" /> Hämtar scheman...
                </div>
              ) : (
                <div className="space-y-2">
                  {sourceSchemas.filter(s => !['pg_catalog', 'information_schema', 'pg_toast'].includes(s)).map(s => (
                    <button key={s} onClick={() => setSelectedSourceSchema(s)}
                      className={`w-full text-left px-4 py-3 rounded-lg border transition-colors font-mono text-sm ${selectedSourceSchema === s ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-gray-200 hover:bg-gray-50'}`}>
                      {s}
                      {selectedSourceSchema === s && <CheckCircle className="w-4 h-4 inline ml-2 text-indigo-600" />}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex justify-between pt-2">
                <button onClick={() => setStep('source-db')} className="text-sm text-gray-500 hover:text-gray-700">← Tillbaka</button>
                <button onClick={generate} disabled={!selectedSourceSchema || generating}
                  className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {generating ? 'AI genererar...' : 'Generera med AI'}
                </button>
              </div>
            </div>
          )}

          {/* Steg 3: Granska SQL */}
          {step === 'sql' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Granska genererade vyer</h2>
                  <p className="text-sm text-gray-500 mt-0.5">{generatedViews.length} vyer – granska och redigera SQL innan du sparar</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setStep('source-schema')} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">← Tillbaka</button>
                  <button onClick={save} disabled={saving}
                    className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    Spara i Studio
                  </button>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700">
                ⚠️ Granska SQL noggrant. Du kan redigera direkt i textrutorna. Vyer skapas i databasen när du klickar <strong>Publicera</strong> på modellsidan.
              </div>

              {generatedViews.map((view, i) => (
                <div key={i} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-gray-900">{view.displayName}</span>
                      <span className="text-xs text-gray-400 font-mono">{view.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${view.type === 'fact' ? 'bg-blue-50 text-blue-600 border-blue-200' : view.type === 'dimension' ? 'bg-purple-50 text-purple-600 border-purple-200' : 'bg-green-50 text-green-600 border-green-200'}`}>
                        {view.type === 'fact' ? 'Faktatabell' : view.type === 'dimension' ? 'Dimension' : 'Mått'}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400">{view.columns?.length ?? 0} kolumner</span>
                  </div>
                  {view.description && (
                    <div className="px-4 py-2 text-xs text-gray-500 border-b border-gray-100">{view.description}</div>
                  )}
                  <textarea value={view.sql}
                    onChange={e => setGeneratedViews(prev => prev.map((v, j) => j === i ? { ...v, sql: e.target.value } : v))}
                    rows={8} className="w-full px-4 py-3 text-xs font-mono bg-gray-900 text-green-400 resize-none focus:outline-none" />
                </div>
              ))}

              <div className="flex justify-end">
                <button onClick={save} disabled={saving}
                  className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  Spara i Studio
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
