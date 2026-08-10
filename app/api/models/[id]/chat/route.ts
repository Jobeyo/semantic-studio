import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { message, history } = await request.json();

  const model = await prisma.semanticModel.findUnique({
    where: { id: parseInt(id) },
    include: { views: { include: { columns: true } } },
  });
  if (!model) return Response.json({ error: 'Not found' }, { status: 404 });

  // Bygg en sammanfattning av modellen
  const modelSummary = `
# Semantisk modell: ${model.name}
Databas: ${model.sourceType}
Status: ${model.status}
Antal vyer: ${model.views.length}

## Vyer
${model.views.map(v => `
### ${v.displayName} (${v.name})
Typ: ${v.type}
Kolumner: ${v.columns.map(c => `${c.name} (${c.dataType}${c.isKey ? ', nyckel' : ''}${c.isMeasure ? ', mått' : ''})`).join(', ')}
`).join('\n')}`;

  const systemPrompt = `Du är en expert på semantiska datamodeller och Business Intelligence.
Du hjälper användaren att designa och förbättra en semantisk modell mot en ${model.sourceType}-databas.

${modelSummary}

Du kan:
- Förklara modellen och dess vyer
- Föreslå förbättringar av vyernas SQL
- Föreslå nya vyer som saknas
- Hjälpa till med att namnge kolumner och vyer på affärsspråk (svenska)
- Analysera relationer mellan tabeller
- Ge råd om best practices för semantiska modeller

Svara alltid på svenska. Om du föreslår SQL, skriv det i ett kodblock med \`\`\`sql.
Om du föreslår att lägga till en ny vy, formatera det tydligt med vyns namn, typ och SQL.`;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      try {
        const msgStream = anthropic.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 2000,
          system: systemPrompt,
          messages: [
            ...history.map((h: any) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
            { role: 'user', content: message },
          ],
        });

        for await (const event of msgStream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            send({ type: 'text', text: event.delta.text });
          }
        }
        send({ type: 'done' });
      } catch (e) {
        send({ type: 'error', message: (e as Error).message });
      }
      controller.close();
    },
  });

  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
}
