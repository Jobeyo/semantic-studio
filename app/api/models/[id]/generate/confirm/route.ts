import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const { views } = await request.json();

    // Ta bort befintliga vyer
    const existing = await prisma.modelView.findMany({ where: { modelId: parseInt(id) } });
    for (const v of existing) {
      await prisma.viewColumn.deleteMany({ where: { viewId: v.id } });
    }
    await prisma.modelView.deleteMany({ where: { modelId: parseInt(id) } });

    // Spara nya vyer
    const savedViews = await Promise.all(views.map(async (v: any) => {
      return prisma.modelView.create({
        data: {
          modelId: parseInt(id),
          name: v.name,
          displayName: v.displayName,
          description: v.description,
          type: v.type,
          sql: v.sql,
          columns: {
            create: (v.columns ?? []).map((c: any) => ({
              name: c.name,
              displayName: c.displayName,
              description: c.description,
              dataType: c.dataType,
              isKey: c.isKey ?? false,
              isMeasure: c.isMeasure ?? false,
              format: c.format ?? null,
            })),
          },
        },
        include: { columns: true },
      });
    }));

    return Response.json({ views: savedViews });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
