import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const { baseViews, dimensions, measures, kpiName } = await request.json();

    const user = await prisma.user.findUnique({ where: { email: session.user.email! } });
    const activeProvider = await prisma.lLMProvider.findFirst({
      where: { orgId: user!.orgId, isDefault: true },
    });
    const apiKey = activeProvider?.apiKey || process.env.ANTHROPIC_API_KEY || '';
    const providerConfig = activeProvider?.config as any;
    const modelName = providerConfig?.model ?? 'claude-sonnet-4-6';
    const providerType = activeProvider?.type ?? 'claude';

    const anthropic = new Anthropic({
      apiKey,
      ...(providerType === 'berget' ? { baseURL: 'https://api.berget.ai/v1' } : {}),
    });

    const prompt = `Du är expert på semantiska datamodeller och SQL-fönsterfunktioner.

Användaren vill skapa ett nyckeltal (KPI) med namnet "${kpiName}".

Tillgängliga basvyer och deras kolumner:
${baseViews.map((v: any) => `
Vy: ${v.name}
Kolumner: ${v.columns.map((c: any) => `${c.name} (${c.dataType}${c.isMeasure ? ', MÅTT' : ''}${c.isKey ? ', NYCKEL' : ''})`).join(', ')}`).join('\n')}

Valda dimensioner att gruppera på: ${dimensions.join(', ') || 'inga valda'}

Önskade mått:
${measures.map((m: any) => `- ${m.displayName}`).join('\n')}

Generera SQL-uttryck för varje mått. Svara ENDAST med JSON i detta format:
{
  "measures": [
    {
      "name": "kolumnnamn_i_snake_case",
      "displayName": "Affärsnamn på svenska",
      "expression": "SQL-uttryck t.ex. SUM(amount) eller ROUND(SUM(amount) * 100.0 / SUM(SUM(amount)) OVER (), 1)",
      "dataType": "number"
    }
  ]
}

Regler:
- Använd fönsterfunktioner (OVER()) för andelar och ranking
- Kolumnnamn ska vara snake_case
- Affärsnamn ska vara på svenska
- SQL-uttrycket ska INTE innehålla AS eller kolumnnamn - bara beräkningen
- Svara BARA med JSON, inget annat`;

    const msg = await anthropic.messages.create({
      model: modelName,
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = msg.content.find(b => b.type === 'text')?.text ?? '';
    const clean = text.replace(/```json|```/g, '').trim();
    const data = JSON.parse(clean);

    return Response.json(data);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
