import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser, getModelForOrg, loadOntology } from '@/lib/ontology';

// GET /api/ontology?modelId=1
// Hela ontologin för en modell, plus modellens vyer och glossary-termer för formulären.
export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const modelId = parseInt(new URL(request.url).searchParams.get('modelId') ?? '', 10);
    const model = await getModelForOrg(modelId, user.orgId);
    if (!model) return Response.json({ error: 'Modellen hittades inte' }, { status: 404 });

    const [ontology, views, glossaryTerms] = await Promise.all([
      loadOntology(modelId),
      prisma.modelView.findMany({
        where: { modelId },
        orderBy: { displayName: 'asc' },
        select: {
          id: true,
          name: true,
          displayName: true,
          type: true,
          columns: {
            orderBy: { id: 'asc' },
            select: { id: true, name: true, displayName: true, dataType: true, isMeasure: true, isKey: true },
          },
        },
      }),
      prisma.glossaryTerm.findMany({
        where: { orgId: user.orgId, OR: [{ modelId }, { modelId: null }] },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, definition: true, synonym: true },
      }),
    ]);

    return Response.json({ model: { id: model.id, name: model.name }, ...ontology, views, glossaryTerms });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
