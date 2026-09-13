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
interface Props { view: ViewNode; targetSchema: string; klarifyUrl: string; }

const TYPE_COLORS: Record<string, { bg: string; border: string; text: string; light: string }> = {
  fact:      { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700',   light: 'bg-blue-100' },
  dimension: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', light: 'bg-purple-100' },
  measure:   { bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-700',  light: 'bg-green-100' },
  kpi:       { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', light: 'bg-orange-100' },
};

type NodeKey = 'source' | 'sql' | 'biz' | `report:${string}`;

interface Line { x1: number; y1: number; x2: number; y2: number; color: string; dashed?: boolean; fromKey: string; toKey: string; }

export default function LineageRow({ view, targetSchema, klarifyUrl }: Props) {
  const [expanded, setExpanded] = useState<Set<NodeKey>>(new Set());
  const [lines, setLines] = useState<Line[]>([]);
  const [activeField, setActiveField] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Refs för fält-element: nodeKey:fieldName → element
  const fieldRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const colors = TYPE_COLORS[view.type] ?? { bg: 'bg-white', border: 'border-gray-200', text: 'text-gray-700', light: 'bg-gray-100' };
  const uniqueSources = [...new Set(view.sourceTables)];

  const toggle = (node: NodeKey) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(node) ? next.delete(node) : next.add(node);
      return next;
    });
  };

  const setRef = (key: string) => (el: HTMLDivElement | null) => {
    fieldRefs.current[key] = el;
  };

  const recalcLines = useCallback(() => {
    if (!containerRef.current) return;
    const box = containerRef.current.getBoundingClientRect();
    const newLines: Line[] = [];

    const get = (key: string) => {
      const el = fieldRefs.current[key];
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left - box.left, right: r.right - box.left, mid: r.top + r.height / 2 - box.top };
    };

    // source → sql
    if (expanded.has('source') && expanded.has('sql')) {
      for (const m of view.columnMappings) {
        const s = get(`source:${m.sourceCol}`);
        const t = get(`sql:${m.targetCol}`);
        if (s && t) newLines.push({ x1: s.right, y1: s.mid, x2: t.left, y2: t.mid, color: '#94a3b8', fromKey: `source:${m.sourceCol}`, toKey: `sql:${m.targetCol}` });
      }
    }

    // sql → biz
    if (expanded.has('sql') && expanded.has('biz')) {
      for (const col of view.columns) {
        const s = get(`sql:${col.name}`);
        const t = get(`biz:${col.name}`);
        if (s && t) newLines.push({ x1: s.right, y1: s.mid, x2: t.left, y2: t.mid, color: '#818cf8', fromKey: `sql:${col.name}`, toKey: `biz:${col.name}` });
      }
    }

    // biz → report
    if (expanded.has('biz')) {
      for (const report of view.reports) {
        for (const sc of (report.sourceColumns ?? []).filter(sc => sc.viewName === view.name)) {
          const s = get(`biz:${sc.columnName}`);
          const t = get(`report:${report.id}:${sc.columnName}`);
          if (s && t && expanded.has(`report:${report.id}`)) newLines.push({ x1: s.right, y1: s.mid, x2: t.left, y2: t.mid, color: '#34d399', dashed: true, fromKey: `biz:${sc.columnName}`, toKey: `report:${report.id}:${sc.columnName}` });
        }
      }
    }

    setLines(newLines);
  }, [expanded, view]);

  useEffect(() => {
    // Liten delay för att DOM ska hinna uppdateras
    const t = setTimeout(recalcLines, 50);
    return () => clearTimeout(t);
  }, [recalcLines]);

  const NodeBox = ({
    id, title, subtitle, headerColor, borderColor, bgColor,
    children, fieldCount
  }: {
    id: NodeKey; title: string; subtitle?: string;
    headerColor: string; borderColor: string; bgColor: string;
    children?: React.ReactNode; fieldCount?: number;
  }) => {
    const isOpen = expanded.has(id);
    return (
      <div className={`rounded-xl border ${borderColor} ${bgColor} shadow-sm overflow-hidden transition-all`}
           style={{ minWidth: 160 }}>
        <button onClick={() => toggle(id)}
          className={`w-full flex items-center justify-between px-3 py-2.5 text-left ${headerColor} hover:opacity-90 transition-opacity`}>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm truncate">{title}</div>
            {subtitle && <div className="text-xs opacity-70 truncate">{subtitle}</div>}
            {fieldCount !== undefined && <div className="text-xs opacity-60">{fieldCount} fält</div>}
          </div>
          {isOpen ? <ChevronUp className="w-3.5 h-3.5 flex-shrink-0 ml-2 opacity-60" />
                  : <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 ml-2 opacity-60" />}
        </button>
        {isOpen && <div className="px-2 py-2 space-y-1 border-t border-current border-opacity-10">{children}</div>}
      </div>
    );
  };

  const FieldPill = ({ refKey, label, icon, colorClass }: {
    refKey: string; label: string;
    icon?: React.ReactNode; colorClass: string;
  }) => {
    const isActive = activeField === refKey;
    const isConnected = activeField && lines.some(l => 
      (l.fromKey === activeField && l.toKey === refKey) || 
      (l.toKey === activeField && l.fromKey === refKey)
    );
    const isDimmed = activeField && !isActive && !isConnected;
    return (
      <div ref={setRef(refKey)}
        onClick={() => setActiveField(activeField === refKey ? null : refKey)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono cursor-pointer transition-all
          ${colorClass} 
          ${isActive ? 'ring-2 ring-offset-1 ring-indigo-400 shadow-md scale-105' : ''}
          ${isConnected ? 'ring-1 ring-offset-1 ring-indigo-300 shadow-sm' : ''}
          ${isDimmed ? 'opacity-20' : ''}
          whitespace-nowrap`}>
        {icon}
        <span className="truncate max-w-[140px]">{label}</span>
      </div>
    );
  };

  return (
    <div ref={containerRef} className="relative py-2">
      {/* SVG overlay */}
      <svg className="absolute inset-0 w-full pointer-events-none z-20"
           style={{ height: '100%', overflow: 'visible' }}>
        {lines.map((l, i) => (
          <path key={i}
            d={`M${l.x1},${l.y1} C${l.x1 + 50},${l.y1} ${l.x2 - 50},${l.y2} ${l.x2},${l.y2}`}
            fill="none" stroke={l.color} strokeWidth="1.5" opacity="0.75"
            strokeDasharray={l.dashed ? '4 2' : undefined} />
        ))}
      </svg>

      {/* 4-kolumns grid */}
      <div className="grid gap-2 items-start" style={{ gridTemplateColumns: '1fr 24px 1fr 24px 1fr 24px 1fr' }}>

        {/* 1. Källtabeller */}
        <div className="space-y-2">
          {uniqueSources.map(table => {
            const parts = table.split('.');
            const schema = parts.length > 1 ? parts[0] : '';
            const name = parts.length > 1 ? parts[1] : table;
            return (
              <NodeBox key={table} id="source"
                title={name} subtitle={schema || undefined}
                headerColor="text-amber-800" borderColor="border-amber-200" bgColor="bg-amber-50"
                fieldCount={view.columnMappings.length}>
                {((view.coreColumns ?? {})[table] ?? view.columnMappings.map(m => m.sourceCol)).map((col: string, i: number) => (
                  <FieldPill key={`${col}-${i}`}
                    refKey={`source:${col}`}
                    label={col}
                    colorClass={`bg-amber-100 text-amber-800 ${view.columnMappings.find(m => m.sourceCol === col) ? '' : 'opacity-50'}`} />
                ))}
              </NodeBox>
            );
          })}
        </div>

        {/* Pil */}
        <div className="flex items-center justify-center pt-4 text-gray-300">
          <svg width="24" height="16"><path d="M0 8 L16 8 M10 4 L16 8 L10 12" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg>
        </div>

        {/* 2. SQL-vy */}
        <NodeBox id="sql"
          title={view.name} subtitle={targetSchema}
          headerColor="text-gray-700" borderColor="border-gray-200" bgColor="bg-white"
          fieldCount={view.columns.length}>
          {/* Mappade kolumner */}
          {view.columnMappings.map((m, i) => (
            <FieldPill key={`${m.targetCol}-${i}`}
              refKey={`sql:${m.targetCol}`}
              label={m.targetCol}
              colorClass="bg-gray-100 text-gray-700" />
          ))}
          {/* Omappade kolumner */}
          {view.columns.filter(c => !view.columnMappings.find(m => m.targetCol === c.name)).map(col => (
            <FieldPill key={col.name}
              refKey={`sql:${col.name}`}
              label={col.name}
              colorClass="bg-gray-50 text-gray-400" />
          ))}
        </NodeBox>

        {/* Pil */}
        <div className="flex items-center justify-center pt-4 text-gray-300">
          <svg width="24" height="16"><path d="M0 8 L16 8 M10 4 L16 8 L10 12" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg>
        </div>

        {/* 3. Affärsmodell */}
        <NodeBox id="biz"
          title={view.displayName || view.name}
          subtitle={view.type}
          headerColor={colors.text} borderColor={colors.border} bgColor={colors.bg}
          fieldCount={view.columns.length}>
          {view.columns.map(col => (
            <FieldPill key={col.name}
              refKey={`biz:${col.name}`}
              label={col.displayName || col.name}
              icon={col.isKey ? <Key className="w-3 h-3 text-yellow-500 flex-shrink-0" />
                  : col.isMeasure ? <Hash className="w-3 h-3 text-green-500 flex-shrink-0" />
                  : <div className="w-2.5 h-2.5 rounded-full bg-blue-400 flex-shrink-0" />}
              colorClass={`${colors.light} ${colors.text}`} />
          ))}
        </NodeBox>

        {/* Pil */}
        <div className="flex items-center justify-center pt-4 text-gray-300">
          <svg width="24" height="16"><path d="M0 8 L16 8 M10 4 L16 8 L10 12" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg>
        </div>

        {/* 4. Rapporter */}
        <div className="space-y-2">
          {view.reports.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-400 italic">
              Inga rapporter kopplade
            </div>
          ) : view.reports.map(report => {
            const usedCols = (report.sourceColumns ?? []).filter(sc => sc.viewName === view.name);
            return (
              <NodeBox key={report.id} id={`report:${report.id}`}
                title={report.title}
                headerColor="text-green-700" borderColor="border-green-200" bgColor="bg-green-50"
                fieldCount={usedCols.length}>
                {usedCols.map(sc => (
                  <FieldPill key={sc.columnName}
                    refKey={`report:${report.id}:${sc.columnName}`}
                    label={sc.columnName}
                    icon={<BarChart2 className="w-3 h-3 text-green-500 flex-shrink-0" />}
                    colorClass="bg-green-100 text-green-700" />
                ))}
                <a href={`${klarifyUrl}/space/1/report/${report.id}`} target="_blank"
                  className="flex items-center gap-1 text-xs text-green-600 hover:underline pt-1">
                  <ExternalLink className="w-3 h-3" /> Öppna i Klarify
                </a>
              </NodeBox>
            );
          })}
        </div>
      </div>
    </div>
  );
}
