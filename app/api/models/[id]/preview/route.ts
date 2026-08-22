import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';
import { Client } from 'pg';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const { sql, sourceConfig } = await request.json();

    const config = sourceConfig ?? (await prisma.semanticModel.findUnique({
      where: { id: parseInt(id) }
    }))?.sourceConfig;

    if (!config) return Response.json({ error: 'No config' }, { status: 400 });

    const cfg = config as any;
    const isPgLake = cfg.host === 'pg_lake';
    const host = isPgLake ? (process.env.PG_LAKE_HOST ?? '188.240.222.70') : cfg.host;
    const port = isPgLake ? parseInt(process.env.PG_LAKE_PORT ?? '55432') : cfg.port;

    const client = new Client({
      host, port, database: cfg.database,
      user: cfg.user, password: cfg.password,
      ssl: cfg.ssl ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 8000,
    });

    await client.connect();
    try {
      // Extrahera SELECT-delen från CREATE OR REPLACE VIEW ... AS SELECT ...
      let selectSql = sql;
      const asIdx = sql.toUpperCase().indexOf(' AS\n');
      const asIdx2 = sql.toUpperCase().indexOf(' AS ');
      const idx = asIdx !== -1 ? asIdx : asIdx2;
      if (idx !== -1) {
        selectSql = sql.slice(idx + 4).trim();
      }
      // Ta bort semikolon i slutet
      selectSql = selectSql.replace(/;$/, '').trim();

      // Kör med LIMIT 5 för preview och COUNT för totalt
      const countRes = await client.query(`SELECT COUNT(*) FROM (${selectSql}) AS _count_query`);
      const previewRes = await client.query(`SELECT * FROM (${selectSql}) AS _preview LIMIT 5`);

      await client.end();
      return Response.json({
        count: parseInt(countRes.rows[0].count),
        columns: previewRes.fields.map(f => f.name),
        rows: previewRes.rows,
      });
    } catch (e) {
      await client.end();
      return Response.json({ error: (e as Error).message }, { status: 400 });
    }
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
