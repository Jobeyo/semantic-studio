import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { viewId, columnName, ruleType, ruleValue, description } = await request.json();
    const rule = await prisma.dataQualityRule.create({
      data: { viewId, columnName, ruleType, ruleValue: ruleValue || null, description: description || null },
    });
    return Response.json(rule, { status: 201 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
