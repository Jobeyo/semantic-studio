'use client';
import { useState, useEffect } from 'react';
import { GitBranch, CheckCircle, XCircle, Loader2, Database, Edit2, X, Save } from 'lucide-react';

interface Connection {
  modelId: number;
  modelName: string;
  sourceType: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
  schema: string;
  status?: 'ok' | 'error' | 'pending';
  version?: string;
  error?: string;
}

const sourceColors: Record<string, string> = {
  postgres: '#336791',
  sqlserver: '#e74c3c',
  mysql: '#f29111',
  sqlite: '#003B57',
};

export default function ConnectionsPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<number | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<Connection>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/models')
      .then(r => r.json())
      .then(models => {
        const conns = models.map((m: any) => ({
          modelId: m.id,
          modelName: m.name,
          sourceType: m.sourceType,
          host: m.sourceConfig?.host ?? '',
          port: m.sourceConfig?.port ?? 5432,
          database: m.sourceConfig?.database ?? '',
          user: m.sourceConfig?.user ?? '',
          password: '',
          ssl: m.sourceConfig?.ssl ?? false,
          schema: m.sourceConfig?.schema ?? 'semantic_layer',
          status: 'pending' as const,
        }));
        setConnections(conns);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function startEdit(idx: number) {
    setEditingIdx(idx);
    setEditForm({ ...connections[idx] });
  }

  function cancelEdit() {
    setEditingIdx(null);
    setEditForm({});
  }

  async function saveEdit(idx: number) {
    setSaving(true);
    const conn = connections[idx];
    try {
      const sourceConfig: any = {
        host: editForm.host,
        port: editForm.port,
        database: editForm.database,
        user: editForm.user,
        ssl: editForm.ssl,
        schema: editForm.schema,
      };
      if (editForm.password) sourceConfig.password = editForm.password;

      const res = await fetch(`/api/models/${conn.modelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceConfig }),
      });
      if (res.ok) {
        setConnections(prev => prev.map((c, i) => i === idx ? { ...c, ...editForm, status: 'pending' } : c));
        setEditingIdx(null);
        setEditForm({});
      }
    } catch {}
    setSaving(false);
  }

  async function testConnection(conn: Connection, idx: number) {
    setTesting(idx);
    try {
      const res = await fetch('/api/connections/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceType: conn.sourceType,
          host: editingIdx === idx ? editForm.host : conn.host,
          port: editingIdx === idx ? editForm.port : conn.port,
          database: editingIdx === idx ? editForm.database : conn.database,
          user: editingIdx === idx ? editForm.user : conn.user,
          password: editingIdx === idx ? editForm.password : '',
          ssl: editingIdx === idx ? editForm.ssl : conn.ssl,
        }),
      });
      const data = await res.json();
      setConnections(prev => prev.map((c, i) => i === idx
        ? { ...c, status: data.ok ? 'ok' : 'error', version: data.version, error: data.error }
        : c
      ));
    } catch {
      setConnections(prev => prev.map((c, i) => i === idx
        ? { ...c, status: 'error', error: 'Anslutning misslyckades' }
        : c
      ));
    }
    setTesting(null);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-8">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : connections.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <GitBranch className="w-12 h-12 opacity-30 mb-4" />
            <p className="font-medium text-gray-600 mb-1">Inga anslutningar ännu</p>
            <p className="text-sm">Skapa en modell för att lägga till en anslutning</p>
          </div>
        ) : (
          <div className="space-y-4 max-w-4xl">
            {connections.map((conn, idx) => (
              <div key={conn.modelId} className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: sourceColors[conn.sourceType] ?? '#6b7280' }}>
                      <Database className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{conn.modelName}</span>
                        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{conn.sourceType}</span>
                      </div>
                      <p className="text-sm text-gray-500 font-mono mt-0.5">
                        {conn.host}:{conn.port}/{conn.database}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {conn.status === 'ok' && (
                      <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 border border-green-200 px-2 py-1 rounded-lg">
                        <CheckCircle className="w-3 h-3" /> Ansluten
                      </span>
                    )}
                    {conn.status === 'error' && (
                      <span className="flex items-center gap-1 text-xs text-red-600 bg-red-50 border border-red-200 px-2 py-1 rounded-lg">
                        <XCircle className="w-3 h-3" /> Fel
                      </span>
                    )}
                    <button onClick={() => testConnection(conn, idx)} disabled={testing === idx}
                      className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">
                      {testing === idx ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                      Testa
                    </button>
                    {editingIdx === idx ? (
                      <button onClick={cancelEdit} className="p-1.5 text-gray-400 hover:text-gray-600">
                        <X className="w-4 h-4" />
                      </button>
                    ) : (
                      <button onClick={() => startEdit(idx)} className="p-1.5 text-gray-400 hover:text-indigo-600">
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {editingIdx === idx ? (
                  <div className="mt-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Host *</label>
                        <input value={editForm.host ?? ''} onChange={e => setEditForm({...editForm, host: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Port *</label>
                        <input value={editForm.port ?? ''} onChange={e => setEditForm({...editForm, port: parseInt(e.target.value)})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Databas *</label>
                        <input value={editForm.database ?? ''} onChange={e => setEditForm({...editForm, database: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Användare *</label>
                        <input value={editForm.user ?? ''} onChange={e => setEditForm({...editForm, user: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Lösenord *</label>
                        <input type="password" value={editForm.password ?? ''} onChange={e => setEditForm({...editForm, password: e.target.value})}
                          placeholder="Nytt lösenord" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Schema</label>
                        <input value={editForm.schema ?? ''} onChange={e => setEditForm({...editForm, schema: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono" />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                        <input type="checkbox" checked={editForm.ssl ?? false} onChange={e => setEditForm({...editForm, ssl: e.target.checked})} />
                        SSL
                      </label>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <button onClick={cancelEdit} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                        Avbryt
                      </button>
                      <button onClick={() => testConnection(conn, idx)} disabled={testing === idx}
                        className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                        {testing === idx ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Testa
                      </button>
                      <button onClick={() => saveEdit(idx)} disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        Spara
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 grid grid-cols-4 gap-3 text-xs">
                    <div className="bg-gray-50 rounded-lg p-2.5">
                      <span className="text-gray-400 block mb-1">Användare</span>
                      <span className="font-mono text-gray-700">{conn.user}</span>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2.5">
                      <span className="text-gray-400 block mb-1">Schema</span>
                      <span className="font-mono text-gray-700">{conn.schema}</span>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2.5">
                      <span className="text-gray-400 block mb-1">SSL</span>
                      <span className="font-mono text-gray-700">{conn.ssl ? 'Ja' : 'Nej'}</span>
                    </div>
                    {conn.version && (
                      <div className="bg-gray-50 rounded-lg p-2.5">
                        <span className="text-gray-400 block mb-1">Version</span>
                        <span className="font-mono text-gray-700">{conn.version}</span>
                      </div>
                    )}
                    {conn.error && (
                      <div className="bg-red-50 rounded-lg p-2.5 col-span-4">
                        <span className="text-red-400 block mb-1">Fel</span>
                        <span className="text-red-600">{conn.error}</span>
                      </div>
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
