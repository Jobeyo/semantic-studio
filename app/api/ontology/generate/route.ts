import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import prisma from '@/lib/db';
import {
  getSessionUser, getModelForOrg, logOntologyChange,
  normalizeSynonyms, CARDINALITIES, RULE_TYPES,
} from '@/lib/ontology';

// POST /api/ontology/generate  { modelId, mode: 'missing' | 'all' }
// AI föreslår begrepp, relationer och affärsregler utifrån modellens vyer och glossary.
export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { modelId, mode = 'missing' } = await request.json();
    const model = await getModelForOrg(parseInt(String(modelId), 10), user.orgId);
    if (!model) return Response.json({ error: 'Modellen hittades inte' }, { status: 404 });

    const [views, glossary, existing] = await Promise.all([
      prisma.modelView.findMany({ where: { modelId: model.id }, include: { columns: true } }),
      prisma.glossaryTerm.findMany({
        where: { orgId: user.orgId, OR: [{ modelId: model.id }, { modelId: null }] },
        select: { id: true, name: true, definition: true, synonym: true },
      }),
      prisma.ontologyConcept.findMany({ where: { modelId: model.id }, select: { id: true, name: true } }),
    ]);
    if (!views.length) return Response.json({ error: 'Modellen har inga vyer ännu' }, { status: 400 });

    const schemaDesc = views.map(v =>
      `Vy: ${v.name} (affärsnamn: ${v.displayName}, typ: ${v.type})\n` +
      `Beskrivning: ${v.description ?? 'saknas'}\n` +
      `Kolumner:\n` +
      v.columns.map(c =>
        `  - ${c.name} (${c.displayName}, ${c.dataType}${c.isKey ? ', nyckel' : ''}${c.isMeasure ? ', mått' : ''}${c.format ? `, format ${c.format}` : ''})${c.description ? `: ${c.description}` : ''}`
      ).join('\n')
    ).join('\n\n');

    const glossaryDesc = glossary.length
      ? glossary.map(t => `- ${t.name}${t.synonym ? ` (synonym: ${t.synonym})` : ''}: ${t.definition}`).join('\n')
      : '(inga termer)';
    const keepDesc = mode === 'missing' && existing.length
      ? `\nFöljande begrepp finns redan och ska inte föreslås igen, men får användas i relationer och regler: ${existing.map(c => c.name).join(', ')}\n`
      : '';

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      messages: [{
        role: 'user',
        content: `Du är expert på ontologier, semantisk modellering och datalager.

Bygg en ontologi för affärsmodellen nedan: vilka affärsbegrepp modellen beskriver, hur de hänger ihop och vilka affärsregler som gäller.

# Affärsmodell: ${model.name}
${model.description ?? ''}

## Vyer och kolumner
${schemaDesc}

## Business Glossary
${glossaryDesc}
${keepDesc}
Regler för svaret:
- Använd bara vy- och kolumnnamn som finns ovan, exakt stavade.
- Ange enhet (kg, ton, SEK, st, %, dagar …) bara när den tydligt framgår av namn, format eller beskrivning. Annars null.
- Koppla ett begrepp till en glossary-term när namnen motsvarar varandra, med termens exakta namn. Annars null.
- Föreslå bara affärsregler som tydligt framgår av modellen. Hellre få och korrekta än många och gissade.
- Skriv namn och beskrivningar på svenska.

Returnera EXAKT detta JSON-format och inget annat:
{
  "concepts": [
    {
      "name": "Kund",
      "description": "1-2 meningar",
      "synonyms": ["klient"],
      "glossaryTerm": "Termens namn eller null",
      "view": "vynamn eller null",
      "keyColumn": "kolumnnamn eller null",
      "properties": [
        { "column": "kolumnnamn", "name": "Affärsnamn", "unit": "kg eller null", "isMeasure": true, "description": "kort eller null" }
      ]
    }
  ],
  "relations": [
    { "from": "Kund", "verb": "lägger", "inverseVerb": "läggs av", "to": "Order", "cardinality": "one_to_many", "joinCondition": "vy.kolumn = vy.kolumn eller null", "description": "kort eller null" }
  ],
  "rules": [
    { "concept": "Begreppets namn eller null", "name": "Regelns namn", "ruleType": "definition|filter|calculation|unit|constraint", "description": "Regeln i klartext", "expression": "SQL-uttryck eller null" }
  ]
}`,
      }],
    });

    const text = msg.content[0]?.type === 'text' ? msg.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return Response.json({ error: 'AI kunde inte generera en ontologi' }, { status: 500 });
    const generated = JSON.parse(jsonMatch[0]);

    // Uppslag för att översätta AI:ns namn till id:n
    const lc = (s: unknown) => String(s ?? '').trim().toLowerCase();
    const viewByName = new Map<string, (typeof views)[number]>();
    for (const v of views) { viewByName.set(lc(v.name), v); viewByName.set(lc(v.displayName), v); }
    const glossaryByName = new Map(glossary.map(t => [lc(t.name), t.id]));
    const findColumn = (view: (typeof views)[number] | undefined, ref: unknown) => {
      const raw = lc(ref);
      if (!raw) return undefined;
      const [a, b] = raw.includes('.') ? raw.split('.', 2) : [null, raw];
      const scope = a ? [viewByName.get(a)].filter(Boolean) as typeof views : view ? [view] : views;
      for (const v of scope) {
        const c = v.columns.find(col => lc(col.name) === b || lc(col.displayName) === b);
        if (c) return c;
      }
      return undefined;
    };

    const result = await prisma.$transaction(async tx => {
      if (mode === 'all') {
        await tx.ontologyRule.deleteMany({ where: { modelId: model.id } });
        await tx.ontologyRelation.deleteMany({ where: { modelId: model.id } });
        await tx.ontologyConcept.deleteMany({ where: { modelId: model.id } });
      }
      const conceptIdByName = new Map<string, number>(mode === 'all' ? [] : existing.map(c => [lc(c.name), c.id]));
      let conceptsCreated = 0, relationsCreated = 0, rulesCreated = 0;

      for (const c of Array.isArray(generated.concepts) ? generated.concepts : []) {
        const name = String(c?.name ?? '').trim();
        if (!name || conceptIdByName.has(lc(name))) continue;
        const view = viewByName.get(lc(c.view));
        const keyCol = findColumn(view, c.keyColumn);
        const properties = (Array.isArray(c.properties) ? c.properties : [])
          .map((p: any) => {
            const col = findColumn(view, p?.column);
            const pname = String(p?.name ?? col?.displayName ?? '').trim();
            if (!pname) return null;
            return {
              columnId: col?.id ?? null,
              name: pname,
              unit: p?.unit ? String(p.unit).trim() : null,
              isMeasure: !!p?.isMeasure,
              description: p?.description ? String(p.description).trim() : null,
            };
          })
          .filter(Boolean) as { columnId: number | null; name: string; unit: string | null; isMeasure: boolean; description: string | null }[];

        const created = await tx.ontologyConcept.create({
          data: {
            modelId: model.id,
            name,
            description: c.description ? String(c.description).trim() : null,
            synonyms: normalizeSynonyms(c.synonyms),
            glossaryTermId: glossaryByName.get(lc(c.glossaryTerm)) ?? null,
            viewId: view?.id ?? null,
            keyColumn: keyCol?.name ?? null,
            createdBy: 'AI',
            updatedBy: 'AI',
            properties: { create: properties },
          },
        });
        conceptIdByName.set(lc(name), created.id);
        conceptsCreated++;
      }

      const existingRelations = await tx.ontologyRelation.findMany({
        where: { modelId: model.id },
        select: { fromConceptId: true, toConceptId: true, verb: true },
      });
      const relKey = (f: number, t: number, v: string) => `${f}|${t}|${lc(v)}`;
      const relSeen = new Set(existingRelations.map(r => relKey(r.fromConceptId, r.toConceptId, r.verb)));
      for (const r of Array.isArray(generated.relations) ? generated.relations : []) {
        const from = conceptIdByName.get(lc(r?.from));
        const to = conceptIdByName.get(lc(r?.to));
        const verb = String(r?.verb ?? '').trim();
        if (!from || !to || !verb || relSeen.has(relKey(from, to, verb))) continue;
        await tx.ontologyRelation.create({
          data: {
            modelId: model.id,
            fromConceptId: from,
            toConceptId: to,
            verb,
            inverseVerb: r.inverseVerb ? String(r.inverseVerb).trim() : null,
            cardinality: (CARDINALITIES as readonly string[]).includes(r.cardinality) ? r.cardinality : 'one_to_many',
            joinCondition: r.joinCondition ? String(r.joinCondition).trim() : null,
            description: r.description ? String(r.description).trim() : null,
            createdBy: 'AI',
            updatedBy: 'AI',
          },
        });
        relSeen.add(relKey(from, to, verb));
        relationsCreated++;
      }

      const existingRuleNames = new Set(
        (await tx.ontologyRule.findMany({ where: { modelId: model.id }, select: { name: true } })).map(r => lc(r.name)),
      );
      for (const r of Array.isArray(generated.rules) ? generated.rules : []) {
        const name = String(r?.name ?? '').trim();
        const description = String(r?.description ?? '').trim();
        if (!name || !description || existingRuleNames.has(lc(name))) continue;
        await tx.ontologyRule.create({
          data: {
            modelId: model.id,
            conceptId: conceptIdByName.get(lc(r.concept)) ?? null,
            name,
            description,
            expression: r.expression ? String(r.expression).trim() : null,
            ruleType: (RULE_TYPES as readonly string[]).includes(r.ruleType) ? r.ruleType : 'definition',
            createdBy: 'AI',
            updatedBy: 'AI',
          },
        });
        existingRuleNames.add(lc(name));
        rulesCreated++;
      }

      return { conceptsCreated, relationsCreated, rulesCreated };
    }, { timeout: 30000 });

    await logOntologyChange(user.orgId, model.id, 'AI', 'ontology_generated', model.name,
      `${result.conceptsCreated} begrepp, ${result.relationsCreated} relationer, ${result.rulesCreated} regler`);
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
