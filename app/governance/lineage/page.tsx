'use client';
import { useState, useEffect } from 'react';
import { Database, GitMerge, ChevronRight, Table, Layers, BarChart2, X, Key, Hash, BarChart } from 'lucide-react';

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
  sourceTables: string[];
  columnCount: number;
  columns: ColumnInfo[];
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

interface Report {
  id: string;
  title: string;
  dataSource: string;
  lastRun: string;
}

const TYPE_COLORS: Record<string, string> = {
  fact: 'bg-blue-100 text-blue-700 border-blue-200',
  dimension: 'bg-purple-100 text-purple-700 border-purple-200',
  measure: 'bg-green-100 text-green-700 border-green-200',
  kpi: 'bg-orange-100 text-orange-700 border-orange-200',
};

export default function LineagePage() {
  const [lineage, setLineage] = useState<ModelLineage[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedModel, setSelectedModel] = useState<ModelLineage | null>(null);
  const [selectedView, setSelectedView] = useState<ViewNode | null>(null);

  useEffect(() => {
    fetch('/api/governance/lineage')
      .then(r => r.json())
      .then(data => {
        setLineage(data.lineage ?? []);
        setReports(data.reports ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const pgReports = reports.filter(r => r.dataSource === 'postgres' || !r.dataSource);

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 py-6 border-b border-gray-200 bg-white">
        <h1 className="text-xl font-semibold text-gray-900">Lineage</h1>
        <p className="text-sm text-gray-500 mt-1">Spårbarhet från källdata till rapport</p>
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
            <div className="space-y-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{selectedModel.name}</h2>
                  <p className="text-sm text-gray-500">{selectedModel.sourceDatabase} · {selectedModel.targetSchema}</p>
                </div>
                <a href={process.env.NEXT_PUBLIC_KLARIFY_URL ?? 'http://localhost:3000'} target="_blank"
                  className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm hover:bg-green-100 transition-colors">
                  <BarChart2 className="w-4 h-4 text-green-600" />
                  <span className="font-medium text-green-700">Öppna Klarify</span>
                  <span className="text-xs text-green-500 ml-1">för att se rapporter</span>
                </a>
              </div>

              {/* Flödesdiagram */}
              <div className="space-y-4">
                {/* Header-rad */}
                <div className="flex items-center gap-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  <div className="min-w-48">Källtabeller</div>
                  <div className="w-12" />
                  <div className="min-w-48">Semantiskt lager</div>
                  <div className="w-12" />
                  <div className="min-w-40">Schema</div>
                  <div className="w-12" />
                  <div className="min-w-40">Rapporter</div>
                </div>

                {selectedModel.views.map(view => {
                  const uniqueSources = [...new Set(view.sourceTables)];
                  const isSelected = selectedView?.id === view.id;

                  return (
                    <div key={view.id} className="flex items-stretch gap-4">
                      {/* Källtabeller */}
                      <div className="flex flex-col justify-center gap-1.5 min-w-48">
                        {uniqueSources.length > 0 ? uniqueSources.map(table => (
                          <div key={table} className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs shadow-sm">
                            <Table className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            <span className="font-mono text-gray-700 truncate">{table}</span>
                          </div>
                        )) : (
                          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs shadow-sm opacity-50">
                            <Table className="w-3.5 h-3.5 text-gray-400" />
                            <span className="text-gray-400 italic">Okänd källa</span>
                          </div>
                        )}
                      </div>

                      {/* Pil */}
                      <div className="flex items-center text-gray-300">
                        <div className="border-t-2 border-dashed border-gray-200 w-6" />
                        <ChevronRight className="w-5 h-5" />
                      </div>

                      {/* Vy - klickbar */}
                      <div className="flex items-center min-w-48">
                        <button onClick={() => setSelectedView(isSelected ? null : view)}
                          className={`w-full border rounded-xl px-4 py-3 shadow-sm text-left transition-all hover:shadow-md ${isSelected ? 'ring-2 ring-indigo-400 ' : ''} ${TYPE_COLORS[view.type] ?? 'bg-white border-gray-200'}`}>
                          <div className="flex items-center gap-2 mb-1">
                            <Layers className="w-4 h-4 flex-shrink-0" />
                            <span className="font-semibold text-sm">{view.displayName || view.name}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs opacity-70">
                            <span className="capitalize">{view.type}</span>
                            <span>·</span>
                            <span>{view.columnCount} kolumner</span>
                          </div>
                        </button>
                      </div>

                      {/* Pil */}
                      <div className="flex items-center text-gray-300">
                        <div className="border-t-2 border-dashed border-gray-200 w-6" />
                        <ChevronRight className="w-5 h-5" />
                      </div>

                      {/* Schema */}
                      <div className="flex items-center min-w-40">
                        <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 shadow-sm">
                          <div className="flex items-center gap-2 mb-1">
                            <Database className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                            <span className="font-semibold text-sm text-indigo-700">{selectedModel.targetSchema}</span>
                          </div>
                          <div className="text-xs text-indigo-500 opacity-70">Semantiskt lager</div>
                        </div>
                      </div>

                      {/* Pil */}
                      <div className="flex items-center text-gray-300">
                        <div className="border-t-2 border-dashed border-gray-200 w-6" />
                        <ChevronRight className="w-5 h-5" />
                      </div>

                      {/* Rapporter */}
                      <div className="flex items-center min-w-40">
                        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 shadow-sm">
                          <div className="flex items-center gap-2 mb-1">
                            <BarChart2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                            <span className="font-semibold text-sm text-green-700">Klarify</span>
                          </div>
                          <div className="text-xs text-green-500">{pgReports.length} rapporter</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Kolumn-panel vid klick på vy */}
              {selectedView && (
                <div className="bg-white border border-gray-200 rounded-xl p-5 mt-4">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-gray-900">{selectedView.displayName || selectedView.name}</h3>
                      <p className="text-xs text-gray-400 capitalize">{selectedView.type} · {selectedView.columnCount} kolumner</p>
                    </div>
                    <button onClick={() => setSelectedView(null)} className="text-gray-400 hover:text-gray-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto" style={{paddingBottom: "32px"}}>
                    {selectedView.columns.map(col => (
                      <div key={col.name} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg text-xs">
                        {col.isKey ? (
                          <Key className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" />
                        ) : col.isMeasure ? (
                          <Hash className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                        ) : (
                          <div className="w-3.5 h-3.5 rounded-full bg-blue-400 flex-shrink-0" />
                        )}
                        <span className="font-medium text-gray-700 truncate">{col.displayName || col.name}</span>
                        <span className="text-gray-400 ml-auto flex-shrink-0">{col.dataType}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
