'use client';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { BarChart2, Key, Hash, ExternalLink, ChevronDown, ChevronUp, Lock, FileSpreadsheet } from 'lucide-react';

export interface ColumnMapping { sourceCol: string; targetCol: string; sourceTable?: string; expression?: string; }
export interface ColumnInfo { name: string; displayName: string; dataType: string; isKey: boolean; isMeasure: boolean; }
export interface ReportInfo { id: string; title: string; sourceViews: string[]; sourceColumns: { viewName: string; columnName: string }[]; reportOwner?: string; reportOwnerEmail?: string; reportRequester?: string; }
export interface UpstreamColumn {
  column: string;
  sourceFile: string | null; sourceHierarchy: string | null; sourceColumn: string | null;
  sourceDescription: string | null; sourceDataType: string | null; sensitive: boolean;
  transformation: string | null; whereCondition: string | null;
  coreTable: string | null; coreColumn: string | null; coreDescription: string | null; coreDataType: string | null;
  datamart: string | null; datamartTable: string | null; datamartColumn: string | null; datamartDescription: string | null;
  loadingExpression: string | null;
}
export interface UpstreamTable { layer: 'core' | 'datamart'; columns: UpstreamColumn[]; }
export interface ViewNode {
  id?: number;
  name: string; displayName: string; type: string;
  sourceTables: string[]; columnCount: number;
  columns: ColumnInfo[]; columnMappings: ColumnMapping[];
  reports: ReportInfo[];
  coreColumns?: Record<string, string[]>;
  upstream?: Record<string, UpstreamTable>;
}
interface Line { x1: number; y1: number; x2: number; y2: number; color: string; dashed?: boolean; fromKey: string; toKey: string; }
interface Props {
  view: ViewNode; targetSchema: string; klarifyUrl: string;
  /** 0 = ingen ETL-lineage, 1 = källfil före Core, 2 = källfil och Core före data mart */
  upstreamDepth?: number;
}

const TYPE_COLORS: Record<string, { bg: string; border: string; text: string; light: string }> = {
  fact:      { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700',   light: 'bg-blue-100' },
  dimension: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', light: 'bg-purple-100' },
  measure:   { bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-700',  light: 'bg-green-100' },
  kpi:       { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', light: 'bg-orange-100' },
};

const lc = (s: string) => s.toLowerCase();
const fileKey = (file: string, col: string) => 'file:' + file + ':' + col;
const coreKey = (table: string, col: string) => 'core:' + lc(table) + ':' + lc(col);
const srcKey = (table: string, col: string) => 'source:' + table + ':' + lc(col);
const sqlKey = (col: string) => 'sql:' + lc(col);

export function lineageGridTemplate(upstreamDepth: number) {
  return Array(4 + upstreamDepth).fill('1fr').join(' 20px ');
}

function Arrow() {
  return (
    <div className="flex items-start justify-center pt-3 text-gray-300">
      <svg width="20" height="16"><path d="M0 8 L14 8 M8 4 L14 8 L8 12" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg>
    </div>
  );
}

export default function LineageRow({ view, targetSchema, klarifyUrl, upstreamDepth = 0 }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [lines, setLines] = useState<Line[]>([]);
  const [activeField, setActiveField] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fieldRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const colors = TYPE_COLORS[view.type] ?? { bg: 'bg-white', border: 'border-gray-200', text: 'text-gray-700', light: 'bg-gray-100' };
  const uniqueSources = useMemo(() => [...new Set(view.sourceTables)], [view.sourceTables]);
  const showFile = upstreamDepth >= 1;
  const showCore = upstreamDepth >= 2;

  // ETL-led uppströms, per källtabell
  const upstream = useMemo(() => uniqueSources.flatMap(table => {
    const u = view.upstream?.[table];
    return u ? u.columns.map(c => ({ table, layer: u.layer, c })) : [];
  }), [uniqueSources, view.upstream]);

  const files = useMemo(() => {
    const map = new Map<string, { hierarchy: string | null; cols: Map<string, UpstreamColumn> }>();
    for (const { c } of upstream) {
      if (!c.sourceFile || !c.sourceColumn) continue;
      if (!map.has(c.sourceFile)) map.set(c.sourceFile, { hierarchy: c.sourceHierarchy, cols: new Map() });
      const f = map.get(c.sourceFile)!;
      if (!f.cols.has(c.sourceColumn)) f.cols.set(c.sourceColumn, c);
    }
    return map;
  }, [upstream]);

  const coreTables = useMemo(() => {
    const map = new Map<string, Map<string, UpstreamColumn>>();
    for (const { layer, c } of upstream) {
      if (layer !== 'datamart' || !c.coreTable || !c.coreColumn) continue;
      if (!map.has(c.coreTable)) map.set(c.coreTable, new Map());
      const t = map.get(c.coreTable)!;
      if (!t.has(lc(c.coreColumn))) t.set(lc(c.coreColumn), c);
    }
    return map;
  }, [upstream]);

  const sourceCols = (table: string): string[] => {
    const known = (view.coreColumns ?? {})[table] ?? [];
    if (known.length) return known;
    const fromMappings = view.columnMappings.filter(m => (m.sourceTable ?? uniqueSources[0]) === table).map(m => m.sourceCol);
    const fromUpstream = (view.upstream?.[table]?.columns ?? []).map(c => c.column);
    return [...new Map([...fromMappings, ...fromUpstream].map(c => [lc(c), c])).values()];
  };
  const isMapped = (table: string, col: string) =>
    view.columnMappings.some(m => (m.sourceTable ?? uniqueSources[0]) === table && lc(m.sourceCol) === lc(col));
  const upstreamFor = (table: string, col: string) =>
    view.upstream?.[table]?.columns.find(c => lc(c.column) === lc(col));

  const sqlTargets = useMemo(() => {
    const seen = new Map<string, { name: string; expression?: string; mapped: boolean }>();
    for (const m of view.columnMappings) if (!seen.has(lc(m.targetCol))) seen.set(lc(m.targetCol), { name: m.targetCol, expression: m.expression, mapped: true });
    for (const c of view.columns) if (!seen.has(lc(c.name))) seen.set(lc(c.name), { name: c.name, mapped: false });
    return [...seen.values()];
  }, [view.columnMappings, view.columns]);

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
    const seen = new Set<string>();
    const link = (fromKey: string, toKey: string, color: string, dashed?: boolean) => {
      if (seen.has(fromKey + '>' + toKey)) return;
      const s = getPos(fromKey, box);
      const t = getPos(toKey, box);
      if (!s || !t) return;
      seen.add(fromKey + '>' + toKey);
      newLines.push({ x1: s.right, y1: s.mid, x2: t.left, y2: t.mid, color, dashed, fromKey, toKey });
    };

    // Källfil -> Core, och Core -> data mart
    for (const { table, layer, c } of upstream) {
      const hasFile = showFile && !!c.sourceFile && !!c.sourceColumn;
      if (layer === 'core') {
        if (hasFile && expanded.has('file') && expanded.has('source')) link(fileKey(c.sourceFile!, c.sourceColumn!), srcKey(table, c.column), '#38bdf8');
      } else if (showCore && c.coreTable && c.coreColumn) {
        if (hasFile && expanded.has('file') && expanded.has('core')) link(fileKey(c.sourceFile!, c.sourceColumn!), coreKey(c.coreTable, c.coreColumn), '#38bdf8');
        if (expanded.has('core') && expanded.has('source')) link(coreKey(c.coreTable, c.coreColumn), srcKey(table, c.column), '#fb923c');
      } else if (hasFile && expanded.has('file') && expanded.has('source')) {
        link(fileKey(c.sourceFile!, c.sourceColumn!), srcKey(table, c.column), '#38bdf8');
      }
    }
    // Källtabell -> semantisk vy
    if (expanded.has('source') && expanded.has('sql')) {
      for (const m of view.columnMappings) link(srcKey(m.sourceTable ?? uniqueSources[0], m.sourceCol), sqlKey(m.targetCol), '#f59e0b');
    }
    // Semantisk vy -> affärsmodell
    if (expanded.has('sql') && expanded.has('biz')) {
      for (const col of view.columns) link(sqlKey(col.name), 'biz:' + col.name, '#818cf8');
    }
    // Affärsmodell -> rapport
    if (expanded.has('biz')) {
      for (const report of view.reports) {
        if (!expanded.has('report:' + report.id)) continue;
        for (const sc of (report.sourceColumns ?? []).filter(sc => sc.viewName === view.name)) {
          link('biz:' + sc.columnName, 'report:' + report.id + ':' + sc.columnName, '#34d399', true);
        }
      }
    }
    setLines(newLines);
  }, [expanded, view, getPos, upstream, uniqueSources, showFile, showCore]);

  useEffect(() => {
    const t = setTimeout(recalcLines, 80);
    return () => clearTimeout(t);
  }, [recalcLines]);

  // Transitiv spårning: alla fält som hänger ihop med det valda, genom hela kedjan
  const connectedKeys = useMemo(() => {
    const visited = new Set<string>();
    if (!activeField) return visited;
    const walk = (key: string) => {
      if (visited.has(key)) return;
      visited.add(key);
      for (const l of lines) {
        if (l.fromKey === key) walk(l.toKey);
        if (l.toKey === key) walk(l.fromKey);
      }
    };
    walk(activeField);
    return visited;
  }, [activeField, lines]);

  const Field = ({ refKey, label, icon, colorClass, title, badge }: {
    refKey: string; label: string; icon?: React.ReactNode; colorClass: string; title?: string; badge?: React.ReactNode;
  }) => {
    const isActive = activeField === refKey;
    const isConnected = !!(activeField && !isActive && connectedKeys.has(refKey));
    const isDimmed = !!(activeField && !isActive && !isConnected);
    return (
      <div
        ref={el => { if (el) fieldRefs.current.set(refKey, el); else fieldRefs.current.delete(refKey); }}
        onClick={() => setActiveField(prev => prev === refKey ? null : refKey)}
        title={title}
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
        {badge && <span className="ml-auto flex items-center gap-1 flex-shrink-0">{badge}</span>}
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

  const fxBadge = (text: string | null | undefined) =>
    text ? <span className="text-[10px] px-1 rounded bg-white/70 border border-current opacity-70 font-sans">ƒ</span> : null;
  const tip = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join('\n') || undefined;

  const emptyBox = (text: string) => (
    <div className="rounded-xl border border-dashed border-gray-200 px-3 py-2.5 text-xs text-gray-400 italic">{text}</div>
  );

  return (
    <div ref={containerRef} className="relative py-2">
      {/* SVG overlay */}
      <svg className="absolute inset-0 pointer-events-none z-20" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
        {lines.map((l, i) => {
          const isActive = !!(activeField && connectedKeys.has(l.fromKey) && connectedKeys.has(l.toKey));
          const isDimmed = !!(activeField && !isActive);
          const d = `M${l.x1},${l.y1} C${(l.x1 + 60)},${l.y1} ${(l.x2 - 60)},${l.y2} ${l.x2},${l.y2}`;
          return (
            <g key={i}>
              <path d={d} fill="none" stroke={l.color} strokeWidth={1.5}
                opacity={isDimmed ? 0.05 : 0.4}
                strokeDasharray={l.dashed ? '4 2' : undefined} />
              {isActive && (
                <path d={d} fill="none" stroke={l.color} strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeDasharray={l.dashed ? '6 3' : undefined}
                  opacity={1} />
              )}
            </g>
          );
        })}
      </svg>

      <div className="grid items-start gap-3" style={{ gridTemplateColumns: lineageGridTemplate(upstreamDepth) }}>

        {/* 0a. Källfil */}
        {showFile && (
          <>
            <div className="space-y-2">
              {files.size === 0 ? emptyBox('Ingen källa i ETL-lineage') : [...files.entries()].map(([file, f]) => (
                <div key={file}>
                  <NodeHeader id="file" title={file} sub={f.hierarchy && f.hierarchy !== '$' ? f.hierarchy : 'Källfil'} count={f.cols.size}
                    hColor="text-sky-800" bColor="border-sky-200" bgColor="bg-sky-50" />
                  {expanded.has('file') && (
                    <div className="mt-1 px-1">
                      {[...f.cols.values()].map(c => (
                        <Field key={c.sourceColumn} refKey={fileKey(file, c.sourceColumn!)} label={c.sourceColumn!}
                          colorClass="bg-sky-100 text-sky-800"
                          icon={<FileSpreadsheet className="w-3 h-3 text-sky-500 flex-shrink-0" />}
                          title={tip(c.sourceDescription, c.sourceDataType && 'Datatyp: ' + c.sourceDataType,
                            c.transformation && 'Transformation: ' + c.transformation,
                            c.whereCondition && 'Villkor: ' + c.whereCondition,
                            c.sensitive && 'Innehåller känsliga uppgifter')}
                          badge={<>{c.sensitive && <Lock className="w-3 h-3 text-rose-500" />}{fxBadge(c.transformation)}</>} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <Arrow />
          </>
        )}

        {/* 0b. Core, när affärsmodellen bygger på en data mart */}
        {showCore && (
          <>
            <div className="space-y-2">
              {coreTables.size === 0 ? emptyBox('–') : [...coreTables.entries()].map(([table, cols]) => (
                <div key={table}>
                  <NodeHeader id="core" title={table} sub="Core" count={cols.size}
                    hColor="text-orange-800" bColor="border-orange-200" bgColor="bg-orange-50" />
                  {expanded.has('core') && (
                    <div className="mt-1 px-1">
                      {[...cols.values()].map(c => (
                        <Field key={c.coreColumn} refKey={coreKey(table, c.coreColumn!)} label={c.coreColumn!}
                          colorClass="bg-orange-100 text-orange-800"
                          title={tip(c.coreDescription, c.coreDataType && 'Datatyp: ' + c.coreDataType)} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <Arrow />
          </>
        )}

        {/* 1. Källtabeller: Core eller data mart */}
        <div className="space-y-2">
          {uniqueSources.map(table => {
            const parts = table.split('.');
            const schema = parts.length > 1 ? parts[0] : '';
            const name = parts.length > 1 ? parts[1] : table;
            const cols = sourceCols(table);
            const layer = view.upstream?.[table]?.layer;
            return (
              <div key={table}>
                <NodeHeader id="source" title={name}
                  sub={[schema, layer === 'datamart' ? 'data mart' : layer === 'core' ? 'Core' : ''].filter(Boolean).join(' · ') || undefined}
                  count={cols.length}
                  hColor="text-amber-800" bColor="border-amber-200" bgColor="bg-amber-50" />
                {expanded.has('source') && (
                  <div className="mt-1 px-1">
                    {cols.map((col, i) => {
                      const u = upstreamFor(table, col);
                      const expr = layer === 'datamart' ? u?.loadingExpression : null;
                      return (
                        <Field key={col + i} refKey={srcKey(table, col)} label={col}
                          colorClass={'bg-amber-100 text-amber-800' + (isMapped(table, col) ? '' : ' opacity-40')}
                          title={tip(layer === 'datamart' ? u?.datamartDescription : u?.coreDescription, expr && 'Laddning: ' + expr)}
                          badge={fxBadge(expr)} />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <Arrow />

        {/* 2. SQL-vy */}
        <div>
          <div className="text-xs text-gray-400 font-semibold mb-1">Semantiskt vylager</div>
          <NodeHeader id="sql" title={view.name} sub={targetSchema} count={view.columns.length}
            hColor="text-gray-700" bColor="border-gray-200" bgColor="bg-white" />
          {expanded.has('sql') && (
            <div className="mt-1 px-1">
              {sqlTargets.map(t => (
                <Field key={t.name} refKey={sqlKey(t.name)} label={t.name}
                  colorClass={t.mapped ? 'bg-gray-100 text-gray-700' : 'bg-gray-50 text-gray-400'}
                  title={t.expression ? 'Uttryck: ' + t.expression : undefined}
                  badge={fxBadge(t.expression)} />
              ))}
            </div>
          )}
        </div>

        <Arrow />

        {/* 3. Affärsmodell */}
        <div>
          <div className="text-xs text-gray-400 font-semibold mb-1">Affärsmodell</div>
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

        <Arrow />

        {/* 4. Rapporter */}
        <div>
          {view.reports.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-400 italic">Inga rapporter</div>
          ) : (
            <div>
              <NodeHeader id="reports-group" title={'Rapporter (' + view.reports.length + ')'}
                hColor="text-green-700" bColor="border-green-200" bgColor="bg-green-50" />
              {expanded.has('reports-group') && (
                <div className="mt-1 space-y-1.5 px-1">
                  {view.reports.map(report => {
                    const usedCols = (report.sourceColumns ?? []).filter(sc => sc.viewName === view.name);
                    const rid = 'report:' + report.id;
                    return (
                      <div key={report.id} className="border border-green-100 rounded-lg overflow-hidden group">
                        <NodeHeader id={rid} title={report.title} count={usedCols.length}
                          hColor="text-green-700" bColor="border-0" bgColor="bg-green-50" />
                        {expanded.has(rid) && (
                          <div className="px-2 pb-2 bg-green-50 border-t border-green-100">
                            {(report.reportOwner || report.reportRequester) && (
                              <div className="pb-1 pt-0.5 space-y-0.5">
                                {report.reportOwner && (
                                  <div className="flex items-center gap-1 text-xs text-green-600">
                                    <span className="text-green-400">Ägare:</span>
                                    {report.reportOwnerEmail ? (
                                      <a href={`mailto:${report.reportOwnerEmail}`} className="hover:underline">{report.reportOwner}</a>
                                    ) : report.reportOwner}
                                  </div>
                                )}
                                {report.reportRequester && (
                                  <div className="flex items-center gap-1 text-xs text-green-500">
                                    <span className="text-green-400">Beställare:</span>
                                    {report.reportRequester}
                                  </div>
                                )}
                              </div>
                            )}
                            {usedCols.map(sc => (
                              <Field key={sc.columnName}
                                refKey={'report:' + report.id + ':' + sc.columnName}
                                label={sc.columnName}
                                colorClass="bg-green-100 text-green-700"
                                icon={<BarChart2 className="w-3 h-3 text-green-500 flex-shrink-0" />} />
                            ))}
                            <div className="flex justify-end pt-1">
                              <a href={klarifyUrl + '/space/1/report/' + report.id} target="_blank"
                                className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-xs text-green-500 hover:text-green-700 px-1"
                                title="Öppna i Klarify">
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
