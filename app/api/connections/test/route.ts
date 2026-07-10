import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { Client } from 'pg';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { sourceType, host, port, database, user, password, ssl } = await request.json();

    if (sourceType === 'postgres') {
      const client = new Client({ host, port, database, user, password, ssl: ssl ? { rejectUnauthorized: false } : undefined, connectionTimeoutMillis: 8000 });
      try {
        await client.connect();
        const res = await client.query('SELECT version()');
        await client.end();
        return Response.json({ ok: true, version: res.rows[0].version.split(' ').slice(0, 2).join(' ') });
      } catch (e) {
        try { await client.end(); } catch {}
        return Response.json({ ok: false, error: (e as Error).message });
      }
    }

    return Response.json({ ok: false, error: `${sourceType} stöds inte ännu` });
  } catch (e) {
    return Response.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
