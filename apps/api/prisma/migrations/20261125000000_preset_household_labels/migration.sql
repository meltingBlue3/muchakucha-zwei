-- Starter household labels and automatic birthday label association.
ALTER TABLE "labels" ADD COLUMN "system_key" VARCHAR(32);

ALTER TABLE "labels" ADD CONSTRAINT "labels_system_key_ck" CHECK ("system_key" IS NULL OR "system_key" = 'birthday');

CREATE UNIQUE INDEX "Label_household_system_key_key" ON "labels"("household_id", "system_key");

-- Claim any pre-existing birthday label per household before inserting missing starters.
WITH ranked_birthday_labels AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (
            PARTITION BY "household_id"
            ORDER BY CASE WHEN "name" = '生日' THEN 0 ELSE 1 END, "created_at" ASC, "id" ASC
        ) AS rn
    FROM "labels"
    WHERE "name" IN ('生日', '誕生日')
)
UPDATE "labels"
SET "system_key" = 'birthday'
FROM ranked_birthday_labels
WHERE "labels"."id" = ranked_birthday_labels."id"
  AND ranked_birthday_labels.rn = 1;

-- Seed missing starter labels for every existing household without duplicating either language's name.
WITH household_creators AS (
    SELECT
        h."id" AS household_id,
        COALESCE(
            owner_m."user_id",
            (
                SELECT m."user_id"
                FROM "memberships" m
                WHERE m."household_id" = h."id"
                ORDER BY m."created_at" ASC, m."id" ASC
                LIMIT 1
            )
        ) AS creator_id
    FROM "households" h
    LEFT JOIN "memberships" owner_m ON owner_m."id" = h."owner_membership_id"
),
preset_labels ("name_zh", "name_ja", "color", "system_key") AS (
    VALUES
        ('生日', '誕生日', '#AD4067', 'birthday'),
        ('家务', '家事', '#2C716C', NULL),
        ('采买', '買い物', '#C98A1B', NULL),
        ('健康', '健康', '#4C7537', NULL),
        ('出行', 'お出かけ', '#3B7DD8', NULL)
)
INSERT INTO "labels" ("household_id", "name", "color", "system_key", "created_by")
SELECT
    hc.household_id,
    pl."name_zh",
    pl."color",
    pl."system_key",
    hc.creator_id
FROM household_creators hc
CROSS JOIN preset_labels pl
WHERE hc.creator_id IS NOT NULL
  AND NOT (
      pl."system_key" IS NOT NULL
      AND EXISTS (
          SELECT 1
          FROM "labels" existing_sys
          WHERE existing_sys."household_id" = hc.household_id
            AND existing_sys."system_key" = pl."system_key"
      )
  )
  AND NOT EXISTS (
      SELECT 1
      FROM "labels" existing_name
      WHERE existing_name."household_id" = hc.household_id
        AND existing_name."name" IN (pl."name_zh", pl."name_ja")
  )
ON CONFLICT DO NOTHING;

-- Backfill existing birthday series and occurrences with the household's birthday label.
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
