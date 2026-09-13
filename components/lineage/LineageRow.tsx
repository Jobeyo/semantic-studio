'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Table, Layers, Database, BarChart2, Key, Hash, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';

interface ColumnMapping { sourceCol: string; targetCol: string; }
interface ColumnInfo { name: string; displayName: string; dataType: string; isKey: boolean; isMeasure: boolean; }
interface ReportInfo { id: string; title: string; sourceViews: string[]; sourceColumns: { viewName: string; columnName: string }[]; }
interface ViewNode {
  name: string; displayName: string; type: string;
  sourceTables: string[]; columnCount: number;
  columns: ColumnInfo[]; columnMappings: ColumnMapping[];
  reports: ReportInfo[];
  coreColumns?: Record<string, string[]>;
}
interface Line { x1: number; y1: number; x2: number; y2: number; color: string; dashed?: boolean; fromKey: string; toKey: string; }
interface Props { view: ViewNode; targetSchema: string; klarifyUrl: string; }

const TYPE_COLORS: Record<string, { bg: string; border: string; text: string; light: string }> = {
  fact:      { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700',   light: 'bg-blue-100' },
  dimension: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', light: 'bg-purple-100' },
  measure:   { bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-700',  light: 'bg-green-100' },
  kpi:       { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', light: 'bg-orange-100' },
};

type NodeKey = 'source' | 'sql' | 'biz' | string;

export default function LineageRow({ view, targetSchema, klarifyUrl }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [lines, setLines] = useState<Line[]>([]);
  const [activeField, setActiveField] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fieldRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const colors = TYPE_COLORS[view.type] ?? { bg: 'bg-white', border: 'border-gray-200', text: 'text-gray-700', light: 'bg-gray-100' };
  const uniqueSources = [...new Set(view.sourceTables)];

  const toggle = (node: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(node) ? next.delete(node) : next.add(node);
      return next;
    });
  };

  const getPos = useCallback((key: string, box: DOMRect) => {
    const el = fieldRefs.current.get(key);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left - box.left, right: r.right - box.left, mid: r.top + r.height / 2 - box.top };
  }, []);

  const recalcLines = useCallback(() => {
    if (!containerRef.current) return;
    const box = containerRef.current.getBoundingClientRect();
    const newLines: Line[] = [];

    if (expanded.has('source') && expanded.has('sql')) {
      for (const m of view.columnMappings) {
        const s = getPos('source:' + m.sourceCol, box);
        const t = getPos('sql:' + m.targetCol, box);
        if (s && t) newLines.push({ x1: s.right, y1: s.mid, x2: t.left, y2: t.mid, color: '#f59e0b', fromKey: 'source:' + m.sourceCol, toKey: 'sql:' + m.targetCol });
      }
    }
    if (expanded.has('sql') && expanded.has('biz')) {
      for (const col of view.columns) {
        const s = getPos('sql:' + col.name, box);
        const t = getPos('biz:' + col.name, box);
        if (s && t) newLines.push({ x1: s.right, y1: s.mid, x2: t.left, y2: t.mid, color: '#818cf8', fromKey: 'sql:' + col.name, toKey: 'biz:' + col.name });
      }
    }
    if (expanded.has('biz')) {
      for (const report of view.reports) {
        if (!expanded.has('report:' + report.id)) continue;
        for (const sc of (report.sourceColumns ?? []).filter(sc => sc.viewName === view.name)) {
          const s = getPos('biz:' + sc.columnName, box);
          const t = getPos('report:' + report.id + ':' + sc.columnName, box);
          if (s && t) newLines.push({ x1: s.right, y1: s.mid, x2: t.left, y2: t.mid, color: '#34d399', dashed: true, fromKey: 'biz:' + sc.columnName, toKey: 'report:' + report.id + ':' + sc.columnName });
        }
      }
    }
    setLines(newLines);
  }, [expanded, view, getPos]);

  useEffect(() => {
    const t = setTimeout(recalcLines, 80);
    return () => clearTimeout(t);
  }, [recalcLines]);

  const Field = ({ refKey, label, icon, colorClass }: { refKey: string; label: string; icon?: React.ReactNode; colorClass: string }) => {
    const isActive = activeField === refKey;
    // Transitiv spårning - hitta alla kopplade fält i hela kedjan
    const getConnected = (key: string, visited = new Set<string>()): Set<string> => {
      if (visited.has(key)) return visited;
      visited.add(key);
      for (const l of lines) {
        if (l.fromKey === key && !visited.has(l.toKey)) getConnected(l.toKey, visited);
        if (l.toKey === key && !visited.has(l.fromKey)) getConnected(l.fromKey, visited);
      }
      return visited;
    };
    const connectedKeys = activeField ? getConnected(activeField) : new Set<string>();
    const isConnected = !!(activeField && !isActive && connectedKeys.has(refKey));
    const isDimmed = !!(activeField && !isActive && !isConnected);
    return (
      <div
        ref={el => { if (el) fieldRefs.current.set(refKey, el); else fieldRefs.current.delete(refKey); }}
        onClick={() => setActiveField(prev => prev === refKey ? null : refKey)}
        className={[
          'flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono cursor-pointer transition-all select-none mb-1',
          colorClass,
          isActive ? 'ring-2 ring-indigo-500 shadow-md scale-105 font-bold brightness-95' : '',
          isConnected ? 'ring-1 ring-indigo-300 shadow-sm brightness-95' : '',
          isDimmed ? 'opacity-15' : '',
        ].filter(Boolean).join(' ')}
      >
        {icon}
        <span className="truncate max-w-[130px]">{label}</span>
      </div>
    );
  };

  const NodeHeader = ({ id, title, sub, count, hColor, bColor, bgColor }: {
    id: string; title: string; sub?: string; count?: number;
    hColor: string; bColor: string; bgColor: string;
  }) => (
    <button onClick={() => toggle(id)}
      className={['w-full flex items-center justify-between px-3 py-2.5 text-left rounded-xl border shadow-sm transition-all hover:shadow-md', bgColor, bColor, hColor].join(' ')}>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm truncate">{title}</div>
        {sub && <div className="text-xs opacity-60 truncate">{sub}</div>}
        {count !== undefined && <div className="text-xs opacity-50">{count} fält</div>}
      </div>
      {expanded.has(id)
        ? <ChevronUp className="w-3.5 h-3.5 flex-shrink-0 ml-2 opacity-50" />
        : <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 ml-2 opacity-50" />}
    </button>
  );

  return (
    <div ref={containerRef} className="relative py-2">
      {/* SVG overlay */}
      <svg className="absolute inset-0 pointer-events-none z-20" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
        {lines.map((l, i) => {
          const getConnectedKeys = (key: string, visited = new Set<string>()): Set<string> => {
            if (visited.has(key)) return visited;
            visited.add(key);
            for (const ln of lines) {
              if (ln.fromKey === key && !visited.has(ln.toKey)) getConnectedKeys(ln.toKey, visited);
              if (ln.toKey === key && !visited.has(ln.fromKey)) getConnectedKeys(ln.fromKey, visited);
            }
            return visited;
          };
          const connectedSet = activeField ? getConnectedKeys(activeField) : new Set<string>();
          const isActive = !!(activeField && (connectedSet.has(l.fromKey) && connectedSet.has(l.toKey)));
          const isDimmed = !!(activeField && !isActive);
          const d = `M${l.x1},${l.y1} C${(l.x1 + 60)},${l.y1} ${(l.x2 - 60)},${l.y2} ${l.x2},${l.y2}`;
          return (
            <g key={i}>
              <path d={d} fill="none" stroke={l.color} strokeWidth={1.5}
                opacity={isDimmed ? 0.05 : 0.4}
                strokeDasharray={l.dashed ? '4 2' : undefined} />
              {isActive && (
                <path d={d} fill="none" stroke="#6366f1" strokeWidth={2}
                  strokeLinecap="round"
                  strokeDasharray={l.dashed ? '6 3' : undefined}
                  opacity={0.7} />
              )}
            </g>
          );
        })}
      </svg>

      {/* 4-kolumns grid */}
      <div className="grid items-start gap-3" style={{ gridTemplateColumns: '1fr 20px 1fr 20px 1fr 20px 1fr' }}>

        {/* 1. Källtabeller */}
        <div className="space-y-2">
          {uniqueSources.map(table => {
            const parts = table.split('.');
            const schema = parts.length > 1 ? parts[0] : '';
            const name = parts.length > 1 ? parts[1] : table;
            const cols = (view.coreColumns ?? {})[table] ?? view.columnMappings.map(m => m.sourceCol);
            return (
              <div key={table}>
                <NodeHeader id="source" title={name} sub={schema || undefined} count={cols.length}
                  hColor="text-amber-800" bColor="border-amber-200" bgColor="bg-amber-50" />
                {expanded.has('source') && (
                  <div className="mt-1 px-1">
                    {cols.map((col: string, i: number) => (
                      <Field key={col + i} refKey={'source:' + col} label={col}
                        colorClass={'bg-amber-100 text-amber-800' + (view.columnMappings.find(m => m.sourceCol === col) ? '' : ' opacity-40')} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Pil 1 */}
        <div className="flex items-start justify-center pt-3 text-gray-300">
          <svg width="20" height="16"><path d="M0 8 L14 8 M8 4 L14 8 L8 12" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg>
        </div>

        {/* 2. SQL-vy */}
        <div>
          <NodeHeader id="sql" title={view.name} sub={targetSchema} count={view.columns.length}
            hColor="text-gray-700" bColor="border-gray-200" bgColor="bg-white" />
          {expanded.has('sql') && (
            <div className="mt-1 px-1">
              {view.columnMappings.map((m, i) => (
                <Field key={m.targetCol + i} refKey={'sql:' + m.targetCol} label={m.targetCol} colorClass="bg-gray-100 text-gray-700" />
              ))}
              {view.columns.filter(c => !view.columnMappings.find(m => m.targetCol === c.name)).map(col => (
                <Field key={col.name} refKey={'sql:' + col.name} label={col.name} colorClass="bg-gray-50 text-gray-400" />
              ))}
            </div>
          )}
        </div>

        {/* Pil 2 */}
        <div className="flex items-start justify-center pt-3 text-gray-300">
          <svg width="20" height="16"><path d="M0 8 L14 8 M8 4 L14 8 L8 12" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg>
        </div>

        {/* 3. Affärsmodell */}
        <div>
          <NodeHeader id="biz" title={view.displayName || view.name} sub={view.type} count={view.columns.length}
            hColor={colors.text} bColor={colors.border} bgColor={colors.bg} />
          {expanded.has('biz') && (
            <div className="mt-1 px-1">
              {view.columns.map(col => (
                <Field key={col.name} refKey={'biz:' + col.name}
                  label={col.displayName || col.name}
                  colorClass={colors.light + ' ' + colors.text}
                  icon={col.isKey
                    ? <Key className="w-3 h-3 text-yellow-500 flex-shrink-0" />
                    : col.isMeasure
                      ? <Hash className="w-3 h-3 text-green-500 flex-shrink-0" />
                      : <div className="w-2.5 h-2.5 rounded-full bg-blue-400 flex-shrink-0" />}
                />
              ))}
            </div>
          )}
        </div>

        {/* Pil 3 */}
        <div className="flex items-start justify-center pt-3 text-gray-300">
          <svg width="20" height="16"><path d="M0 8 L14 8 M8 4 L14 8 L8 12" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg>
        </div>

        {/* 4. Rapporter */}
        <div className="space-y-2">
          {view.reports.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-400 italic">Inga rapporter</div>
          ) : view.reports.map(report => {
            const usedCols = (report.sourceColumns ?? []).filter(sc => sc.viewName === view.name);
            const rid = 'report:' + report.id;
            return (
              <div key={report.id}>
                <NodeHeader id={rid} title={report.title} count={usedCols.length}
                  hColor="text-green-700" bColor="border-green-200" bgColor="bg-green-50" />
                {expanded.has(rid) && (
                  <div className="mt-1 px-1">
                    {usedCols.map(sc => (
                      <Field key={sc.columnName}
                        refKey={'report:' + report.id + ':' + sc.columnName}
                        label={sc.columnName}
                        colorClass="bg-green-100 text-green-700"
                        icon={<BarChart2 className="w-3 h-3 text-green-500 flex-shrink-0" />} />
                    ))}
                    <a href={klarifyUrl + '/space/1/report/' + report.id} target="_blank"
                      className="flex items-center gap-1 text-xs text-green-600 hover:underline pt-1 px-1">
                      <ExternalLink className="w-3 h-3" /> Öppna i Klarify
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
