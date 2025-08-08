/*
  Warnings:

  - You are about to drop the column `grade` on the `Student` table. All the data in the column will be lost.
  - You are about to drop the column `schoolId` on the `Student` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[admissionNumber]` on the table `Student` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `admissionNumber` to the `Student` table without a default value. This is not possible if the table is not empty.
  - Added the required column `currentClass` to the `Student` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY');

-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'GRADUATED', 'DROPPED_OUT', 'ON_LEAVE');

-- AlterTable
ALTER TABLE "Student" DROP COLUMN "grade",
DROP COLUMN "schoolId",
ADD COLUMN     "admissionDate" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "admissionNumber" TEXT NOT NULL,
ADD COLUMN     "currentClass" TEXT NOT NULL,
ADD COLUMN     "dateOfBirth" DATE,
ADD COLUMN     "gender" "Gender",
ADD COLUMN     "section" TEXT,
ADD COLUMN     "status" "StudentStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateIndex
CREATE UNIQUE INDEX "Student_admissionNumber_key" ON "Student"("admissionNumber");
