import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { Client } from 'pg';

async function getClient(body: any) {
  // Lokal dev-fallback: pg_lake -> extern adress
  if (process.env.NODE_ENV !== 'production' && body.host === 'pg_lake') {
    body.host = '188.240.222.70';
    body.port = 55432;
  }
  const client = new Client({
    host: body.host, port: body.port, database: body.database,
    user: body.user, password: body.password,
    ssl: body.ssl ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 8000,
  });
  await client.connect();
  return client;
}

// GET: Lista scheman
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    const client = await getClient(body);
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

// PUT: Skapa schema
export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    const { schemaName } = body;
    if (!schemaName || !/^[a-z0-9_]+$/.test(schemaName)) {
      return Response.json({ error: 'Ogiltigt schemanamn' }, { status: 400 });
    }
    const sql = `CREATE SCHEMA IF NOT EXISTS "${schemaName}"`;
    // Visa SQL för granskning – returnera SQL utan att köra
    // Klienten kör CREATE SCHEMA direkt efter bekräftelse
    const client = await getClient(body);
    try {
      await client.query(sql);
      await client.end();
      return Response.json({ ok: true, schema: schemaName, sql });
    } catch (e) {
      await client.end();
      return Response.json({ error: (e as Error).message }, { status: 400 });
    }
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

// DELETE: Ta bort schema
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    const { schemaName } = body;
    const client = await getClient(body);
    try {
      await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
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
