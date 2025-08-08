-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('CASH', 'ONLINE_TRANSFER', 'CHEQUE', 'CARD', 'MANUAL_ADJUSTMENT');

-- CreateTable
CREATE TABLE "FeePayment" (
    "id" TEXT NOT NULL,
    "paidAmount" DOUBLE PRECISION NOT NULL,
    "paymentDate" DATE NOT NULL,
    "mode" "PaymentMode" NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "notes" TEXT,
    "studentFeeId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeePayment_receiptNumber_key" ON "FeePayment"("receiptNumber");

-- CreateIndex
CREATE INDEX "FeePayment_studentFeeId_idx" ON "FeePayment"("studentFeeId");

-- CreateIndex
CREATE INDEX "FeePayment_studentId_idx" ON "FeePayment"("studentId");

-- CreateIndex
CREATE INDEX "FeePayment_createdById_idx" ON "FeePayment"("createdById");

-- CreateIndex
CREATE INDEX "FeePayment_receiptNumber_idx" ON "FeePayment"("receiptNumber");

-- AddForeignKey
ALTER TABLE "FeePayment" ADD CONSTRAINT "FeePayment_studentFeeId_fkey" FOREIGN KEY ("studentFeeId") REFERENCES "StudentFee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeePayment" ADD CONSTRAINT "FeePayment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeePayment" ADD CONSTRAINT "FeePayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
