'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Plus, Trash2, Sparkles } from 'lucide-react';
import Link from 'next/link';

interface Column { name: string; displayName: string; description: string; dataType: string; isKey: boolean; isMeasure: boolean; isDerived: boolean; expression: string; }
interface ModelView { id: number; name: string; displayName: string; type: string; columns: { name: string; displayName: string; dataType: string; isKey: boolean; isMeasure: boolean }[]; }
interface DerivedMeasure { name: string; displayName: string; expression: string; dataType: string; }

export default function NewViewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('fact');
  const [sql, setSql] = useState('CREATE OR REPLACE VIEW semantic_layer. AS\nSELECT\n\nFROM ');
  const [columns, setColumns] = useState<Column[]>([{ name: '', displayName: '', description: '', dataType: 'string', isKey: false, isMeasure: false, isDerived: false, expression: '' }]);

  // KPI-specifikt
  const [modelViews, setModelViews] = useState<ModelView[]>([]);
  const [selectedBaseViews, setSelectedBaseViews] = useState<number[]>([]);
  const [selectedDimensions, setSelectedDimensions] = useState<string[]>([]);
  const [derivedMeasures, setDerivedMeasures] = useState<DerivedMeasure[]>([{ name: '', displayName: '', expression: '', dataType: 'number' }]);
  const [aiGenerating, setAiGenerating] = useState(false);

  useEffect(() => {
    fetch(`/api/models/${id}`).then(r => r.json()).then(m => setModelViews(m.views ?? []));
  }, [id]);

  // Alla tillgängliga kolumner från valda basvyer
  const availableColumns = modelViews
    .filter(v => selectedBaseViews.includes(v.id))
    .flatMap(v => v.columns.map(c => ({ ...c, viewName: v.name, viewDisplayName: v.displayName })));

  const dimensionColumns = availableColumns.filter(c => !c.isMeasure);
  const measureColumns = availableColumns.filter(c => c.isMeasure);

  function toggleBaseView(viewId: number) {
    setSelectedBaseViews(prev =>
      prev.includes(viewId) ? prev.filter(id => id !== viewId) : [...prev, viewId]
    );
  }

  function toggleDimension(colKey: string) {
    setSelectedDimensions(prev =>
      prev.includes(colKey) ? prev.filter(k => k !== colKey) : [...prev, colKey]
    );
  }

  function addDerivedMeasure() {
    setDerivedMeasures(prev => [...prev, { name: '', displayName: '', expression: '', dataType: 'number' }]);
  }

  function updateDerivedMeasure(i: number, field: keyof DerivedMeasure, value: string) {
    setDerivedMeasures(prev => prev.map((m, j) => j === i ? { ...m, [field]: value } : m));
  }

  function removeDerivedMeasure(i: number) {
    setDerivedMeasures(prev => prev.filter((_, j) => j !== i));
  }

  function generateKpiSql(): string {
    if (selectedBaseViews.length === 0) return '';
    const baseViews = modelViews.filter(v => selectedBaseViews.includes(v.id));
    const primaryView = baseViews[0];
    const alias = primaryView.name.charAt(0);

    const dimCols = selectedDimensions.map(k => {
      const [viewName, colName] = k.split('.');
      return `  ${alias}.${colName}`;
    });

    const measCols = derivedMeasures
      .filter(m => m.name && m.expression)
      .map(m => `  ${m.expression} AS ${m.name}`);

    const allCols = [...dimCols, ...measCols];

    let fromClause = `semantic_layer."${primaryView.name}" ${alias}`;

    // JOIN extra basvyer
    baseViews.slice(1).forEach((v, i) => {
      const a = v.name.charAt(0) + i;
      const joinKey = v.columns.find(c => c.isKey)?.name ?? 'id';
      const primaryKey = primaryView.columns.find(c => c.isKey)?.name ?? 'id';
      fromClause += `\nJOIN semantic_layer."${v.name}" ${a} ON ${a}.${joinKey} = ${alias}.${primaryKey}`;
    });

    const groupBy = dimCols.length > 0
      ? `\nGROUP BY ${dimCols.map(c => c.trim()).join(', ')}`
      : '';

    const viewName = name || 'kpi_view';
    return `CREATE OR REPLACE VIEW semantic_layer."${viewName}" AS\nSELECT\n${allCols.join(',\n')}\nFROM ${fromClause}${groupBy}\nORDER BY ${measCols[0] ? measCols[0].split(' AS ')[1] : dimCols[0]?.trim() ?? '1'} DESC;`;
  }

  async function generateWithAI() {
    if (selectedBaseViews.length === 0 || derivedMeasures.filter(m => m.displayName).length === 0) return;
    setAiGenerating(true);
    try {
      const context = {
        baseViews: modelViews.filter(v => selectedBaseViews.includes(v.id)).map(v => ({
          name: v.name, columns: v.columns
        })),
        dimensions: selectedDimensions,
        measures: derivedMeasures.filter(m => m.displayName),
        kpiName: displayName,
      };
      const res = await fetch(`/api/models/${id}/generate-kpi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(context),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.measures) setDerivedMeasures(data.measures);
        if (data.sql) setSql(data.sql);
      }
    } catch {}
    setAiGenerating(false);
  }

  function addColumn() { setColumns(prev => [...prev, { name: '', displayName: '', description: '', dataType: 'string', isKey: false, isMeasure: false, isDerived: false, expression: '' }]); }
  function updateColumn(i: number, field: keyof Column, value: any) { setColumns(prev => prev.map((c, j) => j === i ? { ...c, [field]: value } : c)); }
  function removeColumn(i: number) { setColumns(prev => prev.filter((_, j) => j !== i)); }

  async function handleSave() {
    setLoading(true);
    let finalSql = sql;
    let finalColumns = columns;

    if (type === 'kpi') {
      finalSql = generateKpiSql();
      // Bygg kolumner från dimensioner + härledda mått
      const dimColsDef: Column[] = selectedDimensions.map(k => {
        const colName = k.split('.')[1];
        const col = availableColumns.find(c => c.name === colName);
        return { name: colName, displayName: col?.displayName ?? colName, description: '', dataType: col?.dataType ?? 'string', isKey: false, isMeasure: false, isDerived: false, expression: '' };
      });
      const measColsDef: Column[] = derivedMeasures.filter(m => m.name).map(m => ({
        name: m.name, displayName: m.displayName, description: '', dataType: m.dataType, isKey: false, isMeasure: true, isDerived: true, expression: m.expression
      }));
      finalColumns = [...dimColsDef, ...measColsDef];
    }

    try {
      const res = await fetch(`/api/models/${id}/views`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, displayName, description, type, sql: finalSql, columns: finalColumns }),
      });
      if (res.ok) router.push(`/models/${id}`);
    } catch {}
    setLoading(false);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 py-5 border-b border-gray-200 bg-white flex items-center gap-4">
        <Link href={`/models/${id}`} className="text-gray-400 hover:text-gray-600"><ArrowLeft className="w-5 h-5" /></Link>
        <h1 className="text-lg font-semibold text-gray-900">Ny vy</h1>
        {type === 'kpi' && <span className="px-2 py-0.5 text-xs rounded-full bg-amber-50 text-amber-700 border border-amber-200">Nyckeltal (KPI)</span>}
      </div>
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-3xl space-y-6">

          {/* Vyinformation */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <h2 className="font-semibold text-gray-900">Vyinformation</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vynamn (i DB) *</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="t.ex. kpi_avfall_per_fastighet"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Affärsnamn *</label>
                <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="t.ex. Avfall per fastighet"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Beskrivning</label>
                <input value={description} onChange={e => setDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Typ</label>
                <select value={type} onChange={e => setType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="fact">Faktatabell</option>
                  <option value="dimension">Dimension</option>
                  <option value="measure">Mått</option>
                  <option value="kpi">Nyckeltal (KPI)</option>
                </select>
              </div>
            </div>
          </div>

          {/* KPI-specifikt flöde */}
          {type === 'kpi' ? (
            <>
              {/* Steg 1: Välj basvyer */}
              <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-medium">1</span>
                  <h2 className="font-semibold text-gray-900">Välj basvyer</h2>
                </div>
                <p className="text-sm text-gray-500">Välj en eller flera vyer som nyckeltalet ska beräknas från.</p>
                <div className="grid grid-cols-2 gap-3">
                  {modelViews.map(v => (
                    <button key={v.id} onClick={() => toggleBaseView(v.id)}
                      className={`p-3 rounded-lg border text-left transition-colors ${selectedBaseViews.includes(v.id) ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <p className="text-sm font-medium text-gray-900">{v.displayName}</p>
                      <p className="text-xs text-gray-400 font-mono mt-0.5">{v.name}</p>
                      <span className={`text-xs px-1.5 py-0.5 rounded mt-1 inline-block ${v.type === 'fact' ? 'bg-blue-50 text-blue-600' : v.type === 'dimension' ? 'bg-purple-50 text-purple-600' : 'bg-green-50 text-green-600'}`}>
                        {v.type === 'fact' ? 'Faktatabell' : v.type === 'dimension' ? 'Dimension' : 'Mått'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Steg 2: Välj dimensioner */}
              {selectedBaseViews.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-medium">2</span>
                    <h2 className="font-semibold text-gray-900">Välj dimensioner att gruppera på</h2>
                  </div>
                  <p className="text-sm text-gray-500">Dessa kolumner används i GROUP BY och ger kontexten för nyckeltalet.</p>
                  <div className="flex flex-wrap gap-2">
                    {dimensionColumns.map((col, i) => {
                      const key = `${col.viewName}.${col.name}`;
                      return (
                        <button key={i} onClick={() => toggleDimension(key)}
                          className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${selectedDimensions.includes(key) ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                          {col.displayName} <span className="text-xs text-gray-400 font-mono">({col.name})</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Steg 3: Härledda mått */}
              {selectedBaseViews.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-medium">3</span>
                      <h2 className="font-semibold text-gray-900">Härledda mått</h2>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={generateWithAI} disabled={aiGenerating}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-indigo-200 text-indigo-600 rounded-lg text-sm hover:bg-indigo-50 disabled:opacity-50">
                        {aiGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        Generera med AI
                      </button>
                      <button onClick={addDerivedMeasure}
                        className="flex items-center gap-1.5 text-sm text-indigo-600 hover:underline">
                        <Plus className="w-4 h-4" /> Lägg till
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-gray-500">Ange SQL-uttryck för varje härlett mått. Tillgängliga källmått: {measureColumns.map(c => c.name).join(', ') || 'välj basvyer med mått'}</p>
                  <div className="space-y-3">
                    {derivedMeasures.map((m, i) => (
                      <div key={i} className="grid grid-cols-12 gap-2 items-start border border-gray-100 rounded-lg p-3 bg-gray-50">
                        <div className="col-span-3">
                          <label className="text-xs text-gray-500 mb-1 block">Kolumnnamn</label>
                          <input value={m.name} onChange={e => updateDerivedMeasure(i, 'name', e.target.value)}
                            placeholder="andel_av_total" className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs font-mono" />
                        </div>
                        <div className="col-span-3">
                          <label className="text-xs text-gray-500 mb-1 block">Affärsnamn</label>
                          <input value={m.displayName} onChange={e => updateDerivedMeasure(i, 'displayName', e.target.value)}
                            placeholder="Andel av total" className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs" />
                        </div>
                        <div className="col-span-5">
                          <label className="text-xs text-gray-500 mb-1 block">SQL-uttryck</label>
                          <input value={m.expression} onChange={e => updateDerivedMeasure(i, 'expression', e.target.value)}
                            placeholder="SUM(amount) / SUM(SUM(amount)) OVER ()"
                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs font-mono" />
                        </div>
                        <div className="col-span-1 flex justify-end pt-5">
                          <button onClick={() => removeDerivedMeasure(i)} className="p-1 text-red-400 hover:text-red-600">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Steg 4: Förhandsgranskning av SQL */}
              {selectedBaseViews.length > 0 && name && (
                <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-medium">4</span>
                    <h2 className="font-semibold text-gray-900">Genererad SQL</h2>
                  </div>
                  <pre className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono bg-gray-900 text-green-400 overflow-x-auto whitespace-pre-wrap">
                    {generateKpiSql() || '-- Fyll i stegen ovan för att generera SQL'}
                  </pre>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Vanlig vy - SQL + kolumner */}
              <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-3">
                <h2 className="font-semibold text-gray-900">SQL-definition</h2>
                <textarea value={sql} onChange={e => setSql(e.target.value)} rows={8}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-900 text-green-400 resize-none" />
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-gray-900">Kolumner</h2>
                  <button onClick={addColumn} className="flex items-center gap-1.5 text-sm text-indigo-600 hover:underline">
                    <Plus className="w-4 h-4" /> Lägg till
                  </button>
                </div>
                <div className="space-y-3">
                  {columns.map((col, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-center border border-gray-100 rounded-lg p-3 bg-gray-50">
                      <div className="col-span-3">
                        <input value={col.name} onChange={e => updateColumn(i, 'name', e.target.value)} placeholder="kolumnnamn"
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs font-mono" />
                      </div>
                      <div className="col-span-3">
                        <input value={col.displayName} onChange={e => updateColumn(i, 'displayName', e.target.value)} placeholder="Affärsnamn"
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs" />
                      </div>
                      <div className="col-span-2">
                        <select value={col.dataType} onChange={e => updateColumn(i, 'dataType', e.target.value)}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs">
                          <option value="string">Text</option>
                          <option value="number">Nummer</option>
                          <option value="date">Datum</option>
                          <option value="boolean">Boolean</option>
                        </select>
                      </div>
                      <div className="col-span-3 flex items-center gap-3">
                        <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                          <input type="checkbox" checked={col.isKey} onChange={e => updateColumn(i, 'isKey', e.target.checked)} /> Nyckel
                        </label>
                        <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                          <input type="checkbox" checked={col.isMeasure} onChange={e => updateColumn(i, 'isMeasure', e.target.checked)} /> Mått
                        </label>
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <button onClick={() => removeColumn(i)} className="p-1 text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="flex justify-end gap-3">
            <Link href={`/models/${id}`} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Avbryt</Link>
            <button onClick={handleSave} disabled={loading || !name || !displayName}
              className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />} Spara vy
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
