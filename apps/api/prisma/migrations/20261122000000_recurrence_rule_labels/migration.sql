-- A series' labels belong to its rule, like its title and location. Until now
-- the generator copied them from the series' earliest occurrence, so relabelling
-- that one occurrence relabelled every occurrence generated after it.
CREATE TABLE "recurrence_rule_labels" (
    "rule_id" UUID NOT NULL,
    "label_id" UUID NOT NULL,

    CONSTRAINT "recurrence_rule_labels_pkey" PRIMARY KEY ("rule_id","label_id")
);

ALTER TABLE "recurrence_rule_labels" ADD CONSTRAINT "recurrence_rule_labels_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "recurrence_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "recurrence_rule_labels" ADD CONSTRAINT "recurrence_rule_labels_label_id_fkey" FOREIGN KEY ("label_id") REFERENCES "labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Each existing series keeps generating what it generates today: the labels of
-- its earliest occurrence row, the row the generator used as its template.
INSERT INTO "recurrence_rule_labels" ("rule_id", "label_id")
SELECT first_event."recurrence_rule_id", event_label."label_id"
FROM (
    SELECT DISTINCT ON ("recurrence_rule_id") "id", "recurrence_rule_id"
    FROM "events"
    WHERE "recurrence_rule_id" IS NOT NULL
    ORDER BY "recurrence_rule_id", "occurrence_date" ASC
) AS first_event
JOIN "event_labels" AS event_label ON event_label."event_id" = first_event."id"
UNION
SELECT first_task."recurrence_rule_id", task_label."label_id"
FROM (
    SELECT DISTINCT ON ("recurrence_rule_id") "id", "recurrence_rule_id"
    FROM "tasks"
    WHERE "recurrence_rule_id" IS NOT NULL
    ORDER BY "recurrence_rule_id", "occurrence_date" ASC
) AS first_task
JOIN "task_labels" AS task_label ON task_label."task_id" = first_task."id";
