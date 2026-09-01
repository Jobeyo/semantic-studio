'use client';
import { useState, useEffect } from 'react';
import { ShieldCheck, Database, Plus, Trash2, Play, CheckCircle, XCircle, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';

interface QualityRule {
  id: number;
  columnName: string;
  ruleType: string;
  ruleValue: string | null;
  description: string | null;
}

interface ModelView {
  id: number;
  name: string;
  displayName: string;
  columns: { name: string; displayName: string; dataType: string }[];
  qualityRules: QualityRule[];
}

interface Model {
  id: number;
  name: string;
  views: ModelView[];
}

type RuleType = 'not_null' | 'unique' | 'min' | 'max' | 'regex';

const RULE_LABELS: Record<RuleType, string> = {
  not_null: 'Ej null',
  unique: 'Unika värden',
  min: 'Minvärde',
  max: 'Maxvärde',
  regex: 'Format (regex)',
};

interface RuleResult {
  viewName: string;
  columnName: string;
  ruleType: string;
  passed: boolean;
  failCount?: number;
  totalCount?: number;
  error?: string;
}

export default function DataQualityPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedModels, setExpandedModels] = useState<Set<number>>(new Set());
  const [expandedViews, setExpandedViews] = useState<Set<number>>(new Set());
  const [addingRule, setAddingRule] = useState<number | null>(null); // viewId
  const [newRule, setNewRule] = useState({ columnName: '', ruleType: 'not_null' as RuleType, ruleValue: '', description: '' });
  const [running, setRunning] = useState<number | null>(null); // modelId
  const [results, setResults] = useState<RuleResult[]>([]);

  useEffect(() => {
    fetch('/api/governance/quality')
      .then(r => r.json())
      .then(data => { setModels(data.models ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function addRule(viewId: number) {
    if (!newRule.columnName || !newRule.ruleType) return;
    const res = await fetch('/api/governance/quality/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ viewId, ...newRule }),
    });
    if (res.ok) {
      const rule = await res.json();
      setModels(prev => prev.map(m => ({
        ...m,
        views: m.views.map(v => v.id === viewId ? { ...v, qualityRules: [...v.qualityRules, rule] } : v)
      })));
      setAddingRule(null);
      setNewRule({ columnName: '', ruleType: 'not_null', ruleValue: '', description: '' });
    }
  }

  async function deleteRule(viewId: number, ruleId: number) {
    await fetch(`/api/governance/quality/rules/${ruleId}`, { method: 'DELETE' });
    setModels(prev => prev.map(m => ({
      ...m,
      views: m.views.map(v => v.id === viewId ? { ...v, qualityRules: v.qualityRules.filter(r => r.id !== ruleId) } : v)
    })));
  }

  async function runChecks(model: Model) {
    setRunning(model.id);
    setResults([]);
    try {
      const res = await fetch('/api/governance/quality/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId: model.id }),
      });
      const data = await res.json();
      setResults(data.results ?? []);
    } catch {}
    setRunning(null);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 py-6 border-b border-gray-200 bg-white">
        <h1 className="text-xl font-semibold text-gray-900">Data Quality</h1>
        <p className="text-sm text-gray-500 mt-1">Definiera och kör kvalitetskontroller på dina datavyer</p>
      </div>
      <div className="flex-1 overflow-y-auto p-8">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">Laddar...</div>
        ) : (
          <div className="max-w-4xl space-y-4">
            {/* Resultat */}
            {results.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-2">
                <h3 className="font-semibold text-gray-900 mb-3">Resultat</h3>
                {results.map((r, i) => (
                  <div key={i} className={`flex items-center gap-3 p-3 rounded-lg ${r.passed ? 'bg-green-50' : 'bg-red-50'}`}>
                    {r.passed ? <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" /> : <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
                    <div className="flex-1 text-sm">
                      <span className="font-medium">{r.viewName}.{r.columnName}</span>
                      <span className="text-gray-500 mx-2">–</span>
                      <span>{RULE_LABELS[r.ruleType as RuleType] ?? r.ruleType}</span>
                      {!r.passed && r.failCount != null && (
                        <span className="text-red-600 ml-2">({r.failCount} av {r.totalCount} rader misslyckas)</span>
                      )}
                      {r.error && <span className="text-red-600 ml-2">{r.error}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {models.map(model => (
              <div key={model.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <button onClick={() => setExpandedModels(prev => { const s = new Set(prev); s.has(model.id) ? s.delete(model.id) : s.add(model.id); return s; })}
                  className="w-full flex items-center gap-3 p-5 hover:bg-gray-50 text-left">
                  <Database className="w-5 h-5 text-indigo-500" />
                  <span className="font-semibold text-gray-900 flex-1">{model.name}</span>
                  <span className="text-xs text-gray-400 mr-2">
                    {model.views.reduce((a, v) => a + v.qualityRules.length, 0)} regler
                  </span>
                  <button onClick={e => { e.stopPropagation(); runChecks(model); }} disabled={running === model.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs hover:bg-indigo-700 disabled:opacity-50 mr-2">
                    {running === model.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    Kör kontroller
                  </button>
                  {expandedModels.has(model.id) ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                </button>

                {expandedModels.has(model.id) && (
                  <div className="border-t border-gray-100">
                    {model.views.map(view => (
                      <div key={view.id} className="border-b border-gray-100 last:border-0">
                        <button onClick={() => setExpandedViews(prev => { const s = new Set(prev); s.has(view.id) ? s.delete(view.id) : s.add(view.id); return s; })}
                          className="w-full flex items-center gap-2 px-5 py-3 hover:bg-gray-50 text-left">
                          {expandedViews.has(view.id) ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
                          <span className="text-sm font-medium text-gray-700">{view.displayName || view.name}</span>
                          <span className="text-xs text-gray-400 ml-auto">{view.qualityRules.length} regler</span>
                        </button>

                        {expandedViews.has(view.id) && (
                          <div className="px-8 pb-4 space-y-2">
                            {view.qualityRules.map(rule => (
                              <div key={rule.id} className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg text-sm">
                                <ShieldCheck className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                                <span className="font-mono text-gray-700">{rule.columnName}</span>
                                <span className="text-gray-400">–</span>
                                <span className="text-gray-600">{RULE_LABELS[rule.ruleType as RuleType] ?? rule.ruleType}</span>
                                {rule.ruleValue && <span className="text-gray-400 font-mono text-xs">{rule.ruleValue}</span>}
                                <button onClick={() => deleteRule(view.id, rule.id)} className="ml-auto text-red-400 hover:text-red-600">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}

                            {addingRule === view.id ? (
                              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                                <div className="grid grid-cols-2 gap-2">
                                  <select value={newRule.columnName} onChange={e => setNewRule(p => ({ ...p, columnName: e.target.value }))}
                                    className="px-2 py-1.5 border border-gray-300 rounded text-sm bg-white">
                                    <option value="">-- Välj kolumn --</option>
                                    {view.columns.map(c => <option key={c.name} value={c.name}>{c.displayName || c.name}</option>)}
                                  </select>
                                  <select value={newRule.ruleType} onChange={e => setNewRule(p => ({ ...p, ruleType: e.target.value as RuleType }))}
                                    className="px-2 py-1.5 border border-gray-300 rounded text-sm bg-white">
                                    {Object.entries(RULE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                  </select>
                                </div>
                                {(newRule.ruleType === 'min' || newRule.ruleType === 'max' || newRule.ruleType === 'regex') && (
                                  <input value={newRule.ruleValue} onChange={e => setNewRule(p => ({ ...p, ruleValue: e.target.value }))}
                                    placeholder={newRule.ruleType === 'regex' ? 'Regex-mönster' : 'Värde'}
                                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                                )}
                                <div className="flex gap-2">
                                  <button onClick={() => setAddingRule(null)} className="px-3 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50">Avbryt</button>
                                  <button onClick={() => addRule(view.id)} className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700">Lägg till</button>
                                </div>
                              </div>
                            ) : (
                              <button onClick={() => setAddingRule(view.id)}
                                className="flex items-center gap-1.5 text-xs text-indigo-600 hover:underline">
                                <Plus className="w-3.5 h-3.5" /> Lägg till regel
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
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
