-- Lunar yearly series: a rule may repeat on a lunar month and day instead of
-- its start date's Gregorian month and day. A lunar day is kept in the
-- ordinary month every year, so no leap flag is stored.
ALTER TABLE "recurrence_rules" ADD COLUMN "lunar_month" SMALLINT;
ALTER TABLE "recurrence_rules" ADD COLUMN "lunar_day" SMALLINT;

-- A birthday series, with the year of birth when it is known.
ALTER TABLE "recurrence_rules" ADD COLUMN "occasion" VARCHAR(10);
ALTER TABLE "recurrence_rules" ADD COLUMN "birth_year" SMALLINT;

ALTER TABLE "recurrence_rules" ADD CONSTRAINT "recurrence_rules_lunar_pair_ck" CHECK (("lunar_month" IS NULL) = ("lunar_day" IS NULL));
ALTER TABLE "recurrence_rules" ADD CONSTRAINT "recurrence_rules_lunar_range_ck" CHECK ("lunar_month" IS NULL OR ("lunar_month" BETWEEN 1 AND 12 AND "lunar_day" BETWEEN 1 AND 30));
ALTER TABLE "recurrence_rules" ADD CONSTRAINT "recurrence_rules_lunar_yearly_ck" CHECK ("lunar_month" IS NULL OR "freq" = 'yearly');
ALTER TABLE "recurrence_rules" ADD CONSTRAINT "recurrence_rules_occasion_ck" CHECK ("occasion" IS NULL OR ("occasion" = 'birthday' AND "freq" = 'yearly'));
ALTER TABLE "recurrence_rules" ADD CONSTRAINT "recurrence_rules_birth_year_ck" CHECK ("birth_year" IS NULL OR ("occasion" = 'birthday' AND "birth_year" BETWEEN 1900 AND 2100));
