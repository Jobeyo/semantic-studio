import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';
import { logChange } from '@/lib/changelog';

export async function GET(request: Request) {
  try {
    const isInternal = request.headers.get('x-internal-request') === 'true';
    const session = await auth();
    if (!session?.user && !isInternal) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const orgId = isInternal ? 1 : parseInt((session!.user as any).orgId);
    const models = await prisma.semanticModel.findMany({
      where: { orgId },
      include: { _count: { select: { views: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    return Response.json(models);
  } catch (e) {
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const orgId = parseInt((session.user as any).orgId);
    const { name, description, sourceType, sourceConfig } = await request.json();
    const model = await prisma.semanticModel.create({
      data: { name, description, sourceType, sourceConfig, orgId, status: 'draft' },
    });
    await logChange({
      orgId, modelId: model.id,
      action: 'model_created', entityType: 'model', entityName: name,
      details: `Modellutkast skapad med källtyp ${sourceType} (generering av semantiskt lager ej klar)`,
      actor: session.user?.email ?? 'unknown',
    });
    return Response.json(model, { status: 201 });
  } catch (e) {
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}
