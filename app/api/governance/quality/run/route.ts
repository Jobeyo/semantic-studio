import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';
import { Client } from 'pg';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { modelId } = await request.json();

    const model = await prisma.semanticModel.findUnique({
      where: { id: modelId },
      include: { views: { include: { qualityRules: true } } },
    });
    if (!model) return Response.json({ error: 'Not found' }, { status: 404 });

    const cfg = model.sourceConfig as any;
    if (process.env.NODE_ENV !== 'production' && cfg.host === 'pg_lake') {
      cfg.host = '188.240.222.70';
      cfg.port = 55432;
    }

    const client = new Client({
      host: cfg.host, port: cfg.port ?? 5432,
      database: cfg.database, user: cfg.user, password: cfg.password,
      ssl: cfg.ssl ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 10000,
    });
    await client.connect();

    const results = [];
    const schema = cfg.schema ?? 'semantic_layer';

    for (const view of model.views) {
      for (const rule of view.qualityRules) {
        try {
          let sql = '';
          if (rule.ruleType === 'not_null') {
            sql = `SELECT COUNT(*) as fail_count, COUNT(*) OVER() as total FROM "${schema}"."${view.name}" WHERE "${rule.columnName}" IS NULL`;
          } else if (rule.ruleType === 'unique') {
            sql = `SELECT COUNT(*) - COUNT(DISTINCT "${rule.columnName}") as fail_count, COUNT(*) as total FROM "${schema}"."${view.name}"`;
          } else if (rule.ruleType === 'min') {
            sql = `SELECT COUNT(*) as fail_count, COUNT(*) as total FROM "${schema}"."${view.name}" WHERE "${rule.columnName}"::numeric < ${rule.ruleValue}`;
          } else if (rule.ruleType === 'max') {
            sql = `SELECT COUNT(*) as fail_count, COUNT(*) as total FROM "${schema}"."${view.name}" WHERE "${rule.columnName}"::numeric > ${rule.ruleValue}`;
          } else if (rule.ruleType === 'regex') {
            sql = `SELECT COUNT(*) as fail_count, COUNT(*) as total FROM "${schema}"."${view.name}" WHERE "${rule.columnName}" !~ '${rule.ruleValue}'`;
          }

          if (sql) {
            const res = await client.query(sql);
            const failCount = parseInt(res.rows[0]?.fail_count ?? '0');
            const total = parseInt(res.rows[0]?.total ?? '0');
            results.push({ viewName: view.name, columnName: rule.columnName, ruleType: rule.ruleType, passed: failCount === 0, failCount, totalCount: total });
          }
        } catch (e: any) {
          results.push({ viewName: view.name, columnName: rule.columnName, ruleType: rule.ruleType, passed: false, error: e.message });
        }
      }
    }

    await client.end();
    return Response.json({ results });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
