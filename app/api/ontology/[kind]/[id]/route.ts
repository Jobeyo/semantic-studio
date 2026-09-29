import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import {
  getSessionUser, getModelForOrg, logOntologyChange,
  conceptInput, relationInput, ruleInput,
} from '@/lib/ontology';

type Kind = 'concepts' | 'relations' | 'rules';

async function findEntity(kind: string, id: number): Promise<{ modelId: number; name: string } | null> {
  if (!Number.isFinite(id)) return null;
  if (kind === 'concepts') {
    return prisma.ontologyConcept.findUnique({ where: { id }, select: { modelId: true, name: true } });
  }
  if (kind === 'relations') {
    const r = await prisma.ontologyRelation.findUnique({
      where: { id },
      select: { modelId: true, verb: true, fromConcept: { select: { name: true } }, toConcept: { select: { name: true } } },
    });
    return r ? { modelId: r.modelId, name: `${r.fromConcept.name} ${r.verb} ${r.toConcept.name}` } : null;
  }
  if (kind === 'rules') {
    return prisma.ontologyRule.findUnique({ where: { id }, select: { modelId: true, name: true } });
  }
  return null;
}

async function authorize(params: any) {
  const { kind, id: rawId } = (await params) as { kind: Kind; id: string };
  const id = parseInt(rawId, 10);
  const user = await getSessionUser();
  if (!user) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) };
  const entity = await findEntity(kind, id);
  if (!entity) return { error: Response.json({ error: 'Hittades inte' }, { status: 404 }) };
  const model = await getModelForOrg(entity.modelId, user.orgId);
  if (!model) return { error: Response.json({ error: 'Hittades inte' }, { status: 404 }) };
  return { kind, id, user, entity };
}

async function conceptsBelongToModel(modelId: number, ids: (number | null)[]) {
  const wanted = ids.filter((x): x is number => x != null);
  if (!wanted.length) return true;
  const count = await prisma.ontologyConcept.count({ where: { modelId, id: { in: wanted } } });
  return count === new Set(wanted).size;
}

// PATCH /api/ontology/{concepts|relations|rules}/{id}
export async function PATCH(request: NextRequest, { params }: { params: any }) {
  try {
    const a = await authorize(params);
    if ('error' in a) return a.error;
    const { kind, id, user, entity } = a;
    const body = await request.json();

    if (kind === 'concepts') {
      const { data, properties, hasProperties } = conceptInput(body);
      if (!data.name) return Response.json({ error: 'Namn krävs' }, { status: 400 });
      const updated = await prisma.$transaction(async tx => {
        if (hasProperties) {
          await tx.ontologyProperty.deleteMany({ where: { conceptId: id } });
          if (properties.length) {
            await tx.ontologyProperty.createMany({ data: properties.map(p => ({ ...p, conceptId: id })) });
          }
        }
        return tx.ontologyConcept.update({
          where: { id },
          data: { ...data, name: data.name!, updatedBy: user.email },
        });
      });
      await logOntologyChange(user.orgId, entity.modelId, user.email, 'ontology_concept_updated', updated.name);
      return Response.json(updated);
    }

    if (kind === 'relations') {
      const d = relationInput(body);
      if (!d.fromConceptId || !d.toConceptId || !d.verb) {
        return Response.json({ error: 'Från, till och relation krävs' }, { status: 400 });
      }
      if (!(await conceptsBelongToModel(entity.modelId, [d.fromConceptId, d.toConceptId]))) {
        return Response.json({ error: 'Begreppen hör inte till modellen' }, { status: 400 });
      }
      const updated = await prisma.ontologyRelation.update({
        where: { id },
        data: { ...d, fromConceptId: d.fromConceptId, toConceptId: d.toConceptId, verb: d.verb, updatedBy: user.email },
      });
      await logOntologyChange(user.orgId, entity.modelId, user.email, 'ontology_relation_updated', entity.name);
      return Response.json(updated);
    }

    const d = ruleInput(body);
    if (!d.name || !d.description) return Response.json({ error: 'Namn och beskrivning krävs' }, { status: 400 });
    if (!(await conceptsBelongToModel(entity.modelId, [d.conceptId]))) {
      return Response.json({ error: 'Begreppet hör inte till modellen' }, { status: 400 });
    }
    const updated = await prisma.ontologyRule.update({
      where: { id },
      data: { ...d, name: d.name, description: d.description, updatedBy: user.email },
    });
    await logOntologyChange(user.orgId, entity.modelId, user.email, 'ontology_rule_updated', updated.name);
    return Response.json(updated);
  } catch (e: any) {
    if (e?.code === 'P2002') return Response.json({ error: 'Det finns redan ett begrepp med det namnet i modellen' }, { status: 409 });
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

// DELETE /api/ontology/{concepts|relations|rules}/{id}
export async function DELETE(_request: NextRequest, { params }: { params: any }) {
  try {
    const a = await authorize(params);
    if ('error' in a) return a.error;
    const { kind, id, user, entity } = a;

    if (kind === 'concepts') await prisma.ontologyConcept.delete({ where: { id } });
    else if (kind === 'relations') await prisma.ontologyRelation.delete({ where: { id } });
    else await prisma.ontologyRule.delete({ where: { id } });

    const action = { concepts: 'ontology_concept_deleted', relations: 'ontology_relation_deleted', rules: 'ontology_rule_deleted' }[kind];
    await logOntologyChange(user.orgId, entity.modelId, user.email, action, entity.name);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
