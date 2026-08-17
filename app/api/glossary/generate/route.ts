import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await prisma.user.findUnique({ where: { email: session.user.email! } });
    const { modelId } = await request.json();

    const model = await prisma.semanticModel.findUnique({
      where: { id: modelId },
      include: { views: { include: { columns: true } } },
    });
    if (!model) return Response.json({ error: 'Model not found' }, { status: 404 });

    // Bygg schema-beskrivning
    const schemaDesc = model.views.map(v =>
      `Vy: ${v.displayName} (${v.name})\nBeskrivning: ${v.description ?? 'saknas'}\nKolumner: ${v.columns.map(c => `${c.displayName} (${c.name}, ${c.dataType}${c.isKey ? ', nyckel' : ''}${c.isMeasure ? ', mått' : ''})`).join(', ')}`
    ).join('\n\n');

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `Du är en expert på Business Glossary och datamodellering.

Analysera följande semantiska modell och skapa ett Business Glossary med affärstermer.

# Semantisk modell: ${model.name}
${schemaDesc}

Skapa ett Business Glossary med 10-20 viktiga affärstermer baserade på modellen.

Returnera EXAKT detta JSON-format:
{
  "terms": [
    {
      "name": "Affärsterm på svenska",
      "definition": "Tydlig affärsdefinition på svenska, 1-3 meningar",
      "synonym": "Eventuell synonym eller engelskt namn",
      "dataSource": "VyNamn.kolumnNamn eller null",
      "type": "dimension|measure|concept"
    }
  ]
}`,
      }],
    });

    const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return Response.json({ error: 'AI kunde inte generera glossary' }, { status: 500 });
    const generated = JSON.parse(jsonMatch[0]);

    // Spara termer i DB
    const saved = await Promise.all(generated.terms.map((t: any) =>
      prisma.glossaryTerm.create({
        data: {
          orgId: user!.orgId,
          modelId,
          name: t.name,
          definition: t.definition,
          synonym: t.synonym ?? null,
          dataSource: t.dataSource ?? null,
          type: t.type ?? 'concept',
          createdBy: 'AI',
          updatedBy: 'AI',
        },
      })
    ));

    return Response.json({ terms: saved });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
