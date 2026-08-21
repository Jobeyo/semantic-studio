import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';
import { logChange } from '@/lib/changelog';
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
      // Hämta kolumner med nullable-info
      const res = await client.query(`
        SELECT table_name, column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = $1
        ORDER BY table_name, ordinal_position
      `, [sourceSchema]);

      const tables: Record<string, string[]> = {};
      for (const row of res.rows) {
        if (!tables[row.table_name]) tables[row.table_name] = [];
        const nullable = row.is_nullable === 'YES' ? ' [kan vara NULL]' : ' [ej NULL]';
        tables[row.table_name].push(`  ${row.column_name} (${row.data_type})${nullable}`);
      }

      // Hämta sample-data och NULL-statistik per tabell
      let out = '';
      for (const [tableName, cols] of Object.entries(tables)) {
        out += `${sourceSchema}.${tableName}:\n${cols.join('\n')}\n`;
        try {
          // Räkna rader och NULL per kolumn
          const colNames = cols.map(c => c.trim().split(' ')[0]);
          const nullChecks = colNames.map(c => `SUM(CASE WHEN "${c}" IS NULL THEN 1 ELSE 0 END) AS "${c}_nulls"`).join(', ');
          const statsRes = await client.query(`SELECT COUNT(*) as total, ${nullChecks} FROM "${sourceSchema}"."${tableName}" LIMIT 1`);
          const stats = statsRes.rows[0];
          const total = parseInt(stats.total);
          out += `  → ${total} rader totalt\n`;
          for (const col of colNames) {
            const nullCount = parseInt(stats[`${col}_nulls`] ?? 0);
            if (nullCount > 0) {
              out += `  → VARNING: ${col} har ${nullCount} NULL-värden (${Math.round(nullCount/total*100)}%)\n`;
            }
          }
          // Visa exempel-värden för potentiella nycklar
          const sampleRes = await client.query(`SELECT * FROM "${sourceSchema}"."${tableName}" LIMIT 3`);
          if (sampleRes.rows.length > 0) {
            out += `  → Exempel: ${JSON.stringify(sampleRes.rows[0])}\n`;
          }
        } catch {}
        out += '\n';
      }
      return out;
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
    // Lokal dev-fallback: pg_lake -> extern adress
    if (process.env.NODE_ENV !== 'production' && sourceDb.host === 'pg_lake') {
      sourceDb.host = '188.240.222.70';
      sourceDb.port = 55432;
    }
    console.log('Source DB config:', { host: sourceDb.host, port: sourceDb.port, database: sourceDb.database, user: sourceDb.user });
    const dbSchema = await getDbSchema(model.sourceType, sourceDb, sourceSchema);
    console.log('DB schema length:', dbSchema.length);
    console.log('DB schema preview:', dbSchema.slice(0, 1000));
    // Begränsa schema om det är för långt
    const truncatedSchema = dbSchema.length > 8000 ? dbSchema.slice(0, 8000) + '\n... (schema trunkerat)' : dbSchema;

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
      max_tokens: 16000,
      messages: [{
        role: 'user',
        content: `Du är en expert på semantiska datamodeller och Business Intelligence.

Analysera följande databasschema och skapa ett semantiskt lager med vyer i schemat "${targetSchema}".

# Databasschema (källschema: ${sourceSchema})
${truncatedSchema}

REGLER:
1. SQL ska referera EXAKT till tabellerna i källschemat ovan med schema-prefix: ${sourceSchema}.table_name
2. Vyer ska skapas i målschemat: ${targetSchema}
3. Använd svenska affärsnamn i displayName
4. Identifiera fakta-, dimensions- och måttvyer

KRITISKA REGLER FÖR JOIN-NYCKLAR:
5. Använd BARA kolumner som faktiskt finns i källtabellerna - hitta INTE på kolumnnamn
6. JOIN-nycklar måste vara kolumner som faktiskt finns i BÅDA tabellerna du joinar
7. Kontrollera att alla kolumnnamn i SELECT och JOIN-villkor existerar i källschemat ovan
8. Om en naturlig JOIN-nyckel inte finns, skapa INTE en konstgjord nyckel - gör istället separata vyer
9. Faktavyer ska innehålla alla mätbara värden och alla naturliga nycklar från källtabellen
10. Dimensionsvyer ska bara innehålla kolumner som faktiskt finns i källtabellen

SQL-KVALITET:
11. Testa mentalt att varje JOIN faktiskt kan producera rader - inte bara NULL
12. Använd hellre enkla vyer utan JOIN än komplexa vyer med felaktiga JOINs
13. Namnge vyer och kolumner konsekvent - samma begrepp ska ha samma namn överallt
14. Håll JSON-svaret kompakt - max 8 vyer, max 15 kolumner per vy
15. SURROGATNYCKLAR: Om en tabell saknar en tydlig primärnyckel, använd en befintlig unik kolumn eller md5()-hash av kombination av kolumner
16. NULL-HANTERING: Om en JOIN-nyckel kan vara NULL i faktatabellen, lägg till WHERE-villkor för att filtrera bort NULL-rader ELLER uteslut dimensionen helt
17. STAR SCHEMA: Faktatabellen ska ha direkta kopplingar till dimensioner via nycklar som FAKTISKT finns i källdata
18. TESTA NYCKLAR: Innan du skapar en JOIN, verifiera mentalt att båda tabellerna har en gemensam kolumn med matchande värden
19. UTESLUT DIMENSION: Om ingen naturlig koppling finns mellan fakta och dimension, skapa dimensionen som en fristående vy utan JOIN mot faktatabellen
14. Håll JSON-svaret kompakt - max 8 vyer, max 15 kolumner per vy

Returnera EXAKT följande JSON-format utan kommentarer:
{
  "views": [
    {
      "name": "view_name",
      "displayName": "Affärsnamn på svenska",
      "description": "Beskrivning",
      "type": "fact|dimension|measure|kpi",
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
    await logChange({
      orgId: model.orgId, modelId: model.id,
      action: 'ai_generated', entityType: 'model', entityName: model.name,
      details: `AI genererade ${generated.views.length} vyer från ${sourceSchema}`,
      actor: 'AI',
    });
    return Response.json({ views: generated.views });

  } catch (e) {
    console.error('Generate error:', e);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
