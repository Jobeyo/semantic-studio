import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';
import { logChange } from '@/lib/changelog';
import { isInternalRequest, withoutSecrets } from '@/lib/internal';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const isInternal = isInternalRequest(request);
    const session = isInternal ? null : await auth();
    if (!session?.user && !isInternal) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const model = await prisma.semanticModel.findUnique({
      where: { id: parseInt(id) },
      include: { views: { include: { columns: { orderBy: { id: 'asc' } } }, orderBy: { id: 'asc' } } },
    });
    if (!model) return Response.json({ error: 'Not found' }, { status: 404 });
    if (!isInternal && model.orgId !== parseInt((session!.user as any).orgId)) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    // Klarify behöver aldrig anslutningens lösenord
    return Response.json(isInternal ? withoutSecrets(model) : model);
  } catch (e) {
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}

// Fält som får ändras. Allt annat i anropet ignoreras.
const UPDATABLE = ['name', 'description', 'status', 'owner', 'ownerEmail', 'sourceType', 'sourceConfig'] as const;
const STATUSES = ['draft', 'published', 'archived'];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const role = (session.user as any).role;
    const orgId = parseInt((session.user as any).orgId);
    const { id } = await params;

    const existing = await prisma.semanticModel.findUnique({ where: { id: parseInt(id) }, select: { orgId: true, sourceConfig: true } });
    if (!existing || existing.orgId !== orgId) return Response.json({ error: 'Not found' }, { status: 404 });

    const body = await request.json();
    const updates: Record<string, any> = {};
    for (const key of UPDATABLE) if (key in body) updates[key] = body[key];

    if (updates.status !== undefined && !STATUSES.includes(updates.status)) {
      return Response.json({ error: 'Ogiltig status' }, { status: 400 });
    }

    if (updates.sourceConfig !== undefined) {
      // Att ändra en befintlig anslutning kräver admin
      if (role !== 'admin') return Response.json({ error: 'Bara admin kan ändra anslutningen' }, { status: 403 });
      if (updates.sourceConfig && typeof updates.sourceConfig === 'object') {
        // Behåll sparade inställningar (lösenord, lineage-källa m.m.) som formuläret inte skickar med
        const old = (existing.sourceConfig as any) ?? {};
        const { hasPassword: _ignored, ...incoming } = updates.sourceConfig;
        updates.sourceConfig = { ...old, ...incoming, password: incoming.password || old.password };
      }
    }

    const model = await prisma.semanticModel.update({ where: { id: parseInt(id) }, data: updates });

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
    if ((session.user as any).role !== 'admin') return Response.json({ error: 'Bara admin kan ta bort en modell' }, { status: 403 });
    const { id } = await params;
    const existing = await prisma.semanticModel.findUnique({ where: { id: parseInt(id) }, select: { orgId: true } });
    if (!existing || existing.orgId !== parseInt((session.user as any).orgId)) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
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
