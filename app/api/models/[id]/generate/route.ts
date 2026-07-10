import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';
import { Client } from 'pg';
import Anthropic from '@anthropic-ai/sdk';

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
        SELECT table_name, column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY table_name, ordinal_position
      `);
      await client.end();
      const tables: Record<string, string[]> = {};
      for (const row of res.rows) {
        if (!tables[row.table_name]) tables[row.table_name] = [];
        tables[row.table_name].push(`  ${row.column_name} (${row.data_type})`);
      }
      return Object.entries(tables).map(([t, cols]) => `${t}:\n${cols.join('\n')}`).join('\n\n');
    } finally {
      try { await client.end(); } catch {}
    }
  }
  throw new Error(`Unsupported source type: ${sourceType}`);
}

export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;

    const model = await prisma.semanticModel.findUnique({ where: { id: parseInt(id) } });
    if (!model) return Response.json({ error: 'Not found' }, { status: 404 });

    const config = model.sourceConfig as any;
    const dbSchema = await getDbSchema(model.sourceType, config);

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `Du är en expert på semantiska datamodeller och Business Intelligence.

Analysera följande databasschema och skapa ett semantiskt lager med vyer.

# Databasschema
${dbSchema}

Returnera EXAKT följande JSON-format (inga kommentarer, inga förklaringar):
{
  "views": [
    {
      "name": "view_name",
      "displayName": "Affärsnamn på svenska",
      "description": "Beskrivning av vad vyn representerar",
      "type": "fact|dimension|measure",
      "sql": "CREATE OR REPLACE VIEW semantic_layer.view_name AS SELECT ...",
      "columns": [
        {
          "name": "column_name",
          "displayName": "Affärsnamn",
          "description": "Vad kolumnen representerar",
          "dataType": "string|number|date|boolean",
          "isKey": true|false,
          "isMeasure": true|false,
          "format": null
        }
      ]
    }
  ]
}`,
      }],
    });

    const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return Response.json({ error: 'AI kunde inte generera schema' }, { status: 500 });

    const generated = JSON.parse(jsonMatch[0]);

    // Spara vyer till databasen
    await prisma.modelView.deleteMany({ where: { modelId: parseInt(id) } });
    const views = await Promise.all(generated.views.map(async (v: any) => {
      return prisma.modelView.create({
        data: {
          modelId: parseInt(id),
          name: v.name,
          displayName: v.displayName,
          description: v.description,
          type: v.type,
          sql: v.sql,
          columns: {
            create: v.columns.map((c: any) => ({
              name: c.name,
              displayName: c.displayName,
              description: c.description,
              dataType: c.dataType,
              isKey: c.isKey ?? false,
              isMeasure: c.isMeasure ?? false,
              format: c.format ?? null,
            })),
          },
        },
        include: { columns: true },
      });
    }));

    return Response.json({ views });
  } catch (e) {
    console.error('Generate error:', e);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
