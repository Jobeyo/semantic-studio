import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';
import { logChange } from '@/lib/changelog';
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const isInternal = request.headers.get('x-internal-request') === 'true';
    const session = await auth();
    if (!session?.user && !isInternal) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const model = await prisma.semanticModel.findUnique({
      where: { id: parseInt(id) },
      include: { views: { include: { columns: { orderBy: { id: 'asc' } } }, orderBy: { id: 'asc' } } },
    });
    if (!model) return Response.json({ error: 'Not found' }, { status: 404 });
    return Response.json(model);
  } catch (e) {
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const updates = await request.json();
    const model = await prisma.semanticModel.update({
      where: { id: parseInt(id) },
      data: updates,
    });
    if (updates.status) {
      await logChange({
        orgId: model.orgId, modelId: model.id,
        action: updates.status === 'published' ? 'model_published' : 'model_unpublished',
        entityType: 'model', entityName: model.name,
        details: `Modell ${updates.status === 'published' ? 'publicerades' : 'avpublicerades'}`,
        actor: session.user?.email ?? 'unknown',
      });
    }
    if (updates.name) {
      await logChange({
        orgId: model.orgId, modelId: model.id,
        action: 'model_renamed', entityType: 'model', entityName: model.name,
        details: `Modell döptes om till "${updates.name}"`,
        actor: session.user?.email ?? 'unknown',
      });
    }
    return Response.json(model);
  } catch (e) {
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    // Ta bort kolumner → vyer → modell i rätt ordning
    const views = await prisma.modelView.findMany({ where: { modelId: parseInt(id) } });
    for (const view of views) {
      await prisma.viewColumn.deleteMany({ where: { viewId: view.id } });
    }
    await prisma.modelView.deleteMany({ where: { modelId: parseInt(id) } });
    await prisma.semanticModel.delete({ where: { id: parseInt(id) } });
    return Response.json({ success: true });
  } catch (e) {
    console.error('Delete model error:', e);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
