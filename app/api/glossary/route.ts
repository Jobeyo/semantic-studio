import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await prisma.user.findUnique({ where: { email: session.user.email! } });
    const { searchParams } = new URL(request.url);
    const modelId = searchParams.get('modelId');
    const terms = await prisma.glossaryTerm.findMany({
      where: { orgId: user!.orgId, ...(modelId ? { modelId: parseInt(modelId) } : {}) },
      orderBy: { name: 'asc' },
    });
    return Response.json(terms);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await prisma.user.findUnique({ where: { email: session.user.email! } });
    const { name, definition, synonym, dataSource, type, modelId } = await request.json();
    const term = await prisma.glossaryTerm.create({
      data: {
        orgId: user!.orgId,
        modelId: modelId ?? null,
        name, definition,
        synonym: synonym ?? null,
        dataSource: dataSource ?? null,
        type: type ?? 'concept',
        createdBy: session.user.email!,
        updatedBy: session.user.email!,
      },
    });
    return Response.json(term, { status: 201 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
