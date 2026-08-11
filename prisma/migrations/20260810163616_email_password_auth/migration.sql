-- AlterTable
ALTER TABLE "User" ADD COLUMN     "email" TEXT,
ADD COLUMN     "passwordHash" TEXT,
ALTER COLUMN "phone" DROP NOT NULL;

-- DropTable
DROP TABLE "OtpVerification";

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

