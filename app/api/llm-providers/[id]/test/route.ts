import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';

export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const provider = await prisma.lLMProvider.findUnique({ where: { id: parseInt(id) } });
    if (!provider) return Response.json({ error: 'Not found' }, { status: 404 });

    if (provider.type === 'claude') {
      const client = new Anthropic({ apiKey: provider.apiKey });
      await client.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 10, messages: [{ role: 'user', content: 'Hi' }] });
      return Response.json({ ok: true });
    }
    if (provider.type === 'ollama') {
      const config = provider.config as any;
      const url = config?.url ?? 'http://ollama:11434';
      const res = await fetch(`${url}/api/tags`);
      return Response.json({ ok: res.ok });
    }
    return Response.json({ ok: false, error: 'Okänd typ' });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message });
  }
}
