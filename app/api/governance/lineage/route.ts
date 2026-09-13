import { auth } from '@/auth';
import prisma from '@/lib/db';
import { Client } from 'pg';

function extractColumnMappings(sql: string): { sourceCol: string; targetCol: string }[] {
  const mappings: { sourceCol: string; targetCol: string }[] = [];
  const selectMatch = sql.match(/SELECT\s+([\s\S]+?)\s+FROM/i);
  if (!selectMatch) return mappings;
  const parts = selectMatch[1].split(',');
  for (const part of parts) {
    const trimmed = part.trim();
    const asMatch = trimmed.match(/(?:[\w.]+\.)?(\w+)\s+AS\s+["']?(\w+)["']?/i);
    if (asMatch) mappings.push({ sourceCol: asMatch[1], targetCol: asMatch[2] });
  }
  return mappings;
}

function extractSourceTables(sql: string): string[] {
  const tables: string[] = [];
  const patterns = [
    /FROM\s+([a-zA-Z_][a-zA-Z0-9_."]+)/gi,
    /JOIN\s+([a-zA-Z_][a-zA-Z0-9_."]+)/gi,
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

    const lineage = await Promise.all(models.map(async model => {
      const cfg = model.sourceConfig as any;
      if (process.env.NODE_ENV !== 'production' && cfg.host === 'pg_lake') {
        cfg.host = '188.240.222.70';
        cfg.port = 55432;
      }
      const targetSchema = cfg?.schema ?? 'semantic_layer';

      // Hämta Core-kolumner från källdatabasen
      const coreTableColumns: Record<string, string[]> = {};
      try {
        const dbClient = new Client({
          host: cfg.host, port: cfg.port ?? 5432,
          database: cfg.database, user: cfg.user, password: cfg.password,
          ssl: cfg.ssl ? { rejectUnauthorized: false } : undefined,
          connectionTimeoutMillis: 5000,
        });
        await dbClient.connect();
        const allSourceTables = [...new Set(model.views.flatMap(v => extractSourceTables(v.sql ?? '')))];
        for (const table of allSourceTables) {
          const parts = table.split('.');
          const schema = parts.length > 1 ? parts[0] : 'public';
          const tableName = parts.length > 1 ? parts[1] : parts[0];
          try {
            const res = await dbClient.query(
              `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`,
              [schema, tableName]
            );
            coreTableColumns[table] = res.rows.map((r: any) => r.column_name);
          } catch {}
        }
        await dbClient.end();
      } catch (e) {
        console.error('Core DB error:', e);
      }

      const views = model.views.map(view => {
        const sourceTables = extractSourceTables(view.sql ?? '');
        const columnMappings = extractColumnMappings(view.sql ?? '');
        const coreColumns: Record<string, string[]> = {};
        for (const t of sourceTables) {
          coreColumns[t] = coreTableColumns[t] ?? [];
        }
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
          coreColumns,
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
    }));

    // Hämta rapporter från Klarify
    const klarifyUrl = process.env.KLARIFY_URL ?? (process.env.NODE_ENV === 'production' ? 'http://klarify:3000' : 'http://localhost:3000');
    console.log('Fetching reports from:', klarifyUrl);
    const reportsByModel: Record<number, {id: string; title: string; sourceViews: string[]; sourceColumns: {viewName: string; columnName: string}[]}[]> = {};
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
              sourceColumns: r.sourceColumns ?? [],
            });
          }
        }
      } else {
        console.log('Reports fetch failed:', res.status);
      }
    } catch (e) {
      console.log('Reports fetch error:', e);
    }

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
