/*
  Warnings:

  - You are about to drop the column `class` on the `Student` table. All the data in the column will be lost.
  - Added the required column `currentClass` to the `Student` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Student" DROP COLUMN "class",
ADD COLUMN     "currentClass" TEXT NOT NULL;
