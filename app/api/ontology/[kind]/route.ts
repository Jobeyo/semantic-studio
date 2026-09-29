import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import {
  getSessionUser, getModelForOrg, logOntologyChange,
  conceptInput, relationInput, ruleInput,
} from '@/lib/ontology';

const KINDS = ['concepts', 'relations', 'rules'] as const;
type Kind = (typeof KINDS)[number];

async function conceptsBelongToModel(modelId: number, ids: (number | null)[]) {
  const wanted = ids.filter((id): id is number => id != null);
  if (!wanted.length) return true;
  const count = await prisma.ontologyConcept.count({ where: { modelId, id: { in: wanted } } });
  return count === new Set(wanted).size;
}

// POST /api/ontology/concepts | relations | rules
export async function POST(request: NextRequest, { params }: { params: any }) {
  try {
    const { kind } = (await params) as { kind: string };
    if (!KINDS.includes(kind as Kind)) return Response.json({ error: 'Okänd typ' }, { status: 404 });

    const user = await getSessionUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const modelId = parseInt(String(body?.modelId ?? ''), 10);
    const model = await getModelForOrg(modelId, user.orgId);
    if (!model) return Response.json({ error: 'Modellen hittades inte' }, { status: 404 });

    if (kind === 'concepts') {
      const { data, properties } = conceptInput(body);
      if (!data.name) return Response.json({ error: 'Namn krävs' }, { status: 400 });
      const created = await prisma.ontologyConcept.create({
        data: {
          ...data,
          name: data.name,
          modelId,
          createdBy: user.email,
          updatedBy: user.email,
          properties: { create: properties },
        },
      });
      await logOntologyChange(user.orgId, modelId, user.email, 'ontology_concept_added', created.name);
      return Response.json(created, { status: 201 });
    }

    if (kind === 'relations') {
      const d = relationInput(body);
      if (!d.fromConceptId || !d.toConceptId || !d.verb) {
        return Response.json({ error: 'Från, till och relation krävs' }, { status: 400 });
      }
      if (!(await conceptsBelongToModel(modelId, [d.fromConceptId, d.toConceptId]))) {
        return Response.json({ error: 'Begreppen hör inte till modellen' }, { status: 400 });
      }
      const created = await prisma.ontologyRelation.create({
        data: {
          ...d,
          fromConceptId: d.fromConceptId,
          toConceptId: d.toConceptId,
          verb: d.verb,
          modelId,
          createdBy: user.email,
          updatedBy: user.email,
        },
        include: { fromConcept: { select: { name: true } }, toConcept: { select: { name: true } } },
      });
      await logOntologyChange(user.orgId, modelId, user.email, 'ontology_relation_added',
        `${created.fromConcept.name} ${created.verb} ${created.toConcept.name}`);
      return Response.json(created, { status: 201 });
    }

    // rules
    const d = ruleInput(body);
    if (!d.name || !d.description) return Response.json({ error: 'Namn och beskrivning krävs' }, { status: 400 });
    if (!(await conceptsBelongToModel(modelId, [d.conceptId]))) {
      return Response.json({ error: 'Begreppet hör inte till modellen' }, { status: 400 });
    }
    const created = await prisma.ontologyRule.create({
      data: { ...d, name: d.name, description: d.description, modelId, createdBy: user.email, updatedBy: user.email },
    });
    await logOntologyChange(user.orgId, modelId, user.email, 'ontology_rule_added', created.name);
    return Response.json(created, { status: 201 });
  } catch (e: any) {
    if (e?.code === 'P2002') return Response.json({ error: 'Det finns redan ett begrepp med det namnet i modellen' }, { status: 409 });
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
