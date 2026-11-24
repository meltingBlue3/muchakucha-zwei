-- Who saved a note last, shown beside the author on the note page.
ALTER TABLE "notes" ADD COLUMN "updated_by" UUID;

-- Until now only the author is known to have saved a note.
UPDATE "notes" SET "updated_by" = "created_by";

ALTER TABLE "notes" ADD CONSTRAINT "notes_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
