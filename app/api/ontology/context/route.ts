import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser, loadOntology, buildOntologyContext, ontologySnapshot } from '@/lib/ontology';

/**
 * Anrop från Klarify (server till server) räknas som interna.
 * Om INTERNAL_API_KEY är satt krävs den i headern x-internal-key.
 * Annars accepteras x-internal-request: true, samma som Glossary-API:t i dag.
 */
function isInternalRequest(request: NextRequest) {
  const key = process.env.INTERNAL_API_KEY;
  if (key) return request.headers.get('x-internal-key') === key;
  return request.headers.get('x-internal-request') === 'true';
}

// GET /api/ontology/context?modelId=1&format=text|json
// Ontologin i det format agenten i Klarify använder.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const modelId = parseInt(searchParams.get('modelId') ?? '', 10);
    const format = searchParams.get('format') === 'json' ? 'json' : 'text';
    if (!Number.isFinite(modelId)) return Response.json({ error: 'modelId krävs' }, { status: 400 });

    const internal = isInternalRequest(request);
    const user = internal ? null : await getSessionUser();
    if (!internal && !user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const model = await prisma.semanticModel.findFirst({
      where: { id: modelId, ...(user ? { orgId: user.orgId } : {}) },
      select: { id: true, name: true },
    });
    if (!model) return Response.json({ error: 'Modellen hittades inte' }, { status: 404 });

    const ontology = await loadOntology(model.id);
    if (format === 'json') {
      return Response.json({ modelId: model.id, modelName: model.name, ontology: ontologySnapshot(ontology) });
    }
    return Response.json({ modelId: model.id, modelName: model.name, context: buildOntologyContext(model.name, ontology) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
