-- A note can be pinned for the whole household. Only when is kept, not who.
ALTER TABLE "notes" ADD COLUMN "pinned_at" TIMESTAMPTZ(3);

-- Notes carry household labels, like tasks and events.
CREATE TABLE "note_labels" (
    "note_id" UUID NOT NULL,
    "label_id" UUID NOT NULL,

    CONSTRAINT "note_labels_pkey" PRIMARY KEY ("note_id","label_id")
);

ALTER TABLE "note_labels" ADD CONSTRAINT "note_labels_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "note_labels" ADD CONSTRAINT "note_labels_label_id_fkey" FOREIGN KEY ("label_id") REFERENCES "labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
