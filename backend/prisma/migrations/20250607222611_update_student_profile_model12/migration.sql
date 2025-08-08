/*
  Warnings:

  - You are about to drop the column `currentClass` on the `Student` table. All the data in the column will be lost.
  - The `status` column on the `Student` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Added the required column `class` to the `Student` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "StudentActiveStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'GRADUATED', 'DROPPED_OUT', 'ON_LEAVE');

-- AlterTable
ALTER TABLE "Student" DROP COLUMN "currentClass",
ADD COLUMN     "class" TEXT NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "StudentActiveStatus" NOT NULL DEFAULT 'ACTIVE';

-- DropEnum
DROP TYPE "StudentStatus";
