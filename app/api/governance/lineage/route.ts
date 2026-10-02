import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';
import { Client } from 'pg';
import { extractTableRefs, extractColumnMappings } from '@/lib/lineage-sql';
import { loadEtlLineage, type UpstreamTable } from '@/lib/etl-lineage';

// GET /api/governance/lineage[?modelId=1][&reports=0]
// Lineage per affärsmodell: källfil -> Core -> (data mart) -> semantisk vy -> affärsmodell -> rapport.
// Klarify anropar samma route server till server med x-internal-key.
export async function GET(request: NextRequest) {
  try {
    const internalKey = process.env.INTERNAL_API_KEY;
    const isInternal = !!internalKey && request.headers.get('x-internal-key') === internalKey;
    const session = isInternal ? null : await auth();
    if (!isInternal && !session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const modelIdParam = parseInt(searchParams.get('modelId') ?? '', 10);
    const modelId = Number.isFinite(modelIdParam) ? modelIdParam : null;
    const withReports = searchParams.get('reports') !== '0';

    const user = session?.user?.email ? await prisma.user.findUnique({ where: { email: session.user.email } }) : null;
    if (!isInternal && !user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const models = await prisma.semanticModel.findMany({
      where: {
        status: { not: 'archived' },
        ...(user ? { orgId: user.orgId } : {}),
        ...(modelId ? { id: modelId } : {}),
      },
      include: { views: { include: { columns: true }, orderBy: { id: 'asc' } } },
      orderBy: { name: 'asc' },
    });

    const lineage = await Promise.all(models.map(async model => {
      const cfg = { ...((model.sourceConfig as any) ?? {}) };
      if (process.env.NODE_ENV !== 'production' && cfg.host === 'pg_lake') {
        cfg.host = '188.240.222.70';
        cfg.port = 55432;
      }
      const targetSchema = cfg?.schema ?? 'semantic_layer';

      const refsByView = new Map(model.views.map(v => [v.id, extractTableRefs(v.sql ?? '')]));
      const allSourceTables = [...new Set([...refsByView.values()].flatMap(r => r.sourceTables))];

      // Kolumner i källtabellerna (Core eller data mart)
      const tableColumns: Record<string, string[]> = {};
      try {
        const dbClient = new Client({
          host: cfg.host, port: cfg.port ?? 5432,
          database: cfg.database, user: cfg.user, password: cfg.password,
          ssl: cfg.ssl ? { rejectUnauthorized: false } : undefined,
          connectionTimeoutMillis: 5000,
        });
        await dbClient.connect();
        for (const table of allSourceTables) {
          const parts = table.split('.');
          const schema = parts.length > 1 ? parts[0] : 'public';
          const tableName = parts.length > 1 ? parts[1] : parts[0];
          try {
            const res = await dbClient.query(
              `SELECT column_name FROM information_schema.columns
               WHERE lower(table_schema) = lower($1) AND lower(table_name) = lower($2)
               ORDER BY ordinal_position`,
              [schema, tableName],
            );
            tableColumns[table] = res.rows.map((r: any) => r.column_name);
          } catch {}
        }
        await dbClient.end();
      } catch (e) {
        console.error('Lineage: kunde inte läsa källtabellernas kolumner:', (e as Error).message);
      }

      // ETL-lineage uppströms (källfil -> Core -> data mart)
      const etl = await loadEtlLineage(cfg, allSourceTables);
      if (etl.error) console.error('Lineage: ETL-lineage kunde inte läsas:', etl.error);

      const views = model.views.map(view => {
        const refs = refsByView.get(view.id)!;
        const byLower = new Map(view.columns.map(c => [c.name.toLowerCase(), c.name]));
        const columnMappings = extractColumnMappings(view.sql ?? '', refs, tableColumns)
          .map(m => ({ ...m, targetCol: byLower.get(m.targetCol.toLowerCase()) ?? m.targetCol }));
        const coreColumns: Record<string, string[]> = {};
        const upstream: Record<string, UpstreamTable> = {};
        for (const t of refs.sourceTables) {
          coreColumns[t] = tableColumns[t] ?? [];
          if (etl.tables[t]) upstream[t] = etl.tables[t];
        }
        return {
          id: view.id,
          name: view.name,
          displayName: view.displayName,
          type: view.type,
          sql: view.sql,
          sourceTables: refs.sourceTables,
          columnCount: view.columns.length,
          columns: view.columns.map(c => ({ name: c.name, displayName: c.displayName, dataType: c.dataType, isKey: c.isKey, isMeasure: c.isMeasure })),
          columnMappings,
          coreColumns,
          upstream,
        };
      });

      const layers = views.flatMap(v => Object.values(v.upstream).map(u => u.layer));
      return {
        id: model.id,
        name: model.name,
        status: model.status,
        sourceType: model.sourceType,
        sourceDatabase: cfg?.database,
        sourceHost: cfg?.host,
        targetSchema,
        etlLineage: {
          configured: etl.configured,
          source: etl.source ?? null,
          error: etl.error ?? null,
          matchedTables: Object.keys(etl.tables).length,
          // 0 = ingen ETL-lineage, 1 = modellen bygger på Core, 2 = modellen bygger på data mart
          depth: layers.includes('datamart') ? 2 : layers.includes('core') ? 1 : 0,
        },
        views,
      };
    }));

    // Rapporter från Klarify
    const reportsByModel: Record<number, { id: string; title: string; reportOwner?: string; reportOwnerEmail?: string; reportRequester?: string; sourceViews: string[]; sourceColumns: { viewName: string; columnName: string }[] }[]> = {};
    if (withReports && internalKey) {
      const klarifyUrl = process.env.KLARIFY_URL ?? (process.env.NODE_ENV === 'production' ? 'http://klarify:3000' : 'http://localhost:3000');
      try {
        const res = await fetch(`${klarifyUrl}/api/reports`, { headers: { 'x-internal-key': internalKey }, cache: 'no-store' });
        if (res.ok) {
          const reports = await res.json();
          for (const r of (Array.isArray(reports) ? reports : [])) {
            if (!r.modelId) continue;
            (reportsByModel[r.modelId] ??= []).push({
              id: r.id,
              title: r.title,
              reportOwner: r.reportOwner ?? null,
              reportOwnerEmail: r.reportOwnerEmail ?? null,
              reportRequester: r.reportRequester ?? null,
              sourceViews: r.sourceViews ?? [],
              sourceColumns: r.sourceColumns ?? [],
            });
          }
        } else {
          console.log('Lineage: rapporter kunde inte hämtas från Klarify:', res.status);
        }
      } catch (e) {
        console.log('Lineage: rapporter kunde inte hämtas från Klarify:', (e as Error).message);
      }
    } else if (withReports) {
      console.log('Lineage: INTERNAL_API_KEY saknas, rapporter hämtas inte från Klarify');
    }

    const lineageWithReports = lineage.map(m => ({
      ...m,
      views: m.views.map(v => ({
        ...v,
        reports: (reportsByModel[m.id] ?? []).filter(r => r.sourceViews?.length > 0 && r.sourceViews.includes(v.name)),
      })),
      reports: reportsByModel[m.id] ?? [],
    }));

    return Response.json({ lineage: lineageWithReports });
  } catch (e) {
    console.error('Lineage API error:', e);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
