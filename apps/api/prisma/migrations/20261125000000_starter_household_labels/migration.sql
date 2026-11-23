-- Starter labels: every household gets five. Until renamed, a starter label
-- stores no name and each reader sees its default name in their own language.
ALTER TABLE "labels" ALTER COLUMN "name" DROP NOT NULL;
ALTER TABLE "labels" ADD COLUMN "system_key" VARCHAR(32);

ALTER TABLE "labels" ADD CONSTRAINT "labels_system_key_ck"
    CHECK ("system_key" IS NULL OR "system_key" IN ('birthday', 'chores', 'shopping', 'health', 'outings'));
-- Only a starter label may go without a name of its own.
ALTER TABLE "labels" ADD CONSTRAINT "labels_name_ck" CHECK ("name" IS NOT NULL OR "system_key" IS NOT NULL);

CREATE UNIQUE INDEX "Label_household_system_key_key" ON "labels"("household_id", "system_key");

-- The same starters as STARTER_LABELS in src/modules/labels/starter-labels.ts.
CREATE TEMPORARY TABLE "starter_labels" ("system_key", "name_zh", "name_ja", "color") AS
VALUES
    ('birthday', '生日', '誕生日', '#AD4067'),
    ('chores', '家务', '家事', '#2C716C'),
    ('shopping', '采买', '買い物', '#C98A1B'),
    ('health', '健康', '健康', '#4C7537'),
    ('outings', '出行', 'お出かけ', '#3B7DD8');

-- A label a household already named like a starter, in either language,
-- becomes that starter: one per household, the Chinese name first, then the oldest.
WITH candidates AS (
    SELECT
        l."id",
        s."system_key",
        ROW_NUMBER() OVER (
            PARTITION BY l."household_id", s."system_key"
            ORDER BY (l."name" = s."name_zh") DESC, l."created_at" ASC, l."id" ASC
        ) AS rn
    FROM "labels" l
    JOIN "starter_labels" s ON l."name" IN (s."name_zh", s."name_ja")
)
UPDATE "labels"
SET "system_key" = candidates."system_key"
FROM candidates
WHERE "labels"."id" = candidates."id"
  AND candidates.rn = 1;

-- It then goes by its default name, unless another label of the household
-- already has one of those names and the two would read alike.
UPDATE "labels" l
SET "name" = NULL
FROM "starter_labels" s
WHERE l."system_key" = s."system_key"
  AND NOT EXISTS (
      SELECT 1
      FROM "labels" other
      WHERE other."household_id" = l."household_id"
        AND other."id" <> l."id"
        AND other."name" IN (s."name_zh", s."name_ja")
  );

-- Add the starters a household is still missing, created by its owner.
INSERT INTO "labels" ("household_id", "name", "color", "system_key", "created_by")
SELECT h."id", NULL, s."color", s."system_key", creator."user_id"
FROM "households" h
CROSS JOIN LATERAL (
    SELECT m."user_id"
    FROM "memberships" m
    WHERE m."household_id" = h."id"
    ORDER BY (m."id" = h."owner_membership_id") DESC, m."created_at" ASC, m."id" ASC
    LIMIT 1
) creator
CROSS JOIN "starter_labels" s
WHERE NOT EXISTS (
    SELECT 1
    FROM "labels" l
    WHERE l."household_id" = h."id"
      AND l."system_key" = s."system_key"
);

-- Existing birthday series and their occurrences carry the birthday label too.
INSERT INTO "recurrence_rule_labels" ("rule_id", "label_id")
SELECT r."id", l."id"
FROM "recurrence_rules" r
JOIN "labels" l
  ON l."household_id" = r."household_id"
 AND l."system_key" = 'birthday'
WHERE r."occasion" = 'birthday'
ON CONFLICT DO NOTHING;

INSERT INTO "event_labels" ("event_id", "label_id")
SELECT e."id", l."id"
FROM "events" e
JOIN "recurrence_rules" r ON r."id" = e."recurrence_rule_id"
JOIN "labels" l
  ON l."household_id" = e."household_id"
 AND l."system_key" = 'birthday'
WHERE r."occasion" = 'birthday'
ON CONFLICT DO NOTHING;

DROP TABLE "starter_labels";
