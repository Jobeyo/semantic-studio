import { auth } from '@/auth';
import prisma from '@/lib/db';

function extractColumnMappings(sql: string): { sourceCol: string; targetCol: string }[] {
  const mappings: { sourceCol: string; targetCol: string }[] = [];
  // Hitta SELECT-delen
  const selectMatch = sql.match(/SELECT\s+([\s\S]+?)\s+FROM/i);
  if (!selectMatch) return mappings;
  
  const selectPart = selectMatch[1];
  const parts = selectPart.split(',');
  
  for (const part of parts) {
    const trimmed = part.trim();
    // Matcha: source AS target eller source.col AS target
    const asMatch = trimmed.match(/(?:[\w.]+\.)?(\w+)\s+AS\s+["']?(\w+)["']?/i);
    if (asMatch) {
      mappings.push({ sourceCol: asMatch[1], targetCol: asMatch[2] });
    }
  }
  return mappings;
}

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
        const columnMappings = extractColumnMappings(view.sql ?? '');
        return {
          id: view.id,
          name: view.name,
          displayName: view.displayName,
          type: view.type,
          sql: view.sql,
          sourceTables,
          columnCount: view.columns.length,
          columns: view.columns.map(c => ({ name: c.name, displayName: c.displayName, dataType: c.dataType, isKey: c.isKey, isMeasure: c.isMeasure })),
          columnMappings,
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

    // Hämta rapporter från Klarify
    const klarifyUrl = process.env.KLARIFY_URL ?? 'http://klarify:3000';
    console.log('Fetching reports from:', klarifyUrl);
    const reportsByModel: Record<number, {id: string; title: string; sourceViews: string[]}[]> = {};
    try {
      const res = await fetch(`${klarifyUrl}/api/reports`, {
        headers: { 'x-internal-key': process.env.INTERNAL_API_KEY ?? 'studio-internal' },
      });
      if (res.ok) {
        const reports = await res.json();
        console.log('Reports fetched:', reports.length);
        for (const r of (Array.isArray(reports) ? reports : [])) {
          if (r.modelId) {
            if (!reportsByModel[r.modelId]) reportsByModel[r.modelId] = [];
            reportsByModel[r.modelId].push({ 
              id: r.id, 
              title: r.title,
              sourceViews: r.sourceViews ?? [],
            });
          }
        }
      } else {
        console.log('Reports fetch failed:', res.status);
      }
    } catch (e) {
      console.log('Reports fetch error:', e);
    }

    console.log('Model IDs:', lineage.map((m: any) => typeof m.id + ':' + m.id));
    console.log('reportsByModel keys:', Object.keys(reportsByModel));
    const lineageWithReports = lineage.map((m: any) => ({
      ...m,
      views: m.views.map((v: any) => ({
        ...v,
        reports: (reportsByModel[m.id] ?? []).filter((r: any) => 
          r.sourceViews && r.sourceViews.length > 0 && r.sourceViews.includes(v.name)
        ),
      })),
      reports: reportsByModel[m.id] ?? [],
    }));

    return Response.json({ lineage: lineageWithReports });
  } catch (e) {
    console.error('Lineage API error:', e);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
