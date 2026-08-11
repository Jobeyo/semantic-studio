import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';
import { Client } from 'pg';

export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;

    const model = await prisma.semanticModel.findUnique({ where: { id: parseInt(id) } });
    if (!model) return Response.json({ error: 'Not found' }, { status: 404 });

    const config = model.sourceConfig as any;
    const client = new Client({
      host: config.host, port: config.port, database: config.database,
      user: config.user, password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 10000,
    });

    await client.connect();

    try {
      // Hämta alla vyer i semantic_layer
      const viewsRes = await client.query(`
        SELECT table_name, view_definition
        FROM information_schema.views
        WHERE table_schema = 'semantic_layer'
        ORDER BY table_name
      `);

      // Hämta kolumner för varje vy
      const columnsRes = await client.query(`
        SELECT table_name, column_name, data_type, ordinal_position
        FROM information_schema.columns
        WHERE table_schema = 'semantic_layer'
        ORDER BY table_name, ordinal_position
      `);

      await client.end();

      // Gruppera kolumner per vy
      const colsByView: Record<string, any[]> = {};
      for (const col of columnsRes.rows) {
        if (!colsByView[col.table_name]) colsByView[col.table_name] = [];
        colsByView[col.table_name].push(col);
      }

      // Ta bort befintliga vyer och importera nya (kolumner måste tas bort först)
      const existingViews = await prisma.modelView.findMany({ where: { modelId: parseInt(id) } });
      for (const v of existingViews) {
        await prisma.viewColumn.deleteMany({ where: { viewId: v.id } });
      }
      await prisma.modelView.deleteMany({ where: { modelId: parseInt(id) } });

      const views = await Promise.all(viewsRes.rows.map(async (v: any) => {
        const cols = colsByView[v.table_name] ?? [];
        return prisma.modelView.create({
          data: {
            modelId: parseInt(id),
            name: v.table_name,
            displayName: v.table_name.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
            description: null,
            type: v.table_name.includes('fact') ? 'fact' : v.table_name.includes('dim') ? 'dimension' : 'fact',
            sql: `CREATE OR REPLACE VIEW semantic_layer.${v.table_name} AS\n${v.view_definition}`,
            columns: {
              create: cols.map((c: any) => ({
                name: c.column_name,
                displayName: c.column_name.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
                description: null,
                dataType: ['integer','bigint','numeric','decimal','real','double precision'].includes(c.data_type) ? 'number'
                         : ['date','timestamp','timestamptz'].includes(c.data_type) ? 'date'
                         : ['boolean'].includes(c.data_type) ? 'boolean' : 'string',
                isKey: c.column_name.toLowerCase().includes('id') && cols.indexOf(c) === 0,
                isMeasure: ['integer','bigint','numeric','decimal','real','double precision'].includes(c.data_type),
                format: null,
              })),
            },
          },
          include: { columns: true },
        });
      }));

      return Response.json({ views, count: views.length });

    } catch (e) {
      await client.end();
      throw e;
    }
  } catch (e) {
    console.error('Import error:', e);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
