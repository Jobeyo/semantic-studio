'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, TestTube, CheckCircle, Plus, Sparkles, X } from 'lucide-react';
import Link from 'next/link';

type Step = 'info' | 'connection' | 'schema' | 'source-db' | 'source-schema' | 'sql';

interface GeneratedView {
  name: string; displayName: string; description: string;
  type: string; sql: string; columns: any[];
}

export default function NewModelPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('info');
  const [createdModelId, setCreatedModelId] = useState<number | null>(null);

  // Steg 1 – Grundinfo
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sourceType, setSourceType] = useState('postgres');

  // Steg 2 – Målanslutning
  const [host, setHost] = useState('');
  const [port, setPort] = useState('5432');
  const [database, setDatabase] = useState('');
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [ssl, setSsl] = useState(false);
  const [testResult, setTestResult] = useState<{ok: boolean; message: string} | null>(null);
  const [testing, setTesting] = useState(false);
  const [existingConns, setExistingConns] = useState<any[]>([]);

  // Steg 3 – Målschema
  const [schemas, setSchemas] = useState<string[]>([]);
  const [loadingSchemas, setLoadingSchemas] = useState(false);
  const [selectedSchema, setSelectedSchema] = useState('');
  const [newSchemaName, setNewSchemaName] = useState('');
  const [schemaAction, setSchemaAction] = useState<'existing' | 'new'>('new');
  const [creatingSchema, setCreatingSchema] = useState(false);
  const [saving, setSaving] = useState(false);

  // Steg 4 – Källdatabas
  const [useSameDb, setUseSameDb] = useState(true);
  const [srcHost, setSrcHost] = useState('');
  const [srcPort, setSrcPort] = useState('5432');
  const [srcDatabase, setSrcDatabase] = useState('');
  const [srcUser, setSrcUser] = useState('');
  const [srcPassword, setSrcPassword] = useState('');
  const [srcSsl, setSrcSsl] = useState(false);
  const [srcDatabases, setSrcDatabases] = useState<string[]>([]);
  const [loadingSrcDbs, setLoadingSrcDbs] = useState(false);

  async function loadSourceDatabases(conn: typeof existingConns[0]) {
    setLoadingSrcDbs(true);
    try {
      const res = await fetch('/api/connections/databases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceType: 'postgres', host: conn.host, port: conn.port, user: conn.user, ssl: conn.ssl }),
      });
      if (res.ok) { const data = await res.json(); setSrcDatabases(data.databases ?? []); }
    } catch {}
    setLoadingSrcDbs(false);
  }
  const [srcTestResult, setSrcTestResult] = useState<{ok: boolean; message: string} | null>(null);
  const [srcTesting, setSrcTesting] = useState(false);

  // Steg 5 – Källschema + Generera
  const [sourceSchemas, setSourceSchemas] = useState<string[]>([]);
  const [loadingSrcSchemas, setLoadingSrcSchemas] = useState(false);
  const [selectedSourceSchema, setSelectedSourceSchema] = useState('');
  const [generating, setGenerating] = useState(false);

  // Steg 6 – SQL-granskning
  const [generatedViews, setGeneratedViews] = useState<GeneratedView[]>([]);
  const [confirmSaving, setConfirmSaving] = useState(false);

  useEffect(() => {
    fetch('/api/models').then(r => r.json()).then(models => {
      setExistingConns(models.filter((m: any) => m.sourceConfig?.host).map((m: any) => ({
        modelId: m.id, modelName: m.name,
        host: m.sourceConfig.host, port: m.sourceConfig.port,
        database: m.sourceConfig.database, user: m.sourceConfig.user, ssl: m.sourceConfig.ssl,
      })));
    }).catch(() => {});
  }, []);

  const stepLabels: {key: Step; label: string}[] = [
    { key: 'info', label: 'Info' },
    { key: 'connection', label: 'Mål DB' },
    { key: 'schema', label: 'Mål schema' },
    { key: 'source-db', label: 'Källa DB' },
    { key: 'source-schema', label: 'Källa' },
    { key: 'sql', label: 'SQL' },
  ];
  const currentStepIdx = stepLabels.findIndex(s => s.key === step);

  async function testTargetConnection() {
    setTesting(true); setTestResult(null);
    const selectedConn = existingConns.find(c => c.host === host && c.database === database);
    try {
      const res = await fetch('/api/connections/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceType, host, port: parseInt(port), database, user, password, ssl, modelId: selectedConn?.modelId }) });
      const data = await res.json();
      setTestResult({ ok: data.ok, message: data.ok ? `Ansluten! ${data.version ?? ''}` : data.error });
    } catch { setTestResult({ ok: false, message: 'Anslutning misslyckades' }); }
    setTesting(false);
  }

  async function loadTargetSchemas() {
    setLoadingSchemas(true);
    try {
      const res = await fetch('/api/connections/schemas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceType, host, port: parseInt(port), database, user, password, ssl }) });
      if (res.ok) { const data = await res.json(); setSchemas(data.schemas ?? []); }
    } catch {}
    setLoadingSchemas(false);
  }

  async function createTargetSchema() {
    if (!newSchemaName.trim()) return;
    setCreatingSchema(true);
    try {
      const res = await fetch('/api/connections/schemas', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceType, host, port: parseInt(port), database, user, password, ssl, schemaName: newSchemaName.trim() }) });
      if (res.ok) {
        setSchemas(prev => [...prev, newSchemaName.trim()].sort());
        setSelectedSchema(newSchemaName.trim());
        setSchemaAction('existing');
        setNewSchemaName('');
      } else {
        const err = await res.json();
        alert('Kunde inte skapa schema: ' + err.error);
      }
    } catch {}
    setCreatingSchema(false);
  }

  async function createModel() {
    const schema = schemaAction === 'new' ? newSchemaName.trim() : selectedSchema;
    if (!schema) { alert('Välj eller skapa ett schema'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/models', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description, sourceType, sourceConfig: { host, port: parseInt(port), database, user, password, ssl, schema } }) });
      if (res.ok) {
        const model = await res.json();
        setCreatedModelId(model.id);
        setStep('source-db');
      }
    } catch {}
    setSaving(false);
  }

  async function testSourceConnection() {
    setSrcTesting(true); setSrcTestResult(null);
    const body = useSameDb ? { sourceType, host, port: parseInt(port), database, user, password, ssl } : { sourceType: 'postgres', host: srcHost, port: parseInt(srcPort), database: srcDatabase, user: srcUser, password: srcPassword, ssl: srcSsl };
    try {
      const res = await fetch('/api/connections/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      setSrcTestResult({ ok: data.ok, message: data.ok ? `Ansluten! ${data.version ?? ''}` : data.error });
    } catch { setSrcTestResult({ ok: false, message: 'Anslutning misslyckades' }); }
    setSrcTesting(false);
  }

  async function loadSourceSchemas() {
    setLoadingSrcSchemas(true);
    try {
      if (useSameDb && createdModelId) {
        const res = await fetch(`/api/models/${createdModelId}/schemas`);
        if (res.ok) { const data = await res.json(); setSourceSchemas(data.schemas ?? []); }
      } else {
        const res = await fetch('/api/connections/schemas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceType: 'postgres', host: srcHost, port: parseInt(srcPort), database: srcDatabase, user: srcUser, password: srcPassword, ssl: srcSsl }) });
        if (res.ok) { const data = await res.json(); setSourceSchemas(data.schemas ?? []); }
      }
    } catch {}
    setLoadingSrcSchemas(false);
  }

  async function generate() {
    if (!selectedSourceSchema || !createdModelId) return;
    setGenerating(true);
    try {
      const schema = schemaAction === 'new' ? newSchemaName.trim() : selectedSchema;
      const body: any = { sourceSchema: selectedSourceSchema, targetSchema: schema };
      if (useSameDb) {
        body.sourceDb = { host, port: parseInt(port), database, user: user, password, ssl };
      } else {
        body.sourceDb = { host: srcHost, port: parseInt(srcPort), database: srcDatabase, user: srcUser, password: srcPassword, ssl: srcSsl };
      }
      const res = await fetch(`/api/models/${createdModelId}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
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

  async function confirmAndSave() {
    if (!createdModelId) return;
    setConfirmSaving(true);
    try {
      const res = await fetch(`/api/models/${createdModelId}/generate/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ views: generatedViews }) });
      if (res.ok) router.push(`/models/${createdModelId}`);
    } catch {}
    setConfirmSaving(false);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 py-5 border-b border-gray-200 bg-white flex items-center gap-4">
        <Link href="/models" className="text-gray-400 hover:text-gray-600"><ArrowLeft className="w-5 h-5" /></Link>
        <h1 className="text-lg font-semibold text-gray-900">Ny semantisk modell</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-2xl mx-auto">

          {/* Steg-indikator */}
          <div className="flex items-center gap-1 mb-8 overflow-x-auto pb-1">
            {stepLabels.map((s, i) => (
              <div key={s.key} className="flex items-center gap-1">
                <div className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full ${step === s.key ? 'bg-indigo-600 text-white' : i < currentStepIdx ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                  <span>{i < currentStepIdx ? '✓' : i + 1}</span>
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
                {i < stepLabels.length - 1 && <div className="w-4 h-px bg-gray-200" />}
              </div>
            ))}
          </div>

          {/* Steg 1: Grundinfo */}
          {step === 'info' && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
              <h2 className="font-semibold text-gray-900">Grundinformation</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Modellnamn *</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="t.ex. DMOrder, Sales Model"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Beskrivning</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Databastyp *</label>
                <select value={sourceType} onChange={e => setSourceType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="postgres">PostgreSQL</option>
                  <option value="sqlserver">SQL Server / Azure SQL</option>
                  <option value="mysql">MySQL / MariaDB</option>
                  <option value="sqlite">SQLite</option>
                </select>
              </div>
              <div className="flex justify-end">
                <button onClick={() => setStep('connection')} disabled={!name.trim()}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">Nästa →</button>
              </div>
            </div>
          )}

          {/* Steg 2: Målanslutning */}
          {step === 'connection' && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
              <div>
                <h2 className="font-semibold text-gray-900">Måldatabas – anslutning</h2>
                <p className="text-sm text-gray-500 mt-1">Detta är databasen där det semantiska vylagret kommer att skapas. Källdata och vylager måste ligga i <strong>samma databas</strong> (PostgreSQL stöder inte cross-databas vyer).</p>
              </div>
              {existingConns.length > 0 && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                  <label className="block text-xs font-medium text-indigo-700 mb-1.5">Återanvänd befintlig anslutning</label>
                  <select onChange={e => {
                    const conn = existingConns.find(c => c.modelId === parseInt(e.target.value));
                    if (conn) { setHost(conn.host); setPort(String(conn.port)); setDatabase(conn.database); setUser(conn.user); setSsl(conn.ssl); setTestResult(null); }
                  }} defaultValue="" className="w-full px-3 py-2 border border-indigo-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="">-- Välj befintlig anslutning --</option>
                    {existingConns.map(c => <option key={c.modelId} value={c.modelId}>{c.modelName} ({c.host}:{c.port}/{c.database})</option>)}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Host *</label>
                  <input value={host} onChange={e => setHost(e.target.value)} placeholder="localhost"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Port *</label>
                  <input value={port} onChange={e => setPort(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Databas *</label>
                  <input value={database} onChange={e => setDatabase(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Användare *</label>
                  <input value={user} onChange={e => setUser(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Lösenord</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div className="col-span-2">
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={ssl} onChange={e => setSsl(e.target.checked)} /> Använd SSL
                  </label>
                </div>
              </div>
              {testResult && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${testResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  <CheckCircle className="w-4 h-4" />{testResult.message}
                </div>
              )}
              <div className="flex items-center justify-between pt-2">
                <button onClick={() => setStep('info')} className="text-sm text-gray-500 hover:text-gray-700">← Tillbaka</button>
                <div className="flex gap-3">
                  <button onClick={testTargetConnection} disabled={testing || !host}
                    className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">
                    {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <TestTube className="w-4 h-4" />} Testa
                  </button>
                  <button onClick={() => { setStep('schema'); loadTargetSchemas(); }} disabled={!host || !database || !user}
                    className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">Nästa →</button>
                </div>
              </div>
            </div>
          )}

          {/* Steg 3: Målschema */}
          {step === 'schema' && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
              <div>
                <h2 className="font-semibold text-gray-900">Målschema</h2>
                <p className="text-sm text-gray-500 mt-1">Välj eller skapa ett nytt schema i måldatabasen där vylagret ska skapas, t.ex. <code className="bg-gray-100 px-1 rounded text-xs">semantic_layer</code>.</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setSchemaAction('new')} className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${schemaAction === 'new' ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>Skapa nytt schema</button>
                <button onClick={() => setSchemaAction('existing')} className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${schemaAction === 'existing' ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>Välj befintligt</button>
              </div>
              {schemaAction === 'new' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Schemanamn *</label>
                    <div className="flex gap-2">
                      <input value={newSchemaName} onChange={e => setNewSchemaName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                        placeholder="t.ex. semantic_layer"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                      <button onClick={createTargetSchema} disabled={!newSchemaName.trim() || creatingSchema}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                        {creatingSchema ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Skapa
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Endast gemener, siffror och understreck.</p>
                  </div>
                  {selectedSchema && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                      <CheckCircle className="w-4 h-4" /> Schema "{selectedSchema}" skapades!
                    </div>
                  )}
                </div>
              )}
              {schemaAction === 'existing' && (
                <div>
                  {loadingSchemas ? (
                    <div className="flex items-center gap-2 text-sm text-gray-400"><Loader2 className="w-4 h-4 animate-spin" /> Hämtar scheman...</div>
                  ) : (
                    <select value={selectedSchema} onChange={e => setSelectedSchema(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                      <option value="">-- Välj schema --</option>
                      {schemas.filter(s => !['pg_catalog', 'information_schema', 'pg_toast'].includes(s)).map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}
              <div className="flex items-center justify-between pt-2">
                <button onClick={() => setStep('connection')} className="text-sm text-gray-500 hover:text-gray-700">← Tillbaka</button>
                <button onClick={createModel} disabled={saving || (!selectedSchema && !newSchemaName.trim())}
                  className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />} Skapa modell & fortsätt →
                </button>
              </div>
            </div>
          )}

          {/* Steg 4: Källdatabas */}
          {step === 'source-db' && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium text-green-700">Målanslutning sparad! Välj nu källdata för AI-generering.</span>
                </div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
                <div>
                  <h2 className="font-semibold text-gray-900">Källdatabas</h2>
                  <p className="text-sm text-gray-500 mt-1">Databasen där rådata finns som AI ska analysera.</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setUseSameDb(true)} className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${useSameDb ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>Samma som mål</button>
                  <button onClick={() => setUseSameDb(false)} className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${!useSameDb ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>Annan databas</button>
                </div>
                {useSameDb ? (
                  <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600 font-mono">
                    {host}:{port}/{database}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {existingConns.length > 0 && (
                      <div className="col-span-2 bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                        <label className="block text-xs font-medium text-indigo-700 mb-1.5">Återanvänd befintlig serverinställning</label>
                        <select onChange={e => {
                          const conn = existingConns.find(c => c.modelId === parseInt(e.target.value));
                          if (conn) { setSrcHost(conn.host); setSrcPort(String(conn.port)); setSrcUser(conn.user); setSrcSsl(conn.ssl); setSrcDatabase(''); loadSourceDatabases(conn); }
                        }} defaultValue="" className="w-full px-3 py-2 border border-indigo-300 rounded-lg text-sm bg-white">
                          <option value="">-- Välj server --</option>
                          {existingConns.map(c => <option key={c.modelId} value={c.modelId}>{c.modelName} ({c.host}:{c.port})</option>)}
                        </select>
                      </div>
                    )}
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Host *</label>
                      <input value={srcHost} onChange={e => setSrcHost(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
                      <input value={srcPort} onChange={e => setSrcPort(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Databas *</label>
                      {srcDatabases.length > 0 ? (
                        <select value={srcDatabase} onChange={e => setSrcDatabase(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                          <option value="">-- Välj databas --</option>
                          {srcDatabases.map(d => <option key={d} value={d}>{d}</option>)}
                          {loadingSrcDbs && <option disabled>Hämtar...</option>}
                        </select>
                      ) : (
                        <input value={srcDatabase} onChange={e => setSrcDatabase(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Användare *</label>
                      <input value={srcUser} onChange={e => setSrcUser(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Lösenord</label>
                      <input type="password" value={srcPassword} onChange={e => setSrcPassword(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                    <div className="col-span-2">
                      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                        <input type="checkbox" checked={srcSsl} onChange={e => setSrcSsl(e.target.checked)} /> Använd SSL
                      </label>
                    </div>
                  </div>
                )}
                {srcTestResult && (
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${srcTestResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    <CheckCircle className="w-4 h-4" />{srcTestResult.message}
                  </div>
                )}
                <div className="flex items-center justify-between pt-2">
                  <button onClick={() => setStep('schema')} className="text-sm text-gray-500 hover:text-gray-700">← Tillbaka</button>
                  <div className="flex gap-3">
                    {!useSameDb && (
                      <button onClick={testSourceConnection} disabled={srcTesting || !srcHost}
                        className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">
                        {srcTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <TestTube className="w-4 h-4" />} Testa
                      </button>
                    )}
                    <button onClick={() => { setStep('source-schema'); loadSourceSchemas(); }}
                      className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">Nästa →</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Steg 5: Källschema */}
          {step === 'source-schema' && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
              <div>
                <h2 className="font-semibold text-gray-900">Källschema</h2>
                <p className="text-sm text-gray-500 mt-1">Välj schemat med rådata i måldatabasen. AI analyserar tabellerna och genererar vyer i målschemat.</p>
              </div>
              {loadingSrcSchemas ? (
                <div className="flex items-center gap-2 text-sm text-gray-400 py-4"><Loader2 className="w-4 h-4 animate-spin" /> Hämtar scheman...</div>
              ) : (
                <select value={selectedSourceSchema} onChange={e => setSelectedSourceSchema(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">-- Välj källschema --</option>
                  {sourceSchemas.filter(s => !['pg_catalog', 'information_schema', 'pg_toast'].includes(s)).map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              )}
              <div className="flex items-center justify-between pt-2">
                <button onClick={() => setStep('source-db')} className="text-sm text-gray-500 hover:text-gray-700">← Tillbaka</button>
                <button onClick={generate} disabled={!selectedSourceSchema || generating}
                  className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {generating ? 'AI genererar...' : 'Generera med AI'}
                </button>
              </div>
            </div>
          )}

          {/* Steg 6: Granska SQL */}
          {step === 'sql' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Granska genererade vyer</h2>
                  <p className="text-sm text-gray-500 mt-0.5">{generatedViews.length} vyer genererades</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setStep('source-schema')} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">← Tillbaka</button>
                  <button onClick={confirmAndSave} disabled={confirmSaving}
                    className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                    {confirmSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    Spara i Studio
                  </button>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700">
                ⚠️ Granska och redigera SQL. Vyer skapas i databasen när du klickar <strong>Publicera</strong> på modellsidan.
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
                  {view.description && <div className="px-4 py-2 text-xs text-gray-500 border-b border-gray-100">{view.description}</div>}
                  <textarea value={view.sql} onChange={e => setGeneratedViews(prev => prev.map((v, j) => j === i ? { ...v, sql: e.target.value } : v))}
                    rows={8} className="w-full px-4 py-3 text-xs font-mono bg-gray-900 text-green-400 resize-none focus:outline-none" />
                </div>
              ))}
              <div className="flex justify-end">
                <button onClick={confirmAndSave} disabled={confirmSaving}
                  className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                  {confirmSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
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
