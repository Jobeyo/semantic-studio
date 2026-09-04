'use client';
import { useState, useEffect } from 'react';
import { Database, GitMerge, ChevronRight, Table, Layers, BarChart2, X, Key, Hash, ExternalLink, ChevronDown } from 'lucide-react';

interface ColumnMapping {
  sourceCol: string;
  targetCol: string;
}

interface ColumnInfo {
  name: string;
  displayName: string;
  dataType: string;
  isKey: boolean;
  isMeasure: boolean;
}

interface ViewNode {
  id: number;
  name: string;
  displayName: string;
  type: string;
  sql: string;
  sourceTables: string[];
  columnCount: number;
  columns: ColumnInfo[];
  columnMappings: ColumnMapping[];
}

interface ModelLineage {
  id: number;
  name: string;
  sourceType: string;
  sourceDatabase: string;
  sourceHost: string;
  targetSchema: string;
  views: ViewNode[];
}

const TYPE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  fact: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' },
  dimension: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700' },
  measure: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700' },
  kpi: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700' },
};

export default function LineagePage() {
  const [lineage, setLineage] = useState<ModelLineage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedModel, setSelectedModel] = useState<ModelLineage | null>(null);
  const [selectedView, setSelectedView] = useState<ViewNode | null>(null);
  const [showMappings, setShowMappings] = useState(false);
  const [showColumns, setShowColumns] = useState(false);

  useEffect(() => {
    fetch('/api/governance/lineage')
      .then(r => r.json())
      .then(data => { setLineage(data.lineage ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-8 py-6 border-b border-gray-200 bg-white flex-shrink-0">
        <h1 className="text-xl font-semibold text-gray-900">Lineage</h1>
        <p className="text-sm text-gray-500 mt-1">Spårbarhet från källdata till publicerat semantiskt lager</p>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Vänster – modellista */}
        <div className="w-64 border-r border-gray-200 overflow-y-auto bg-white flex-shrink-0">
          <div className="p-3 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Modeller</p>
          </div>
          {loading ? (
            <div className="p-4 text-sm text-gray-400">Laddar...</div>
          ) : (
            <div className="p-2 space-y-1">
              {lineage.map(model => (
                <button key={model.id} onClick={() => { setSelectedModel(model); setSelectedView(null); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors ${selectedModel?.id === model.id ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-50'}`}>
                  <Database className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1 truncate">{model.name}</span>
                  <span className="text-xs text-gray-400">{model.views.length}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Höger – lineage-diagram */}
        <div className="flex-1 overflow-auto p-8 bg-gray-50">
          {!selectedModel ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <GitMerge className="w-12 h-12 opacity-30 mb-4" />
              <p className="font-medium text-gray-600">Välj en modell</p>
              <p className="text-sm mt-1">för att se dataflödet</p>
            </div>
          ) : (
            <div className="space-y-6 pb-16">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{selectedModel.name}</h2>
                <p className="text-sm text-gray-500">{selectedModel.sourceDatabase} → {selectedModel.targetSchema}</p>
              </div>

              {/* Flödes-header */}
              <div className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                <div className="min-w-44 text-center">Källtabeller</div>
                <div className="w-8" />
                <div className="min-w-48 text-center">Core-schema</div>
                <div className="w-8" />
                <div className="min-w-52 text-center">Semantisk vy</div>
                <div className="w-8" />
                <div className="min-w-40 text-center">Publicerat schema</div>
              </div>

              {/* En rad per vy */}
              {selectedModel.views.map(view => {
                const uniqueSources = [...new Set(view.sourceTables)];
                const isSelected = selectedView?.id === view.id;
                const colors = TYPE_COLORS[view.type] ?? { bg: 'bg-white', border: 'border-gray-200', text: 'text-gray-700' };

                return (
                  <div key={view.id} className="space-y-2">
                    <div className="flex items-center gap-2">
                      {/* Källtabeller */}
                      <div className="flex flex-col gap-1 min-w-44">
                        {uniqueSources.length > 0 ? uniqueSources.map(table => {
                          const parts = table.split('.');
                          const schema = parts.length > 1 ? parts[0] : '';
                          const tableName = parts.length > 1 ? parts[1] : table;
                          return (
                            <div key={table} className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs shadow-sm">
                              {schema && <div className="text-gray-400 font-mono text-xs">{schema}</div>}
                              <div className="flex items-center gap-1.5">
                                <Table className="w-3 h-3 text-gray-400 flex-shrink-0" />
                                <span className="font-mono font-medium text-gray-700">{tableName}</span>
                              </div>
                            </div>
                          );
                        }) : (
                          <div className="bg-white border border-dashed border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-400">
                            Okänd källa
                          </div>
                        )}
                      </div>

                      {/* Pil */}
                      <div className="flex items-center text-gray-300 flex-shrink-0">
                        <div className="w-4 border-t-2 border-dashed border-gray-200" />
                        <ChevronRight className="w-4 h-4" />
                      </div>

                      {/* Core-schema (källans schema) */}
                      <div className="min-w-48">
                        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs shadow-sm">
                          <div className="text-amber-500 font-semibold mb-1 uppercase tracking-wide text-xs">Core</div>
                          <div className="space-y-0.5">
                            {uniqueSources.slice(0, 3).map(table => (
                              <div key={table} className="font-mono text-amber-700 text-xs">{table.split('.').pop()}</div>
                            ))}
                            {uniqueSources.length > 3 && <div className="text-amber-400">+{uniqueSources.length - 3} till</div>}
                          </div>
                        </div>
                      </div>

                      {/* Pil */}
                      <div className="flex items-center text-gray-300 flex-shrink-0">
                        <div className="w-4 border-t-2 border-dashed border-gray-200" />
                        <ChevronRight className="w-4 h-4" />
                      </div>

                      {/* Semantisk vy – klickbar */}
                      <div className="min-w-52">
                        <button onClick={() => { setSelectedView(isSelected ? null : view); setShowMappings(false); setShowColumns(false); }}
                          className={`w-full text-left border rounded-xl px-4 py-3 shadow-sm transition-all hover:shadow-md ${isSelected ? 'ring-2 ring-indigo-400 ' : ''} ${colors.bg} ${colors.border}`}>
                          <div className={`flex items-center gap-2 mb-1 ${colors.text}`}>
                            <Layers className="w-4 h-4 flex-shrink-0" />
                            <span className="font-semibold text-sm">{view.displayName || view.name}</span>
                          </div>
                          <div className={`flex items-center gap-2 text-xs opacity-70 ${colors.text}`}>
                            <span className="capitalize">{view.type}</span>
                            <span>·</span>
                            <span>{view.columnCount} kolumner</span>
                            {view.columnMappings.length > 0 && (
                              <>
                                <span>·</span>
                                <span>{view.columnMappings.length} mappningar</span>
                              </>
                            )}
                          </div>
                        </button>
                      </div>

                      {/* Pil */}
                      <div className="flex items-center text-gray-300 flex-shrink-0">
                        <div className="w-4 border-t-2 border-dashed border-gray-200" />
                        <ChevronRight className="w-4 h-4" />
                      </div>

                      {/* Publicerat schema */}
                      <div className="min-w-40">
                        <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 shadow-sm">
                          <div className="flex items-center gap-2 mb-1">
                            <Database className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                            <span className="font-semibold text-sm text-indigo-700">{selectedModel.targetSchema}</span>
                          </div>
                          <div className="text-xs text-indigo-500 font-mono">{view.name}</div>
                        </div>
                      </div>
                    </div>

                    {/* Expanderad vy med mappningar och kolumner */}
                    {isSelected && (
                      <div className="ml-0 bg-white border border-gray-200 rounded-xl p-5 space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold text-gray-900">{view.displayName || view.name}</h3>
                            <p className="text-xs text-gray-400 capitalize">{view.type} · {view.columnCount} kolumner</p>
                          </div>
                          <button onClick={() => setSelectedView(null)} className="text-gray-400 hover:text-gray-600">
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="flex gap-2">
                          <button onClick={() => { setShowMappings(!showMappings); setShowColumns(false); }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${showMappings ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                            <GitMerge className="w-3.5 h-3.5" />
                            Kolumnmappningar ({view.columnMappings.length})
                          </button>
                          <button onClick={() => { setShowColumns(!showColumns); setShowMappings(false); }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${showColumns ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                            <Table className="w-3.5 h-3.5" />
                            Kolumner i semantiskt lager ({view.columnCount})
                          </button>
                        </div>

                        {/* Kolumnmappningar */}
                        {showMappings && view.columnMappings.length > 0 && (
                          <div className="space-y-1 max-h-64 overflow-y-auto pb-2">
                            <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wide px-2 mb-2">
                              <div>Källkolumn</div>
                              <div>Affärsnamn</div>
                            </div>
                            {view.columnMappings.map((m, i) => (
                              <div key={i} className="grid grid-cols-2 gap-2 items-center p-2 bg-gray-50 rounded-lg text-xs">
                                <div className="flex items-center gap-1.5">
                                  <Table className="w-3 h-3 text-amber-400 flex-shrink-0" />
                                  <span className="font-mono text-gray-600">{m.sourceCol}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <ChevronRight className="w-3 h-3 text-gray-300" />
                                  <span className="font-mono text-indigo-600 font-medium">{m.targetCol}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Kolumner i semantiskt lager */}
                        {showColumns && (
                          <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pb-2">
                            {view.columns.map(col => (
                              <div key={col.name} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg text-xs">
                                {col.isKey ? (
                                  <Key className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" />
                                ) : col.isMeasure ? (
                                  <Hash className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                                ) : (
                                  <div className="w-3.5 h-3.5 rounded-full bg-blue-400 flex-shrink-0" />
                                )}
                                <span className="font-medium text-gray-700 truncate">{col.displayName || col.name}</span>
                                <span className="text-gray-400 ml-auto flex-shrink-0 font-mono">{col.dataType}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Länk till Klarify */}
              <div className="pt-4 border-t border-gray-200">
                <a href={process.env.NEXT_PUBLIC_KLARIFY_URL ?? 'https://app.klarify.nu'} target="_blank"
                  className="flex items-center gap-2 text-sm text-indigo-600 hover:underline">
                  <BarChart2 className="w-4 h-4" />
                  Öppna Klarify för att se rapporter kopplade till denna modell
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
