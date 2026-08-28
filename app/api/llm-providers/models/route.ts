import { NextRequest } from 'next/server';
import prisma from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    let apiKey = searchParams.get('apiKey');

    const providerId = searchParams.get('providerId');
    if (!apiKey && providerId) {
      const provider = await prisma.lLMProvider.findUnique({ where: { id: parseInt(providerId) } });
      if (provider) apiKey = provider.apiKey ?? null;
    }

    if (type === 'berget' && apiKey) {
      const res = await fetch('https://api.berget.ai/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      if (res.ok) {
        const data = await res.json();
        const models = data.data
          .filter((m: any) => !m.id.includes('whisper') && !m.id.includes('e5') && !m.id.includes('bge') && !m.id.includes('reranker'))
          .map((m: any) => ({ id: m.id, name: m.name ?? m.id.split('/').pop(), created: m.created ?? 0 }))
          .sort((a: any, b: any) => b.created - a.created);
        return Response.json({ models });
      }
    }

    if (type === 'claude' && apiKey) {
      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      });
      if (res.ok) {
        const data = await res.json();
        const models = data.data
          .map((m: any) => ({ id: m.id, name: m.display_name ?? m.id, created: m.created_at ? new Date(m.created_at).getTime() : 0 }))
          .sort((a: any, b: any) => b.created - a.created);
        return Response.json({ models });
      }
    }

    if (type === 'openai' && apiKey) {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      if (res.ok) {
        const data = await res.json();
        const models = data.data
          .filter((m: any) => m.id.startsWith('gpt'))
          .map((m: any) => ({ id: m.id, name: m.id }));
        return Response.json({ models });
      }
    }

    return Response.json({ models: [] });
  } catch (e) {
    return Response.json({ models: [] });
  }
}
