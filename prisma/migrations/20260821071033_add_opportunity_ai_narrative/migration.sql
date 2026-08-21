/*
  Warnings:

  - Added the required column `updated_at` to the `opportunities` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "opportunities" ADD COLUMN     "ai_narrative" JSONB,
ADD COLUMN     "ai_narrative_input_hash" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT now();
