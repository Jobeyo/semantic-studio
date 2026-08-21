'use client';
import { useEffect, useRef, useState } from 'react';

interface Column { name: string; displayName: string; dataType: string; isKey: boolean; isMeasure: boolean; }
interface View { id: number; name: string; displayName: string; type: string; sql: string; columns: Column[]; }

interface Node { id: string; x: number; y: number; width: number; height: number; view: View; }
interface Edge { from: string; to: string; fromCol: string; toCol: string; }

const TYPE_COLORS: Record<string, { bg: string; header: string; border: string }> = {
  fact:      { bg: '#eff6ff', header: '#1d4ed8', border: '#3b82f6' },
  dimension: { bg: '#f5f3ff', header: '#6d28d9', border: '#8b5cf6' },
  measure:   { bg: '#f0fdf4', header: '#15803d', border: '#22c55e' },
};

function parseRelations(views: View[]): Edge[] {
  const edges: Edge[] = [];

  // Hitta relationer via delade nyckelkolumner (isKey = true med samma namn)
  for (let i = 0; i < views.length; i++) {
    const viewA = views[i];
    const keysA = viewA.columns.filter(c => c.isKey).map(c => c.name.toLowerCase());
    
    for (let j = i + 1; j < views.length; j++) {
      const viewB = views[j];
      const keysB = viewB.columns.filter(c => c.isKey).map(c => c.name.toLowerCase());
      
      // Hitta gemensamma nycklar
      const shared = keysA.filter(k => keysB.includes(k));
      if (shared.length > 0) {
        edges.push({ 
          from: viewA.name, 
          to: viewB.name, 
          fromCol: shared[0], 
          toCol: shared[0] 
        });
      }
    }
    
    // Hitta också icke-nyckel kolumner som matchar nyckelkolumner i andra vyer
    const allColsA = viewA.columns.map(c => c.name.toLowerCase());
    for (let j = 0; j < views.length; j++) {
      if (i === j) continue;
      const viewB = views[j];
      const keysB = viewB.columns.filter(c => c.isKey).map(c => c.name.toLowerCase());
      const matched = keysB.filter(k => allColsA.includes(k) && !keysA.includes(k));
      if (matched.length > 0) {
        const existing = edges.find(e =>
          (e.from === viewA.name && e.to === viewB.name) ||
          (e.from === viewB.name && e.to === viewA.name)
        );
        if (!existing) {
          edges.push({ from: viewA.name, to: viewB.name, fromCol: matched[0], toCol: matched[0] });
        }
      }
    }
  }
  return edges;
}

function layoutNodes(views: View[]): Node[] {
  const COL_WIDTH = 220;
  const ROW_HEIGHT = 40;
  const PADDING = 20;
  const COLS = 3;

  const facts = views.filter(v => v.type === 'fact');
  const dims = views.filter(v => v.type === 'dimension');
  const measures = views.filter(v => v.type === 'measure');
  const kpis = views.filter(v => v.type === 'kpi');
  const ordered = [...facts, ...dims, ...measures, ...kpis];

  return ordered.map((view, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const height = ROW_HEIGHT + (view.columns.length * 24) + PADDING;
    return {
      id: view.name,
      x: col * (COL_WIDTH + 60) + 40,
      y: row * (height + 40) + 40,
      width: COL_WIDTH,
      height,
      view,
    };
  });
}

const STORAGE_KEY = 'er-diagram-positions';

export default function ERDiagram({ views, modelId }: { views: View[]; modelId: number }) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [savedMsg, setSavedMsg] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}-${modelId}`);
    if (saved) {
      try {
        const positions = JSON.parse(saved) as Record<string, {x: number; y: number}>;
        const layout = layoutNodes(views);
        setNodes(layout.map((n, i) => {
          if (positions[n.id]) return { ...n, x: positions[n.id].x, y: positions[n.id].y };
          // Ny vy utan sparad position - lägg inom viewport
          const col = i % 3;
          const row = Math.floor(i / 3);
          return { ...n, x: col * 280 + 40, y: row * 200 + 40 };
        }));
      } catch {
        setNodes(layoutNodes(views));
      }
    } else {
      setNodes(layoutNodes(views));
    }
    setEdges(parseRelations(views));
  }, [views, modelId]);

  function saveLayout() {
    const positions: Record<string, {x: number; y: number}> = {};
    nodes.forEach(n => { positions[n.id] = { x: n.x, y: n.y }; });
    localStorage.setItem(`${STORAGE_KEY}-${modelId}`, JSON.stringify(positions));
    setSavedMsg(true); setHasChanges(false); setTimeout(() => setSavedMsg(false), 2000);
  }

  const totalW = Math.max(...nodes.map(n => n.x + n.width + 60), 800);
  const totalH = Math.max(...nodes.map(n => n.y + n.height + 60), 600);

  function getNodeCenter(nodeId: string) {
    const n = nodes.find(n => n.id === nodeId);
    if (!n) return { x: 0, y: 0 };
    return { x: n.x + n.width / 2, y: n.y + n.height / 2 };
  }

  function onMouseDown(e: React.MouseEvent, nodeId: string) {
    const n = nodes.find(n => n.id === nodeId)!;
    setDragging(nodeId);
    setDragOffset({ x: e.clientX - n.x, y: e.clientY - n.y });
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!dragging) return;
    setHasChanges(true);
    setNodes(prev => prev.map(n => n.id === dragging
      ? { ...n, x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y }
      : n
    ));
  }

  function onMouseUp() { setDragging(null); }

  return (
    <div className="w-full overflow-auto border border-gray-200 rounded-xl bg-gray-50">
      <svg
        ref={svgRef}
        width={totalW}
        height={totalH}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        style={{ userSelect: 'none' }}
      >
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="#94a3b8" />
          </marker>
        </defs>

        {/* Edges */}
        {edges.map((edge, i) => {
          const from = getNodeCenter(edge.from);
          const to = getNodeCenter(edge.to);
          return (
            <g key={i}>
              <line
                x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5,3"
                markerEnd="url(#arrow)"
              />
              <text
                x={(from.x + to.x) / 2}
                y={(from.y + to.y) / 2 - 4}
                fontSize={9} fill="#64748b" textAnchor="middle"
              >
                {edge.fromCol} = {edge.toCol}
              </text>
            </g>
          );
        })}

        {/* Nodes */}
        {nodes.map(node => {
          const colors = TYPE_COLORS[node.view.type] ?? TYPE_COLORS.fact;
          return (
            <g
              key={node.id}
              transform={`translate(${node.x},${node.y})`}
              onMouseDown={e => onMouseDown(e, node.id)}
              style={{ cursor: 'grab' }}
            >
              {/* Card */}
              <rect width={node.width} height={node.height} rx={8} fill={colors.bg} stroke={colors.border} strokeWidth={1.5} />
              {/* Header */}
              <rect width={node.width} height={36} rx={8} fill={colors.header} />
              <rect y={28} width={node.width} height={8} fill={colors.header} />
              <text x={10} y={14} fontSize={11} fontWeight="600" fill="white">{node.view.displayName}</text>
              <text x={10} y={28} fontSize={9} fill="rgba(255,255,255,0.7)">
                {node.view.type === 'fact' ? 'Faktatabell' : node.view.type === 'dimension' ? 'Dimension' : 'Mått'} · {node.view.columns.length} kolumner
              </text>
              {/* Columns */}
              {node.view.columns.map((col, ci) => (
                <g key={col.name} transform={`translate(0,${36 + ci * 24})`}>
                  <rect width={node.width} height={24} fill={ci % 2 === 0 ? 'rgba(0,0,0,0.02)' : 'transparent'} />
                  {col.isKey && (
                    <text x={8} y={16} fontSize={10} fill="#f59e0b">🔑</text>
                  )}
                  {col.isMeasure && !col.isKey && (
                    <text x={8} y={16} fontSize={10} fill="#3b82f6">∑</text>
                  )}
                  <text x={col.isKey || col.isMeasure ? 22 : 10} y={16} fontSize={10} fill="#374151">
                    {col.displayName}
                  </text>
                  <text x={node.width - 6} y={16} fontSize={9} fill="#9ca3af" textAnchor="end">
                    {col.dataType}
                  </text>
                </g>
              ))}
            </g>
          );
        })}
      </svg>
      <div className="p-3 border-t border-gray-200 flex items-center gap-6 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-700 inline-block" /> Faktatabell</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-violet-700 inline-block" /> Dimension</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-green-700 inline-block" /> Mått</span>
        <span className="flex items-center gap-1.5"><span className="w-4 h-px border-t border-dashed border-slate-400 inline-block" /> Relation</span>
        <span className="text-gray-400">Dra i rutorna för att flytta</span>
        <div className="ml-auto flex items-center gap-2">
          {savedMsg && <span className="text-xs text-green-600 font-medium">✓ Layout sparad</span>}
          <button onClick={saveLayout} disabled={!hasChanges} className="px-3 py-1 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed">
            Spara layout
          </button>
        </div>
      </div>
    </div>
  );
}
