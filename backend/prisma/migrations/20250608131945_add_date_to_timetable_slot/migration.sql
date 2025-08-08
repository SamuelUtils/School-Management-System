/*
  Warnings:

  - You are about to drop the column `class` on the `TimetableSlot` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[dayOfWeek,startTime,currentClass,section,subject,date]` on the table `TimetableSlot` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `currentClass` to the `TimetableSlot` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "TimetableSlot_class_section_dayOfWeek_idx";

-- DropIndex
DROP INDEX "TimetableSlot_dayOfWeek_startTime_class_section_subject_key";

-- DropIndex
DROP INDEX "TimetableSlot_teacherId_idx";

-- AlterTable
ALTER TABLE "TimetableSlot" DROP COLUMN "class",
ADD COLUMN     "currentClass" TEXT NOT NULL,
ADD COLUMN     "date" DATE;

-- CreateIndex
CREATE INDEX "TimetableSlot_currentClass_section_dayOfWeek_date_idx" ON "TimetableSlot"("currentClass", "section", "dayOfWeek", "date");

-- CreateIndex
CREATE INDEX "TimetableSlot_teacherId_date_dayOfWeek_idx" ON "TimetableSlot"("teacherId", "date", "dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "TimetableSlot_dayOfWeek_startTime_currentClass_section_subj_key" ON "TimetableSlot"("dayOfWeek", "startTime", "currentClass", "section", "subject", "date");
