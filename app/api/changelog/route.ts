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
    const limit = parseInt(searchParams.get('limit') ?? '50');

    const logs = await prisma.changeLog.findMany({
      where: {
        orgId: user!.orgId,
        ...(modelId ? { modelId: parseInt(modelId) } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { model: { select: { name: true } } },
    });
    return Response.json(logs);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
