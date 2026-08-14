import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';
import { hash } from '@node-rs/bcrypt';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const currentUser = await prisma.user.findUnique({ where: { email: session.user.email! } });
    if (currentUser?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const users = await prisma.user.findMany({
      where: { orgId: currentUser.orgId },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    return Response.json(users);
  } catch (e) {
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const currentUser = await prisma.user.findUnique({ where: { email: session.user.email! } });
    if (currentUser?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const { name, email, password, role } = await request.json();
    if (!name || !email || !password) return Response.json({ error: 'Saknade fält' }, { status: 400 });
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return Response.json({ error: 'E-postadressen används redan' }, { status: 400 });
    const passwordHash = await hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, passwordHash, role: role ?? 'editor', orgId: currentUser.orgId },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });
    return Response.json(user, { status: 201 });
  } catch (e) {
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}
