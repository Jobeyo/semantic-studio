import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/db';
import { hash, verify } from '@node-rs/bcrypt';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { currentPassword, newPassword } = await request.json();
    if (!currentPassword || !newPassword) return Response.json({ error: 'Saknade fält' }, { status: 400 });
    if (newPassword.length < 8) return Response.json({ error: 'Lösenordet måste vara minst 8 tecken' }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { email: session.user.email! } });
    if (!user) return Response.json({ error: 'Användare hittades inte' }, { status: 404 });

    const match = await verify(currentPassword, user.passwordHash);
    if (!match) return Response.json({ error: 'Nuvarande lösenord stämmer inte' }, { status: 400 });

    const newHash = await hash(newPassword, 10);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash } });

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}
