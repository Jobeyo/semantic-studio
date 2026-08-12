import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
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
