-- AlterEnum
ALTER TYPE "CampaignStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "opportunities" ALTER COLUMN "updated_at" DROP DEFAULT;
