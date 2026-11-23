-- Each member chooses which of their households the merged 总览 view shows.
ALTER TABLE "memberships" ADD COLUMN "in_overview" BOOLEAN NOT NULL DEFAULT true;
