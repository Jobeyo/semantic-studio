import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ ruleId: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { ruleId } = await params;
    await prisma.dataQualityRule.delete({ where: { id: parseInt(ruleId) } });
    return Response.json({ success: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
