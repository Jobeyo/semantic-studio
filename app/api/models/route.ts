import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const orgId = parseInt((session.user as any).orgId);
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
    return Response.json(model, { status: 201 });
  } catch (e) {
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}
