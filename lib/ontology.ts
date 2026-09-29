import prisma from '@/lib/db';
import { auth } from '@/auth';

// ─── Behörighet ──────────────────────────────────────────────────────────────

export async function getSessionUser() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;
  return prisma.user.findUnique({ where: { email } });
}

/** Returnerar modellen endast om den tillhör användarens organisation. */
export async function getModelForOrg(modelId: number, orgId: number) {
  if (!Number.isFinite(modelId)) return null;
  return prisma.semanticModel.findFirst({ where: { id: modelId, orgId } });
}

export async function logOntologyChange(
  orgId: number,
  modelId: number,
  actor: string,
  action: string,
  entityName: string,
  details?: string,
) {
  try {
    await prisma.changeLog.create({
      data: { orgId, modelId, action, entityType: 'ontology', entityName, details, actor },
    });
  } catch {
    // Ändringsloggen får aldrig stoppa själva ändringen
  }
}

// ─── Normalisering av indata ─────────────────────────────────────────────────

export function normalizeSynonyms(input: unknown): string[] {
  const list = Array.isArray(input) ? input : typeof input === 'string' ? input.split(',') : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const v = String(raw ?? '').trim();
    if (v && !seen.has(v.toLowerCase())) {
      seen.add(v.toLowerCase());
      out.push(v);
    }
  }
  return out;
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const int = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : null;
};

export interface PropertyInput {
  columnId: number | null;
  name: string;
  description: string | null;
  unit: string | null;
  isMeasure: boolean;
}

export function conceptInput(b: any) {
  const properties: PropertyInput[] = Array.isArray(b?.properties)
    ? b.properties
        .filter((p: any) => str(p?.name))
        .map((p: any) => ({
          columnId: int(p.columnId),
          name: str(p.name)!,
          description: str(p.description),
          unit: str(p.unit),
          isMeasure: !!p.isMeasure,
        }))
    : [];
  return {
    data: {
      name: str(b?.name),
      description: str(b?.description),
      synonyms: normalizeSynonyms(b?.synonyms),
      glossaryTermId: int(b?.glossaryTermId),
      viewId: int(b?.viewId),
      keyColumn: str(b?.keyColumn),
      owner: str(b?.owner),
    },
    properties,
    hasProperties: Array.isArray(b?.properties),
  };
}

export const CARDINALITIES = ['one_to_one', 'one_to_many', 'many_to_one', 'many_to_many'] as const;
export const RULE_TYPES = ['definition', 'filter', 'calculation', 'unit', 'constraint'] as const;

export function relationInput(b: any) {
  const cardinality = CARDINALITIES.includes(b?.cardinality) ? b.cardinality : 'one_to_many';
  return {
    fromConceptId: int(b?.fromConceptId),
    toConceptId: int(b?.toConceptId),
    verb: str(b?.verb),
    inverseVerb: str(b?.inverseVerb),
    cardinality,
    joinCondition: str(b?.joinCondition),
    description: str(b?.description),
  };
}

export function ruleInput(b: any) {
  const ruleType = RULE_TYPES.includes(b?.ruleType) ? b.ruleType : 'definition';
  return {
    conceptId: int(b?.conceptId),
    name: str(b?.name),
    description: str(b?.description),
    expression: str(b?.expression),
    ruleType,
  };
}

// ─── Läsning ─────────────────────────────────────────────────────────────────

export async function loadOntology(modelId: number) {
  const [concepts, relations, rules] = await Promise.all([
    prisma.ontologyConcept.findMany({
      where: { modelId },
      orderBy: { name: 'asc' },
      include: {
        properties: {
          orderBy: { id: 'asc' },
          include: { column: { select: { id: true, name: true, displayName: true, viewId: true } } },
        },
        view: { select: { id: true, name: true, displayName: true } },
        glossaryTerm: { select: { id: true, name: true, definition: true, synonym: true } },
      },
    }),
    prisma.ontologyRelation.findMany({
      where: { modelId },
      orderBy: { id: 'asc' },
      include: {
        fromConcept: { select: { id: true, name: true } },
        toConcept: { select: { id: true, name: true } },
      },
    }),
    prisma.ontologyRule.findMany({
      where: { modelId },
      orderBy: { name: 'asc' },
      include: { concept: { select: { id: true, name: true } } },
    }),
  ]);
  return { concepts, relations, rules };
}

type Ontology = Awaited<ReturnType<typeof loadOntology>>;

const CARD_LABEL: Record<string, string> = {
  one_to_one: '1:1',
  one_to_many: '1:N',
  many_to_one: 'N:1',
  many_to_many: 'N:M',
};

/**
 * Kompakt ontologi i JSON, avsedd att sparas i ModelVersion.snapshot vid publicering
 * och att läsas av agenten i Klarify.
 */
export function ontologySnapshot(ont: Ontology) {
  return {
    concepts: ont.concepts.map(c => ({
      name: c.name,
      description: c.description,
      synonyms: [...c.synonyms, ...(c.glossaryTerm?.synonym ? normalizeSynonyms(c.glossaryTerm.synonym) : [])],
      glossaryTerm: c.glossaryTerm ? { name: c.glossaryTerm.name, definition: c.glossaryTerm.definition } : null,
      view: c.view?.name ?? null,
      keyColumn: c.keyColumn,
      owner: c.owner,
      properties: c.properties.map(p => ({
        name: p.name,
        column: p.column?.name ?? null,
        unit: p.unit,
        isMeasure: p.isMeasure,
        description: p.description,
      })),
    })),
    relations: ont.relations.map(r => ({
      from: r.fromConcept.name,
      verb: r.verb,
      inverseVerb: r.inverseVerb,
      to: r.toConcept.name,
      cardinality: r.cardinality,
      joinCondition: r.joinCondition,
      description: r.description,
    })),
    rules: ont.rules.map(r => ({
      name: r.name,
      concept: r.concept?.name ?? null,
      type: r.ruleType,
      description: r.description,
      expression: r.expression,
    })),
  };
}

/** Hämtar ontologin för en modell i publiceringsformat. Anropas från publiceringen. */
export async function getOntologySnapshot(modelId: number) {
  return ontologySnapshot(await loadOntology(modelId));
}

/** Ontologin som text, så som agenten i Klarify får den i sin instruktion. */
export function buildOntologyContext(modelName: string, ont: Ontology): string {
  const snap = ontologySnapshot(ont);
  if (!snap.concepts.length && !snap.rules.length) return '';
  const lines: string[] = [`# Ontologi för affärsmodellen "${modelName}"`, ''];

  if (snap.concepts.length) {
    lines.push('## Begrepp');
    for (const c of snap.concepts) {
      const syn = c.synonyms.length ? ` (synonymer: ${c.synonyms.join(', ')})` : '';
      const def = c.description ?? c.glossaryTerm?.definition;
      lines.push(`- **${c.name}**${syn}${def ? ` – ${def}` : ''}`);
      if (c.view) lines.push(`  - Data: vyn \`${c.view}\`${c.keyColumn ? `, identifieras av \`${c.keyColumn}\`` : ''}`);
      for (const p of c.properties) {
        const col = p.column ? `\`${p.column}\`` : 'ingen kolumn';
        const unit = p.unit ? ` [${p.unit}]` : '';
        const kind = p.isMeasure ? ', mått' : '';
        lines.push(`  - ${p.name}: ${col}${unit}${kind}${p.description ? ` – ${p.description}` : ''}`);
      }
    }
    lines.push('');
  }

  if (snap.relations.length) {
    lines.push('## Relationer');
    for (const r of snap.relations) {
      const join = r.joinCondition ? ` via \`${r.joinCondition}\`` : '';
      lines.push(`- ${r.from} ${r.verb} ${r.to} (${CARD_LABEL[r.cardinality] ?? r.cardinality})${join}`);
    }
    lines.push('');
  }

  if (snap.rules.length) {
    lines.push('## Affärsregler');
    for (const r of snap.rules) {
      const concept = r.concept ? ` (${r.concept})` : '';
      const expr = r.expression ? ` Uttryck: \`${r.expression}\`` : '';
      lines.push(`- [${r.type}] **${r.name}**${concept}: ${r.description}${expr}`);
    }
    lines.push('');
  }

  lines.push(
    '## Så används ontologin',
    '- Tolka användarens ord via begreppens namn och synonymer innan frågan skrivs.',
    '- Använd alltid enheten som anges för en egenskap. Summera aldrig en egenskap som något annat än dess enhet.',
    '- Använd relationernas join-villkor när flera begrepp kombineras.',
    '- Tillämpa affärsreglerna när frågan rör regelns begrepp, och nämn i svaret vilken regel som användes.',
  );
  return lines.join('\n');
}
