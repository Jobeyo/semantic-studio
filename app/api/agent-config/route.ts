import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { prisma as db } from '@/lib/db';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    
    const user = await db.user.findUnique({ where: { email: session.user.email } });
    if (!user) return Response.json({ error: 'User not found' }, { status: 404 });

    const config = await (db as any).agentConfig.findUnique({ where: { orgId: user.orgId } });
    return Response.json(config ?? {
      agentName: 'Studio AI',
      agentDescription: 'Din AI-drivna modelleringsassistent',
      agentPersona: 'Du är en erfaren datamodellerare och BI-arkitekt som hjälper till att bygga semantiska modeller.',
      systemPromptExtra: '',
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    
    const user = await db.user.findUnique({ where: { email: session.user.email } });
    if (!user || user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { agentName, agentDescription, agentPersona, systemPromptExtra } = await request.json();

    await (db as any).agentConfig.upsert({
      where: { orgId: user.orgId },
      create: { orgId: user.orgId, agentName, agentDescription, agentPersona, systemPromptExtra },
      update: { agentName, agentDescription, agentPersona, systemPromptExtra, updatedAt: new Date() },
    });
    
    return Response.json({ success: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
