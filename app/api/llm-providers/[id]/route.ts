import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await prisma.user.findUnique({ where: { email: session.user.email! } });
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const { id } = await params;
    await prisma.lLMProvider.delete({ where: { id: parseInt(id) } });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await prisma.user.findUnique({ where: { email: session.user.email! } });
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const { id } = await params;
    const updates = await request.json();
    const provider = await prisma.lLMProvider.update({ where: { id: parseInt(id) }, data: updates });
    return Response.json(provider);
  } catch (e) {
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}
