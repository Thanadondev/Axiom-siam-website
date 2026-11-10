-- Where the copy of the zip sits in the team's job folders on the NAS, once the order was paid.
-- AlterTable
ALTER TABLE "order_files" ADD COLUMN     "nas_at" TIMESTAMP(3),
ADD COLUMN     "nas_path" TEXT;
