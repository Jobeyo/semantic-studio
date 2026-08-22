'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, TestTube, CheckCircle, Plus, Sparkles } from 'lucide-react';
import Link from 'next/link';

type Step = 'info' | 'source-db' | 'source-schema' | 'target-db' | 'target-schema' | 'naming' | 'sql';

interface GeneratedView {
  name: string; displayName: string; description: string;
  type: string; sql: string; columns: any[];
}

export default function NewModelPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('info');
  const [createdModelId, setCreatedModelId] = useState<number | null>(null);

  // Namnkonventioner
  const [namingLanguage, setNamingLanguage] = useState<'sv' | 'en'>('sv');
  const [namingStyle, setNamingStyle] = useState<'underscore' | 'camel'>('underscore');

  // Steg 1 – Grundinfo
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sourceType, setSourceType] = useState('postgres');

  // Steg 2 – Källdatabas
  const [srcHost, setSrcHost] = useState('');
  const [srcPort, setSrcPort] = useState('5432');
  const [srcDatabase, setSrcDatabase] = useState('');
  const [srcUser, setSrcUser] = useState('');
  const [srcPassword, setSrcPassword] = useState('');
  const [srcSsl, setSrcSsl] = useState(false);
  const [srcTesting, setSrcTesting] = useState(false);
  const [srcTestResult, setSrcTestResult] = useState<{ok: boolean; message: string} | null>(null);
  const [srcDatabases, setSrcDatabases] = useState<string[]>([]);
  const [loadingSrcDbs, setLoadingSrcDbs] = useState(false);

  // Steg 3 – Källschema
  const [sourceSchemas, setSourceSchemas] = useState<string[]>([]);
  const [loadingSrcSchemas, setLoadingSrcSchemas] = useState(false);
  const [selectedSourceSchema, setSelectedSourceSchema] = useState('');

  // Steg 4 – Måldatabas
  const [useSameDb, setUseSameDb] = useState(true);
  const [tgtHost, setTgtHost] = useState('');
  const [tgtPort, setTgtPort] = useState('5432');
  const [tgtDatabase, setTgtDatabase] = useState('');
  const [tgtUser, setTgtUser] = useState('');
  const [tgtPassword, setTgtPassword] = useState('');
  const [tgtSsl, setTgtSsl] = useState(false);
  const [tgtTesting, setTgtTesting] = useState(false);
  const [tgtTestResult, setTgtTestResult] = useState<{ok: boolean; message: string} | null>(null);

  // Steg 5 – Målschema
  const [targetSchemas, setTargetSchemas] = useState<string[]>([]);
  const [loadingTgtSchemas, setLoadingTgtSchemas] = useState(false);
  const [selectedTargetSchema, setSelectedTargetSchema] = useState('');
  const [newSchemaName, setNewSchemaName] = useState('');
  const [schemaAction, setSchemaAction] = useState<'new' | 'existing'>('new');
  const [creatingSchema, setCreatingSchema] = useState(false);
  const [saving, setSaving] = useState(false);

  // Steg 6 – SQL
  const [generating, setGenerating] = useState(false);
  const [generatedViews, setGeneratedViews] = useState<GeneratedView[]>([]);
  const [confirmSaving, setConfirmSaving] = useState(false);
  const [deletingViewIndex, setDeletingViewIndex] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [previewData, setPreviewData] = useState<Record<number, {count: number; columns: string[]; rows: any[]; loading: boolean; error: string}>>({});

  // Befintliga anslutningar
  const [existingConns, setExistingConns] = useState<any[]>([]);

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
    { key: 'source-db', label: 'Källa DB' },
    { key: 'source-schema', label: 'Källschema' },
    { key: 'target-db', label: 'Mål DB' },
    { key: 'target-schema', label: 'Målschema' },
    { key: 'naming', label: 'Namnkonvention' },
    { key: 'sql', label: 'Granska' },
  ];
  const currentStepIdx = stepLabels.findIndex(s => s.key === step);

  // Källdatabas-funktioner
  async function testSourceConnection() {
    setSrcTesting(true); setSrcTestResult(null);
    try {
      const res = await fetch('/api/connections/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceType, host: srcHost, port: parseInt(srcPort), database: srcDatabase, user: srcUser, password: srcPassword, ssl: srcSsl }) });
      const data = await res.json();
      setSrcTestResult({ ok: data.ok, message: data.ok ? `Ansluten! ${data.version ?? ''}` : data.error });
    } catch { setSrcTestResult({ ok: false, message: 'Anslutning misslyckades' }); }
    setSrcTesting(false);
  }

  async function loadSourceDatabases(conn: any) {
    setLoadingSrcDbs(true);
    try {
      const res = await fetch('/api/connections/databases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceType, host: conn.host, port: conn.port, user: conn.user, ssl: conn.ssl }) });
      if (res.ok) { const data = await res.json(); setSrcDatabases(data.databases ?? []); }
    } catch {}
    setLoadingSrcDbs(false);
  }

  async function loadSourceSchemas() {
    setLoadingSrcSchemas(true);
    try {
      const res = await fetch('/api/connections/schemas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceType, host: srcHost, port: parseInt(srcPort), database: srcDatabase, user: srcUser, password: srcPassword, ssl: srcSsl }) });
      if (res.ok) { const data = await res.json(); setSourceSchemas(data.schemas ?? []); }
    } catch {}
    setLoadingSrcSchemas(false);
  }

  // Måldatabas-funktioner
  function getTargetConn() {
    return useSameDb
      ? { host: srcHost, port: parseInt(srcPort), database: srcDatabase, user: srcUser, password: srcPassword, ssl: srcSsl }
      : { host: tgtHost, port: parseInt(tgtPort), database: tgtDatabase, user: tgtUser, password: tgtPassword, ssl: tgtSsl };
  }

  async function testTargetConnection() {
    setTgtTesting(true); setTgtTestResult(null);
    try {
      const conn = getTargetConn();
      const res = await fetch('/api/connections/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceType, ...conn }) });
      const data = await res.json();
      setTgtTestResult({ ok: data.ok, message: data.ok ? `Ansluten! ${data.version ?? ''}` : data.error });
    } catch { setTgtTestResult({ ok: false, message: 'Anslutning misslyckades' }); }
    setTgtTesting(false);
  }

  async function loadTargetSchemas() {
    setLoadingTgtSchemas(true);
    try {
      const conn = getTargetConn();
      const res = await fetch('/api/connections/schemas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceType, ...conn }) });
      if (res.ok) { const data = await res.json(); setTargetSchemas(data.schemas ?? []); }
    } catch {}
    setLoadingTgtSchemas(false);
  }

  async function createTargetSchema() {
    if (!newSchemaName.trim()) return;
    setCreatingSchema(true);
    const conn = getTargetConn();
    try {
      const res = await fetch('/api/connections/schemas', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceType, ...conn, schemaName: newSchemaName.trim() }) });
      if (res.ok) {
        setTargetSchemas(prev => [...prev, newSchemaName.trim()].sort());
        setSelectedTargetSchema(newSchemaName.trim());
        setSchemaAction('existing');
        setNewSchemaName('');
      } else {
        const err = await res.json();
        setErrorMsg('Kunde inte skapa schema: ' + err.error);
      }
    } catch {}
    setCreatingSchema(false);
  }

  async function saveModel() {
    const schema = schemaAction === 'new' ? newSchemaName.trim() : selectedTargetSchema;
    if (!schema) { setErrorMsg('Välj eller skapa ett schema'); return; }
    setSaving(true);
    const conn = getTargetConn();
    try {
      const res = await fetch('/api/models', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description, sourceType, sourceConfig: { ...conn, schema } }) });
      if (res.ok) {
        const model = await res.json();
        setCreatedModelId(model.id);
        setStep('naming');
      }
    } catch {}
    setSaving(false);
  }

  async function generateWithNaming() {
    const schema = schemaAction === 'new' ? newSchemaName.trim() : selectedTargetSchema;
    if (!createdModelId || !schema) return;
    await generate(createdModelId, schema);
  }

  async function generate(modelId: number, targetSchema: string) {
    setGenerating(true);
    try {
      const body = {
        sourceSchema: selectedSourceSchema,
        targetSchema,
        sourceDb: { host: srcHost, port: parseInt(srcPort), database: srcDatabase, user: srcUser, password: srcPassword, ssl: srcSsl },
      };
      const res = await fetch(`/api/models/${modelId}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) {
        const data = await res.json();
        setGeneratedViews(data.views);
        setStep('sql');
      } else {
        const err = await res.json();
        setErrorMsg('Fel: ' + err.error);
      }
    } catch { setErrorMsg('Generering misslyckades'); }
    setGenerating(false);
  }

  async function previewView(index: number, sql: string) {
    setPreviewData(prev => ({ ...prev, [index]: { count: 0, columns: [], rows: [], loading: true, error: '' } }));
    try {
      const res = await fetch(`/api/models/${createdModelId}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql, sourceConfig: { host: srcHost, port: parseInt(srcPort), database: srcDatabase, user: srcUser, password: srcPassword, ssl: srcSsl } }),
      });
      const data = await res.json();
      if (res.ok) {
        setPreviewData(prev => ({ ...prev, [index]: { ...data, loading: false, error: '' } }));
      } else {
        setPreviewData(prev => ({ ...prev, [index]: { count: 0, columns: [], rows: [], loading: false, error: data.error } }));
      }
    } catch (e) {
      setPreviewData(prev => ({ ...prev, [index]: { count: 0, columns: [], rows: [], loading: false, error: 'Fel vid preview' } }));
    }
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
        <div className="max-w-3xl mx-auto">

          {/* Steg-indikator */}
          <div className="flex items-center gap-1 mb-8 overflow-x-auto pb-1">
            {stepLabels.map((s, i) => (
              <div key={s.key} className="flex items-center gap-1">
                <div className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ${step === s.key ? 'bg-indigo-600 text-white' : i < currentStepIdx ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                  <span>{i < currentStepIdx ? '✓' : i + 1}</span>
                  <span>{s.label}</span>
                </div>
                {i < stepLabels.length - 1 && <div className="w-4 h-px bg-gray-200 flex-shrink-0" />}
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
                </select>
              </div>
              <div className="flex justify-end">
                <button onClick={() => setStep('source-db')} disabled={!name.trim()}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">Nästa →</button>
              </div>
            </div>
          )}

          {/* Steg 2: Källdatabas */}
          {step === 'source-db' && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
              <div>
                <h2 className="font-semibold text-gray-900">Källdatabas</h2>
                <p className="text-sm text-gray-500 mt-1">Databasen där källdata finns. AI analyserar tabellerna härifrån.</p>
              </div>
              {existingConns.length > 0 && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                  <label className="block text-xs font-medium text-indigo-700 mb-1.5">Återanvänd befintlig anslutning</label>
                  <select onChange={e => {
                    const conn = existingConns.find(c => c.modelId === parseInt(e.target.value));
                    if (conn) { setSrcHost(conn.host); setSrcPort(String(conn.port)); setSrcDatabase(conn.database); setSrcUser(conn.user); setSrcSsl(conn.ssl); setSrcTestResult(null); }
                  }} defaultValue="" className="w-full px-3 py-2 border border-indigo-300 rounded-lg text-sm bg-white">
                    <option value="">-- Välj befintlig anslutning --</option>
                    {existingConns.map(c => <option key={c.modelId} value={c.modelId}>{c.modelName} ({c.host}:{c.port}/{c.database})</option>)}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Host *</label>
                  <input value={srcHost} onChange={e => setSrcHost(e.target.value)} placeholder="localhost"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Port *</label>
                  <input value={srcPort} onChange={e => setSrcPort(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Databas *</label>
                  {srcDatabases.length > 0 ? (
                    <select value={srcDatabase} onChange={e => setSrcDatabase(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                      <option value="">-- Välj databas --</option>
                      {srcDatabases.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  ) : (
                    <input value={srcDatabase} onChange={e => setSrcDatabase(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  )}
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
              {srcTestResult && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${srcTestResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  <CheckCircle className="w-4 h-4" />{srcTestResult.message}
                </div>
              )}
              <div className="flex items-center justify-between pt-2">
                <button onClick={() => setStep('info')} className="text-sm text-gray-500 hover:text-gray-700">← Tillbaka</button>
                <div className="flex gap-3">
                  <button onClick={testSourceConnection} disabled={srcTesting || !srcHost}
                    className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">
                    {srcTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <TestTube className="w-4 h-4" />} Testa
                  </button>
                  <button onClick={() => { setStep('source-schema'); loadSourceSchemas(); }} disabled={!srcHost || !srcDatabase || !srcUser}
                    className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">Nästa →</button>
                </div>
              </div>
            </div>
          )}

          {/* Steg 3: Källschema */}
          {step === 'source-schema' && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
              <div>
                <h2 className="font-semibold text-gray-900">Källschema</h2>
                <p className="text-sm text-gray-500 mt-1">Välj schemat med källdata. AI analyserar tabellerna och genererar ett semantiskt lager.</p>
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
                <button onClick={() => setStep('target-db')} disabled={!selectedSourceSchema}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">Nästa →</button>
              </div>
            </div>
          )}

          {/* Steg 4: Måldatabas */}
          {step === 'target-db' && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
              <div>
                <h2 className="font-semibold text-gray-900">Måldatabas</h2>
                <p className="text-sm text-gray-500 mt-1">Databasen där det semantiska vylagret ska skapas. Måste vara samma databas som källan för PostgreSQL.</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setUseSameDb(true)} className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${useSameDb ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                  Samma som källan
                </button>
                <button onClick={() => setUseSameDb(false)} className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${!useSameDb ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                  Annan databas
                </button>
              </div>
              {useSameDb ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm font-mono text-green-800">
                  <CheckCircle className="w-4 h-4 inline mr-2 text-green-600" />
                  {srcHost}:{srcPort}/{srcDatabase}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Host *</label>
                    <input value={tgtHost} onChange={e => setTgtHost(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
                    <input value={tgtPort} onChange={e => setTgtPort(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Databas *</label>
                    <input value={tgtDatabase} onChange={e => setTgtDatabase(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Användare *</label>
                    <input value={tgtUser} onChange={e => setTgtUser(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Lösenord</label>
                    <input type="password" value={tgtPassword} onChange={e => setTgtPassword(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div className="col-span-2">
                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input type="checkbox" checked={tgtSsl} onChange={e => setTgtSsl(e.target.checked)} /> Använd SSL
                    </label>
                  </div>
                </div>
              )}
              {tgtTestResult && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${tgtTestResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  <CheckCircle className="w-4 h-4" />{tgtTestResult.message}
                </div>
              )}
              <div className="flex items-center justify-between pt-2">
                <button onClick={() => setStep('source-schema')} className="text-sm text-gray-500 hover:text-gray-700">← Tillbaka</button>
                <div className="flex gap-3">
                  {!useSameDb && (
                    <button onClick={testTargetConnection} disabled={tgtTesting || !tgtHost}
                      className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">
                      {tgtTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <TestTube className="w-4 h-4" />} Testa
                    </button>
                  )}
                  <button onClick={() => { setStep('target-schema'); loadTargetSchemas(); }}
                    className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">Nästa →</button>
                </div>
              </div>
            </div>
          )}

          {/* Steg 5: Målschema */}
          {step === 'target-schema' && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
              <div>
                <h2 className="font-semibold text-gray-900">Målschema</h2>
                <p className="text-sm text-gray-500 mt-1">Välj eller skapa schemat där det semantiska vylagret ska skapas.</p>
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
                  {selectedTargetSchema && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                      <CheckCircle className="w-4 h-4" /> Schema "{selectedTargetSchema}" skapades!
                    </div>
                  )}
                </div>
              )}
              {schemaAction === 'existing' && (
                <div>
                  {loadingTgtSchemas ? (
                    <div className="flex items-center gap-2 text-sm text-gray-400"><Loader2 className="w-4 h-4 animate-spin" /> Hämtar scheman...</div>
                  ) : (
                    <select value={selectedTargetSchema} onChange={e => setSelectedTargetSchema(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                      <option value="">-- Välj schema --</option>
                      {targetSchemas.filter(s => !['pg_catalog', 'information_schema', 'pg_toast'].includes(s)).map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}
              {errorMsg && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 flex items-center justify-between">
                  <span>⚠️ {errorMsg}</span>
                  <button onClick={() => setErrorMsg('')} className="text-red-400 hover:text-red-600 ml-4">✕</button>
                </div>
              )}
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700">
                ⚠️ Nästa steg skapar modellen och låter AI generera det semantiska lagret. Du får granska SQL innan något körs mot databasen.
              </div>
              <div className="flex items-center justify-between pt-2">
                <button onClick={() => setStep('target-db')} className="text-sm text-gray-500 hover:text-gray-700">← Tillbaka</button>
                <button onClick={saveModel} disabled={saving || (!selectedTargetSchema && !newSchemaName.trim())}
                  className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                  {(saving || generating) && <Loader2 className="w-4 h-4 animate-spin" />}
                  {saving ? 'Skapar modell...' : generating ? 'AI genererar...' : 'Fortsätt →'}
                </button>
              </div>
            </div>
          )}

          {/* Steg 6: Granska SQL */}
          {step === 'naming' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Namnkonvention</h2>
                <p className="text-sm text-gray-500 mt-0.5">Välj hur AI ska namnge vyer och kolumner</p>
              </div>

              <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-6">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Språk för affärsnamn</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setNamingLanguage('sv')}
                      className={`p-4 rounded-xl border-2 text-left transition-colors ${namingLanguage === 'sv' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <div className="text-2xl mb-2">🇸🇪</div>
                      <p className="font-medium text-gray-900 text-sm">Svenska</p>
                      <p className="text-xs text-gray-500 mt-0.5">ex. "Orderdatum", "Kundnamn"</p>
                    </button>
                    <button onClick={() => setNamingLanguage('en')}
                      className={`p-4 rounded-xl border-2 text-left transition-colors ${namingLanguage === 'en' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <div className="text-2xl mb-2">🇬🇧</div>
                      <p className="font-medium text-gray-900 text-sm">Engelska</p>
                      <p className="text-xs text-gray-500 mt-0.5">ex. "Order Date", "Customer Name"</p>
                    </button>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Notation för tekniska namn (i DB)</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setNamingStyle('underscore')}
                      className={`p-4 rounded-xl border-2 text-left transition-colors ${namingStyle === 'underscore' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <p className="font-medium text-gray-900 text-sm mb-1">Underscore</p>
                      <p className="text-xs text-gray-400 font-mono">order_date, customer_name</p>
                    </button>
                    <button onClick={() => setNamingStyle('camel')}
                      className={`p-4 rounded-xl border-2 text-left transition-colors ${namingStyle === 'camel' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <p className="font-medium text-gray-900 text-sm mb-1">Kamelnotation</p>
                      <p className="text-xs text-gray-400 font-mono">orderDate, customerName</p>
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex justify-between">
                <button onClick={() => setStep('target-schema')} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">← Tillbaka</button>
                <button onClick={generateWithNaming} disabled={generating || saving}
                  className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                  {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Genererar...</> : <><Sparkles className="w-4 h-4" /> Generera med AI →</>}
                </button>
              </div>
            </div>
          )}
          {step === 'sql' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Granska genererade vyer</h2>
                  <p className="text-sm text-gray-500 mt-0.5">{generatedViews.length} vyer genererades – granska och redigera SQL innan du sparar</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setStep('target-schema')} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">← Tillbaka</button>
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
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${view.type === 'fact' ? 'bg-blue-50 text-blue-600 border-blue-200' : view.type === 'dimension' ? 'bg-purple-50 text-purple-600 border-purple-200' : view.type === 'kpi' ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-green-50 text-green-600 border-green-200'}`}>
                        {view.type === 'fact' ? 'Faktatabell' : view.type === 'dimension' ? 'Dimension' : view.type === 'kpi' ? 'Nyckeltal' : 'Mått'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-400">{view.columns?.length ?? 0} kolumner</span>
                      {previewData[i]?.count !== undefined && !previewData[i]?.loading && (
                        <span className="text-xs text-green-600">{previewData[i].count.toLocaleString()} rader</span>
                      )}
                      <button onClick={() => previewView(i, view.sql)} disabled={previewData[i]?.loading}
                        className="text-xs text-indigo-600 hover:underline disabled:opacity-50">
                        {previewData[i]?.loading ? 'Laddar...' : 'Preview'}
                      </button>
                      <button onClick={() => setDeletingViewIndex(i)}
                        className="text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-0.5 rounded transition-colors">
                        Ta bort
                      </button>
                    </div>
                      <button onClick={() => setGeneratedViews(prev => prev.filter((_, j) => j !== i))}
                        className="text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-0.5 rounded transition-colors">
                        Ta bort
                      </button>
                    </div>
                  </div>
                  {view.description && <div className="px-4 py-2 text-xs text-gray-500 border-b border-gray-100">{view.description}</div>}
                  <textarea value={view.sql} onChange={e => setGeneratedViews(prev => prev.map((v, j) => j === i ? { ...v, sql: e.target.value } : v))}
                    rows={8} className="w-full px-4 py-3 text-xs font-mono bg-gray-900 text-green-400 resize-none focus:outline-none" />
                  {previewData[i]?.rows?.length > 0 && (
                    <div className="overflow-x-auto border-t border-gray-200">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50">
                          <tr>{previewData[i].columns.map(c => <th key={c} className="px-3 py-2 text-left text-gray-600 font-medium uppercase tracking-wider">{c}</th>)}</tr>
                        </thead>
                        <tbody>
                          {previewData[i].rows.map((row, ri) => (
                            <tr key={ri} className="border-t border-gray-100">
                              {previewData[i].columns.map(c => <td key={c} className="px-3 py-2 text-gray-700">{String(row[c] ?? '')}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {previewData[i]?.error && (
                    <div className="px-4 py-2 text-xs text-red-600 bg-red-50 border-t border-red-200">⚠️ {previewData[i].error}</div>
                  )}
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
