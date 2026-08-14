import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const currentUser = await prisma.user.findUnique({ where: { email: session.user.email! } });
    if (currentUser?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const { id } = await params;
    const { role } = await request.json();
    const user = await prisma.user.update({ where: { id: parseInt(id) }, data: { role } });
    return Response.json(user);
  } catch (e) {
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const currentUser = await prisma.user.findUnique({ where: { email: session.user.email! } });
    if (currentUser?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const { id } = await params;
    if (currentUser.id === parseInt(id)) return Response.json({ error: 'Kan inte ta bort dig själv' }, { status: 400 });
    // Kolla om det är sista adminen
    const userToDelete = await prisma.user.findUnique({ where: { id: parseInt(id) } });
    if (userToDelete?.role === 'admin') {
      const adminCount = await prisma.user.count({ where: { orgId: currentUser.orgId, role: 'admin' } });
      if (adminCount <= 1) return Response.json({ error: 'Kan inte ta bort den sista adminen' }, { status: 400 });
    }
    await prisma.user.delete({ where: { id: parseInt(id) } });
    return Response.json({ success: true });
  } catch (e) {
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}
