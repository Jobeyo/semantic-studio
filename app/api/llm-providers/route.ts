import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await prisma.user.findUnique({ where: { email: session.user.email! } });
    const providers = await prisma.lLMProvider.findMany({
      where: { orgId: user!.orgId },
      orderBy: { createdAt: 'asc' },
    });
    return Response.json(providers);
  } catch (e) {
    console.error('LLM POST error:', e);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await prisma.user.findUnique({ where: { email: session.user.email! } });
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const { name, type, apiKey, model, ollamaUrl } = await request.json();
    const config: any = {};
    if (model) config.model = model;
    if (ollamaUrl) config.url = ollamaUrl;
    const provider = await prisma.lLMProvider.create({
      data: { name, type, apiKey: apiKey ?? '', config, isDefault: false, orgId: user.orgId },
    });
    return Response.json(provider, { status: 201 });
  } catch (e) {
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}
