import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';
import { Client } from 'pg';

async function getClientForModel(modelId: number) {
  const model = await prisma.semanticModel.findUnique({ where: { id: modelId } });
  if (!model) throw new Error('Model not found');
  const config = model.sourceConfig as any;
  const client = new Client({
    host: config.host, port: config.port, database: config.database,
    user: config.user, password: config.password,
    ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 8000,
  });
  await client.connect();
  return { client, model, config };
}

// PATCH: Byt schemanamn
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const { newSchemaName } = await request.json();
    if (!newSchemaName || !/^[a-z0-9_]+$/.test(newSchemaName)) {
      return Response.json({ error: 'Ogiltigt schemanamn' }, { status: 400 });
    }
    const { client, model, config } = await getClientForModel(parseInt(id));
    const oldSchema = config.schema ?? 'semantic_layer';
    try {
      await client.query(`ALTER SCHEMA "${oldSchema}" RENAME TO "${newSchemaName}"`);
      await client.end();
      // Uppdatera sourceConfig i Studio
      await prisma.semanticModel.update({
        where: { id: parseInt(id) },
        data: { sourceConfig: { ...config, schema: newSchemaName } },
      });
      return Response.json({ ok: true, schema: newSchemaName });
    } catch (e) {
      await client.end();
      return Response.json({ error: (e as Error).message }, { status: 400 });
    }
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

// DELETE: Ta bort schema
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const { client, config } = await getClientForModel(parseInt(id));
    const schema = config.schema ?? 'semantic_layer';
    try {
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await client.end();
      return Response.json({ ok: true });
    } catch (e) {
      await client.end();
      return Response.json({ error: (e as Error).message }, { status: 400 });
    }
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
