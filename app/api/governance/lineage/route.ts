import { auth } from '@/auth';
import prisma from '@/lib/db';

function extractSourceTables(sql: string): string[] {
  // Extrahera tabellnamn från FROM och JOIN i SQL
  const tables: string[] = [];
  const patterns = [
    /FROM\s+([a-zA-Z_][a-zA-Z0-9_.\"]+)/gi,
    /JOIN\s+([a-zA-Z_][a-zA-Z0-9_.\"]+)/gi,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(sql)) !== null) {
      const table = match[1].replace(/"/g, '').trim();
      if (!table.toLowerCase().includes('select') && !tables.includes(table)) {
        tables.push(table);
      }
    }
  }
  return tables;
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const models = await prisma.semanticModel.findMany({
      where: { status: { not: 'archived' } },
      include: { views: { include: { columns: true } } },
      orderBy: { name: 'asc' },
    });

    // Hämta rapporter från Klarify via Studio-konfiguration
    const studioUrl = process.env.STUDIO_URL ?? 'http://localhost:3001';

    const lineage = models.map(model => {
      const cfg = model.sourceConfig as any;
      const targetSchema = cfg?.schema ?? 'semantic_layer';

      const views = model.views.map(view => {
        const sourceTables = extractSourceTables(view.sql ?? '');
        return {
          id: view.id,
          name: view.name,
          displayName: view.displayName,
          type: view.type,
          sourceTables,
          columnCount: view.columns.length,
        };
      });

      return {
        id: model.id,
        name: model.name,
        sourceType: model.sourceType,
        sourceDatabase: cfg?.database,
        sourceHost: cfg?.host,
        targetSchema,
        views,
      };
    });

    return Response.json({ lineage });
  } catch (e) {
    console.error('Lineage API error:', e);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
