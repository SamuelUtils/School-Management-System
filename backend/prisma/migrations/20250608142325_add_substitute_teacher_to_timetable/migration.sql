-- AlterTable
ALTER TABLE "TimetableSlot" ADD COLUMN     "substituteTeacherId" TEXT;

-- CreateIndex
CREATE INDEX "TimetableSlot_substituteTeacherId_date_dayOfWeek_idx" ON "TimetableSlot"("substituteTeacherId", "date", "dayOfWeek");

-- AddForeignKey
ALTER TABLE "TimetableSlot" ADD CONSTRAINT "TimetableSlot_substituteTeacherId_fkey" FOREIGN KEY ("substituteTeacherId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
