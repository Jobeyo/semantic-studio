import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { Client } from 'pg';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { host, port, user, ssl, password } = await request.json();

    const client = new Client({
      host, port, database: 'postgres', user, password: password ?? '',
      ssl: ssl ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 8000,
    });
    await client.connect();
    try {
      const res = await client.query(`
        SELECT datname FROM pg_database
        WHERE datistemplate = false
        ORDER BY datname
      `);
      await client.end();
      return Response.json({ databases: res.rows.map(r => r.datname) });
    } catch (e) {
      await client.end();
      throw e;
    }
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
