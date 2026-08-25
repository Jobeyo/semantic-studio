'use client';
import { useState, useEffect } from 'react';
import { usePageHeader } from '@/contexts/PageHeaderContext';
import { Clock, Database, Sparkles, FileText, BookOpen, User, Filter } from 'lucide-react';

interface ChangeLog {
  id: number;
  action: string;
  entityType: string;
  entityName: string | null;
  details: string | null;
  actor: string;
  createdAt: string;
  model: { name: string } | null;
  modelId: number | null;
}

const ACTION_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  model_published:  { label: 'Modell publicerad',   color: 'bg-green-50 text-green-700 border-green-200',   icon: Database },
  model_unpublished:{ label: 'Modell avpublicerad', color: 'bg-amber-50 text-amber-700 border-amber-200',   icon: Database },
  model_renamed:    { label: 'Modell omdöpt',       color: 'bg-gray-50 text-gray-700 border-gray-200',      icon: Database },
  model_created:   { label: 'Modell skapad',       color: 'bg-blue-50 text-blue-700 border-blue-200',   icon: Database },
  model_deleted:   { label: 'Modell borttagen',     color: 'bg-red-50 text-red-700 border-red-200',     icon: Database },
  view_published:  { label: 'Vy publicerad',        color: 'bg-green-50 text-green-700 border-green-200', icon: FileText },
  view_created:    { label: 'Vy skapad',            color: 'bg-indigo-50 text-indigo-700 border-indigo-200', icon: FileText },
  view_updated:    { label: 'Vy uppdaterad',        color: 'bg-amber-50 text-amber-700 border-amber-200', icon: FileText },
  ai_generated:    { label: 'AI-genererat',         color: 'bg-purple-50 text-purple-700 border-purple-200', icon: Sparkles },
  glossary_added:  { label: 'Glossary-term tillagd', color: 'bg-teal-50 text-teal-700 border-teal-200', icon: BookOpen },
  glossary_updated:{ label: 'Glossary uppdaterad',  color: 'bg-teal-50 text-teal-700 border-teal-200', icon: BookOpen },
};

function formatDate(d: string) {
  const date = new Date(d);
  return date.toLocaleDateString('sv-SE') + ' ' + date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
}

function groupByDate(logs: ChangeLog[]) {
  return logs.reduce((acc, log) => {
    const date = new Date(log.createdAt).toLocaleDateString('sv-SE');
    if (!acc[date]) acc[date] = [];
    acc[date].push(log);
    return acc;
  }, {} as Record<string, ChangeLog[]>);
}

export default function ChangeLogPage() {
  const { setHeader } = usePageHeader();
  const [logs, setLogs] = useState<ChangeLog[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { setHeader('Ändringslogg', `${logs.length} händelser`); }, [logs.length]);
  const [filterAction, setFilterAction] = useState('');
  const [filterActor, setFilterActor] = useState('');

  useEffect(() => {
    fetch('/api/changelog')
      .then(r => r.json())
      .then(data => { setLogs(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = logs.filter(l =>
    (!filterAction || l.action === filterAction) &&
    (!filterActor || (filterActor === 'AI' ? l.actor === 'AI' : l.actor !== 'AI'))
  );

  const grouped = groupByDate(filtered);
  const uniqueActions = [...new Set(logs.map(l => l.action))];

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 py-3 flex items-center justify-end gap-3">
  <Filter className="w-4 h-4 text-gray-400" />
  <select value={filterAction} onChange={e => setFilterAction(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">Alla händelser</option>
            {uniqueActions.map(a => (
              <option key={a} value={a}>{ACTION_CONFIG[a]?.label ?? a}</option>
            ))}
          </select>
  <select value={filterActor} onChange={e => setFilterActor(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">Alla aktörer</option>
            <option value="AI">Enbart AI</option>
            <option value="human">Enbart användare</option>
          </select>
</div>

      <div className="flex-1 overflow-y-auto p-8">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">Laddar...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Clock className="w-12 h-12 opacity-30 mb-4" />
            <p className="font-medium text-gray-600">Ingen historik ännu</p>
            <p className="text-sm mt-1">Händelser loggas automatiskt när du arbetar i Studio</p>
          </div>
        ) : (
          <div className="max-w-3xl space-y-8">
            {Object.entries(grouped).map(([date, dateLogs]) => (
              <div key={date}>
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{date}</span>
                  <div className="h-px flex-1 bg-gray-200" />
                </div>
                <div className="space-y-3">
                  {dateLogs.map((log, i) => {
                    const cfg = ACTION_CONFIG[log.action] ?? { label: log.action, color: 'bg-gray-50 text-gray-700 border-gray-200', icon: Clock };
                    const Icon = cfg.icon;
                    const isAI = log.actor === 'AI';
                    return (
                      <div key={log.id} className="flex gap-4">
                        <div className="flex flex-col items-center">
                          <div className={`w-8 h-8 rounded-full border flex items-center justify-center flex-shrink-0 ${cfg.color}`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          {i < dateLogs.length - 1 && <div className="w-px flex-1 bg-gray-200 my-1" />}
                        </div>
                        <div className="flex-1 pb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cfg.color}`}>
                              {cfg.label}
                            </span>
                            {log.model && (
                              <span className="text-xs text-gray-500 font-mono">{log.model.name}</span>
                            )}
                            {log.entityName && log.entityName !== log.model?.name && (
                              <span className="text-xs text-gray-400 font-mono">· {log.entityName}</span>
                            )}
                          </div>
                          {log.details && (
                            <p className="text-sm text-gray-600 mt-1">{log.details}</p>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            {isAI ? (
                              <span className="flex items-center gap-1 text-xs text-purple-600">
                                <Sparkles className="w-3 h-3" /> AI
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-xs text-gray-400">
                                <User className="w-3 h-3" /> {log.actor}
                              </span>
                            )}
                            <span className="text-xs text-gray-300">·</span>
                            <span className="text-xs text-gray-400">{formatDate(log.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
