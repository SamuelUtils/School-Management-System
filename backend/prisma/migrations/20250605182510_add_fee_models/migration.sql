-- CreateTable
CREATE TABLE "FeeCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "baseAmount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeeCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentFee" (
    "id" TEXT NOT NULL,
    "assignedAmount" DOUBLE PRECISION NOT NULL,
    "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "studentId" TEXT NOT NULL,
    "feeCategoryId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentFee_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeeCategory_name_key" ON "FeeCategory"("name");

-- CreateIndex
CREATE INDEX "StudentFee_studentId_idx" ON "StudentFee"("studentId");

-- CreateIndex
CREATE INDEX "StudentFee_feeCategoryId_idx" ON "StudentFee"("feeCategoryId");

-- CreateIndex
CREATE INDEX "StudentFee_assignedById_idx" ON "StudentFee"("assignedById");

-- CreateIndex
CREATE UNIQUE INDEX "StudentFee_studentId_feeCategoryId_key" ON "StudentFee"("studentId", "feeCategoryId");

-- AddForeignKey
ALTER TABLE "StudentFee" ADD CONSTRAINT "StudentFee_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentFee" ADD CONSTRAINT "StudentFee_feeCategoryId_fkey" FOREIGN KEY ("feeCategoryId") REFERENCES "FeeCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentFee" ADD CONSTRAINT "StudentFee_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
