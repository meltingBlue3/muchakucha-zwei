-- Series-level template fields.
--
-- Generated occurrences used to copy their field values from the earliest
-- surviving instance row, which the user is explicitly allowed to edit on its
-- own (D-02/D-07). That leaked single-occurrence edits — and completed or
-- cancelled state — into every occurrence generated afterwards. The template
-- now lives on the rule, where no per-instance edit can reach it.

-- AlterTable
ALTER TABLE "recurrence_rules"
    ADD COLUMN "template_title" VARCHAR(200),
    ADD COLUMN "template_description" TEXT,
    ADD COLUMN "template_priority" VARCHAR(10) NOT NULL DEFAULT 'medium',
    ADD COLUMN "template_location" VARCHAR(255),
    ADD COLUMN "template_all_day" BOOLEAN NOT NULL DEFAULT false;

-- Backfill from the earliest surviving instance of each rule, which is the row
-- the materializer treated as the template before this migration.
UPDATE "recurrence_rules" AS r
SET
    "template_title" = COALESCE(
        (SELECT t."title" FROM "tasks" t WHERE t."recurrence_rule_id" = r."id" ORDER BY t."occurrence_date" ASC LIMIT 1),
        (SELECT e."title" FROM "events" e WHERE e."recurrence_rule_id" = r."id" ORDER BY e."occurrence_date" ASC LIMIT 1),
        '未命名'
    ),
    "template_description" = COALESCE(
        (SELECT t."description" FROM "tasks" t WHERE t."recurrence_rule_id" = r."id" ORDER BY t."occurrence_date" ASC LIMIT 1),
        (SELECT e."description" FROM "events" e WHERE e."recurrence_rule_id" = r."id" ORDER BY e."occurrence_date" ASC LIMIT 1)
    ),
    "template_priority" = COALESCE(
        (SELECT t."priority" FROM "tasks" t WHERE t."recurrence_rule_id" = r."id" ORDER BY t."occurrence_date" ASC LIMIT 1),
        'medium'
    ),
    "template_location" = (SELECT e."location" FROM "events" e WHERE e."recurrence_rule_id" = r."id" ORDER BY e."occurrence_date" ASC LIMIT 1),
    "template_all_day" = COALESCE(
        (SELECT e."all_day" FROM "events" e WHERE e."recurrence_rule_id" = r."id" ORDER BY e."occurrence_date" ASC LIMIT 1),
        false
    );

ALTER TABLE "recurrence_rules" ALTER COLUMN "template_title" SET NOT NULL;

ALTER TABLE "recurrence_rules"
    ADD CONSTRAINT "recurrence_rules_template_priority_ck"
    CHECK ("template_priority" IN ('low','medium','high','urgent'));
