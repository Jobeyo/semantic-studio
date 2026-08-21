-- AlterTable
ALTER TABLE "ViewColumn" ADD COLUMN     "expression" TEXT,
ADD COLUMN     "isDerived" BOOLEAN NOT NULL DEFAULT false;
