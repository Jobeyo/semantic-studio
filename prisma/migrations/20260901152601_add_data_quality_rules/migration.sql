-- CreateTable
CREATE TABLE "DataQualityRule" (
    "id" SERIAL NOT NULL,
    "viewId" INTEGER NOT NULL,
    "columnName" TEXT NOT NULL,
    "ruleType" TEXT NOT NULL,
    "ruleValue" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataQualityRule_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "DataQualityRule" ADD CONSTRAINT "DataQualityRule_viewId_fkey" FOREIGN KEY ("viewId") REFERENCES "ModelView"("id") ON DELETE CASCADE ON UPDATE CASCADE;
