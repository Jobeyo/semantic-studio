import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';
import { Client } from 'pg';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const { viewId } = await request.json();

    const model = await prisma.semanticModel.findUnique({ where: { id: parseInt(id) } });
    if (!model) return Response.json({ error: 'Not found' }, { status: 404 });

    const view = await prisma.modelView.findUnique({ where: { id: viewId } });
    if (!view) return Response.json({ error: 'View not found' }, { status: 404 });

    const config = model.sourceConfig as any;
    const client = new Client({
      host: config.host, port: config.port, database: config.database,
      user: config.user, password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 10000,
    });
    await client.connect();

    try {
      // Säkerställ att semantic_layer schema finns
      await client.query('CREATE SCHEMA IF NOT EXISTS semantic_layer');
      await client.query(view.sql);
      await client.end();
      return Response.json({ success: true });
    } catch (e) {
      await client.end();
      return Response.json({ error: (e as Error).message }, { status: 400 });
    }
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
