-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateTable
CREATE TABLE "TimetableSlot" (
    "id" TEXT NOT NULL,
    "dayOfWeek" "DayOfWeek" NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "class" TEXT NOT NULL,
    "section" TEXT,
    "subject" TEXT NOT NULL,
    "teacherId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimetableSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimetableSlot_class_section_dayOfWeek_idx" ON "TimetableSlot"("class", "section", "dayOfWeek");

-- CreateIndex
CREATE INDEX "TimetableSlot_teacherId_idx" ON "TimetableSlot"("teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "TimetableSlot_dayOfWeek_startTime_class_section_subject_key" ON "TimetableSlot"("dayOfWeek", "startTime", "class", "section", "subject");

-- AddForeignKey
ALTER TABLE "TimetableSlot" ADD CONSTRAINT "TimetableSlot_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
