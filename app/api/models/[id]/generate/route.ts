import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';
import { Client } from 'pg';
import Anthropic from '@anthropic-ai/sdk';

async function getDbSchema(sourceType: string, config: any, sourceSchema: string): Promise<string> {
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
        WHERE table_schema = $1
        ORDER BY table_name, ordinal_position
      `, [sourceSchema]);
      await client.end();
      const tables: Record<string, string[]> = {};
      for (const row of res.rows) {
        if (!tables[row.table_name]) tables[row.table_name] = [];
        tables[row.table_name].push(`  ${row.column_name} (${row.data_type})`);
      }
      return Object.entries(tables).map(([t, cols]) => `${sourceSchema}.${t}:\n${cols.join('\n')}`).join('\n\n');
    } finally {
      try { await client.end(); } catch {}
    }
  }
  throw new Error(`Unsupported source type: ${sourceType}`);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const body = await request.json();
    const { sourceSchema, targetSchema } = body;
    console.log('Generate request:', { sourceSchema, targetSchema, modelId: id });

    const model = await prisma.semanticModel.findUnique({ where: { id: parseInt(id) } });
    if (!model) return Response.json({ error: 'Not found' }, { status: 404 });

    const config = model.sourceConfig as any;
    // Använd källdatabas om angiven, annars modellens anslutning
    const sourceDb = body.sourceDb ?? config;
    console.log('Source DB config:', { host: sourceDb.host, port: sourceDb.port, database: sourceDb.database, user: sourceDb.user });
    const dbSchema = await getDbSchema(model.sourceType, sourceDb, sourceSchema);
    console.log('DB schema length:', dbSchema.length);

    // Hämta aktiv LLM-leverantör
    const sessionData = await auth();
    const user = await prisma.user.findUnique({ where: { email: sessionData?.user?.email! } });
    const activeProvider = await prisma.lLMProvider.findFirst({
      where: { orgId: user!.orgId, isDefault: true, type: 'claude' },
    });
    const apiKey = activeProvider?.apiKey || process.env.ANTHROPIC_API_KEY || '';
    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      messages: [{
        role: 'user',
        content: `Du är en expert på semantiska datamodeller och Business Intelligence.

Analysera följande databasschema och skapa ett semantiskt lager med vyer i schemat "${targetSchema}".

# Databasschema (källschema: ${sourceSchema})
${dbSchema}

REGLER:
1. SQL ska referera EXAKT till tabellerna i källschemat ovan med schema-prefix: ${sourceSchema}.table_name
2. Vyer ska skapas i målschemat: ${targetSchema}
3. Använd svenska affärsnamn i displayName
4. Identifiera fakta-, dimensions- och måttvyer

Returnera EXAKT följande JSON-format utan kommentarer:
{
  "views": [
    {
      "name": "view_name",
      "displayName": "Affärsnamn på svenska",
      "description": "Beskrivning",
      "type": "fact|dimension|measure",
      "sql": "CREATE OR REPLACE VIEW ${targetSchema}.\\"view_name\\" AS SELECT ...",
      "columns": [
        {
          "name": "column_name",
          "displayName": "Affärsnamn",
          "description": "Beskrivning",
          "dataType": "string|number|date|boolean",
          "isKey": false,
          "isMeasure": false,
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
    if (!jsonMatch) {
      console.error('AI response (no JSON found):', text.slice(0, 500));
      return Response.json({ error: 'AI kunde inte generera schema: ' + text.slice(0, 200) }, { status: 500 });
    }
    
    let generated;
    try {
      generated = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('JSON parse error:', (parseError as Error).message);
      console.error('Raw text length:', text.length);
      // Försök begränsa antalet vyer om JSON är för långt
      return Response.json({ error: 'AI genererade för mycket data. Försök med ett schema med färre tabeller.' }, { status: 500 });
    }
    // Returnera vyer utan att spara – användaren granskar SQL först
    return Response.json({ views: generated.views });

  } catch (e) {
    console.error('Generate error:', e);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
