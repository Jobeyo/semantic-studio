-- CreateTable
CREATE TABLE "OntologyConcept" (
    "id" SERIAL NOT NULL,
    "modelId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "synonyms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "glossaryTermId" INTEGER,
    "viewId" INTEGER,
    "keyColumn" TEXT,
    "owner" TEXT,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OntologyConcept_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OntologyProperty" (
    "id" SERIAL NOT NULL,
    "conceptId" INTEGER NOT NULL,
    "columnId" INTEGER,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT,
    "isMeasure" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OntologyProperty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OntologyRelation" (
    "id" SERIAL NOT NULL,
    "modelId" INTEGER NOT NULL,
    "fromConceptId" INTEGER NOT NULL,
    "toConceptId" INTEGER NOT NULL,
    "verb" TEXT NOT NULL,
    "inverseVerb" TEXT,
    "cardinality" TEXT NOT NULL DEFAULT 'one_to_many',
    "joinCondition" TEXT,
    "description" TEXT,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OntologyRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OntologyRule" (
    "id" SERIAL NOT NULL,
    "modelId" INTEGER NOT NULL,
    "conceptId" INTEGER,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "expression" TEXT,
    "ruleType" TEXT NOT NULL DEFAULT 'definition',
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OntologyRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OntologyConcept_modelId_name_key" ON "OntologyConcept"("modelId", "name");

-- AddForeignKey
ALTER TABLE "OntologyConcept" ADD CONSTRAINT "OntologyConcept_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "SemanticModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OntologyConcept" ADD CONSTRAINT "OntologyConcept_glossaryTermId_fkey" FOREIGN KEY ("glossaryTermId") REFERENCES "GlossaryTerm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OntologyConcept" ADD CONSTRAINT "OntologyConcept_viewId_fkey" FOREIGN KEY ("viewId") REFERENCES "ModelView"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OntologyProperty" ADD CONSTRAINT "OntologyProperty_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "OntologyConcept"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OntologyProperty" ADD CONSTRAINT "OntologyProperty_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "ViewColumn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OntologyRelation" ADD CONSTRAINT "OntologyRelation_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "SemanticModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OntologyRelation" ADD CONSTRAINT "OntologyRelation_fromConceptId_fkey" FOREIGN KEY ("fromConceptId") REFERENCES "OntologyConcept"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OntologyRelation" ADD CONSTRAINT "OntologyRelation_toConceptId_fkey" FOREIGN KEY ("toConceptId") REFERENCES "OntologyConcept"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OntologyRule" ADD CONSTRAINT "OntologyRule_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "SemanticModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OntologyRule" ADD CONSTRAINT "OntologyRule_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "OntologyConcept"("id") ON DELETE SET NULL ON UPDATE CASCADE;
