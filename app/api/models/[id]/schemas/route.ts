import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';
import { Client } from 'pg';

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;

    const model = await prisma.semanticModel.findUnique({ where: { id: parseInt(id) } });
    if (!model) return Response.json({ error: 'Not found' }, { status: 404 });

    const config = model.sourceConfig as any;
    // Lokal dev-fallback
    if (process.env.NODE_ENV !== 'production' && config.host === 'pg_lake') {
      config.host = '188.240.222.70';
      config.port = 55432;
    }
    const client = new Client({
      host: config.host, port: config.port, database: config.database,
      user: config.user, password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 8000,
    });
    await client.connect();
    try {
      const res = await client.query(`
        SELECT schema_name FROM information_schema.schemata
        WHERE schema_name NOT IN ('pg_toast', 'pg_catalog', 'information_schema')
        ORDER BY schema_name
      `);
      await client.end();
      return Response.json({ schemas: res.rows.map(r => r.schema_name) });
    } catch (e) {
      await client.end();
      throw e;
    }
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
