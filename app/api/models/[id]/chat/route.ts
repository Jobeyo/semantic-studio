import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';
import { Client } from 'pg';

async function getDbSchema(sourceType: string, config: any): Promise<string> {
  if (sourceType === 'postgres') {
    const client = new Client({
      host: config.host, port: config.port, database: config.database,
      user: config.user, password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 10000,
    });
    await client.connect();
    try {
      const res = await client.query(`
        SELECT table_schema, table_name, column_name, data_type
        FROM information_schema.columns
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema', 'semantic_layer')
        ORDER BY table_schema, table_name, ordinal_position
      `);
      await client.end();
      const tables: Record<string, string[]> = {};
      for (const row of res.rows) {
        const key = `${row.table_schema}.${row.table_name}`;
        if (!tables[key]) tables[key] = [];
        tables[key].push(`  ${row.column_name} (${row.data_type})`);
      }
      return Object.entries(tables).map(([t, cols]) => `${t}:\n${cols.join('\n')}`).join('\n\n');
    } catch (e) {
      try { await client.end(); } catch {}
      return 'Kunde inte hämta schema från databasen.';
    }
  }
  return 'Databastyp stöds inte ännu.';
}

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

  // Hämta faktiskt DB-schema
  const config = model.sourceConfig as any;
  const dbSchema = await getDbSchema(model.sourceType, config);

  const modelSummary = `# Semantisk modell: ${model.name}
Databas: ${model.sourceType}
Status: ${model.status}

## Befintliga vyer i modellen
${model.views.map(v => `
### ${v.displayName} (ID: ${v.id}, DB-namn: ${v.name})
Typ: ${v.type}
Beskrivning: ${v.description ?? 'saknas'}
Kolumner:
${v.columns.map(c => `  - ${c.name} (ID: ${c.id}) | Affärsnamn: ${c.displayName} | Typ: ${c.dataType}${c.isKey ? ' | NYCKEL' : ''}${c.isMeasure ? ' | MÅTT' : ''}${c.description ? ` | ${c.description}` : ''}`).join('\n')}`).join('\n')}

## Faktiskt databasschema (tabeller som FAKTISKT finns)
${dbSchema}`;

  const systemPrompt = `Du är en expert på semantiska datamodeller och Business Intelligence.
Du hjälper användaren att förbättra och dokumentera sin semantiska modell.

${modelSummary}

VIKTIGA REGLER:
1. Du kan ENDAST ändra metadata (visningsnamn, beskrivningar, typ, nyckel/mått-flaggor).
2. Du kan INTE ändra SQL eller kolumnnamn i databasen – det kräver manuell hantering.
3. När du föreslår nya vyer MÅSTE du basera SQL ENBART på tabeller som faktiskt finns i databasen ovan.
4. Hitta ALDRIG på tabeller eller kolumner – använd BARA det som finns i "Faktiskt databasschema".
5. SQL för nya vyer ska använda schema-prefixat tabellnamn, t.ex. core.wastedata.

Svara på svenska.`;

  const tools: Anthropic.Tool[] = [
    {
      name: 'update_view_metadata',
      description: 'Uppdaterar metadata för en vy (visningsnamn, beskrivning, typ). Ändrar INTE SQL eller DB-strukturen.',
      input_schema: {
        type: 'object' as const,
        properties: {
          viewId: { type: 'number', description: 'Vyns ID' },
          displayName: { type: 'string', description: 'Nytt affärsnamn' },
          description: { type: 'string', description: 'Ny beskrivning' },
          type: { type: 'string', enum: ['fact', 'dimension', 'measure'] },
        },
        required: ['viewId'],
      },
    },
    {
      name: 'update_column_metadata',
      description: 'Uppdaterar metadata för en kolumn (visningsnamn, beskrivning, datatyp, nyckel/mått-flaggor).',
      input_schema: {
        type: 'object' as const,
        properties: {
          columnId: { type: 'number', description: 'Kolumnens ID' },
          displayName: { type: 'string', description: 'Nytt affärsnamn' },
          description: { type: 'string', description: 'Ny beskrivning' },
          dataType: { type: 'string', enum: ['string', 'number', 'date', 'boolean'] },
          isKey: { type: 'boolean' },
          isMeasure: { type: 'boolean' },
        },
        required: ['columnId'],
      },
    },
    {
      name: 'create_view',
      description: 'Skapar en ny vy i modellen. SQL MÅSTE baseras på tabeller som faktiskt finns i databasen.',
      input_schema: {
        type: 'object' as const,
        properties: {
          name: { type: 'string', description: 'Vyns tekniska namn (snake_case)' },
          displayName: { type: 'string', description: 'Affärsnamn på svenska' },
          description: { type: 'string', description: 'Beskrivning av vyn' },
          type: { type: 'string', enum: ['fact', 'dimension', 'measure'] },
          sql: { type: 'string', description: 'SQL för att skapa vyn i semantic_layer-schemat' },
        },
        required: ['name', 'displayName', 'type', 'sql'],
      },
    },
  ];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      try {
        // Hämta aktiv LLM-leverantör
        const session = await auth();
        const user = await prisma.user.findUnique({ where: { email: session?.user?.email! } });
        const activeProvider = await prisma.lLMProvider.findFirst({
          where: { orgId: user!.orgId, isDefault: true },
        });
        const providerType = activeProvider?.type ?? 'claude';
        const apiKey = activeProvider?.apiKey || process.env.ANTHROPIC_API_KEY || '';
        const providerConfig = activeProvider?.config as any;
        const modelName = providerConfig?.model ?? (providerType === 'claude' ? 'claude-sonnet-4-6' : providerType === 'berget' ? 'Llama-3.3-70B-Instruct' : 'gpt-4o');
        const anthropic = new Anthropic({ 
          apiKey,
          ...(providerType === 'berget' ? { baseURL: 'https://api.berget.ai/v1' } : {}),
        });
        const messages: Anthropic.MessageParam[] = [
          ...history.map((h: any) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
          { role: 'user', content: message },
        ];

        let continueLoop = true;
        while (continueLoop) {
          const msg = await anthropic.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 2000,
            system: systemPrompt,
            tools,
            messages,
          });

          for (const block of msg.content) {
            if (block.type === 'text') send({ type: 'text', text: block.text });
          }

          if (msg.stop_reason === 'tool_use') {
            const toolResults: Anthropic.ToolResultBlockParam[] = [];
            for (const block of msg.content) {
              if (block.type !== 'tool_use') continue;
              const input = block.input as any;
              let result = '';
              try {
                if (block.name === 'update_view_metadata') {
                  const data: any = {};
                  if (input.displayName) data.displayName = input.displayName;
                  if (input.description !== undefined) data.description = input.description;
                  if (input.type) data.type = input.type;
                  await prisma.modelView.update({ where: { id: input.viewId }, data });
                  result = `Uppdaterade vy ${input.viewId}`;
                  send({ type: 'model_updated' });
                } else if (block.name === 'update_column_metadata') {
                  const data: any = {};
                  if (input.displayName) data.displayName = input.displayName;
                  if (input.description !== undefined) data.description = input.description;
                  if (input.dataType) data.dataType = input.dataType;
                  if (input.isKey !== undefined) data.isKey = input.isKey;
                  if (input.isMeasure !== undefined) data.isMeasure = input.isMeasure;
                  await prisma.viewColumn.update({ where: { id: input.columnId }, data });
                  result = `Uppdaterade kolumn ${input.columnId}`;
                  send({ type: 'model_updated' });
                } else if (block.name === 'create_view') {
                  const newView = await prisma.modelView.create({
                    data: {
                      modelId: parseInt(id),
                      name: input.name,
                      displayName: input.displayName,
                      description: input.description,
                      type: input.type,
                      sql: input.sql,
                    },
                    include: { columns: true },
                  });
                  result = `Skapade vy ${newView.id}: ${input.name}`;
                  send({ type: 'model_updated' });
                }
              } catch (e) {
                result = `Fel: ${(e as Error).message}`;
              }
              toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
            }
            messages.push({ role: 'assistant', content: msg.content });
            messages.push({ role: 'user', content: toolResults });
          } else {
            continueLoop = false;
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
