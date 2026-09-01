import { auth } from '@/auth';
import prisma from '@/lib/db';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const models = await prisma.semanticModel.findMany({
      where: { status: { not: 'archived' } },
      include: {
        views: {
          include: {
            columns: true,
            qualityRules: true,
          }
        }
      },
      orderBy: { name: 'asc' },
    });
    return Response.json({ models });
  } catch (e) {
    console.error('Quality API error:', e);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
