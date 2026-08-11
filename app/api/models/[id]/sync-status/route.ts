import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';
import { Client } from 'pg';

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;

    const model = await prisma.semanticModel.findUnique({
      where: { id: parseInt(id) },
      include: { views: true },
    });
    if (!model) return Response.json({ error: 'Not found' }, { status: 404 });

    const config = model.sourceConfig as any;
    const client = new Client({
      host: config.host, port: config.port, database: config.database,
      user: config.user, password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 8000,
    });
    await client.connect();

    const res = await client.query(`
      SELECT table_name FROM information_schema.views
      WHERE table_schema = 'semantic_layer'
    `);
    await client.end();

    const dbViews = res.rows.map((r: any) => r.table_name);
    const syncStatus = model.views.map(v => ({
      id: v.id,
      name: v.name,
      existsInDb: dbViews.includes(v.name),
    }));

    return Response.json({ syncStatus, dbViews });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
