import { auth } from '@/auth';
import prisma from '@/lib/db';
import { hash } from '@node-rs/bcrypt';
import { NextRequest } from 'next/server';

export async function GET() {
  try {
    const count = await prisma.user.count();
    return Response.json({ needsSetup: count === 0 });
  } catch {
    return Response.json({ needsSetup: false });
  }
}

export async function POST(request: NextRequest) {
  try {
    const count = await prisma.user.count();
    if (count > 0) return Response.json({ error: 'Setup redan genomförd' }, { status: 400 });
    const { name, email, password } = await request.json();
    if (!name || !email || !password) return Response.json({ error: 'Saknade fält' }, { status: 400 });
    const org = await prisma.organization.upsert({ where: { id: 1 }, update: {}, create: { name: 'Min organisation' } });
    const passwordHash = await hash(password, 10);
    await prisma.user.create({ data: { name, email, passwordHash, role: 'admin', orgId: org.id } });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
