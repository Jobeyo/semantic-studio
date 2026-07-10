import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Skapa organisation
  const org = await prisma.organization.upsert({
    where: { id: 1 },
    update: {},
    create: { name: 'Demo Organisation' },
  });

  // Skapa admin-användare
  const hash = await bcrypt.hash('admin123', 12);
  const user = await prisma.user.upsert({
    where: { email: 'admin@demo.com' },
    update: {},
    create: {
      name: 'Admin',
      email: 'admin@demo.com',
      passwordHash: hash,
      role: 'admin',
      orgId: org.id,
    },
  });

  console.log('✅ Seed klar!');
  console.log(`   Organisation: ${org.name}`);
  console.log(`   Användare: ${user.email} / admin123`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
