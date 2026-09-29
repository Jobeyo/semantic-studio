'use client';
import { useState, useEffect, useMemo } from 'react';
import { usePageHeader } from '@/contexts/PageHeaderContext';
import {
  Network, Sparkles, Plus, Trash2, Edit2, Loader2, X, ArrowRight, Scale, Boxes, Eye, Copy, CheckCircle,
} from 'lucide-react';

// ─── Typer ───────────────────────────────────────────────────────────────────

interface Column { id: number; name: string; displayName: string; dataType: string; isMeasure: boolean; isKey: boolean; }
interface View { id: number; name: string; displayName: string; type: string; columns: Column[]; }
interface GlossaryRef { id: number; name: string; definition: string; synonym: string | null; }
interface Property {
  id?: number; columnId: number | null; name: string; description: string | null; unit: string | null; isMeasure: boolean;
  column?: { id: number; name: string; displayName: string; viewId: number } | null;
}
interface Concept {
  id: number; name: string; description: string | null; synonyms: string[];
  glossaryTermId: number | null; viewId: number | null; keyColumn: string | null; owner: string | null;
  createdBy: string; updatedBy: string | null; updatedAt: string;
  properties: Property[];
  view: { id: number; name: string; displayName: string } | null;
  glossaryTerm: { id: number; name: string; definition: string; synonym: string | null } | null;
}
interface Relation {
  id: number; fromConceptId: number; toConceptId: number; verb: string; inverseVerb: string | null;
  cardinality: string; joinCondition: string | null; description: string | null;
  fromConcept: { id: number; name: string }; toConcept: { id: number; name: string };
}
interface Rule {
  id: number; conceptId: number | null; name: string; description: string; expression: string | null; ruleType: string;
  concept: { id: number; name: string } | null;
}
interface OntologyData {
  model: { id: number; name: string };
  concepts: Concept[]; relations: Relation[]; rules: Rule[]; views: View[]; glossaryTerms: GlossaryRef[];
}
interface Model { id: number; name: string; }
type Tab = 'concepts' | 'relations' | 'rules';

// ─── Konstanter ──────────────────────────────────────────────────────────────

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';
const labelCls = 'block text-xs font-medium text-gray-600 mb-1';
const CARDINALITY: Record<string, string> = { one_to_one: '1:1', one_to_many: '1:N', many_to_one: 'N:1', many_to_many: 'N:M' };
const RULE_TYPE: Record<string, { label: string; cls: string }> = {
  definition: { label: 'Definition', cls: 'bg-gray-50 text-gray-700 border-gray-200' },
  filter: { label: 'Filter', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  calculation: { label: 'Beräkning', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  unit: { label: 'Enhet', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  constraint: { label: 'Begränsning', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
};
const UNITS = ['kg', 'ton', 'SEK', 'tkr', 'st', '%', 'dagar', 'timmar', 'm³', 'km'];

const emptyConcept = { name: '', description: '', synonyms: '', glossaryTermId: '', viewId: '', keyColumn: '', owner: '', properties: [] as Property[] };
const emptyRelation = { fromConceptId: '', toConceptId: '', verb: '', inverseVerb: '', cardinality: 'one_to_many', joinCondition: '', description: '' };
const emptyRule = { conceptId: '', name: '', description: '', expression: '', ruleType: 'definition' };

// ─── Hjälpkomponenter ────────────────────────────────────────────────────────

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-8" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 pb-6 overflow-y-auto space-y-4">{children}</div>
      </div>
    </div>
  );
}

function ModalFooter({ onCancel, onSave, saving, editing }: { onCancel: () => void; onSave: () => void; saving: boolean; editing: boolean }) {
  return (
    <div className="flex justify-end gap-3 pt-2">
      <button onClick={onCancel} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Avbryt</button>
      <button onClick={onSave} disabled={saving}
        className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
        {editing ? 'Spara' : 'Lägg till'}
      </button>
    </div>
  );
}

function EmptyState({ icon: Icon, title, text }: { icon: any; title: string; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
      <Icon className="w-12 h-12 opacity-30 mb-4" />
      <p className="font-medium text-gray-600 mb-1">{title}</p>
      <p className="text-sm">{text}</p>
    </div>
  );
}

// ─── Sidan ───────────────────────────────────────────────────────────────────

export default function OntologyPage() {
  const { setHeader } = usePageHeader();
  const [models, setModels] = useState<Model[]>([]);
  const [modelId, setModelId] = useState<number | null>(null);
  const [data, setData] = useState<OntologyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('concepts');
  const [search, setSearch] = useState('');

  const [conceptForm, setConceptForm] = useState(emptyConcept);
  const [relationForm, setRelationForm] = useState(emptyRelation);
  const [ruleForm, setRuleForm] = useState(emptyRule);
  const [open, setOpen] = useState<Tab | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false);
  const [generateMode, setGenerateMode] = useState<'missing' | 'all'>('missing');
  const [contextText, setContextText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setHeader('Ontologi', data ? `${data.concepts.length} begrepp · ${data.relations.length} relationer · ${data.rules.length} regler` : 'Begrepp, relationer och affärsregler per affärsmodell');
  }, [data?.concepts.length, data?.relations.length, data?.rules.length]);

  useEffect(() => {
    fetch('/api/models').then(r => r.json()).then((m: Model[]) => {
      setModels(Array.isArray(m) ? m : []);
      if (Array.isArray(m) && m.length) setModelId(m[0].id);
      else setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { if (modelId) load(modelId); }, [modelId]);

  async function load(id = modelId) {
    if (!id) return;
    setLoading(true);
    const res = await fetch(`/api/ontology?modelId=${id}`);
    if (res.ok) setData(await res.json());
    else setData(null);
    setLoading(false);
  }

  const views = data?.views ?? [];
  const concepts = data?.concepts ?? [];
  const viewById = useMemo(() => new Map(views.map(v => [v.id, v])), [views]);
  const q = search.trim().toLowerCase();
  const match = (...parts: (string | null | undefined)[]) => !q || parts.some(p => p?.toLowerCase().includes(q));

  // ─── Spara / ta bort ───────────────────────────────────────────────────────

  async function send(kind: Tab, body: any) {
    setSaving(true);
    const res = await fetch(editingId ? `/api/ontology/${kind}/${editingId}` : `/api/ontology/${kind}`, {
      method: editingId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, modelId }),
    });
    setSaving(false);
    if (!res.ok) { const err = await res.json().catch(() => ({})); alert('Fel: ' + (err.error ?? res.status)); return; }
    setOpen(null); setEditingId(null);
    await load();
  }

  async function remove(kind: Tab, id: number, label: string) {
    const extra = kind === 'concepts' ? '\n\nRelationer till begreppet tas också bort.' : '';
    if (!confirm(`Ta bort "${label}"?${extra}`)) return;
    const res = await fetch(`/api/ontology/${kind}/${id}`, { method: 'DELETE' });
    if (!res.ok) { alert('Kunde inte ta bort'); return; }
    await load();
  }

  function saveConcept() {
    if (!conceptForm.name.trim()) { alert('Namn krävs'); return; }
    send('concepts', {
      ...conceptForm,
      glossaryTermId: conceptForm.glossaryTermId || null,
      viewId: conceptForm.viewId || null,
      properties: conceptForm.properties.filter(p => p.name.trim()),
    });
  }
  function saveRelation() {
    if (!relationForm.fromConceptId || !relationForm.toConceptId || !relationForm.verb.trim()) { alert('Välj begrepp och ange relation'); return; }
    send('relations', relationForm);
  }
  function saveRule() {
    if (!ruleForm.name.trim() || !ruleForm.description.trim()) { alert('Namn och beskrivning krävs'); return; }
    send('rules', { ...ruleForm, conceptId: ruleForm.conceptId || null });
  }

  // ─── Öppna formulär ────────────────────────────────────────────────────────

  function openConcept(c?: Concept) {
    setEditingId(c?.id ?? null);
    setConceptForm(c ? {
      name: c.name, description: c.description ?? '', synonyms: c.synonyms.join(', '),
      glossaryTermId: c.glossaryTermId ? String(c.glossaryTermId) : '', viewId: c.viewId ? String(c.viewId) : '',
      keyColumn: c.keyColumn ?? '', owner: c.owner ?? '',
      properties: c.properties.map(p => ({ columnId: p.columnId, name: p.name, description: p.description, unit: p.unit, isMeasure: p.isMeasure })),
    } : emptyConcept);
    setOpen('concepts');
  }
  function openRelation(r?: Relation) {
    setEditingId(r?.id ?? null);
    setRelationForm(r ? {
      fromConceptId: String(r.fromConceptId), toConceptId: String(r.toConceptId), verb: r.verb, inverseVerb: r.inverseVerb ?? '',
      cardinality: r.cardinality, joinCondition: r.joinCondition ?? '', description: r.description ?? '',
    } : emptyRelation);
    setOpen('relations');
  }
  function openRule(r?: Rule) {
    setEditingId(r?.id ?? null);
    setRuleForm(r ? {
      conceptId: r.conceptId ? String(r.conceptId) : '', name: r.name, description: r.description,
      expression: r.expression ?? '', ruleType: r.ruleType,
    } : emptyRule);
    setOpen('rules');
  }
  const openNew = () => (tab === 'concepts' ? openConcept() : tab === 'relations' ? openRelation() : openRule());

  // ─── Egenskaper i begreppsformuläret ───────────────────────────────────────

  const formView = conceptForm.viewId ? viewById.get(parseInt(conceptForm.viewId, 10)) : undefined;
  const setProp = (i: number, patch: Partial<Property>) =>
    setConceptForm(f => ({ ...f, properties: f.properties.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));
  const addProp = () =>
    setConceptForm(f => ({ ...f, properties: [...f.properties, { columnId: null, name: '', description: null, unit: null, isMeasure: false }] }));
  const removeProp = (i: number) => setConceptForm(f => ({ ...f, properties: f.properties.filter((_, j) => j !== i) }));
  function pickColumn(i: number, columnId: string) {
    const col = formView?.columns.find(c => c.id === parseInt(columnId, 10));
    const current = conceptForm.properties[i];
    setProp(i, {
      columnId: col?.id ?? null,
      name: current.name || col?.displayName || '',
      isMeasure: col ? col.isMeasure : current.isMeasure,
    });
  }

  // ─── AI och agentkontext ───────────────────────────────────────────────────

  async function generate() {
    setShowGenerateConfirm(false);
    setGenerating(true);
    const res = await fetch('/api/ontology/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId, mode: generateMode }),
    });
    const body = await res.json().catch(() => ({}));
    setGenerating(false);
    if (!res.ok) { alert('Fel: ' + (body.error ?? res.status)); return; }
    await load();
    alert(`AI lade till ${body.conceptsCreated} begrepp, ${body.relationsCreated} relationer och ${body.rulesCreated} regler. Granska förslagen innan modellen publiceras.`);
  }

  async function showContext() {
    const res = await fetch(`/api/ontology/context?modelId=${modelId}`);
    const body = await res.json().catch(() => ({}));
    setContextText(res.ok ? (body.context || 'Ontologin är tom. Lägg till begrepp eller regler först.') : 'Kunde inte hämta kontexten.');
    setCopied(false);
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const counts = { concepts: concepts.length, relations: data?.relations.length ?? 0, rules: data?.rules.length ?? 0 };
  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'concepts', label: 'Begrepp', icon: Boxes },
    { id: 'relations', label: 'Relationer', icon: Network },
    { id: 'rules', label: 'Affärsregler', icon: Scale },
  ];
  const newLabel = { concepts: 'Nytt begrepp', relations: 'Ny relation', rules: 'Ny regel' }[tab];
  const needsConcepts = tab !== 'concepts' && tab !== 'rules' && concepts.length < 2;

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden">
        {/* Verktygsrad */}
        <div className="px-8 py-3 flex items-center gap-3 flex-wrap">
          <select value={modelId ?? ''} onChange={e => setModelId(e.target.value ? parseInt(e.target.value, 10) : null)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            {models.length === 0 && <option value="">Inga affärsmodeller</option>}
            {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Sök…"
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-48" />
          <div className="flex-1" />
          <button onClick={showContext} disabled={!modelId}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">
            <Eye className="w-4 h-4" /> Agentens vy
          </button>
          <button onClick={() => setShowGenerateConfirm(true)} disabled={generating || !modelId}
            className="flex items-center gap-2 px-4 py-2 border border-indigo-200 text-indigo-600 rounded-lg text-sm hover:bg-indigo-50 disabled:opacity-50">
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Generera med AI
          </button>
          <button onClick={openNew} disabled={!modelId || needsConcepts}
            title={needsConcepts ? 'Skapa minst två begrepp först' : undefined}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
            <Plus className="w-4 h-4" /> {newLabel}
          </button>
        </div>

        {/* Flikar */}
        <div className="px-8 border-b border-gray-200 flex gap-6">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 py-3 text-sm font-medium border-b-2 -mb-px ${tab === t.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              <t.icon className="w-4 h-4" /> {t.label}
              <span className={`text-xs px-1.5 rounded-full ${tab === t.id ? 'bg-indigo-50' : 'bg-gray-100'}`}>{counts[t.id]}</span>
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-8 pb-16">
          {loading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
          ) : !data ? (
            <EmptyState icon={Network} title="Ingen affärsmodell vald" text="Skapa eller välj en affärsmodell för att bygga dess ontologi" />
          ) : tab === 'concepts' ? (
            <ConceptsGrid concepts={concepts.filter(c => match(c.name, c.description, ...c.synonyms))}
              relations={data.relations} rules={data.rules} onEdit={openConcept} onDelete={c => remove('concepts', c.id, c.name)} />
          ) : tab === 'relations' ? (
            <RelationsTable relations={data.relations.filter(r => match(r.fromConcept.name, r.toConcept.name, r.verb, r.joinCondition))}
              onEdit={openRelation} onDelete={r => remove('relations', r.id, `${r.fromConcept.name} ${r.verb} ${r.toConcept.name}`)}
              empty={concepts.length < 2 ? 'Skapa minst två begrepp innan du lägger till relationer' : 'Beskriv hur begreppen hänger ihop, t.ex. Kund lägger Order'} />
          ) : (
            <RulesTable rules={data.rules.filter(r => match(r.name, r.description, r.expression, r.concept?.name))}
              onEdit={openRule} onDelete={r => remove('rules', r.id, r.name)} />
          )}
        </div>
      </div>

      {/* Begrepp */}
      {open === 'concepts' && (
        <Modal title={editingId ? 'Redigera begrepp' : 'Nytt begrepp'} onClose={() => setOpen(null)} wide>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Namn *</label>
              <input value={conceptForm.name} onChange={e => setConceptForm(f => ({ ...f, name: e.target.value }))} placeholder="t.ex. Kund" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Synonymer (kommaseparerade)</label>
              <input value={conceptForm.synonyms} onChange={e => setConceptForm(f => ({ ...f, synonyms: e.target.value }))} placeholder="t.ex. klient, beställare" className={inputCls} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Beskrivning</label>
              <textarea value={conceptForm.description} onChange={e => setConceptForm(f => ({ ...f, description: e.target.value }))} rows={2} className={`${inputCls} resize-none`} />
            </div>
            <div>
              <label className={labelCls}>Glossary-term</label>
              <select value={conceptForm.glossaryTermId} onChange={e => setConceptForm(f => ({ ...f, glossaryTermId: e.target.value }))} className={inputCls}>
                <option value="">Ingen</option>
                {data?.glossaryTerms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Ägare</label>
              <input value={conceptForm.owner} onChange={e => setConceptForm(f => ({ ...f, owner: e.target.value }))} placeholder="Namn eller e-post" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Vy i modellen</label>
              <select value={conceptForm.viewId} onChange={e => setConceptForm(f => ({ ...f, viewId: e.target.value, keyColumn: '', properties: f.properties.map(p => ({ ...p, columnId: null })) }))} className={inputCls}>
                <option value="">Ingen</option>
                {views.map(v => <option key={v.id} value={v.id}>{v.displayName} ({v.name})</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Identifierande kolumn</label>
              <select value={conceptForm.keyColumn} onChange={e => setConceptForm(f => ({ ...f, keyColumn: e.target.value }))} disabled={!formView} className={`${inputCls} disabled:bg-gray-50`}>
                <option value="">Ingen</option>
                {formView?.columns.map(c => <option key={c.id} value={c.name}>{c.displayName} ({c.name}){c.isKey ? ' – nyckel' : ''}</option>)}
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-600">Egenskaper och mått</label>
              <button onClick={addProp} className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"><Plus className="w-3.5 h-3.5" /> Lägg till egenskap</button>
            </div>
            {conceptForm.properties.length === 0 ? (
              <p className="text-xs text-gray-400 border border-dashed border-gray-200 rounded-lg p-3">
                Koppla begreppets egenskaper till kolumner och ange enhet, t.ex. Vikt → amount [kg]. Enheten är det som hindrar agenten från att tolka kilo som kronor.
              </p>
            ) : (
              <div className="space-y-2">
                {conceptForm.properties.map((p, i) => (
                  <div key={i} className="grid grid-cols-[1.3fr_1.2fr_0.8fr_auto_auto] gap-2 items-center">
                    <select value={p.columnId ?? ''} onChange={e => pickColumn(i, e.target.value)} disabled={!formView} className={`${inputCls} disabled:bg-gray-50`}>
                      <option value="">{formView ? 'Välj kolumn' : 'Välj vy först'}</option>
                      {formView?.columns.map(c => <option key={c.id} value={c.id}>{c.displayName} ({c.name})</option>)}
                    </select>
                    <input value={p.name} onChange={e => setProp(i, { name: e.target.value })} placeholder="Affärsnamn" className={inputCls} />
                    <input value={p.unit ?? ''} onChange={e => setProp(i, { unit: e.target.value || null })} placeholder="Enhet" list="ontology-units" className={inputCls} />
                    <label className="flex items-center gap-1 text-xs text-gray-600 whitespace-nowrap">
                      <input type="checkbox" checked={p.isMeasure} onChange={e => setProp(i, { isMeasure: e.target.checked })} /> Mått
                    </label>
                    <button onClick={() => removeProp(i)} className="text-red-400 hover:text-red-600 p-1"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            )}
            <datalist id="ontology-units">{UNITS.map(u => <option key={u} value={u} />)}</datalist>
          </div>

          <ModalFooter onCancel={() => setOpen(null)} onSave={saveConcept} saving={saving} editing={!!editingId} />
        </Modal>
      )}

      {/* Relation */}
      {open === 'relations' && (
        <Modal title={editingId ? 'Redigera relation' : 'Ny relation'} onClose={() => setOpen(null)}>
          <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 items-end">
            <div>
              <label className={labelCls}>Från *</label>
              <select value={relationForm.fromConceptId} onChange={e => setRelationForm(f => ({ ...f, fromConceptId: e.target.value }))} className={inputCls}>
                <option value="">Välj</option>
                {concepts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Relation *</label>
              <input value={relationForm.verb} onChange={e => setRelationForm(f => ({ ...f, verb: e.target.value }))} placeholder="t.ex. lägger" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Till *</label>
              <select value={relationForm.toConceptId} onChange={e => setRelationForm(f => ({ ...f, toConceptId: e.target.value }))} className={inputCls}>
                <option value="">Välj</option>
                {concepts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Omvänd relation</label>
              <input value={relationForm.inverseVerb} onChange={e => setRelationForm(f => ({ ...f, inverseVerb: e.target.value }))} placeholder="t.ex. läggs av" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Kardinalitet</label>
              <select value={relationForm.cardinality} onChange={e => setRelationForm(f => ({ ...f, cardinality: e.target.value }))} className={inputCls}>
                <option value="one_to_one">1:1 – en till en</option>
                <option value="one_to_many">1:N – en till många</option>
                <option value="many_to_one">N:1 – många till en</option>
                <option value="many_to_many">N:M – många till många</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Join-villkor</label>
              <input value={relationForm.joinCondition} onChange={e => setRelationForm(f => ({ ...f, joinCondition: e.target.value }))} placeholder="t.ex. fact_order.customer_id = dim_customer.id" className={`${inputCls} font-mono`} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Beskrivning</label>
              <textarea value={relationForm.description} onChange={e => setRelationForm(f => ({ ...f, description: e.target.value }))} rows={2} className={`${inputCls} resize-none`} />
            </div>
          </div>
          <ModalFooter onCancel={() => setOpen(null)} onSave={saveRelation} saving={saving} editing={!!editingId} />
        </Modal>
      )}

      {/* Affärsregel */}
      {open === 'rules' && (
        <Modal title={editingId ? 'Redigera affärsregel' : 'Ny affärsregel'} onClose={() => setOpen(null)}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>Namn *</label>
              <input value={ruleForm.name} onChange={e => setRuleForm(f => ({ ...f, name: e.target.value }))} placeholder="t.ex. Återvinningsbart material" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Begrepp</label>
              <select value={ruleForm.conceptId} onChange={e => setRuleForm(f => ({ ...f, conceptId: e.target.value }))} className={inputCls}>
                <option value="">Gäller hela modellen</option>
                {concepts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Typ</label>
              <select value={ruleForm.ruleType} onChange={e => setRuleForm(f => ({ ...f, ruleType: e.target.value }))} className={inputCls}>
                {Object.entries(RULE_TYPE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Regeln i klartext *</label>
              <textarea value={ruleForm.description} onChange={e => setRuleForm(f => ({ ...f, description: e.target.value }))} rows={3}
                placeholder="t.ex. Material räknas som återvinningsbart när materialgruppen är metall, papper eller plast." className={`${inputCls} resize-none`} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>SQL-uttryck</label>
              <input value={ruleForm.expression} onChange={e => setRuleForm(f => ({ ...f, expression: e.target.value }))}
                placeholder="t.ex. material_group IN ('Metall','Papper','Plast')" className={`${inputCls} font-mono`} />
            </div>
          </div>
          <ModalFooter onCancel={() => setOpen(null)} onSave={saveRule} saving={saving} editing={!!editingId} />
        </Modal>
      )}

      {/* Generera med AI */}
      {showGenerateConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-[480px] space-y-4">
            <h3 className="font-semibold text-gray-900 text-lg">Generera ontologi med AI</h3>
            <p className="text-sm text-gray-600">AI:n läser modellens vyer, kolumner och Business Glossary och föreslår begrepp, relationer och affärsregler.</p>
            <div className="space-y-2">
              <label className="flex items-start gap-3 p-3 border rounded-xl cursor-pointer hover:bg-gray-50">
                <input type="radio" name="ontGenMode" checked={generateMode === 'missing'} onChange={() => setGenerateMode('missing')} className="mt-0.5" />
                <div>
                  <p className="font-medium text-sm text-gray-900">Komplettera</p>
                  <p className="text-xs text-gray-500">Lägger bara till det som saknas. Befintliga begrepp, relationer och regler bevaras.</p>
                </div>
              </label>
              <label className="flex items-start gap-3 p-3 border rounded-xl cursor-pointer hover:bg-gray-50">
                <input type="radio" name="ontGenMode" checked={generateMode === 'all'} onChange={() => setGenerateMode('all')} className="mt-0.5" />
                <div>
                  <p className="font-medium text-sm text-gray-900">Börja om</p>
                  <p className="text-xs text-red-500">Tar bort hela modellens ontologi och ersätter den med nya förslag.</p>
                </div>
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowGenerateConfirm(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Avbryt</button>
              <button onClick={generate} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">Generera</button>
            </div>
          </div>
        </div>
      )}

      {/* Agentens vy */}
      {contextText !== null && (
        <Modal title="Så här ser agenten ontologin" onClose={() => setContextText(null)} wide>
          <p className="text-sm text-gray-600">Det här skickas med till AI-agenten i Klarify när någon ställer frågor mot modellen.</p>
          <pre className="text-xs bg-gray-50 border border-gray-200 rounded-xl p-4 whitespace-pre-wrap font-mono text-gray-700 max-h-[55vh] overflow-y-auto">{contextText}</pre>
          <div className="flex justify-end">
            <button onClick={() => { navigator.clipboard?.writeText(contextText); setCopied(true); }}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
              {copied ? <CheckCircle className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />} {copied ? 'Kopierat' : 'Kopiera'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

// ─── Listor ──────────────────────────────────────────────────────────────────

function Actions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-1 justify-end">
      <button onClick={onEdit} className="text-gray-400 hover:text-gray-600 p-1"><Edit2 className="w-4 h-4" /></button>
      <button onClick={onDelete} className="text-red-400 hover:text-red-600 p-1"><Trash2 className="w-4 h-4" /></button>
    </div>
  );
}

function ConceptsGrid({ concepts, relations, rules, onEdit, onDelete }: {
  concepts: Concept[]; relations: Relation[]; rules: Rule[]; onEdit: (c: Concept) => void; onDelete: (c: Concept) => void;
}) {
  if (!concepts.length) return <EmptyState icon={Boxes} title="Inga begrepp ännu" text="Lägg till manuellt eller generera med AI" />;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
      {concepts.map(c => {
        const rel = relations.filter(r => r.fromConceptId === c.id || r.toConceptId === c.id).length;
        const rl = rules.filter(r => r.conceptId === c.id).length;
        return (
          <div key={c.id} className="border border-gray-200 rounded-xl p-5 hover:border-indigo-200 hover:shadow-sm transition bg-white flex flex-col">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold text-gray-900 truncate">{c.name}</h3>
                {c.view && <p className="text-xs text-gray-400 font-mono mt-0.5 truncate">{c.view.name}{c.keyColumn ? ` · ${c.keyColumn}` : ''}</p>}
              </div>
              <Actions onEdit={() => onEdit(c)} onDelete={() => onDelete(c)} />
            </div>
            {(c.description || c.glossaryTerm?.definition) && (
              <p className="text-sm text-gray-600 mt-2 line-clamp-2">{c.description || c.glossaryTerm?.definition}</p>
            )}
            {c.synonyms.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-3">
                {c.synonyms.map(s => <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{s}</span>)}
              </div>
            )}
            {c.properties.length > 0 && (
              <div className="mt-3 space-y-1">
                {c.properties.slice(0, 4).map((p, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-gray-700 truncate">{p.name}{p.column ? <span className="text-gray-400 font-mono"> · {p.column.name}</span> : null}</span>
                    {p.unit && <span className="ml-2 px-1.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">{p.unit}</span>}
                  </div>
                ))}
                {c.properties.length > 4 && <p className="text-xs text-gray-400">+{c.properties.length - 4} till</p>}
              </div>
            )}
            <div className="flex items-center gap-3 mt-auto pt-4 text-xs text-gray-400">
              {c.glossaryTerm && <span className="text-indigo-500">Glossary: {c.glossaryTerm.name}</span>}
              <span>{rel} relationer</span>
              <span>{rl} regler</span>
              {c.createdBy === 'AI' && c.updatedBy === 'AI' && <span className="ml-auto flex items-center gap-1 text-indigo-400"><Sparkles className="w-3 h-3" /> AI-förslag</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RelationsTable({ relations, onEdit, onDelete, empty }: {
  relations: Relation[]; onEdit: (r: Relation) => void; onDelete: (r: Relation) => void; empty: string;
}) {
  if (!relations.length) return <EmptyState icon={Network} title="Inga relationer ännu" text={empty} />;
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Relation</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Kardinalitet</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Join-villkor</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Beskrivning</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {relations.map(r => (
            <tr key={r.id} className="hover:bg-gray-50">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2 font-medium text-gray-900">
                  <span>{r.fromConcept.name}</span>
                  <span className="flex items-center gap-1 text-indigo-600 font-normal text-xs px-2 py-0.5 rounded-full bg-indigo-50">{r.verb} <ArrowRight className="w-3 h-3" /></span>
                  <span>{r.toConcept.name}</span>
                </div>
                {r.inverseVerb && <div className="text-xs text-gray-400 mt-0.5">{r.toConcept.name} {r.inverseVerb} {r.fromConcept.name}</div>}
              </td>
              <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded-full border bg-gray-50 text-gray-700 border-gray-200">{CARDINALITY[r.cardinality] ?? r.cardinality}</span></td>
              <td className="px-4 py-3 text-gray-500 font-mono text-xs">{r.joinCondition ?? '–'}</td>
              <td className="px-4 py-3 text-gray-600 max-w-xs">{r.description ?? ''}</td>
              <td className="px-4 py-3"><Actions onEdit={() => onEdit(r)} onDelete={() => onDelete(r)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RulesTable({ rules, onEdit, onDelete }: { rules: Rule[]; onEdit: (r: Rule) => void; onDelete: (r: Rule) => void }) {
  if (!rules.length) return <EmptyState icon={Scale} title="Inga affärsregler ännu" text="Beskriv regler som agenten alltid ska följa, t.ex. vad som räknas som återvinningsbart" />;
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Regel</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Typ</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Beskrivning</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Uttryck</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rules.map(r => {
            const t = RULE_TYPE[r.ruleType] ?? RULE_TYPE.definition;
            return (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{r.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{r.concept ? r.concept.name : 'Hela modellen'}</div>
                </td>
                <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full border ${t.cls}`}>{t.label}</span></td>
                <td className="px-4 py-3 text-gray-600 max-w-sm">{r.description}</td>
                <td className="px-4 py-3 text-gray-500 font-mono text-xs max-w-xs break-words">{r.expression ?? '–'}</td>
                <td className="px-4 py-3"><Actions onEdit={() => onEdit(r)} onDelete={() => onDelete(r)} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
