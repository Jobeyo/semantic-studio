import prisma from '@/lib/db';

export async function logChange({
  orgId, modelId, userId, action, entityType, entityName, details, actor
}: {
  orgId: number; modelId?: number; userId?: number;
  action: string; entityType: string; entityName?: string;
  details?: string; actor: string;
}) {
  try {
    await prisma.changeLog.create({
      data: { orgId, modelId: modelId ?? null, userId: userId ?? null, action, entityType, entityName: entityName ?? null, details: details ?? null, actor },
    });
  } catch {}
}
