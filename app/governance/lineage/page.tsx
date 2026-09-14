'use client';
import { useState, useEffect } from 'react';
import { Database, GitMerge } from 'lucide-react';
import LineageRow from '@/components/lineage/LineageRow';

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

interface ReportInfo {
  id: string;
  title: string;
  sourceViews: string[];
  sourceColumns: { viewName: string; columnName: string }[];
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
  reports: ReportInfo[];
}

interface ModelLineage {
  id: number;
  name: string;
  sourceType: string;
  sourceDatabase: string;
  sourceHost: string;
  targetSchema: string;
  views: ViewNode[];
  reports: ReportInfo[];
}

export default function LineagePage() {
  const [lineage, setLineage] = useState<ModelLineage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedModel, setSelectedModel] = useState<ModelLineage | null>(null);

  useEffect(() => {
    fetch('/api/governance/lineage')
      .then(r => r.json())
      .then(data => { setLineage(data.lineage ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const klarifyUrl = process.env.NEXT_PUBLIC_KLARIFY_URL ?? 'https://app.klarify.nu';

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-8 py-6 border-b border-gray-200 bg-white flex-shrink-0">
        <h1 className="text-xl font-semibold text-gray-900">Lineage</h1>
        <p className="text-sm text-gray-500 mt-1">Dataflöde från källdata till semantisk modell och rapporter · Klicka "Expandera" för fältnivå-lineage</p>
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
                <button key={model.id} onClick={() => setSelectedModel(model)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors ${selectedModel?.id === model.id ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-50'}`}>
                  <Database className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1 truncate">{model.name}</span>
                  <span className="text-xs text-gray-400">{model.views.length}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Höger – lineage */}
        <div className="flex-1 overflow-auto p-8 bg-gray-50">
          {!selectedModel ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <GitMerge className="w-12 h-12 opacity-30 mb-4" />
              <p className="font-medium text-gray-600">Välj en modell</p>
              <p className="text-sm mt-1">för att se dataflödet</p>
            </div>
          ) : (
            <div className="space-y-2 pb-16">
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-900">{selectedModel.name}</h2>
                <p className="text-sm text-gray-500">{selectedModel.sourceDatabase} → {selectedModel.targetSchema}</p>
              </div>

              {/* Kolumnrubriker - matchar LineageRow grid: 1fr 20px 1fr 20px 1fr 20px 1fr */}
              <div className="grid text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 gap-3 px-1"
                style={{ gridTemplateColumns: '1fr 20px 1fr 20px 1fr 20px 1fr' }}>
                <div className="text-center">Källtabeller</div>
                <div />
                <div className="text-center">Teknisk SQL-vy</div>
                <div />
                <div className="text-center">Semantisk modell</div>
                <div />
                <div className="text-center">Rapporter</div>
              </div>

              {selectedModel.views.map(view => (
                <LineageRow
                  key={view.id}
                  view={view}
                  targetSchema={selectedModel.targetSchema}
                  klarifyUrl={klarifyUrl}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
