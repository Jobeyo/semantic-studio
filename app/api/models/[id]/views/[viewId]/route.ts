import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string; viewId: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { viewId } = await params;
    const view = await prisma.modelView.findUnique({
      where: { id: parseInt(viewId) },
      include: { columns: { orderBy: { id: 'asc' } } },
    });
    if (!view) return Response.json({ error: 'Not found' }, { status: 404 });
    return Response.json(view);
  } catch (e) {
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; viewId: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { viewId } = await params;
    const { displayName, description, type, sql, columns } = await request.json();

    // Uppdatera vyn
    await prisma.modelView.update({
      where: { id: parseInt(viewId) },
      data: { displayName, description, type, sql },
    });

    // Synka kolumner
    const existingCols = await prisma.viewColumn.findMany({ where: { viewId: parseInt(viewId) } });
    const existingIds = existingCols.map(c => c.id);

    for (const col of columns) {
      if (col.id > 0 && existingIds.includes(col.id)) {
        await prisma.viewColumn.update({
          where: { id: col.id },
          data: { name: col.name, displayName: col.displayName, description: col.description, dataType: col.dataType, isKey: col.isKey, isMeasure: col.isMeasure },
        });
      } else {
        await prisma.viewColumn.create({
          data: { viewId: parseInt(viewId), name: col.name, displayName: col.displayName, description: col.description, dataType: col.dataType, isKey: col.isKey, isMeasure: col.isMeasure, format: null },
        });
      }
    }

    // Ta bort borttagna kolumner
    const updatedIds = columns.filter((c: any) => c.id > 0).map((c: any) => c.id);
    const toDelete = existingIds.filter(id => !updatedIds.includes(id));
    if (toDelete.length > 0) await prisma.viewColumn.deleteMany({ where: { id: { in: toDelete } } });

    return Response.json({ success: true });
  } catch (e) {
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string; viewId: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { viewId } = await params;
    // Ta bort kolumner först pga foreign key constraint
    await prisma.viewColumn.deleteMany({ where: { viewId: parseInt(viewId) } });
    await prisma.modelView.delete({ where: { id: parseInt(viewId) } });
    return Response.json({ success: true });
  } catch (e) {
    console.error('DELETE view error:', e);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
