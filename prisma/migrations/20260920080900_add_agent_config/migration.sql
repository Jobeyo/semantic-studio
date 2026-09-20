-- CreateTable
CREATE TABLE "AgentConfig" (
    "id" SERIAL NOT NULL,
    "orgId" INTEGER NOT NULL,
    "agentName" TEXT NOT NULL DEFAULT 'Studio AI',
    "agentDescription" TEXT,
    "agentPersona" TEXT,
    "systemPromptExtra" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentConfig_orgId_key" ON "AgentConfig"("orgId");
