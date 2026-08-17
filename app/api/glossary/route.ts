import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const { searchParams } = new URL(request.url);
    const modelId = searchParams.get('modelId');
    const orgId = searchParams.get('orgId');
    
    // Tillåt intern request från Klarify eller publik med orgId
    const isInternal = request.headers.get('x-internal-request') === 'true';
    if (!session?.user && !orgId && !isInternal) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    
    const effectiveOrgId = session?.user 
      ? (await prisma.user.findUnique({ where: { email: session.user.email! } }))?.orgId ?? parseInt(orgId ?? '1')
      : parseInt(orgId ?? '1');
      
    const terms = await prisma.glossaryTerm.findMany({
      where: { orgId: effectiveOrgId, ...(modelId ? { modelId: parseInt(modelId) } : {}) },
      orderBy: { name: 'asc' },
    });
    return Response.json(terms, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
      }
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await prisma.user.findUnique({ where: { email: session.user.email! } });
    const { name, definition, synonym, dataSource, type, modelId } = await request.json();
    const term = await prisma.glossaryTerm.create({
      data: {
        orgId: user!.orgId,
        modelId: modelId ?? null,
        name, definition,
        synonym: synonym ?? null,
        dataSource: dataSource ?? null,
        type: type ?? 'concept',
        createdBy: session.user.email!,
        updatedBy: session.user.email!,
      },
    });
    return Response.json(term, { status: 201 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
