-- CreateTable
CREATE TABLE "task_assignees" (
    "task_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "task_assignees_pkey" PRIMARY KEY ("task_id","user_id")
);

-- CreateIndex
CREATE INDEX "TaskAssignee_user_idx" ON "task_assignees"("user_id");

-- AddForeignKey
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate existing single-assignee data into the new join table before the
-- column is dropped, so tasks that already had an assignee keep it.
INSERT INTO "task_assignees" ("task_id", "user_id")
SELECT "id", "assignee_id" FROM "tasks" WHERE "assignee_id" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_assignee_id_fkey";

-- DropIndex
DROP INDEX "Task_household_assignee_idx";

-- DropIndex
DROP INDEX "Task_assignee_status_idx";

-- AlterTable
ALTER TABLE "tasks" DROP COLUMN "assignee_id";
