'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, TestTube, CheckCircle, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';

type Step = 'info' | 'connection' | 'schema';

export default function NewModelPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('info');
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [schemas, setSchemas] = useState<string[]>([]);
  const [loadingSchemas, setLoadingSchemas] = useState(false);
  const [selectedSchema, setSelectedSchema] = useState('');
  const [newSchemaName, setNewSchemaName] = useState('');
  const [creatingSchema, setCreatingSchema] = useState(false);
  const [schemaAction, setSchemaAction] = useState<'existing' | 'new'>('new');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sourceType, setSourceType] = useState('postgres');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('5432');
  const [database, setDatabase] = useState('');
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [ssl, setSsl] = useState(false);

  async function testConnection() {
    setTesting(true); setTestResult(null);
    try {
      const res = await fetch('/api/connections/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceType, host, port: parseInt(port), database, user, password, ssl }),
      });
      const data = await res.json();
      setTestResult({ ok: data.ok, message: data.ok ? `Ansluten! ${data.version ?? ''}` : data.error });
    } catch {
      setTestResult({ ok: false, message: 'Anslutning misslyckades' });
    }
    setTesting(false);
  }

  async function loadSchemas() {
    setLoadingSchemas(true);
    try {
      const res = await fetch('/api/connections/schemas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceType, host, port: parseInt(port), database, user, password, ssl }),
      });
      if (res.ok) {
        const data = await res.json();
        setSchemas(data.schemas ?? []);
      }
    } catch {}
    setLoadingSchemas(false);
  }

  async function goToSchema() {
    setStep('schema');
    loadSchemas();
  }

  async function createSchema() {
    if (!newSchemaName.trim()) return;
    setCreatingSchema(true);
    try {
      const res = await fetch('/api/connections/schemas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceType, host, port: parseInt(port), database, user, password, ssl, schemaName: newSchemaName.trim() }),
      });
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

  async function handleCreate() {
    const schema = schemaAction === 'new' ? newSchemaName.trim() : selectedSchema;
    if (!schema) { alert('Välj eller skapa ett schema'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, description, sourceType,
          sourceConfig: { host, port: parseInt(port), database, user, password, ssl, schema },
        }),
      });
      if (res.ok) {
        const model = await res.json();
        router.push(`/models/${model.id}`);
      }
    } catch {}
    setLoading(false);
  }

  const steps: { key: Step; label: string }[] = [
    { key: 'info', label: 'Grundinfo' },
    { key: 'connection', label: 'Anslutning' },
    { key: 'schema', label: 'Schema' },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 py-5 border-b border-gray-200 bg-white flex items-center gap-4">
        <Link href="/models" className="text-gray-400 hover:text-gray-600"><ArrowLeft className="w-5 h-5" /></Link>
        <h1 className="text-lg font-semibold text-gray-900">Ny semantisk modell</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-2xl mx-auto">
          {/* Steg-indikator */}
          <div className="flex items-center gap-3 mb-8">
            {steps.map((s, i) => (
              <div key={s.key} className="flex items-center gap-3">
                <div className={`flex items-center gap-2 text-sm font-medium ${step === s.key ? 'text-indigo-600' : steps.indexOf(steps.find(x => x.key === step)!) > i ? 'text-green-600' : 'text-gray-400'}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${step === s.key ? 'bg-indigo-600 text-white' : steps.indexOf(steps.find(x => x.key === step)!) > i ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                    {steps.indexOf(steps.find(x => x.key === step)!) > i ? '✓' : i + 1}
                  </div>
                  {s.label}
                </div>
                {i < steps.length - 1 && <div className="w-8 h-px bg-gray-200" />}
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
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                  Nästa →
                </button>
              </div>
            </div>
          )}

          {/* Steg 2: Anslutning */}
          {step === 'connection' && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
              <h2 className="font-semibold text-gray-900">Anslutningsinformation</h2>
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
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />{testResult.message}
                </div>
              )}
              <div className="flex items-center justify-between pt-2">
                <button onClick={() => setStep('info')} className="text-sm text-gray-500 hover:text-gray-700">← Tillbaka</button>
                <div className="flex gap-3">
                  <button onClick={testConnection} disabled={testing || !host}
                    className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">
                    {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <TestTube className="w-4 h-4" />} Testa
                  </button>
                  <button onClick={goToSchema} disabled={!host || !database || !user}
                    className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                    Nästa →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Steg 3: Schema */}
          {step === 'schema' && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
              <h2 className="font-semibold text-gray-900">Semantiskt schema</h2>
              <p className="text-sm text-gray-500">Välj ett befintligt schema eller skapa ett nytt. Schemat är din isolerade arbetsyta i databasen.</p>

              <div className="flex gap-3">
                <button onClick={() => setSchemaAction('new')}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${schemaAction === 'new' ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                  Skapa nytt schema
                </button>
                <button onClick={() => setSchemaAction('existing')}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${schemaAction === 'existing' ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                  Välj befintligt
                </button>
              </div>

              {schemaAction === 'new' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Schemanamn *</label>
                    <div className="flex gap-2">
                      <input value={newSchemaName} onChange={e => setNewSchemaName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                        placeholder="t.ex. semantic_layer"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                      <button onClick={createSchema} disabled={!newSchemaName.trim() || creatingSchema}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                        {creatingSchema ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        Skapa
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Välj schema</label>
                  {loadingSchemas ? (
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <Loader2 className="w-4 h-4 animate-spin" /> Hämtar scheman...
                    </div>
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
                <button onClick={handleCreate} disabled={loading || (!selectedSchema && !newSchemaName.trim())}
                  className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Skapa modell
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
