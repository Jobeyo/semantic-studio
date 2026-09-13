'use client';
import { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronRight, Table, Layers, Database, BarChart2, Key, Hash, ExternalLink } from 'lucide-react';

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
  name: string;
  displayName: string;
  type: string;
  sourceTables: string[];
  columnCount: number;
  columns: ColumnInfo[];
  columnMappings: ColumnMapping[];
  reports: ReportInfo[];
}

interface LineageRowProps {
  view: ViewNode;
  targetSchema: string;
  klarifyUrl: string;
}

const TYPE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  fact: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' },
  dimension: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700' },
  measure: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700' },
  kpi: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700' },
};

interface FieldRef {
  [key: string]: HTMLDivElement | null;
}

export default function LineageRow({ view, targetSchema, klarifyUrl }: LineageRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [svgLines, setSvgLines] = useState<{ x1: number; y1: number; x2: number; y2: number; color: string }[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const sourceRefs = useRef<FieldRef>({});
  const sqlRefs = useRef<FieldRef>({});
  const bizRefs = useRef<FieldRef>({});
  const reportRefs = useRef<FieldRef>({});

  const colors = TYPE_COLORS[view.type] ?? { bg: 'bg-white', border: 'border-gray-200', text: 'text-gray-700' };
  const uniqueSources = [...new Set(view.sourceTables)];

  // Parsea källkolumner från sourceTables
  const sourceTableCols: Record<string, string[]> = {};
  for (const table of uniqueSources) {
    const tableName = table.split('.').pop() ?? table;
    sourceTableCols[tableName] = view.columnMappings.map(m => m.sourceCol);
  }

  useEffect(() => {
    if (!expanded || !containerRef.current) return;
    
    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();
    const lines: { x1: number; y1: number; x2: number; y2: number; color: string }[] = [];

    // Rita linjer: sourceCol → targetCol (columnMappings)
    for (const mapping of view.columnMappings) {
      const sourceEl = sourceRefs.current[mapping.sourceCol];
      const sqlEl = sqlRefs.current[mapping.targetCol];
      
      if (sourceEl && sqlEl) {
        const s = sourceEl.getBoundingClientRect();
        const t = sqlEl.getBoundingClientRect();
        lines.push({
          x1: s.right - containerRect.left,
          y1: s.top + s.height / 2 - containerRect.top,
          x2: t.left - containerRect.left,
          y2: t.top + t.height / 2 - containerRect.top,
          color: '#94a3b8',
        });
      }

      // SQL-vy → Affärsmodell (samma kolumnnamn)
      const bizEl = bizRefs.current[mapping.targetCol];
      if (sqlEl && bizEl) {
        const s = sqlEl.getBoundingClientRect();
        const t = bizEl.getBoundingClientRect();
        lines.push({
          x1: s.right - containerRect.left,
          y1: s.top + s.height / 2 - containerRect.top,
          x2: t.left - containerRect.left,
          y2: t.top + t.height / 2 - containerRect.top,
          color: '#818cf8',
        });
      }
    }

    // Rita linjer: Affärsmodell → Rapport (sourceColumns)
    for (const report of view.reports) {
      for (const sc of (report.sourceColumns ?? [])) {
        if (sc.viewName === view.name) {
          const bizEl = bizRefs.current[sc.columnName];
          const repEl = reportRefs.current[`${report.id}-${sc.columnName}`];
          if (bizEl && repEl) {
            const s = bizEl.getBoundingClientRect();
            const t = repEl.getBoundingClientRect();
            lines.push({
              x1: s.right - containerRect.left,
              y1: s.top + s.height / 2 - containerRect.top,
              x2: t.left - containerRect.left,
              y2: t.top + t.height / 2 - containerRect.top,
              color: '#34d399',
            });
          }
        }
      }
    }

    setSvgLines(lines);
  }, [expanded, view]);

  return (
    <div ref={containerRef} className="relative">
      {/* Collapsed rad */}
      {!expanded && (
        <div className="flex items-center gap-3 py-2">
          {/* Källtabeller */}
          <div className="flex flex-col gap-1 w-44">
            {uniqueSources.map(table => {
              const parts = table.split('.');
              const schema = parts.length > 1 ? parts[0] : '';
              const tableName = parts.length > 1 ? parts[1] : table;
              return (
                <div key={table} className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs shadow-sm">
                  {schema && <div className="text-amber-400 font-mono text-xs">{schema}</div>}
                  <div className="flex items-center gap-1.5">
                    <Table className="w-3 h-3 text-amber-500 flex-shrink-0" />
                    <span className="font-mono font-medium text-amber-800">{tableName}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center text-gray-300 flex-shrink-0">
            <div className="w-4 border-t-2 border-dashed border-gray-300" />
            <ChevronRight className="w-4 h-4" />
          </div>

          {/* SQL-vy */}
          <div className="w-44">
            <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm">
              <div className="text-xs text-gray-400 font-mono">{targetSchema}</div>
              <div className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-gray-400" />
                <span className="font-mono text-sm font-medium text-gray-700">{view.name}</span>
              </div>
              <div className="text-xs text-gray-400">{view.columnCount} kolumner</div>
            </div>
          </div>

          <div className="flex items-center text-gray-300 flex-shrink-0">
            <div className="w-4 border-t-2 border-dashed border-gray-300" />
            <ChevronRight className="w-4 h-4" />
          </div>

          {/* Affärsmodell */}
          <div className="w-52">
            <div className={`border rounded-xl px-3 py-2 shadow-sm ${colors.bg} ${colors.border}`}>
              <div className={`flex items-center gap-1.5 ${colors.text}`}>
                <Database className="w-3.5 h-3.5" />
                <span className="font-semibold text-sm">{view.displayName || view.name}</span>
              </div>
              <div className={`text-xs opacity-70 ${colors.text}`}>{view.type} · {view.columnCount} fält</div>
            </div>
          </div>

          <div className="flex items-center text-gray-300 flex-shrink-0">
            <div className="w-4 border-t-2 border-dashed border-gray-300" />
            <ChevronRight className="w-4 h-4" />
          </div>

          {/* Rapporter */}
          <div className="w-40">
            <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2 shadow-sm">
              <div className="flex items-center gap-1.5 mb-1">
                <BarChart2 className="w-3.5 h-3.5 text-green-600" />
                <span className="text-xs font-semibold text-green-700">Rapporter ({view.reports.length})</span>
              </div>
              {view.reports.slice(0, 2).map(r => (
                <div key={r.id} className="text-xs text-green-600 truncate">{r.title}</div>
              ))}
              {view.reports.length > 2 && <div className="text-xs text-green-400">+{view.reports.length - 2} till</div>}
            </div>
          </div>

          {/* Expandera-knapp */}
          <button onClick={() => setExpanded(true)}
            className="ml-2 flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 border border-indigo-200 rounded-lg px-2 py-1 hover:bg-indigo-50">
            <ChevronDown className="w-3.5 h-3.5" />
            Expandera
          </button>
        </div>
      )}

      {/* Expanded - fältnivå med SVG-linjer */}
      {expanded && (
        <div className="border border-indigo-200 rounded-xl bg-white shadow-md overflow-hidden mb-4">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-indigo-50 border-b border-indigo-100">
            <div className="flex items-center gap-2">
              <Database className={`w-4 h-4 ${colors.text}`} />
              <span className="font-semibold text-gray-900">{view.displayName || view.name}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full border ${colors.bg} ${colors.border} ${colors.text}`}>{view.type}</span>
            </div>
            <button onClick={() => { setExpanded(false); setSvgLines([]); }}
              className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-2 py-1">
              Komprimera
            </button>
          </div>

          {/* Fältkolumner */}
          <div className="grid grid-cols-4 gap-0 relative">
            {/* SVG overlay */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-10"
              style={{ overflow: 'visible' }}>
              {svgLines.map((line, i) => (
                <g key={i}>
                  <path
                    d={`M ${line.x1} ${line.y1} C ${line.x1 + 40} ${line.y1}, ${line.x2 - 40} ${line.y2}, ${line.x2} ${line.y2}`}
                    fill="none"
                    stroke={line.color}
                    strokeWidth="1.5"
                    strokeDasharray={line.color === '#34d399' ? '4 2' : 'none'}
                    opacity="0.7"
                  />
                </g>
              ))}
            </svg>

            {/* Kolumn 1: Källtabeller */}
            <div className="border-r border-gray-100 p-4">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Källtabeller</div>
              {uniqueSources.map(table => {
                const tableName = table.split('.').pop() ?? table;
                const schema = table.includes('.') ? table.split('.')[0] : '';
                return (
                  <div key={table} className="mb-4">
                    <div className="text-xs font-semibold text-amber-600 mb-1 flex items-center gap-1">
                      <Table className="w-3 h-3" />
                      {schema && <span className="text-amber-400">{schema}.</span>}
                      {tableName}
                    </div>
                    {view.columnMappings.map(m => (
                      <div key={m.sourceCol}
                        ref={el => { sourceRefs.current[m.sourceCol] = el; }}
                        className="flex items-center gap-1 py-1 px-2 text-xs text-gray-600 bg-amber-50 rounded mb-1 font-mono">
                        {m.sourceCol}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            {/* Kolumn 2: SQL-vy */}
            <div className="border-r border-gray-100 p-4">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">SQL-vy · {targetSchema}</div>
              <div className="text-xs font-semibold text-gray-600 mb-2 font-mono">{view.name}</div>
              {view.columnMappings.map(m => (
                <div key={m.targetCol}
                  ref={el => { sqlRefs.current[m.targetCol] = el; }}
                  className="flex items-center gap-1 py-1 px-2 text-xs text-gray-600 bg-gray-50 rounded mb-1 font-mono">
                  {m.targetCol}
                </div>
              ))}
              {/* Kolumner utan mappning */}
              {view.columns.filter(c => !view.columnMappings.find(m => m.targetCol === c.name)).map(col => (
                <div key={col.name}
                  ref={el => { sqlRefs.current[col.name] = el; }}
                  className="flex items-center gap-1 py-1 px-2 text-xs text-gray-400 bg-gray-50 rounded mb-1 font-mono opacity-50">
                  {col.name}
                </div>
              ))}
            </div>

            {/* Kolumn 3: Affärsmodell */}
            <div className={`border-r border-gray-100 p-4 ${colors.bg}`}>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Affärsmodell</div>
              <div className={`text-xs font-semibold mb-2 ${colors.text}`}>{view.displayName || view.name}</div>
              {view.columns.map(col => (
                <div key={col.name}
                  ref={el => { bizRefs.current[col.name] = el; }}
                  className={`flex items-center gap-1.5 py-1 px-2 text-xs rounded mb-1 ${colors.bg} border ${colors.border}`}>
                  {col.isKey ? <Key className={`w-3 h-3 text-yellow-500 flex-shrink-0`} />
                    : col.isMeasure ? <Hash className={`w-3 h-3 text-green-500 flex-shrink-0`} />
                    : <div className="w-3 h-3 rounded-full bg-blue-400 flex-shrink-0" />}
                  <span className={`${colors.text} truncate`}>{col.displayName || col.name}</span>
                </div>
              ))}
            </div>

            {/* Kolumn 4: Rapporter */}
            <div className="p-4">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Rapporter</div>
              {view.reports.length === 0 ? (
                <div className="text-xs text-gray-400 italic">Inga rapporter</div>
              ) : view.reports.map(report => {
                const usedCols = (report.sourceColumns ?? []).filter(sc => sc.viewName === view.name);
                return (
                  <div key={report.id} className="mb-4">
                    <a href={`${klarifyUrl}/space/1/report/${report.id}`} target="_blank"
                      className="flex items-center gap-1 text-xs font-semibold text-green-700 hover:underline mb-1">
                      <BarChart2 className="w-3 h-3" />
                      {report.title}
                      <ExternalLink className="w-2.5 h-2.5 ml-auto" />
                    </a>
                    {usedCols.map(sc => (
                      <div key={sc.columnName}
                        ref={el => { reportRefs.current[`${report.id}-${sc.columnName}`] = el; }}
                        className="flex items-center gap-1 py-1 px-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded mb-1 font-mono">
                        {sc.columnName}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
