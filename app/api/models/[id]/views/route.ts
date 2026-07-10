import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const { name, displayName, description, type, sql, columns } = await request.json();
    const view = await prisma.modelView.create({
      data: {
        modelId: parseInt(id),
        name, displayName, description, type, sql,
        columns: { create: columns },
      },
      include: { columns: true },
    });
    return Response.json(view, { status: 201 });
  } catch (e) {
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}
